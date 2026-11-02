"""
Pydantic schemas for PatchPilot Advisory Analysis and Localization.
Conforms strictly to docs/API.md (Sections 3.H & 3.I) and docs/DATABASE.md.
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator


SupportedLanguage = Literal["en", "ur", "ur-Latn", "ar", "es"]
ProcessingMode = Literal["fixture", "llm"]
SeverityLevel = Literal["critical", "high", "medium", "low", "unknown"]
SourceKind = Literal["demo", "official", "user_supplied"]
GeneratedBy = Literal["fixture", "llm", "manual"]

SUPPORTED_LANGUAGES = {"en", "ur", "ur-Latn", "ar", "es"}


class AdvisoryAnalyzeRequest(BaseModel):
    advisory_text: str = Field(
        ...,
        min_length=1,
        max_length=12000,
        description="Raw advisory text to analyze (1 to 12,000 characters)."
    )
    languages: List[SupportedLanguage] = Field(
        default=["en"],
        description="Requested language codes (permitted: en, ur, ur-Latn, ar, es; max 5)."
    )
    processing_mode: ProcessingMode = Field(
        default="fixture",
        description="Analysis mode: 'fixture' (deterministic demo) or 'llm' (configured LLM provider)."
    )

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, v: List[SupportedLanguage]) -> List[SupportedLanguage]:
        if not v:
            return ["en"]
        deduped = list(dict.fromkeys(v))
        if len(deduped) > 5:
            raise ValueError("A maximum of 5 distinct language codes may be requested.")
        return deduped


class AdvisoryItem(BaseModel):
    id: Optional[int] = None
    external_id: Optional[str] = None
    title: str
    severity: SeverityLevel
    summary: str
    source_kind: SourceKind = "demo"
    source_url: Optional[str] = None
    verified: bool = False
    generated_by: GeneratedBy = "fixture"
    created_at: str


class LocalizationItem(BaseModel):
    language_code: SupportedLanguage
    title: str
    summary: str
    recommended_action: str
    generated_by: GeneratedBy = "fixture"


class AdvisoryAnalyzeResponse(BaseModel):
    advisory: AdvisoryItem
    localizations: List[LocalizationItem]
    processing_mode: ProcessingMode
    is_simulated: bool = True


class AdvisoryListResponse(BaseModel):
    items: List[AdvisoryItem]
    total: int
    limit: int
    offset: int


# -----------------------------------------------------------------------------
# LLM Structured Output Schemas (for validating Groq JSON completions)
# -----------------------------------------------------------------------------

class LLMLocalizationItem(BaseModel):
    language_code: SupportedLanguage
    title: str = Field(..., min_length=1, description="Concise title in the target language.")
    summary: str = Field(..., min_length=1, description="Plain-language explanation of affected components and risks.")
    recommended_action: str = Field(..., min_length=1, description="Defensive recommendations (e.g. patch, upgrade).")


class LLMAdvisoryAnalysis(BaseModel):
    title: str = Field(..., min_length=1, description="Overall title summarizing the advisory.")
    severity: SeverityLevel = Field(default="unknown", description="Severity: critical, high, medium, low, or unknown.")
    summary: str = Field(..., min_length=1, description="Concise English overview summary.")
    external_id: Optional[str] = Field(default=None, description="Explicit CVE identifier if mentioned (e.g. CVE-2026-109618), otherwise null.")
    localizations: List[LLMLocalizationItem] = Field(..., description="List of localizations for requested languages.")
