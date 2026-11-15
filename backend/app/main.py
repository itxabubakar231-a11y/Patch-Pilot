"""
PatchPilot Management API Application (port 8000).

Provides management endpoints for proxy control, rule inspection, request replay,
traffic querying, and advisory analysis.
"""

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.advisories import (
    AdminAuthException as AdvisoryAdminAuthException,
    admin_auth_exception_handler as advisory_admin_auth_exception_handler,
    router as advisories_router,
)
from app.api.proxy import router as proxy_router
from app.api.traffic import router as traffic_router
from app.core.auth import (
    AdminAuthException as CoreAdminAuthException,
    admin_auth_exception_handler as core_admin_auth_exception_handler,
)
from app.core.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager.
    Initializes the shared SQLite database schema and seeds the default demo rule
    off the main event loop thread on startup.
    """
    await asyncio.to_thread(init_db)
    yield


app = FastAPI(
    title="PatchPilot Defensive Security API",
    description="Backend API service for PatchPilot self-hosted PHP defensive security toolkit.",
    version="0.1.0",
    lifespan=lifespan,
)

# Register custom authentication exception handlers
app.add_exception_handler(AdvisoryAdminAuthException, advisory_admin_auth_exception_handler)
app.add_exception_handler(CoreAdminAuthException, core_admin_auth_exception_handler)

# Mount API routers
app.include_router(advisories_router)
app.include_router(proxy_router)
app.include_router(traffic_router)

# Enable CORS for local React development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/")
def read_root():
    return {
        "service": "PatchPilot Defensive Security API",
        "status": "online",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
        },
    }


@app.get("/health")
def get_health():
    """Health check endpoint to verify backend operational readiness."""
    return {
        "status": "ok",
        "service": "PatchPilot Backend",
        "version": "0.1.0",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
