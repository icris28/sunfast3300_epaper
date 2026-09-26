"""Optional local JSON endpoint; same snapshot can feed future E1001 firmware."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread


class SnapshotServer:
    def __init__(self, host: str = "127.0.0.1", port: int = 8765) -> None:
        self.lock = Lock()
        self.snapshot: dict = {}
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/":
                    body = (Path(__file__).parent / "display.html").read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if self.path != "/snapshot":
                    self.send_error(404)
                    return
                with owner.lock:
                    body = json.dumps(owner.snapshot).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format, *args):
                pass

        self.httpd = ThreadingHTTPServer((host, port), Handler)

    def update(self, snapshot: dict) -> None:
        with self.lock:
            self.snapshot = snapshot

    def start(self) -> None:
        Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
