"""
PatchPilot Lab - Minimal Local Dummy HTTP Server
Simulates an isolated local target server (e.g. PHP/Apache web environment)
strictly on 127.0.0.1 for local testing.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import time

HOST = "127.0.0.1"
PORT = 8081


class DummyTargetHandler(BaseHTTPRequestHandler):
    server_version = "Apache/2.4.52 (Ubuntu)"
    sys_version = ""

    def _set_headers(self, content_type="text/html", status_code=200):
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("X-Powered-By", "PHP/8.2.0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_GET(self):
        timestamp = time.strftime("[%Y-%m-%d %H:%M:%S]")
        print(f"{timestamp} Incoming GET request: {self.path} from {self.client_address[0]}")

        if self.path == "/health":
            self._set_headers(content_type="application/json")
            response = {
                "status": "ok",
                "service": "PatchPilot Lab Target Server",
                "simulated_stack": "Apache/2.4.52 + PHP/8.2.0",
                "host": HOST,
                "port": PORT
            }
            self.wfile.write(json.dumps(response, indent=2).encode("utf-8"))
            return

        # Default simulated target homepage
        self._set_headers(content_type="text/html")
        html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>PatchPilot Isolated Lab Target</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #0f172a; color: #f8fafc; }
        .card { background: #1e293b; border-radius: 8px; padding: 24px; max-width: 600px; border: 1px solid #334155; }
        .tag { display: inline-block; background: #0284c7; color: white; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; }
        h1 { margin-top: 12px; font-size: 22px; }
        pre { background: #020617; padding: 12px; border-radius: 4px; overflow-x: auto; color: #38bdf8; font-size: 13px; }
    </style>
</head>
<body>
    <div class="card">
        <span class="tag">ISOLATED LAB TARGET</span>
        <h1>Dummy PHP Web Server</h1>
        <p>This is a safe, dummy local HTTP service running inside the PatchPilot lab folder.</p>
        <p>Simulated Environment: <strong>PHP 8.2 / Apache 2.4</strong></p>
        <pre>GET /health -> Returns target health JSON</pre>
    </div>
</body>
</html>"""
        self.wfile.write(html_content.encode("utf-8"))

    def log_message(self, format, *args):
        # Format custom log line
        print(f"[LAB SERVER] {self.address_string()} - {format % args}")


def run(host=HOST, port=PORT):
    server_address = (host, port)
    httpd = HTTPServer(server_address, DummyTargetHandler)
    print("=" * 60)
    print(f"[*] PatchPilot Dummy HTTP Lab Server started successfully")
    print(f"[*] Listening on: http://{host}:{port}")
    print(f"[*] Health Check: http://{host}:{port}/health")
    print(f"[*] Local only - No external networking")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Shutting down dummy lab server...")
        httpd.server_close()


if __name__ == "__main__":
    run()

