"""
Unit and Integration Tests for PatchPilot Security Proxy.

Owned by Member 1 (Team A).
Tests request forwarding, hop-by-hop header filtering, timeout/connect error handling,
URL encoding safety, loopback isolation, redirect handling, privacy log redaction,
and management health check baseline.

Rules:
- No real network and no real lab server required.
- Uses httpx.MockTransport with FastAPI TestClient.
"""

from contextlib import contextmanager
import json
import logging
from typing import Callable, Generator
from fastapi.testclient import TestClient
import httpx
import pytest

from app.main import app as management_app
from app.proxy_app import app as proxy_app, proxy_service


@contextmanager
def mock_proxy_upstream(
    handler: Callable[[httpx.Request], httpx.Response]
) -> Generator[TestClient, None, None]:
    """
    Context manager that creates a TestClient for proxy_app and injects
    an httpx.AsyncClient using httpx.MockTransport into proxy_service.

    Ensures tests run completely in-memory without contacting a real upstream.
    """
    transport = httpx.MockTransport(handler)
    mock_client = httpx.AsyncClient(transport=transport, follow_redirects=False)

    with TestClient(proxy_app) as test_client:
        original_client = proxy_service._client
        proxy_service._client = mock_client
        try:
            yield test_client
        finally:
            proxy_service._client = original_client


# ==============================================================================
# Required Test 1: GET Forwarding
# ==============================================================================
def test_get_request_forwarded_accurately():
    """
    Prove GET method, path, and query reach http://127.0.0.1:8081 exactly,
    and the lab's status code and body are returned intact.
    """
    captured_request = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(
            status_code=200,
            headers={"Content-Type": "application/json"},
            json={"status": "ok", "service": "lab target"},
        )

    with mock_proxy_upstream(handler) as client:
        response = client.get("/health?check=1")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "lab target"}
    assert captured_request is not None
    assert captured_request.method == "GET"
    assert captured_request.url.path == "/health"
    assert captured_request.url.query.decode("latin-1") == "check=1"
    assert str(captured_request.url) == "http://127.0.0.1:8081/health?check=1"


# ==============================================================================
# Required Test 2: POST Forwarding
# ==============================================================================
def test_post_request_forwarded_with_body():
    """
    Prove POST is forwarded with its HTTP method, URL path, and request body intact.
    """
    captured_request = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(201, json={"created": True})

    payload = {"item": "demo", "count": 42}
    with mock_proxy_upstream(handler) as client:
        response = client.post("/items", json=payload)

    assert response.status_code == 201
    assert response.json() == {"created": True}
    assert captured_request is not None
    assert captured_request.method == "POST"
    assert captured_request.url.path == "/items"
    assert json.loads(captured_request.content.decode("utf-8")) == payload


# ==============================================================================
# Required Test 3: Request Hop-by-Hop & Encoding Headers Stripped
# ==============================================================================
def test_request_hop_by_hop_and_encoding_headers_stripped():
    """
    Prove hop-by-hop headers, Connection-nominated headers, and Accept-Encoding
    are NOT forwarded, while normal request headers (e.g., X-Test) ARE forwarded.
    """
    captured_request = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(200, text="headers evaluated")

    headers = {
        "Connection": "close, X-Custom-Hop",
        "Keep-Alive": "timeout=5",
        "TE": "trailers",
        "Upgrade": "websocket",
        "Transfer-Encoding": "chunked",
        "Proxy-Authorization": "Basic dGVzdDp0ZXN0",
        "X-Custom-Hop": "sensitive-hop-data",
        "Accept-Encoding": "x-client-encoding-marker",
        "X-Test": "pass-through-value",
    }

    with mock_proxy_upstream(handler) as client:
        response = client.get("/test-headers", headers=headers)

    assert response.status_code == 200
    assert captured_request is not None

    # Note: httpx automatically adds its own default headers (e.g. connection: keep-alive,
    # accept-encoding: gzip, deflate). We verify that the client-sent values were stripped:
    assert "x-client-encoding-marker" not in captured_request.headers.get("accept-encoding", "")
    assert captured_request.headers.get("connection") != "close, X-Custom-Hop"
    assert "x-custom-hop" not in captured_request.headers

    # Verify standard hop-by-hop headers that httpx does not generate are completely absent
    assert "keep-alive" not in captured_request.headers
    assert "te" not in captured_request.headers
    assert "upgrade" not in captured_request.headers
    assert "transfer-encoding" not in captured_request.headers
    assert "proxy-authorization" not in captured_request.headers

    # Verify standard custom header is preserved
    assert captured_request.headers.get("x-test") == "pass-through-value"


# ==============================================================================
# Required Test 4: Response Hop-by-Hop Headers Stripped
# ==============================================================================
def test_response_hop_by_hop_headers_stripped():
    """
    Prove upstream response hop-by-hop headers and Connection-nominated headers
    are NOT returned to the client, while normal response headers are preserved.
    """
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code=200,
            headers={
                "Connection": "close, X-Upstream-Nominated",
                "Keep-Alive": "timeout=10",
                "Upgrade": "websocket",
                "X-Upstream-Nominated": "remove-from-client",
                "X-Normal-Response-Header": "keep-on-client",
                "Content-Type": "text/plain",
            },
            content=b"safe response content",
        )

    with mock_proxy_upstream(handler) as client:
        response = client.get("/response-headers")

    assert response.status_code == 200
    assert "connection" not in response.headers
    assert "keep-alive" not in response.headers
    assert "upgrade" not in response.headers
    assert "x-upstream-nominated" not in response.headers
    assert response.headers.get("x-normal-response-header") == "keep-on-client"
    assert response.text == "safe response content"


# ==============================================================================
# Required Test 5: Upstream ConnectError returns 502
# ==============================================================================
def test_upstream_connection_error_returns_502():
    """
    Prove upstream connection error (httpx.ConnectError) returns HTTP 502 with
    exact standard error JSON envelope and no traceback or internal error text.
    """
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused by upstream target", request=request)

    with mock_proxy_upstream(handler) as client:
        response = client.get("/health")

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "UPSTREAM_UNAVAILABLE",
            "message": "Lab server unavailable",
        }
    }
    assert "Traceback" not in response.text
    assert "ConnectError" not in response.text


# ==============================================================================
# Required Test 6: Upstream ReadTimeout returns 502
# ==============================================================================
def test_upstream_timeout_returns_502():
    """
    Prove upstream timeout (httpx.ReadTimeout) returns HTTP 502 with the exact
    standard error JSON envelope and no traceback text.
    """
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Read timed out on upstream", request=request)

    with mock_proxy_upstream(handler) as client:
        response = client.get("/slow")

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "UPSTREAM_UNAVAILABLE",
            "message": "Lab server unavailable",
        }
    }
    assert "Traceback" not in response.text
    assert "ReadTimeout" not in response.text


# ==============================================================================
# Required Test 7: %3F in Path Is Not Decoded Into Query String
# ==============================================================================
def test_path_with_percent_encoded_question_mark():
    """
    Prove a path containing %3F (e.g., /x%3Fdemo_attack%3Dtrue) reaches the
    upstream still percent-encoded, with NO fake query string created.
    """
    captured_request = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(200, text="encoded path received")

    with mock_proxy_upstream(handler) as client:
        response = client.get("/x%3Fdemo_attack%3Dtrue")

    assert response.status_code == 200
    assert captured_request is not None
    # Upstream query string must remain empty
    assert captured_request.url.query == b""
    assert "?" not in str(captured_request.url)
    assert "%3F" in str(captured_request.url) or "%3f" in str(captured_request.url).lower()
    assert str(captured_request.url) == "http://127.0.0.1:8081/x%3Fdemo_attack%3Dtrue"


# ==============================================================================
# Required Test 8: Paths Starting with // Stay on Fixed Loopback Host
# ==============================================================================
def test_path_beginning_with_double_slash_stays_on_loopback():
    """
    Prove a path beginning with // (e.g., //evil.com/x) is still strictly sent
    to 127.0.0.1:8081 and cannot divert the proxy to an external host.
    """
    captured_request = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(200, text="loopback confirmed")

    with mock_proxy_upstream(handler) as client:
        # Test full testserver URL with double slash path
        response = client.get("http://testserver//evil.com/x")
        assert response.status_code == 200

    assert captured_request is not None
    assert captured_request.url.host == "127.0.0.1"
    assert captured_request.url.port == 8081
    assert captured_request.url.path == "//evil.com/x"
    assert str(captured_request.url) == "http://127.0.0.1:8081//evil.com/x"


# ==============================================================================
# Required Test 9: Upstream 404 and 501 Pass Through Unchanged
# ==============================================================================
def test_upstream_error_status_codes_pass_through():
    """
    Prove upstream HTTP 404 Not Found and 501 Not Implemented status codes
    pass through unchanged to the client.
    """
    for status_code in (404, 501):
        def handler(request: httpx.Request, code=status_code) -> httpx.Response:
            return httpx.Response(status_code=code, text=f"Upstream status {code}")

        with mock_proxy_upstream(handler) as client:
            response = client.get(f"/status-{status_code}")
            assert response.status_code == status_code
            assert response.text == f"Upstream status {status_code}"


# ==============================================================================
# Required Test 10: Upstream 302 Redirect Is Not Followed
# ==============================================================================
def test_upstream_redirect_not_followed():
    """
    Prove an upstream 302 redirect with Location header is returned as 302
    to the client (the proxy does not follow redirects on behalf of the user).
    """
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code=302,
            headers={"Location": "/target-destination"},
            text="Redirecting",
        )

    with mock_proxy_upstream(handler) as client:
        response = client.get("/redirect-test", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers.get("location") == "/target-destination"
    assert response.text == "Redirecting"


# ==============================================================================
# Required Test 11: Privacy Redaction in Logs
# ==============================================================================
def test_privacy_redaction_in_logs(caplog: pytest.LogCaptureFixture):
    """
    Prove query parameters (?secret=abc123) and request body ('password=xyz')
    are never leaked into captured proxy or httpx log output.
    """
    caplog.set_level(logging.INFO)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="privacy ok")

    with mock_proxy_upstream(handler) as client:
        response = client.post(
            "/login?secret=abc123",
            content=b"password=xyz",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert response.status_code == 200

    # Ensure sensitive credentials and raw queries never appear in log text
    assert "abc123" not in caplog.text
    assert "xyz" not in caplog.text


# ==============================================================================
# Required Test 12: Management App Health Check Baseline
# ==============================================================================
def test_management_app_health():
    """
    Prove the management app (app.main on port 8000) continues to answer
    GET /health with the exact required baseline JSON structure.
    """
    with TestClient(management_app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "PatchPilot Backend",
        "version": "0.1.0",
    }
