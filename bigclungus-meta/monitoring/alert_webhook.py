#!/usr/bin/env python3
"""Alertmanager webhook -> BigClungus inject bridge."""
import json, os, urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

INJECT_URL = "http://127.0.0.1:9876/inject"
CHAT_ID = "1485343472952148008"


def get_secret():
    env_file = os.path.expanduser("~/.claude/channels/discord/.env")
    for line in open(env_file):
        if line.startswith("DISCORD_INJECT_SECRET"):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("DISCORD_INJECT_SECRET not found")


SECRET = get_secret()


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        for alert in body.get("alerts", []):
            status = alert.get("status", "firing")
            name = alert.get("labels", {}).get("alertname", "unknown")
            summary = alert.get("annotations", {}).get("summary", "")
            if status == "firing":
                msg = f"⚠️ **{name}**: {summary}"
            else:
                msg = f"✅ **{name}** resolved: {summary}"
            req = urllib.request.Request(
                INJECT_URL,
                data=json.dumps({"content": msg, "chat_id": CHAT_ID, "user": "prometheus"}).encode(),
                headers={"Content-Type": "application/json", "x-inject-secret": SECRET},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass  # suppress access logs


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 9095), Handler)
    print("alert webhook listening on :9095")
    server.serve_forever()
