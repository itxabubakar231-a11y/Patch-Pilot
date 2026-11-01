"""
PatchPilot Advisory Analysis Service.
Handles deterministic fixture evaluation and multilingual localization
for security advisories according to docs/API.md and docs/DATABASE.md.
"""
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.schemas.advisory import (
    AdvisoryAnalyzeRequest,
    AdvisoryAnalyzeResponse,
    AdvisoryItem,
    AdvisoryListResponse,
    LocalizationItem,
    SupportedLanguage,
)


class LLMNotConfiguredError(Exception):
    """Raised when processing_mode='llm' is requested without a configured LLM provider."""
    pass


# Deterministic, safe mock localizations strictly for the local lab
MULTILINGUAL_FIXTURES: Dict[SupportedLanguage, Dict[str, str]] = {
    "en": {
        "title": "Security notice",
        "summary": "A sample advisory for the local lab simulating PHP runtime risk.",
        "recommended_action": "Confirm the vendor bulletin and patch the runtime.",
    },
    "ur": {
        "title": "سیکیورٹی اطلاع",
        "summary": "یہ مقامی لیب کے لیے ایک نمونہ سیکیورٹی نوٹس ہے۔",
        "recommended_action": "مستند اطلاع دیکھیں اور سافٹ ویئر اپ ڈیٹ کریں۔",
    },
    "ur-Latn": {
        "title": "Security Ittila",
        "summary": "Yeh local lab ke liye aik sample security notice hai.",
        "recommended_action": "Vendor advisory check karein aur software foran update karein.",
    },
    "ar": {
        "title": "إشعار أمني",
        "summary": "هذا إشعار أمني تجريبي مخصص لبيئة المختبر المحلي.",
        "recommended_action": "تحقق من النشرة الرسمية للمورد وقم بتحديث بيئة التشغيل فوراً.",
    },
    "es": {
        "title": "Aviso de seguridad",
        "summary": "Un aviso de muestra para el entorno de laboratorio local.",
        "recommended_action": "Verifique el boletín oficial del proveedor y actualice el entorno de ejecución.",
    },
}


class AdvisoryService:
    """
    Advisory parsing, deterministic fixture synthesis, and multilingual localization service.
    """

    def __init__(self, llm_configured: bool = False):
        self.llm_configured = llm_configured

    def analyze_advisory(self, request: AdvisoryAnalyzeRequest) -> AdvisoryAnalyzeResponse:
        """
        Analyze untrusted advisory text and return structured summaries and localizations.
        In Sprint 1, uses deterministic fixtures; rejects 'llm' mode if provider is unconfigured.
        """
        if request.processing_mode == "llm" and not self.llm_configured:
            raise LLMNotConfiguredError("LLM provider is not configured on this server.")

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Deterministic simulation advisory metadata
        advisory_item = AdvisoryItem(
            id=2,
            external_id=None,
            title="Illustrative PHP security notice",
            severity="unknown",
            summary="Review vendor guidance and update the runtime.",
            source_kind="demo",
            source_url=None,
            verified=False,
            generated_by="fixture",
            created_at=now_iso,
        )

        # Assemble requested localizations
        localizations: List[LocalizationItem] = []
        for lang in request.languages:
            content = MULTILINGUAL_FIXTURES.get(
                lang,
                MULTILINGUAL_FIXTURES["en"]
            )
            localizations.append(
                LocalizationItem(
                    language_code=lang,
                    title=content["title"],
                    summary=content["summary"],
                    recommended_action=content["recommended_action"],
                    generated_by="fixture",
                )
            )

        return AdvisoryAnalyzeResponse(
            advisory=advisory_item,
            localizations=localizations,
            processing_mode="fixture",
            is_simulated=True,
        )

    def list_advisories(self, limit: int = 50, offset: int = 0) -> AdvisoryListResponse:
        """
        Return sample registered advisories matching docs/API.md contract.
        """
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        sample_items = [
            AdvisoryItem(
                id=1,
                external_id="CVE-2026-109618",
                title="PHP request handling security advisory",
                severity="critical",
                summary="Patch the affected PHP runtime promptly.",
                source_kind="demo",
                source_url="https://www.php.net/archive/2026.php",
                verified=False,
                generated_by="fixture",
                created_at=now_iso,
            )
        ]
        paged_items = sample_items[offset : offset + limit]
        return AdvisoryListResponse(
            items=paged_items,
            total=len(sample_items),
            limit=limit,
            offset=offset,
        )

