"""
Reverse Proxy Forwarding Service for PatchPilot.

Handles safe, local-only HTTP forwarding from the security proxy (port 8080)
to the isolated lab upstream (port 8081) using httpx.AsyncClient.

Enforces:
1. Fixed loopback destination (strictly http://127.0.0.1:8081).
2. Hop-by-hop header removal in both directions.
3. Strict privacy: never logs or stores raw query strings, bodies, cookies,
   client IPs, or Authorization headers.
4. Clean HTTP 502 Bad Gateway response when upstream is unreachable.
5. SQLite integration for proxy modes ('off', 'shadow', 'enforce'):
   - 'off': no rule evaluation, forward, log 'allowed'.
   - 'shadow': evaluate rules against raw query, forward, log 'shadow_match' or 'allowed'.
   - 'enforce': check replay gate; if invalid, downgrade to shadow and forward; if valid,
     block matching approved rules with HTTP 403 without forwarding to upstream.
6. Non-blocking asynchronous SQLite execution via asyncio.to_thread.
"""

import asyncio
import logging
import time
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
from app.core.db import (
    downgrade_enforce_to_shadow,
    get_proxy_mode,
    insert_traffic_event,
    list_rules,
)
from app.services.replay_service import check_enforce_gate
from app.services.rule_engine import RuleEngine

logger = logging.getLogger("patchpilot.proxy")

# Suppress httpx and httpcore INFO logs because they log the full target URL
# including raw query strings, which violates our privacy redaction requirements.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Standard HTTP hop-by-hop headers defined by RFC 2616 / RFC 7230 / RFC 9110.
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

    connection_val = request_headers.get("connection")
    if connection_val:
        for item in connection_val.split(","):
            cleaned = item.strip().lower()
            if cleaned:
                stripped.add(cleaned)

    stripped.add("host")
    stripped.add("content-length")
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
    Service responsible for inspecting and forwarding HTTP traffic to the fixed lab upstream.
    Uses a long-lived httpx.AsyncClient managed via the ASGI application lifespan.
    """

    def __init__(self, upstream_base_url: str = LAB_UPSTREAM_URL) -> None:
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
        Forward an incoming HTTP request to the fixed lab upstream, applying security rules
        according to the current proxy mode.

        Privacy rule:
        Never logs or stores raw query strings, request bodies, cookies, client IP,
        or Authorization headers. Only safe HTTP method and sanitized pathname are logged/persisted.
        """
        start_time = time.perf_counter()

        client = client_override or self._client
        if client is None or client.is_closed:
            await self.start()
            client = self._client

        # Extract raw path and raw query string
        raw_path_bytes = request.scope.get("raw_path")
        if isinstance(raw_path_bytes, bytes):
            raw_path = raw_path_bytes.decode("latin-1")
        else:
            raw_path = urllib.parse.quote(request.url.path, safe="/")

        if not raw_path.startswith("/"):
            raw_path = f"/{raw_path}"

        target_url = f"{self.upstream_base_url}{raw_path}"

        query_bytes = request.scope.get("query_string", b"")
        if isinstance(query_bytes, bytes):
            query_str = query_bytes.decode("latin-1")
        else:
            query_str = str(query_bytes)

        if query_str:
            target_url = f"{target_url}?{query_str}"

        # Parse query string into dictionary once using urllib.parse.parse_qs.
        # Passing a pre-parsed mapping prevents rule bypass caused by unencoded '?'
        # characters inside parameter values or names (which string-based URL parsers treat as delimiters).
        query_params = urllib.parse.parse_qs(query_str, keep_blank_values=True)

        # Clean request headers and read request body
        forward_headers = filter_request_headers(request.headers)
        body = await request.body()
        content = body if (body or request.method in {"POST", "PUT", "PATCH"}) else None

        # Privacy-safe log: log only method and path (no query string, body, or headers)
        logger.info("Proxy forwarding request: %s %s", request.method, raw_path)

        # 1. Read proxy mode safely from SQLite
        db_read_failed = False
        try:
            active_mode = await asyncio.to_thread(get_proxy_mode)
        except Exception as exc:
            logger.warning(
                "Database unavailable reading proxy mode (%s); bypassing rule evaluation.",
                type(exc).__name__,
            )
            db_read_failed = True
            active_mode = "off"

        # 2. If DB read failed: bypass rules and logging, forward request directly
        if db_read_failed:
            return await self._send_to_upstream(
                client=client,
                method=request.method,
                target_url=target_url,
                forward_headers=forward_headers,
                content=content,
                raw_path=raw_path,
            )

        matched_rule_id: Optional[int] = None
        action = "allowed"

        # 3. Mode Evaluation Flow
        if active_mode == "off":
            # Mode off: no rule evaluation, forward directly
            pass

        elif active_mode == "shadow":
            # Mode shadow: evaluate all enabled rules against query_params; never block
            try:
                rules = await asyncio.to_thread(list_rules)
                enabled_rules = [r for r in rules if r.get("enabled")]
                match_result = RuleEngine.evaluate_request(enabled_rules, query_params)
                if match_result.matched:
                    action = "shadow_match"
                    matched_rule_id = match_result.rule_id
            except Exception as rule_exc:
                logger.warning("Error evaluating rules in shadow mode (%s)", type(rule_exc).__name__)

        elif active_mode == "enforce":
            # Mode enforce: verify replay gate on EVERY request first
            try:
                gate = await asyncio.to_thread(check_enforce_gate)
            except Exception as gate_exc:
                logger.warning("Error evaluating enforce gate (%s)", type(gate_exc).__name__)
                gate = None

            if gate is None or not gate.ready:
                # Gate failed: atomically downgrade to shadow and forward as shadow
                reason = gate.message if gate else "Enforce gate check failed"
                err_code = gate.error_code if gate else "GATE_CHECK_ERROR"
                fail_id = gate.failed_rule_id if gate else None

                try:
                    await asyncio.to_thread(
                        downgrade_enforce_to_shadow,
                        reason=reason,
                        error_code=err_code,
                        failed_rule_id=fail_id,
                    )
                except Exception as down_exc:
                    logger.warning("Failed to downgrade proxy mode (%s)", type(down_exc).__name__)

                active_mode = "shadow"

                # Process current request under shadow semantics
                try:
                    rules = await asyncio.to_thread(list_rules)
                    enabled_rules = [r for r in rules if r.get("enabled")]
                    match_result = RuleEngine.evaluate_request(enabled_rules, query_params)
                    if match_result.matched:
                        action = "shadow_match"
                        matched_rule_id = match_result.rule_id
                except Exception as rule_exc:
                    logger.warning("Error evaluating rules after downgrade (%s)", type(rule_exc).__name__)

            else:
                # Gate is ready: evaluate rules. Only enabled AND human_approved rules block
                try:
                    rules = await asyncio.to_thread(list_rules)
                    blocking_rules = [
                        r for r in rules if r.get("enabled") and r.get("human_approved")
                    ]
                    match_result = RuleEngine.evaluate_request(blocking_rules, query_params)
                    if match_result.matched:
                        # Request BLOCKED: return HTTP 403, do not forward to upstream
                        duration_ms = (time.perf_counter() - start_time) * 1000.0
                        await self._safe_log_traffic(
                            method=request.method,
                            raw_path=raw_path,
                            mode="enforce",
                            action="blocked",
                            status_code=403,
                            duration_ms=duration_ms,
                            matched_rule_id=match_result.rule_id,
                        )
                        return JSONResponse(
                            status_code=403,
                            content={
                                "error": {
                                    "code": "REQUEST_BLOCKED",
                                    "message": "Request blocked by PatchPilot security rule.",
                                }
                            },
                        )
                except Exception as eval_exc:
                    logger.warning("Error evaluating blocking rules (%s)", type(eval_exc).__name__)

        # 4. Forward to upstream (for non-blocked requests)
        response, is_upstream_error = await self._send_to_upstream_with_error_tracking(
            client=client,
            method=request.method,
            target_url=target_url,
            forward_headers=forward_headers,
            content=content,
            raw_path=raw_path,
        )

        final_action = "upstream_error" if is_upstream_error else action
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        # 5. Log traffic event to SQLite
        await self._safe_log_traffic(
            method=request.method,
            raw_path=raw_path,
            mode=active_mode,
            action=final_action,
            status_code=response.status_code,
            duration_ms=duration_ms,
            matched_rule_id=matched_rule_id if not is_upstream_error else None,
        )

        return response

    async def _send_to_upstream(
        self,
        client: httpx.AsyncClient,
        method: str,
        target_url: str,
        forward_headers: Dict[str, str],
        content: Optional[bytes],
        raw_path: str,
    ) -> Response:
        """Forward request directly without traffic logging."""
        resp, _ = await self._send_to_upstream_with_error_tracking(
            client, method, target_url, forward_headers, content, raw_path
        )
        return resp

    async def _send_to_upstream_with_error_tracking(
        self,
        client: httpx.AsyncClient,
        method: str,
        target_url: str,
        forward_headers: Dict[str, str],
        content: Optional[bytes],
        raw_path: str,
    ) -> tuple[Response, bool]:
        """
        Sends request to upstream. Returns (Response, is_upstream_error).
        Handles httpx.RequestError by returning 502 Bad Gateway.
        """
        try:
            upstream_response = await client.request(
                method=method,
                url=target_url,
                headers=forward_headers,
                content=content,
            )
            response_headers = filter_response_headers(upstream_response.headers)
            return (
                Response(
                    content=upstream_response.content,
                    status_code=upstream_response.status_code,
                    headers=response_headers,
                ),
                False,
            )
        except httpx.RequestError as exc:
            logger.warning(
                "Upstream lab error (%s) on %s %s",
                type(exc).__name__,
                method,
                raw_path,
            )
            return (
                JSONResponse(
                    status_code=502,
                    content={
                        "error": {
                            "code": "UPSTREAM_UNAVAILABLE",
                            "message": "Lab server unavailable",
                        }
                    },
                ),
                True,
            )

    async def _safe_log_traffic(
        self,
        method: str,
        raw_path: str,
        mode: str,
        action: str,
        status_code: int,
        duration_ms: float,
        matched_rule_id: Optional[int],
    ) -> None:
        """
        Safely records a traffic event in SQLite without letting any database exception
        break or modify the client HTTP response.
        """
        try:
            await asyncio.to_thread(
                insert_traffic_event,
                method=method,
                path=raw_path,
                mode=mode,
                action=action,
                status_code=status_code,
                duration_ms=duration_ms,
                matched_rule_id=matched_rule_id,
            )
        except Exception as log_exc:
            logger.warning("Failed to record traffic event (%s)", type(log_exc).__name__)
