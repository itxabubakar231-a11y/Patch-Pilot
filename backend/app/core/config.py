"""
PatchPilot Core Configuration.

Centralizes configuration values, network addresses, and fixed port numbers.
Adheres strictly to the architectural contracts defined in docs/ARCHITECTURE.md
and docs/API.md.
"""

from pathlib import Path

# Base directories
# Path resolution: config.py -> core -> app -> backend
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BACKEND_DIR / "data"
DATABASE_PATH = DATA_DIR / "patchpilot.db"

# Fixed network ports and loopback addresses
# As per project rules, all listeners bind strictly to 127.0.0.1.
PROXY_HOST = "127.0.0.1"
PROXY_PORT = 8080

LAB_HOST = "127.0.0.1"
LAB_PORT = 8081
# The proxy forwards only to this fixed loopback lab URL.
# Arbitrary upstream targets or URL query parameters are rejected by design.
LAB_UPSTREAM_URL = f"http://{LAB_HOST}:{LAB_PORT}"

MANAGEMENT_HOST = "127.0.0.1"
MANAGEMENT_PORT = 8000

# Proxy HTTP client connection limits and timeouts (in seconds)
# Managed by httpx.AsyncClient during the application lifespan.
PROXY_CONNECT_TIMEOUT_SECONDS = 5.0
PROXY_READ_TIMEOUT_SECONDS = 10.0
PROXY_WRITE_TIMEOUT_SECONDS = 10.0
PROXY_POOL_TIMEOUT_SECONDS = 5.0
PROXY_MAX_KEEP_ALIVE_CONNECTIONS = 20
PROXY_MAX_CONNECTIONS = 50
