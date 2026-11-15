"""
PatchPilot Security Proxy Application.

Runs as a separate ASGI service listening strictly on 127.0.0.1:8080.
Forwards incoming HTTP requests to the isolated lab upstream on 127.0.0.1:8081.

Architecture reference: docs/ARCHITECTURE.md (Sections 1, 2, and 5).
"""

import asyncio
from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator
from fastapi import FastAPI, Request, Response

from app.core.config import PROXY_HOST, PROXY_PORT
from app.core.db import init_db
from app.services.proxy_service import ProxyService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("patchpilot.proxy_app")

# Shared singleton instance of ProxyService
proxy_service = ProxyService()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manage the lifespan of the Proxy application.
    Initializes the shared SQLite database schema in a worker thread,
    starts the shared httpx.AsyncClient connection pool on startup,
    and gracefully closes it on shutdown.
    """
    logger.info("Initializing database schema on proxy startup...")
    await asyncio.to_thread(init_db)

    logger.info("Starting PatchPilot Security Proxy on http://%s:%s", PROXY_HOST, PROXY_PORT)
    await proxy_service.start()
    try:
        yield
    finally:
        logger.info("Stopping PatchPilot Security Proxy and closing connection pools...")
        await proxy_service.stop()


# Initialize standalone FastAPI app for proxying
app = FastAPI(
    title="PatchPilot Security Proxy",
    description="Local defensive reverse proxy service on port 8080.",
    version="0.1.0",
    lifespan=lifespan,
)


@app.api_route(
    "/",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
async def catch_all_proxy(request: Request, path: str = "") -> Response:
    """
    Catch-all proxy endpoint.
    Intercepts all incoming HTTP methods and paths on port 8080
    and delegates forwarding to the ProxyService.
    """
    return await proxy_service.forward_request(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.proxy_app:app", host=PROXY_HOST, port=PROXY_PORT, reload=True)
