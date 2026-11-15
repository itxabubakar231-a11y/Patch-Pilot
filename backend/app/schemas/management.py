"""
Management API Pydantic schemas for PatchPilot.

Adheres strictly to docs/API.md (Section 3, endpoints A-G).
All request models use extra="forbid" to reject unexpected fields.
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict


# -----------------------------------------------------------------------------
# Proxy Management Schemas (Endpoints B, C, D)
# -----------------------------------------------------------------------------

class ProxyStatusResponse(BaseModel):
    """Shape of GET /api/v1/proxy/status and PUT /api/v1/proxy/mode response."""
    mode: str
    ready_for_enforce: bool
    enabled_rule_count: int
    upstream: str
    last_replay_at: Optional[str] = None
    updated_at: str


class ProxyModeUpdateRequest(BaseModel):
    """Shape of PUT /api/v1/proxy/mode request body."""
    model_config = ConfigDict(extra="forbid")
    mode: Literal["off", "shadow", "enforce"]


class ProxyRollbackResponse(BaseModel):
    """Shape of POST /api/v1/proxy/rollback response."""
    mode: str
    rolled_back: bool
    message: str


# -----------------------------------------------------------------------------
# Security Rules & Replay Schemas (Endpoints E, F)
# -----------------------------------------------------------------------------

class RuleItem(BaseModel):
    """Individual rule item representation in GET /api/v1/rules."""
    id: int
    name: str
    matcher_type: str
    match_config: Dict[str, Any]
    enabled: bool
    human_approved: bool
    source_kind: str
    replay_passed: bool
    rule_digest: str


class RuleListResponse(BaseModel):
    """Shape of GET /api/v1/rules paginated response."""
    items: List[RuleItem]
    total: int
    limit: int
    offset: int


class RuleReplayResponse(BaseModel):
    """Shape of POST /api/v1/rules/{rule_id}/replay response."""
    run_id: int
    rule_id: int
    fixture_version: str
    benign_total: int
    benign_matches: int
    attack_total: int
    attack_matches: int
    passed: bool
    tested_at: str


# -----------------------------------------------------------------------------
# Traffic Log Schemas (Endpoint G)
# -----------------------------------------------------------------------------

class TrafficItem(BaseModel):
    """Individual redacted traffic record in GET /api/v1/traffic."""
    id: int
    method: str
    path: str
    mode: str
    action: str
    status_code: int
    matched_rule_id: Optional[int] = None
    duration_ms: float
    created_at: str


class TrafficListResponse(BaseModel):
    """Shape of GET /api/v1/traffic paginated response."""
    items: List[TrafficItem]
    total: int
    limit: int
    offset: int


# -----------------------------------------------------------------------------
# Overview Dashboard Schemas (Endpoint A)
# -----------------------------------------------------------------------------

class ProxyOverview(BaseModel):
    mode: str
    ready_for_enforce: bool


class TrafficOverview(BaseModel):
    total_requests: int
    allowed_requests: int
    shadow_matches: int
    blocked_requests: int


class LabOverview(BaseModel):
    upstream: str
    status: Literal["online", "offline", "unknown"]
    simulated_stack: Optional[str] = None


class AdvisoriesOverview(BaseModel):
    total: int


class ScannerOverview(BaseModel):
    status: str


class OverviewResponse(BaseModel):
    """Shape of GET /api/v1/overview response."""
    environment: str
    is_simulated: bool
    proxy: ProxyOverview
    traffic: TrafficOverview
    lab: LabOverview
    advisories: AdvisoriesOverview
    scanner: ScannerOverview
    generated_at: str
