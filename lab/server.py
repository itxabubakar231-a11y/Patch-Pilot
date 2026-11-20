"""
PatchPilot Lab - Minimal Local Dummy HTTP Server
Simulates an isolated local target server (e.g. PHP/Apache web environment)
strictly on 127.0.0.1 for local testing.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import time
import urllib.parse

HOST = "127.0.0.1"
PORT = 8081
MAX_BODY_SIZE = 1_048_576  # 1 MB maximum allowed request body size


class DummyTargetHandler(BaseHTTPRequestHandler):
    server_version = "Apache/2.4.52 (Ubuntu)"
    sys_version = ""

    def _set_headers(self, content_type="text/html", status_code=200, extra_headers=None):
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("X-Powered-By", "PHP/8.2.0")
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()

    def _send_error_json(self, status_code: int, error_code: str, message: str):
        """Send a structured JSON error response and close connection to avoid hang/unbounded reads."""
        self.close_connection = True
        self._set_headers(
            content_type="application/json",
            status_code=status_code,
            extra_headers={"Connection": "close"},
        )
        response = {
            "error": {
                "code": error_code,
                "message": message,
            },
            "status": "error",
            "simulated_stack": "Apache/2.4.52 + PHP/8.2.0",
        }
        self.wfile.write(json.dumps(response, indent=2).encode("utf-8"))

    def log_request(self, code="-", size="-"):
        """Privacy-safe request logger: redacts query parameters from self.requestline."""
        clean_path = urllib.parse.urlsplit(self.path).path
        clean_requestline = f"{self.command} {clean_path} {self.request_version}"
        self.log_message('"%s" %s %s', clean_requestline, str(code), str(size))

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        clean_path = parsed.path
        timestamp = time.strftime("[%Y-%m-%d %H:%M:%S]")
        print(f"{timestamp} Incoming GET request: {clean_path} from {self.client_address[0]}")

        if clean_path == "/health":
            self._set_headers(content_type="application/json")
            response = {
                "status": "ok",
                "service": "PatchPilot Lab Target Server",
                "simulated_stack": "Apache/2.4.52 + PHP/8.2.0",
                "host": HOST,
                "port": PORT,
            }
            self.wfile.write(json.dumps(response, indent=2).encode("utf-8"))
            return

        # Default simulated target homepage
        self._set_headers(content_type="text/html")
        html_content = (
            "<!DOCTYPE html>\n"
            "<html lang=\"en\">\n"
            "<head>\n"
            "    <meta charset=\"UTF-8\">\n"
            "    <title>PatchPilot Isolated Lab Target</title>\n"
            "    <style>\n"
            "        body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; margin: 40px; background: #0f172a; color: #f8fafc; }\n"
            "        .card { background: #1e293b; border-radius: 8px; padding: 24px; max-width: 600px; border: 1px solid #334155; }\n"
            "        .tag { display: inline-block; background: #0284c7; color: white; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; }\n"
            "        h1 { margin-top: 12px; font-size: 22px; }\n"
            "        pre { background: #020617; padding: 12px; border-radius: 4px; overflow-x: auto; color: #38bdf8; font-size: 13px; }\n"
            "    </style>\n"
            "</head>\n"
            "<body>\n"
            "    <div class=\"card\">\n"
            "        <span class=\"tag\">ISOLATED LAB TARGET</span>\n"
            "        <h1>Dummy PHP Web Server</h1>\n"
            "        <p>This is a safe, dummy local HTTP service running inside the PatchPilot lab folder.</p>\n"
            "        <p>Simulated Environment: <strong>PHP 8.2 / Apache 2.4</strong></p>\n"
            "        <pre>GET /health -&gt; Returns target health JSON</pre>\n"
            "    </div>\n"
            "</body>\n"
            "</html>"
        )
        self.wfile.write(html_content.encode("utf-8"))

    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        clean_path = parsed.path
        timestamp = time.strftime("[%Y-%m-%d %H:%M:%S]")
        print(f"{timestamp} Incoming POST request: {clean_path} from {self.client_address[0]}")

        # Safely determine request body length from Content-Length header
        raw_cl = self.headers.get("Content-Length")
        if raw_cl is not None:
            try:
                content_length = int(raw_cl.strip())
            except (ValueError, TypeError):
                self._send_error_json(
                    status_code=400,
                    error_code="BAD_REQUEST",
                    message="Malformed Content-Length header.",
                )
                return

            if content_length < 0:
                self._send_error_json(
                    status_code=400,
                    error_code="BAD_REQUEST",
                    message="Negative Content-Length header.",
                )
                return
        else:
            content_length = 0

        # Enforce maximum body size without buffering oversized payloads
        if content_length > MAX_BODY_SIZE:
            self._send_error_json(
                status_code=413,
                error_code="PAYLOAD_TOO_LARGE",
                message=f"Request body exceeds maximum limit of {MAX_BODY_SIZE} bytes.",
            )
            return

        # Safely read raw body bytes without executing or interpreting content
        if content_length > 0:
            body = self.rfile.read(content_length)
            received_body_length = len(body)
        else:
            received_body_length = 0

        # Return a simple JSON response confirming receipt
        self._set_headers(content_type="application/json", status_code=200)
        response = {
            "status": "ok",
            "message": "POST request received by PatchPilot Lab Target Server",
            "path": clean_path,
            "received_body_length": received_body_length,
            "simulated_stack": "Apache/2.4.52 + PHP/8.2.0",
        }
        self.wfile.write(json.dumps(response, indent=2).encode("utf-8"))

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
