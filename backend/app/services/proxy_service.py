"""
Reverse Proxy Forwarding Service for PatchPilot.

Handles safe, local-only HTTP forwarding from the security proxy (port 8080)
to the isolated lab upstream (port 8081) using httpx.AsyncClient.

Enforces:
1. Fixed loopback destination (strictly http://127.0.0.1:8081).
2. Hop-by-hop header removal in both directions.
3. Strict privacy: never logs or stores raw query strings, bodies, cookies,
   or Authorization headers.
4. Clean HTTP 502 Bad Gateway response when upstream is unreachable.
5. Buffered responses (no complex streaming or database dependencies in Sprint 1).
"""

import logging
from typing import Dict, Mapping, Optional, Set
import urllib.parse
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import httpx

from app.core.config import (
    LAB_UPSTREAM_URL,
    PROXY_CONNECT_TIMEOUT_SECONDS,
    PROXY_MAX_CONNECTIONS,
    PROXY_MAX_KEEP_ALIVE_CONNECTIONS,
    PROXY_POOL_TIMEOUT_SECONDS,
    PROXY_READ_TIMEOUT_SECONDS,
    PROXY_WRITE_TIMEOUT_SECONDS,
)

logger = logging.getLogger("patchpilot.proxy")

# Suppress httpx and httpcore INFO logs because they log the full target URL
# including raw query strings, which violates our privacy redaction requirements.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Standard HTTP hop-by-hop headers defined by RFC 2616 / RFC 7230 / RFC 9110.
# These headers are meaningful only for a single transport link and must NOT
# be forwarded across the reverse proxy.
HOP_BY_HOP_HEADERS: Set[str] = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


def filter_request_headers(request_headers: Mapping[str, str]) -> Dict[str, str]:
    """
    Filter incoming client request headers before forwarding to the upstream lab.

    Removes:
    - Standard hop-by-hop headers.
    - Any header nominated inside the 'Connection' header value.
    - 'host' and 'content-length' (so httpx recalculates them accurately).
    - 'accept-encoding' (proxy strips content-encoding, letting httpx negotiate decodable encodings).
    """
    stripped = set(HOP_BY_HOP_HEADERS)

    # If the Connection header specifies additional headers to remove, strip them too
    connection_val = request_headers.get("connection")
    if connection_val:
        for item in connection_val.split(","):
            cleaned = item.strip().lower()
            if cleaned:
                stripped.add(cleaned)

    # Let httpx calculate the correct Host and framing for the upstream target
    stripped.add("host")
    stripped.add("content-length")

    # Strip accept-encoding so httpx negotiates encodings it can decode itself
    stripped.add("accept-encoding")

    forwarded: Dict[str, str] = {}
    for key, value in request_headers.items():
        if key.lower() not in stripped:
            forwarded[key] = value

    return forwarded


def filter_response_headers(upstream_headers: httpx.Headers) -> Dict[str, str]:
    """
    Filter upstream response headers before returning the response to the client.

    Removes:
    - Hop-by-hop headers.
    - Any header nominated inside the upstream 'Connection' header.
    - 'content-length' (Starlette Response sets this based on buffered body).
    - 'content-encoding' (httpx automatically decodes content, preventing compression mismatches).
    """
    stripped = set(HOP_BY_HOP_HEADERS)

    connection_val = upstream_headers.get("connection")
    if connection_val:
        for item in connection_val.split(","):
            cleaned = item.strip().lower()
            if cleaned:
                stripped.add(cleaned)

    stripped.add("content-length")
    stripped.add("content-encoding")

    filtered: Dict[str, str] = {}
    for key, value in upstream_headers.items():
        if key.lower() not in stripped:
            filtered[key] = value

    return filtered


class ProxyService:
    """
    Service responsible for forwarding HTTP traffic to the fixed lab upstream.
    Uses a long-lived httpx.AsyncClient managed via the ASGI application lifespan.
    """

    def __init__(self, upstream_base_url: str = LAB_UPSTREAM_URL) -> None:
        # Base URL is immutable; ensures requests cannot target arbitrary external systems
        self.upstream_base_url = upstream_base_url.rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    async def start(self) -> None:
        """Initialize the shared httpx.AsyncClient connection pool."""
        if self._client is None or self._client.is_closed:
            limits = httpx.Limits(
                max_keepalive_connections=PROXY_MAX_KEEP_ALIVE_CONNECTIONS,
                max_connections=PROXY_MAX_CONNECTIONS,
            )
            timeout = httpx.Timeout(
                connect=PROXY_CONNECT_TIMEOUT_SECONDS,
                read=PROXY_READ_TIMEOUT_SECONDS,
                write=PROXY_WRITE_TIMEOUT_SECONDS,
                pool=PROXY_POOL_TIMEOUT_SECONDS,
            )
            self._client = httpx.AsyncClient(
                limits=limits,
                timeout=timeout,
                # A reverse proxy must not follow redirects on behalf of the client
                follow_redirects=False,
            )

    async def stop(self) -> None:
        """Gracefully close the httpx.AsyncClient and its connection pool."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def forward_request(
        self,
        request: Request,
        client_override: Optional[httpx.AsyncClient] = None,
    ) -> Response:
        """
        Forward an incoming HTTP request to the fixed lab upstream and return its response.

        Privacy rule:
        Never logs or stores raw query strings, request bodies, cookies,
        or Authorization headers. Only safe HTTP method and path are logged.
        """
        # Ensure client is ready if lifespan wasn't invoked
        client = client_override or self._client
        if client is None or client.is_closed:
            await self.start()
            client = self._client

        # Safely extract raw path without percent-decoding (prevents %3F turning into '?')
        raw_path_bytes = request.scope.get("raw_path")
        if isinstance(raw_path_bytes, bytes):
            raw_path = raw_path_bytes.decode("latin-1")
        else:
            raw_path = urllib.parse.quote(request.url.path, safe="/")

        if not raw_path.startswith("/"):
            raw_path = f"/{raw_path}"

        target_url = f"{self.upstream_base_url}{raw_path}"

        # Safely extract query string from scope
        query_bytes = request.scope.get("query_string", b"")
        if isinstance(query_bytes, bytes):
            query_str = query_bytes.decode("latin-1")
        else:
            query_str = str(query_bytes)

        if query_str:
            target_url = f"{target_url}?{query_str}"

        # Clean request headers
        forward_headers = filter_request_headers(request.headers)

        # Read request body
        body = await request.body()
        content = body if (body or request.method in {"POST", "PUT", "PATCH"}) else None

        # Privacy-safe log: log only method and path (no query string, body, or headers)
        logger.info("Proxy forwarding request: %s %s", request.method, raw_path)

        try:
            upstream_response = await client.request(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                content=content,
            )

            # Filter response headers
            response_headers = filter_response_headers(upstream_response.headers)

            # Buffer response content into memory (simple buffer model, no streaming)
            return Response(
                content=upstream_response.content,
                status_code=upstream_response.status_code,
                headers=response_headers,
            )

        except httpx.RequestError as exc:
            # Upstream server is down, unreachable, or timed out.
            # Privacy-safe warning: never log sensitive details
            logger.warning(
                "Upstream lab error (%s) on %s %s",
                type(exc).__name__,
                request.method,
                raw_path,
            )
            return JSONResponse(
                status_code=502,
                content={
                    "error": {
                        "code": "UPSTREAM_UNAVAILABLE",
                        "message": "Lab server unavailable",
                    }
                },
            )
