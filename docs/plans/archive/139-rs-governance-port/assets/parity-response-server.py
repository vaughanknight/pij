#!/usr/bin/env python3
"""Private scripted HTTP authority for byte-exact real CLI/shim comparison."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Lock

root = Path(__file__).resolve().parent
lock = Lock()
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *_args):
        pass
    def do_GET(self):
        self.reply()
    def do_POST(self):
        self.reply()
    def reply(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0"))).decode()
        with lock:
            config = json.loads((root / "case.json").read_text())
            with (root / "requests.jsonl").open("a") as output:
                output.write(json.dumps({"case": config["id"], "path": self.path,
                    "method": self.command, "body": body}) + "\n")
        if self.headers.get("Authorization") != "Bearer private-parity-key":
            status, text = 401, '{"ok":false,"command":"auth","v":2,"error":"auth","meta":"private fixture key required"}'
        elif self.path == "/health":
            status, text = config.get("health_status", 200), config.get("health", '{"ok":true,"command":"pij ping","v":2,"data":{"status":"healthy","build":"deterministic-client-fixture","offline":false,"machine":"fixture-machine"}}')
        elif self.path.split("?", 1)[0] in config.get("responses", {}):
            selected = config["responses"][self.path.split("?", 1)[0]]
            status, text = selected["status"], selected["body"]
        elif self.path.split("?", 1)[0] == config["path"]:
            status, text = config["status"], config["body"]
        else:
            status, text = 500, '{"ok":false,"command":"fixture","v":2,"error":"adapter","meta":"unexpected private fixture request"}'
        encoded = text.encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
        self.wfile.flush()

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print(f"PARITY_READY {server.server_port}", flush=True)
server.serve_forever()
