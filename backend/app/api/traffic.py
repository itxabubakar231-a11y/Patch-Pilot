"""
FastAPI Router for System Overview and Traffic Logs.

Implements endpoints A and G as specified in docs/API.md:
- GET /api/v1/overview
- GET /api/v1/traffic
"""

from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Query
import httpx

from app.core.auth import verify_admin_token
from app.core.config import LAB_HOST, LAB_PORT, LAB_UPSTREAM_URL
from app.core.db import (
    count_advisories,
    count_traffic_events,
    get_proxy_mode,
    list_traffic_events,
    traffic_counts,
    utc_now_iso,
)
from app.schemas.management import OverviewResponse, TrafficItem, TrafficListResponse
from app.services.replay_service import check_enforce_gate

router = APIRouter(
    prefix="/api/v1",
    tags=["Traffic & Overview"],
    dependencies=[Depends(verify_admin_token)],
)


def probe_lab_health() -> Tuple[str, Optional[str]]:
    """
    Probe the fixed lab health endpoint (GET http://127.0.0.1:8081/health).
    Uses fixed LAB_UPSTREAM_URL constant from config.py with a 1-second timeout.
    Tests can monkeypatch this function. Never accepts host or port from user input.

    Returns:
        (status, simulated_stack) where status is 'online', 'offline', or 'unknown'.
    """
    health_url = f"{LAB_UPSTREAM_URL}/health"
    try:
        with httpx.Client(timeout=1.0, follow_redirects=False) as client:
            resp = client.get(health_url)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    stack = data.get("simulated_stack")
                    if isinstance(stack, str) and len(stack) <= 100:
                        return ("online", stack)
                    return ("online", None)
                except Exception:
                    return ("online", None)
            return ("offline", None)
    except Exception:
        return ("offline", None)


# =============================================================================
# Endpoint A: GET /api/v1/overview
# =============================================================================

@router.get("/overview", response_model=OverviewResponse)
def get_overview() -> Any:
    """
    Return high-level operational overview including proxy state, observed traffic
    aggregates, lab health probe, and advisory metrics.
    """
    # 1. Proxy status
    mode = get_proxy_mode()
    gate = check_enforce_gate()

    # 2. Observed traffic counts
    counts = traffic_counts()

    # 3. Lab upstream probe
    lab_status, simulated_stack = probe_lab_health()

    # 4. Advisories count (observed count from SQLite database)
    advisories_total = count_advisories()

    return {
        "environment": "local_lab",
        "is_simulated": True,
        "proxy": {
            "mode": mode,
            "ready_for_enforce": gate.ready,
        },
        "traffic": {
            "total_requests": counts["total"],
            "allowed_requests": counts["allowed"],
            "shadow_matches": counts["shadow_match"],
            "blocked_requests": counts["blocked"],
        },
        "lab": {
            "upstream": f"{LAB_HOST}:{LAB_PORT}",
            "status": lab_status,
            "simulated_stack": simulated_stack,
        },
        "advisories": {
            "total": advisories_total,
        },
        "scanner": {
            "status": "not_implemented",
        },
        "generated_at": utc_now_iso(),
    }


# =============================================================================
# Endpoint G: GET /api/v1/traffic
# =============================================================================

@router.get("/traffic", response_model=TrafficListResponse)
def get_traffic_log(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=2_147_483_647),
) -> Any:
    """
    Paginated access to chronological, privacy-sanitized traffic logs (newest first).
    """
    total = count_traffic_events()
    events = list_traffic_events(limit=limit, offset=offset)

    items: List[Dict[str, Any]] = []
    for ev in events:
        items.append({
            "id": ev["id"],
            "method": ev["method"],
            "path": ev["path"],
            "mode": ev["mode"],
            "action": ev["action"],
            "status_code": ev["status_code"],
            "matched_rule_id": ev["matched_rule_id"],
            "duration_ms": float(ev["duration_ms"]),
            "created_at": ev["created_at"],
        })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
