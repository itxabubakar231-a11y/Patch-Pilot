"""
FastAPI Router for Proxy Management and Security Rules.

Implements endpoints B, C, D, E, F as specified in docs/API.md:
- GET /api/v1/proxy/status
- PUT /api/v1/proxy/mode
- POST /api/v1/proxy/rollback
- GET /api/v1/rules
- POST /api/v1/rules/{rule_id}/replay
"""

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Path, Query, status
from fastapi.responses import JSONResponse

from app.core.auth import verify_admin_token
from app.core.config import LAB_HOST, LAB_PORT
from app.core.db import (
    add_audit_event,
    compute_rule_digest,
    count_enabled_rules,
    count_rules,
    get_app_settings,
    get_last_replay_at,
    get_latest_replay,
    get_proxy_mode,
    list_rules_paged,
    set_proxy_mode,
)
from app.schemas.management import (
    ProxyModeUpdateRequest,
    ProxyRollbackResponse,
    ProxyStatusResponse,
    RuleItem,
    RuleListResponse,
    RuleReplayResponse,
)
from app.services.replay_service import (
    FixtureValidationError,
    RuleNotFoundError,
    check_enforce_gate,
    execute_rule_replay,
)

router = APIRouter(
    prefix="/api/v1",
    tags=["Proxy Management"],
    dependencies=[Depends(verify_admin_token)],
)


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """Helper to return the standard docs/API.md error envelope."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def _build_proxy_status() -> Dict[str, Any]:
    """Helper to assemble the current proxy status data dictionary."""
    mode = get_proxy_mode()
    gate = check_enforce_gate()
    settings = get_app_settings()
    last_replay = get_last_replay_at()

    return {
        "mode": mode,
        "ready_for_enforce": gate.ready,
        "enabled_rule_count": count_enabled_rules(),
        "upstream": f"{LAB_HOST}:{LAB_PORT}",
        "last_replay_at": last_replay,
        "updated_at": settings["updated_at"],
    }


# =============================================================================
# Endpoint B: GET /api/v1/proxy/status
# =============================================================================

@router.get("/proxy/status", response_model=ProxyStatusResponse)
def get_proxy_status() -> Any:
    """Return current proxy operational state, replay readiness, and rule counts."""
    return _build_proxy_status()


# =============================================================================
# Endpoint C: PUT /api/v1/proxy/mode
# =============================================================================

@router.put("/proxy/mode", response_model=ProxyStatusResponse)
def update_proxy_mode(payload: ProxyModeUpdateRequest) -> Any:
    """
    Switch proxy mode between off, shadow, and enforce.
    Enforce mode requires all enabled rules to pass the replay validation gate.
    """
    target_mode = payload.mode
    current_mode = get_proxy_mode()

    if target_mode == "enforce":
        gate = check_enforce_gate()
        if not gate.ready:
            error_code = (
                "RULE_NOT_APPROVED"
                if gate.error_code == "RULE_NOT_APPROVED"
                else "REPLAY_REQUIRED"
            )
            message = gate.message or "Enforce mode requires a current passing replay."
            return error_response(
                status_code=status.HTTP_409_CONFLICT,
                code=error_code,
                message=message,
            )

    # Apply accepted mode transition
    set_proxy_mode(target_mode)
    add_audit_event(
        event_type="PROXY_MODE_CHANGE",
        resource_type="proxy",
        resource_id=1,
        safe_metadata={
            "previous_mode": current_mode,
            "new_mode": target_mode,
        },
    )

    return _build_proxy_status()


# =============================================================================
# Endpoint D: POST /api/v1/proxy/rollback
# =============================================================================

@router.post("/proxy/rollback", response_model=ProxyRollbackResponse)
def rollback_proxy() -> Any:
    """
    Emergency rollback endpoint. Always resets proxy mode to shadow (never off).
    Idempotent and creates an audit record for every invocation.
    """
    current_mode = get_proxy_mode()
    set_proxy_mode("shadow")
    add_audit_event(
        event_type="PROXY_ROLLBACK",
        resource_type="proxy",
        resource_id=1,
        safe_metadata={
            "previous_mode": current_mode,
            "new_mode": "shadow",
        },
    )

    return {
        "mode": "shadow",
        "rolled_back": True,
        "message": "Enforcement disabled; shadow logging continues.",
    }


# =============================================================================
# Endpoint E: GET /api/v1/rules
# =============================================================================

@router.get("/rules", response_model=RuleListResponse)
def list_rules_endpoint(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=2_147_483_647),
) -> Any:
    """
    List configured security rules with current computed digests and replay status.
    """
    total = count_rules()
    rules = list_rules_paged(limit=limit, offset=offset)

    items: List[Dict[str, Any]] = []
    for r in rules:
        current_digest = compute_rule_digest(r["matcher_type"], r["match_config"])
        latest_replay = get_latest_replay(
            rule_id=r["id"],
            rule_digest=current_digest,
            fixture_version="lab-v1",
        )
        replay_passed = bool(latest_replay and latest_replay.get("passed"))

        items.append({
            "id": r["id"],
            "name": r["name"],
            "matcher_type": r["matcher_type"],
            "match_config": r["match_config"],
            "enabled": r["enabled"],
            "human_approved": r["human_approved"],
            "source_kind": r["source_kind"],
            "replay_passed": replay_passed,
            "rule_digest": current_digest,
        })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# =============================================================================
# Endpoint F: POST /api/v1/rules/{rule_id}/replay
# =============================================================================

@router.post("/rules/{rule_id}/replay", response_model=RuleReplayResponse)
def replay_rule_endpoint(rule_id: int = Path(ge=1, le=2_147_483_647)) -> Any:
    """
    Trigger offline request replay evaluation against official harmless test fixtures.
    """
    try:
        result = execute_rule_replay(rule_id=rule_id)
        return result
    except RuleNotFoundError:
        return error_response(
            status_code=status.HTTP_404_NOT_FOUND,
            code="RULE_NOT_FOUND",
            message=f"Rule {rule_id} not found.",
        )
    except FileNotFoundError:
        return error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="FIXTURE_UNAVAILABLE",
            message="Official replay test fixtures are unavailable.",
        )
    except FixtureValidationError:
        return error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="FIXTURE_INVALID",
            message="Replay test fixtures are invalid or corrupted.",
        )
