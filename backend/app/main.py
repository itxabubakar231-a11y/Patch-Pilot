from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.advisories import (
    AdminAuthException,
    admin_auth_exception_handler,
    router as advisories_router,
)

app = FastAPI(
    title="PatchPilot Defensive Security API",
    description="Backend API service for PatchPilot self-hosted PHP defensive security toolkit.",
    version="0.1.0",
)

# Register custom exception handlers
app.add_exception_handler(AdminAuthException, admin_auth_exception_handler)

# Mount API routers
app.include_router(advisories_router)

# Enable CORS for local React development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {
        "service": "PatchPilot Defensive Security API",
        "status": "online",
        "endpoints": {
            "health": "/health",
            "docs": "/docs"
        }
    }


@app.get("/health")
def get_health():
    """Health check endpoint to verify backend operational readiness."""
    return {
        "status": "ok",
        "service": "PatchPilot Backend",
        "version": "0.1.0"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
