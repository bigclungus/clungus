#!/usr/bin/env python3
"""
BigClungus Integration Tests — critical service endpoints.

Tests:
  1. Discord inject endpoint — POST with correct secret, expect 200
  2. Temporal worker health — service running and localhost:7233 reachable
  3. Congress activity chain — GET /api/congress/active on clunger (public endpoint)
  4. Labs router discovery — GET http://localhost:8083/ expect 200 and HTML listing
  5. Commons-server WS — connect to ws://localhost:8090/ws, expect tick within 5s
  6. Clunger health — GET /api/congress/sessions (public), expect 200

Exit code: 0 if all pass, 1 if any fail.
"""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

TIMEOUT = 5  # seconds per test


# ── helpers ────────────────────────────────────────────────────────────────

def http_get(url: str, timeout: int = TIMEOUT) -> tuple[int, bytes]:
    """Return (status_code, body). Raises on connection failure."""
    req = urllib.request.Request(url, headers={"User-Agent": "BigClungus-IntegrationTest/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read()


def http_post(url: str, body: dict, headers: dict = None, timeout: int = TIMEOUT) -> tuple[int, bytes]:
    """Return (status_code, body). Raises on connection failure."""
    data = json.dumps(body).encode()
    h = {"Content-Type": "application/json", "User-Agent": "BigClungus-IntegrationTest/1.0"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def tcp_reachable(host: str, port: int, timeout: int = TIMEOUT) -> bool:
    """Return True if TCP connection succeeds within timeout."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, socket.timeout):
        return False


def service_active(name: str) -> bool:
    """Return True if a systemd --user service is active."""
    try:
        result = subprocess.run(
            ["systemctl", "--user", "is-active", name],
            capture_output=True, text=True, timeout=TIMEOUT,
        )
        return result.stdout.strip() == "active"
    except Exception:
        return False


# ── test runner ────────────────────────────────────────────────────────────

results: list[tuple[str, bool, str]] = []  # (name, passed, reason)


def run_test(name: str, fn):
    """Execute fn(); record PASS/FAIL and print immediately."""
    try:
        passed, reason = fn()
    except Exception as exc:
        passed, reason = False, f"exception: {exc}"
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {reason}")
    results.append((name, passed, reason))


# ── individual tests ────────────────────────────────────────────────────────

def test_discord_inject():
    """POST to inject endpoint with correct secret — expect 200 / 'ok'."""
    secret = os.environ.get(
        "DISCORD_INJECT_SECRET",
        "aa330b635ee444c20e27b4b79355e210c7f706523e768746ea687cecc4338db1",
    )
    # Use a dry-run-style test message that won't actually disturb the channel;
    # we ping with user="integration-test" and a known-safe chat_id.
    status, body = http_post(
        "http://127.0.0.1:9876/inject",
        body={"content": "[integration-test] inject endpoint check", "chat_id": "1485343472952148008", "user": "integration-test"},
        headers={"x-inject-secret": secret},
    )
    if status == 200:
        return True, f"HTTP {status} — body: {body[:80].decode(errors='replace')}"
    return False, f"HTTP {status} — body: {body[:120].decode(errors='replace')}"


def test_inject_rejects_bad_secret():
    """POST to inject endpoint with wrong secret — expect 401 (not 200)."""
    status, body = http_post(
        "http://127.0.0.1:9876/inject",
        body={"content": "should be rejected", "chat_id": "1485343472952148008", "user": "integration-test"},
        headers={"x-inject-secret": "not-the-real-secret"},
    )
    if status == 401:
        return True, f"correctly rejected with HTTP {status}"
    return False, f"expected 401, got {status} — body: {body[:80].decode(errors='replace')}"


def test_temporal_worker():
    """temporal-worker.service active + localhost:7233 TCP reachable."""
    if not service_active("temporal-worker.service"):
        return False, "temporal-worker.service is not active"
    if not tcp_reachable("localhost", 7233):
        return False, "temporal-worker.service active but localhost:7233 not reachable"
    return True, "service active and port 7233 reachable"


def test_congress_active_endpoint():
    """GET /api/congress/active on clunger (localhost:8081) — public endpoint, expect 200 + valid JSON."""
    status, body = http_get("http://localhost:8081/api/congress/active")
    if status != 200:
        return False, f"HTTP {status}"
    try:
        payload = json.loads(body)
    except Exception as exc:
        return False, f"HTTP {status} but invalid JSON: {exc}"
    if "active" not in payload:
        return False, f"HTTP {status} JSON missing 'active' key — got: {list(payload.keys())}"
    return True, f"HTTP {status} — active={payload['active']}"


def test_labs_router():
    """GET http://localhost:8083/ — expect 200 and HTML that references at least one lab."""
    status, body = http_get("http://localhost:8083/")
    if status != 200:
        return False, f"HTTP {status}"
    text = body.decode(errors="replace")
    if "labs.clung.us" not in text:
        return False, "HTTP 200 but response doesn't look like labs index (missing 'labs.clung.us')"
    # The labs router HTML includes lab names/links — check that it rendered something
    if "<title>" not in text:
        return False, "HTTP 200 but response missing <title> — unexpected format"
    lab_count_marker = "running"
    if lab_count_marker not in text:
        return False, "HTTP 200 but expected 'running' count marker not found"
    return True, f"HTTP {status} — labs index rendered ({len(body)} bytes)"


def test_commons_ws():
    """Connect to ws://localhost:8090/ws, expect a JSON tick message within 5s."""
    import threading

    received: list[str] = []
    error: list[str] = []

    def ws_connect():
        """Minimal HTTP/1.1 WebSocket handshake over raw socket."""
        import base64
        import hashlib
        import os

        host, port, path = "localhost", 8090, "/ws?userId=inttest&name=inttest&color=%23ffffff"
        # RFC 6455 requires a 16-byte random nonce, base64-encoded
        key = base64.b64encode(os.urandom(16)).decode()

        try:
            sock = socket.create_connection((host, port), timeout=TIMEOUT)
            handshake = (
                f"GET {path} HTTP/1.1\r\n"
                f"Host: {host}:{port}\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\n"
                "Sec-WebSocket-Version: 13\r\n"
                "\r\n"
            )
            sock.sendall(handshake.encode())

            # Read HTTP upgrade response
            resp_buf = b""
            deadline = time.time() + TIMEOUT
            while b"\r\n\r\n" not in resp_buf and time.time() < deadline:
                chunk = sock.recv(1024)
                if not chunk:
                    break
                resp_buf += chunk

            if b"101" not in resp_buf:
                error.append(f"WS upgrade failed: {resp_buf[:200]!r}")
                sock.close()
                return

            # Read WebSocket frames — server sends welcome tick immediately.
            # The message may be fragmented across multiple frames; reassemble.
            sock.settimeout(TIMEOUT)
            raw = b""
            deadline = time.time() + TIMEOUT

            def read_exact(n: int) -> bytes:
                """Read exactly n bytes from sock, refilling raw as needed."""
                nonlocal raw
                while len(raw) < n and time.time() < deadline:
                    chunk = sock.recv(65536)
                    if not chunk:
                        break
                    raw += chunk
                data, raw = raw[:n], raw[n:]
                return data

            message_payload = b""
            final_opcode = None

            # Read frames until a FIN frame is received
            while time.time() < deadline:
                header = read_exact(2)
                if len(header) < 2:
                    error.append("no WS frame header received within timeout")
                    sock.close()
                    return

                b0, b1 = header[0], header[1]
                fin = (b0 & 0x80) != 0
                opcode = b0 & 0x0F
                masked = (b1 & 0x80) != 0
                payload_len = b1 & 0x7F

                if payload_len == 126:
                    ext = read_exact(2)
                    payload_len = int.from_bytes(ext, "big")
                elif payload_len == 127:
                    ext = read_exact(8)
                    payload_len = int.from_bytes(ext, "big")

                mask_key = b""
                if masked:
                    mask_key = read_exact(4)

                payload_bytes = read_exact(payload_len)
                if masked:
                    payload_bytes = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload_bytes))

                if opcode == 8:  # close
                    error.append("server closed WS immediately")
                    sock.close()
                    return
                elif opcode == 9:  # ping — ignore
                    pass
                elif opcode in (1, 2):  # text/binary — first frame
                    final_opcode = opcode
                    message_payload += payload_bytes
                elif opcode == 0:  # continuation
                    message_payload += payload_bytes
                else:
                    error.append(f"unexpected opcode {opcode}")
                    sock.close()
                    return

                if fin and final_opcode is not None:
                    break

            if final_opcode == 1:  # text
                try:
                    msg = json.loads(message_payload.decode("utf-8"))
                    received.append(json.dumps(msg)[:120])
                except Exception as exc:
                    error.append(f"WS text frame but invalid JSON: {exc}")
            elif final_opcode == 2:  # binary
                error.append(f"received binary frame ({len(message_payload)} bytes), expected JSON text")
            elif not error:
                error.append("no complete WS message received within timeout")

            sock.close()
        except Exception as exc:
            error.append(f"exception: {exc}")

    t = threading.Thread(target=ws_connect, daemon=True)
    t.start()
    t.join(timeout=TIMEOUT + 1)

    if t.is_alive():
        return False, "timed out waiting for WS message"
    if error:
        return False, error[0]
    if received:
        return True, f"received tick frame: {received[0][:80]}"
    return False, "no message received and no error — unknown state"


def test_clunger_health():
    """GET /api/congress/sessions on clunger (public endpoint) — expect 200 + JSON array."""
    status, body = http_get("http://localhost:8081/api/congress/sessions")
    if status != 200:
        return False, f"HTTP {status}"
    try:
        payload = json.loads(body)
    except Exception as exc:
        return False, f"HTTP {status} but invalid JSON: {exc}"
    if not isinstance(payload, list):
        return False, f"HTTP {status} but expected JSON array, got {type(payload).__name__}"
    return True, f"HTTP {status} — {len(payload)} sessions returned"


# ── main ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("BigClungus Integration Tests")
    print(f"Run at: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
    print("=" * 60)

    run_test("1. Discord inject (correct secret)", test_discord_inject)
    run_test("2. Discord inject (bad secret rejected)", test_inject_rejects_bad_secret)
    run_test("3. Temporal worker health", test_temporal_worker)
    run_test("4. Congress /api/congress/active endpoint", test_congress_active_endpoint)
    run_test("5. Labs router discovery", test_labs_router)
    run_test("6. Commons-server WebSocket (tick message)", test_commons_ws)
    run_test("7. Clunger /api/congress/sessions (public)", test_clunger_health)

    print("=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"Results: {passed}/{total} passed")
    print("=" * 60)

    sys.exit(0 if passed == total else 1)
