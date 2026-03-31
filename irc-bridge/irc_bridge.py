#!/usr/bin/env python3
"""
IRC Bridge — connects to nullclaw.georgelarson.me via WebSocket IRC (wss://)
and bridges to BigClungus via inject endpoint.

The IRC server is behind Cloudflare, only accessible via WebSocket (wss://).
Each WebSocket frame carries one IRC protocol line (no newline buffering needed).

- Connects via WSS WebSocket, subprotocol text.ircv3.net
- Joins #lobby
- Forwards channel messages to BigClungus via POST http://127.0.0.1:9876/inject
- Runs HTTP server on localhost:9879 to receive outgoing messages from BigClungus
- Handles reconnects gracefully
- Logs to stdout

BigClungus can reply to IRC:
  curl http://localhost:9879/say -d '{"message": "hello Nully"}'
  curl http://localhost:9879/say -d '{"message": "...", "target": "#lobby"}'
  curl http://localhost:9879/status   (GET)
"""

import os
import sys
import json
import logging
import asyncio
import threading
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler
from socketserver import TCPServer

import websockets

# --- Config ---
IRC_WSS_URL = "wss://nullclaw.georgelarson.me"
IRC_NICK = "TheSecondClungus"
IRC_REALNAME = "BigClungus Discord Bot"
IRC_CHANNEL = "#lobby"

INJECT_URL = "http://127.0.0.1:9876/inject"
INJECT_CHAT_ID = "1486907231747309609"
HTTP_PORT = 9879
RECONNECT_DELAY = 30

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("irc-bridge")


def get_env():
    secret = os.environ.get("DISCORD_INJECT_SECRET")
    if not secret:
        raise RuntimeError("DISCORD_INJECT_SECRET not set in environment")
    channel = os.environ.get("IRC_CHANNEL", IRC_CHANNEL)
    return secret, channel


def inject_to_discord(secret: str, content: str):
    payload = json.dumps({
        "content": content,
        "chat_id": INJECT_CHAT_ID,
        "user": "irc-bridge",
    }).encode()
    req = urllib.request.Request(
        INJECT_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-inject-secret": secret,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            log.info(f"Injected to Discord (status {resp.status}): {content[:100]}")
    except urllib.error.URLError as e:
        log.error(f"Failed to inject to Discord: {e}")


# Shared state
_loop: asyncio.AbstractEventLoop = None
_ws = None
_connected = False
_channel = IRC_CHANNEL
_secret = None


async def irc_send(ws, line: str):
    log.info(f">> {line}")
    # Each WebSocket frame is one IRC line; no trailing \r\n needed but servers accept it
    await ws.send(line + "\r\n")


async def handle_line(ws, line: str, secret: str, channel: str):
    global _connected
    line = line.rstrip("\r\n")
    if not line:
        return
    log.info(f"<< {line}")

    if line.startswith("PING"):
        token = line.split(":", 1)[1] if ":" in line else "irc"
        await irc_send(ws, f"PONG :{token}")
        return

    parts = line.split(" ", 3)
    if len(parts) < 2:
        return

    # RPL_WELCOME — join channel
    if parts[1] == "001":
        log.info(f"Registered. Joining {channel}...")
        await irc_send(ws, f"JOIN {channel}")
        _connected = True
        inject_to_discord(
            secret,
            f"[IRC] BigClungus connected to LarsonNet (nullclaw.georgelarson.me) and joined {channel}. "
            f"Reply via: curl http://localhost:{HTTP_PORT}/say -d '{{\"message\": \"text\"}}'",
        )
        return

    if parts[1] == "PRIVMSG" and len(parts) >= 4:
        prefix = parts[0].lstrip(":")
        nick = prefix.split("!")[0] if "!" in prefix else prefix
        target = parts[2]
        text = parts[3].lstrip(":")

        if nick.lower() == IRC_NICK.lower():
            return

        if target.startswith("#") or target.startswith("&"):
            content = f"[IRC {target}] <{nick}> {text}"
        else:
            content = f"[IRC DM from {nick}] {text}"

        inject_to_discord(secret, content)
        return

    if parts[1] == "433":
        new_nick = IRC_NICK + "_"
        log.warning(f"Nick in use, trying {new_nick}")
        await irc_send(ws, f"NICK {new_nick}")
        return

    if parts[1] == "KICK" and len(parts) >= 4:
        kicked_nick = parts[3].split()[0]
        ch = parts[2]
        if kicked_nick.lower() == IRC_NICK.lower():
            log.warning(f"Kicked from {ch}, rejoining in 10s...")
            await asyncio.sleep(10)
            await irc_send(ws, f"JOIN {ch}")
        return


async def irc_client_loop(secret: str, channel: str):
    global _ws, _connected
    while True:
        try:
            log.info(f"Connecting via WebSocket to {IRC_WSS_URL}...")
            async with websockets.connect(
                IRC_WSS_URL,
                subprotocols=["text.ircv3.net"],
                ping_interval=60,
                ping_timeout=20,
                additional_headers={
                    "User-Agent": "BigClungus-IRC-Bridge/1.0",
                    "Origin": "https://georgelarson.me",
                },
                open_timeout=15,
            ) as ws:
                _ws = ws
                _connected = False

                await irc_send(ws, f"NICK {IRC_NICK}")
                await irc_send(ws, f"USER {IRC_NICK} 0 * :{IRC_REALNAME}")

                # Each recv() returns one complete IRC line (one WS frame = one IRC line)
                async for raw_msg in ws:
                    # Handle both str and bytes frames
                    if isinstance(raw_msg, bytes):
                        raw_msg = raw_msg.decode("utf-8", errors="replace")
                    # Strip any trailing whitespace/newlines
                    line = raw_msg.rstrip("\r\n")
                    await handle_line(ws, line, secret, channel)

        except (websockets.exceptions.WebSocketException, OSError, ConnectionError) as e:
            log.error(f"WebSocket connection lost: {e}")
        except Exception as e:
            log.error(f"Unexpected error: {e}", exc_info=True)
        finally:
            _ws = None
            _connected = False

        inject_to_discord(
            secret,
            f"[IRC] Connection lost. Reconnecting in {RECONNECT_DELAY}s...",
        )
        await asyncio.sleep(RECONNECT_DELAY)


def send_to_irc(message: str, target: str = None):
    global _loop, _ws, _connected, _channel
    if not _connected or _ws is None or _loop is None:
        raise RuntimeError("IRC not connected")
    tgt = target or _channel

    async def _do_send():
        await irc_send(_ws, f"PRIVMSG {tgt} :{message}")

    future = asyncio.run_coroutine_threadsafe(_do_send(), _loop)
    future.result(timeout=5)


def send_raw_to_irc(line: str):
    global _loop, _ws, _connected
    if not _connected or _ws is None or _loop is None:
        raise RuntimeError("IRC not connected")

    async def _do_send():
        await irc_send(_ws, line)

    future = asyncio.run_coroutine_threadsafe(_do_send(), _loop)
    future.result(timeout=5)


# --- HTTP server ---

class IRCReplyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log.info(f"HTTP {fmt % args}")

    def do_POST(self):
        path = self.path.rstrip("/")

        if path not in ("/say", "/raw"):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "use POST /say, POST /raw, or GET /status"}')
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error": "invalid JSON"}')
            return

        if path == "/raw":
            line = data.get("line", "").strip()
            if not line:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "line required"}')
                return
            try:
                send_raw_to_irc(line)
            except RuntimeError as e:
                self.send_response(503)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
                return
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "line": line}).encode())
            return

        # /say handler
        message = data.get("message", "").strip()
        target = data.get("target", None)

        if not message:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error": "message required"}')
            return

        try:
            send_to_irc(message, target)
        except RuntimeError as e:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
            return
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        effective_target = target or _channel
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "target": effective_target, "message": message}).encode())

    def do_GET(self):
        if self.path.rstrip("/") in ("/status", ""):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({
                "connected": _connected,
                "channel": _channel,
                "server": IRC_WSS_URL,
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "not found"}')


class ReusableHTTPServer(TCPServer):
    allow_reuse_address = True
    address_family = __import__("socket").AF_INET


def run_http_server():
    server = ReusableHTTPServer(("127.0.0.1", HTTP_PORT), IRCReplyHandler)
    log.info(f"HTTP server listening on localhost:{HTTP_PORT}")
    server.serve_forever()


def main():
    global _loop, _secret, _channel
    _secret, _channel = get_env()
    log.info(f"Starting IRC bridge: {IRC_WSS_URL}, nick={IRC_NICK}, channel={_channel}")

    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    try:
        _loop.run_until_complete(irc_client_loop(_secret, _channel))
    except KeyboardInterrupt:
        log.info("Interrupted, shutting down...")


if __name__ == "__main__":
    main()
