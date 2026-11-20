"""
Unit and Security Tests for PatchPilot Dummy HTTP Lab Server.

Owned by Team A, Member 2 (Security Testing & Scanner Developer).
Branch: feature/scanner

Verifies:
  1. GET /health endpoint behavior with and without query parameters.
  2. GET / simulated Apache/PHP homepage serving.
  3. Safe POST request body consumption without execution or interpretation.
  4. HTTP 413 Payload Too Large rejection for bodies exceeding MAX_BODY_SIZE.
  5. HTTP 400 Bad Request rejection for negative or malformed Content-Length.
  6. Query string privacy: ensuring query parameters are stripped from logs and responses.
  7. Simulated stack headers (Apache/2.4.52 and PHP/8.2.0).
"""

import io
import json
from pathlib import Path
import sys
from typing import Dict, Tuple
import pytest

# Ensure repository root is on sys.path for importing lab.server
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from lab.server import DummyTargetHandler, MAX_BODY_SIZE, HOST, PORT


class MockHeaders(dict):
    """Case-insensitive dictionary simulating http.client.HTTPMessage."""

    def get(self, key, default=None):
        for k, v in self.items():
            if k.lower() == key.lower():
                return v
        return default


class ForbiddenReadStream(io.BytesIO):
    """
    A request body stream that raises an AssertionError if read(), readline(),
    or readlines() is called. Used to prove that the server rejects oversized or
    invalid requests without buffering any body bytes into RAM.
    """

    def read(self, *args, **kwargs):
        raise AssertionError(
            "CRITICAL SECURITY FAILURE: Server attempted to read request body on an invalid/oversized request!"
        )

    def readline(self, *args, **kwargs):
        raise AssertionError(
            "CRITICAL SECURITY FAILURE: Server attempted to readline on an invalid/oversized request!"
        )

    def readlines(self, *args, **kwargs):
        raise AssertionError(
            "CRITICAL SECURITY FAILURE: Server attempted to readlines on an invalid/oversized request!"
        )


def make_handler(
    method: str,
    path: str,
    headers: Dict[str, str] = None,
    body: bytes = b"",
    body_stream: io.BytesIO = None,
) -> Tuple[DummyTargetHandler, io.BytesIO]:
    """
    Instantiate an isolated, headless DummyTargetHandler with in-memory streams.
    Does not bind physical network sockets. Accepts a custom body_stream to test
    zero-read guarantees.
    """
    handler = DummyTargetHandler.__new__(DummyTargetHandler)
    handler.request_version = "HTTP/1.1"
    handler.protocol_version = "HTTP/1.1"
    handler.requestline = f"{method} {path} HTTP/1.1"
    handler.client_address = ("127.0.0.1", 54321)
    handler.rfile = body_stream if body_stream is not None else io.BytesIO(body)
    handler.wfile = io.BytesIO()
    handler.headers = MockHeaders(headers or {})
    handler.path = path
    handler.command = method
    handler.close_connection = False
    return handler, handler.wfile


def parse_response(wfile: io.BytesIO) -> Tuple[int, Dict[str, str], bytes]:
    """Parse raw HTTP response bytes into status code, headers dict, and body."""
    raw = wfile.getvalue()
    parts = raw.split(b"\r\n\r\n", 1)
    header_block = parts[0].decode("latin-1")
    body = parts[1] if len(parts) > 1 else b""

    lines = header_block.split("\r\n")
    status_line = lines[0]  # e.g., 'HTTP/1.1 200 OK'
    status_code = int(status_line.split()[1])

    headers = {}
    for line in lines[1:]:
        if ":" in line:
            key, val = line.split(":", 1)
            headers[key.strip().lower()] = val.strip()

    return status_code, headers, body


# ==============================================================================
# Test 1: GET /health with and without query parameters
# ==============================================================================
def test_lab_health_endpoint_with_and_without_query_params():
    """
    Verify that GET /health returns HTTP 200 JSON status 'ok',
    and that adding query parameters (e.g., /health?check=1&token=secret)
    does not break routing.
    """
    # Case A: Standard clean path
    h1, w1 = make_handler("GET", "/health")
    h1.do_GET()
    status1, headers1, body1 = parse_response(w1)
    assert status1 == 200
    assert "application/json" in headers1.get("content-type", "")
    data1 = json.loads(body1.decode("utf-8"))
    assert data1["status"] == "ok"
    assert data1["service"] == "PatchPilot Lab Target Server"
    assert data1["simulated_stack"] == "Apache/2.4.52 + PHP/8.2.0"
    assert data1["host"] == HOST
    assert data1["port"] == PORT

    # Case B: Health path with query parameters
    h2, w2 = make_handler("GET", "/health?check=1&cache_buster=xyz123")
    h2.do_GET()
    status2, headers2, body2 = parse_response(w2)
    assert status2 == 200
    assert "application/json" in headers2.get("content-type", "")
    data2 = json.loads(body2.decode("utf-8"))
    assert data2["status"] == "ok"


# ==============================================================================
# Test 2: GET / homepage
# ==============================================================================
def test_lab_homepage_get():
    """
    Verify that GET / returns HTTP 200 with text/html content-type
    and simulated PHP/Apache web server branding.
    """
    h, w = make_handler("GET", "/")
    h.do_GET()
    status, headers, body = parse_response(w)
    assert status == 200
    assert "text/html" in headers.get("content-type", "")
    html_text = body.decode("utf-8")
    assert "<!DOCTYPE html>" in html_text
    assert "ISOLATED LAB TARGET" in html_text
    assert "Dummy PHP Web Server" in html_text
    assert "PHP 8.2 / Apache 2.4" in html_text


# ==============================================================================
# Test 3: Safe POST request body consumption
# ==============================================================================
def test_lab_post_safe_body_consumption():
    """
    Verify that legitimate POST requests consume request body bytes safely
    without executing or interpreting content, returning received_body_length.
    """
    payload = json.dumps({"username": "auditor", "action": "health_inquiry"}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(payload)),
    }
    h, w = make_handler("POST", "/contact", headers=headers, body=payload)
    h.do_POST()
    status, headers_out, body = parse_response(w)
    assert status == 200
    assert "application/json" in headers_out.get("content-type", "")

    data = json.loads(body.decode("utf-8"))
    assert data["status"] == "ok"
    assert data["path"] == "/contact"
    assert data["received_body_length"] == len(payload)
    assert data["simulated_stack"] == "Apache/2.4.52 + PHP/8.2.0"


# ==============================================================================
# Test 4: Rejection of oversized POST bodies (HTTP 413)
# ==============================================================================
def test_lab_post_payload_too_large_returns_413():
    """
    Verify that POST requests exceeding MAX_BODY_SIZE (1 MB) are rejected
    immediately with HTTP 413 Payload Too Large without buffering into RAM,
    and the connection is marked to close.

    Uses ForbiddenReadStream to strictly assert that read() is never called on rfile.
    """
    oversized_length = MAX_BODY_SIZE + 500
    headers = {"Content-Length": str(oversized_length)}

    forbidden_stream = ForbiddenReadStream()
    h, w = make_handler("POST", "/upload", headers=headers, body_stream=forbidden_stream)
    h.do_POST()
    status, headers_out, body = parse_response(w)

    assert status == 413
    assert headers_out.get("connection") == "close"
    assert h.close_connection is True

    data = json.loads(body.decode("utf-8"))
    assert data["status"] == "error"
    assert data["error"]["code"] == "PAYLOAD_TOO_LARGE"
    assert str(MAX_BODY_SIZE) in data["error"]["message"]


# ==============================================================================
# Test 5: Rejection of negative and malformed Content-Length (HTTP 400)
# ==============================================================================
def test_lab_post_negative_and_malformed_content_length_returns_400():
    """
    Verify that negative or non-integer Content-Length values are rejected
    with HTTP 400 Bad Request to prevent indefinite read(-1) hangs.

    Uses ForbiddenReadStream to strictly assert that read() is never called on rfile.
    """
    # Negative Content-Length
    stream1 = ForbiddenReadStream()
    h1, w1 = make_handler("POST", "/api/test", headers={"Content-Length": "-1"}, body_stream=stream1)
    h1.do_POST()
    status1, headers1, body1 = parse_response(w1)
    assert status1 == 400
    assert h1.close_connection is True
    assert headers1.get("connection") == "close"
    data1 = json.loads(body1.decode("utf-8"))
    assert data1["error"]["code"] == "BAD_REQUEST"

    # Malformed / non-numeric Content-Length
    stream2 = ForbiddenReadStream()
    h2, w2 = make_handler("POST", "/api/test", headers={"Content-Length": "not_a_number"}, body_stream=stream2)
    h2.do_POST()
    status2, headers2, body2 = parse_response(w2)
    assert status2 == 400
    assert h2.close_connection is True
    data2 = json.loads(body2.decode("utf-8"))
    assert data2["error"]["code"] == "BAD_REQUEST"


# ==============================================================================
# Test 6: Query string privacy: no query parameters in logs or responses
# ==============================================================================
def test_lab_query_string_privacy_not_in_logs(capsys: pytest.CaptureFixture):
    """
    Verify that query strings (which may contain sensitive tokens, keys, or markers)
    are strictly stripped from server console output, request logging, and JSON responses.
    """
    secret_marker = "sensitive_token_super_secret_xyz123"
    target_path = f"/health?token={secret_marker}&demo_attack=true"

    h, w = make_handler("GET", target_path)
    h.do_GET()
    _status, _headers, body = parse_response(w)

    # Check captured stdout logs
    captured = capsys.readouterr().out
    assert secret_marker not in captured, (
        f"CRITICAL PRIVACY VIOLATION: Secret token was logged in server stdout: {captured}"
    )
    assert "demo_attack" not in captured, (
        f"Query parameter 'demo_attack' must not be logged: {captured}"
    )
    assert "/health" in captured

    # Also verify POST request path sanitization in JSON response
    post_secret = "post_param_secret_key_456"
    post_path = f"/contact?key={post_secret}"
    h_post, w_post = make_handler("POST", post_path, body=b"")
    h_post.do_POST()
    _status_post, _headers_post, body_post = parse_response(w_post)

    post_data = json.loads(body_post.decode("utf-8"))
    assert post_data["path"] == "/contact", (
        f"POST response echoed raw query string: {post_data['path']}"
    )
    assert post_secret not in json.dumps(post_data)

    captured_post = capsys.readouterr().out
    assert post_secret not in captured_post


# ==============================================================================
# Test 7: Simulated server headers
# ==============================================================================
def test_lab_simulated_server_headers():
    """
    Verify that responses from lab/server.py include the simulated Apache and PHP
    version headers per the architectural specifications.
    """
    h, w = make_handler("GET", "/health")
    h.do_GET()
    _status, headers, _body = parse_response(w)

    # Check headers
    assert headers.get("x-powered-by") == "PHP/8.2.0"
    assert headers.get("access-control-allow-origin") == "*"
    assert DummyTargetHandler.server_version == "Apache/2.4.52 (Ubuntu)"
