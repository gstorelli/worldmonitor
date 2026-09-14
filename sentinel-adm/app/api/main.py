"""SENTINEL-ADM — FastAPI application core.

Thin HTTP layer over the deterministic engines. Each workspace of the operator
dashboard maps to a router section:

    /health, /config              system status
    /privacy/mask|unmask          edge sanitization (session-scoped)
    /legal/qualify, /legal/catalog dynamic legal intelligence
    /sanctions/screen             local Yente screening
    /radar/match, /radar/ripple   news contagion matching
    /evidence/*                   forensic vault

FastAPI is imported lazily so the deterministic core stays usable (and
testable) without web dependencies installed.
"""

from __future__ import annotations

import secrets
from typing import Any

from ..config import Settings
from ..forensics.evidence import EvidenceVault
from ..legal.urnlex import catalog, qualify
from ..privacy.sanitizer import PrivacyMasker
from ..radar.fuzzy import WatchlistEntry, match_watchlist, ripple_severity
from ..sanctions.yente_client import YenteClient

# Session-scoped maskers: the mapping must never be persisted, and only the
# authenticated local interface can request unmasking.
_MASKERS: dict[str, tuple[PrivacyMasker, float]] = {}
_SESSION_TTL_SECONDS = 3600


def _get_masker(session_id: str | None) -> tuple[str, PrivacyMasker]:
    import time

    now = time.time()
    for key, (_, created) in list(_MASKERS.items()):
        if now - created > _SESSION_TTL_SECONDS:
            _MASKERS.pop(key, None)
    if session_id and session_id in _MASKERS:
        return session_id, _MASKERS[session_id][0]
    new_id = secrets.token_urlsafe(12)
    masker = PrivacyMasker()
    _MASKERS[new_id] = (masker, now)
    return new_id, masker


def create_app(settings: Settings | None = None) -> Any:
    try:
        from fastapi import Body, FastAPI
        from fastapi.responses import JSONResponse
    except ImportError as error:  # pragma: no cover - optional dependency
        raise RuntimeError("FastAPI non installato: `pip install -r requirements.txt`") from error

    config = settings or Settings.from_env()
    app = FastAPI(title="SENTINEL-ADM", version="0.1.0", description="Tactical OSINT, Early Warning and Legal Intelligence for ADM")
    vault = EvidenceVault(root=config.evidence_dir)
    yente = YenteClient(base_url=config.yente_url, dataset=config.yente_dataset, threshold=config.sanctions_match_threshold)

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "config": config.describe(),
            "components": {
                "yente": yente.health(),
                "evidence_dir_writable": vault.root.exists(),
            },
        }

    @app.post("/privacy/mask")
    def privacy_mask(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        session_id, masker = _get_masker(payload.get("session_id"))
        result = masker.mask(str(payload.get("text", "")))
        return {"session_id": session_id, "text": result.text, "counts": result.counts}

    @app.post("/privacy/unmask")
    def privacy_unmask(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        session_id = payload.get("session_id")
        if not session_id or session_id not in _MASKERS:
            return JSONResponse({"error": "sessione di mascheramento non valida"}, status_code=400)
        return {"text": _MASKERS[session_id][0].unmask(str(payload.get("text", "")))}

    @app.post("/legal/qualify")
    def legal_qualify(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        report = qualify(str(payload.get("text", "")))
        return {
            "qualifications": [vars(item) for item in report.qualifications],
            "suggested_acts": report.suggested_acts,
            "unresolved_mentions": report.unresolved_mentions,
        }

    @app.get("/legal/catalog")
    def legal_catalog() -> list[dict[str, object]]:
        return catalog()

    @app.post("/sanctions/screen")
    def sanctions_screen(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        names = [str(name) for name in payload.get("names", []) if str(name).strip()]
        schema = str(payload.get("schema", "Person"))
        try:
            results = yente.screen(names, schema=schema)
        except Exception as error:  # noqa: BLE001 - surfaced to the operator
            return JSONResponse({"error": str(error)}, status_code=502)
        return {
            name: [vars(hit) for hit in hits]
            for name, hits in results.items()
        }

    @app.post("/radar/match")
    def radar_match(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        watchlist = [
            WatchlistEntry(
                entry_id=str(entry.get("entry_id", "")),
                name=str(entry.get("name", "")),
                kind=str(entry.get("kind", "deposit")),
                city=str(entry.get("city", "")),
                vat=str(entry.get("vat", "")),
                aliases=[str(alias) for alias in entry.get("aliases", [])],
            )
            for entry in payload.get("watchlist", [])
        ]
        matches = match_watchlist([str(entity) for entity in payload.get("entities", [])], watchlist)
        assessments = [
            {
                **vars(match),
                "entry": vars(match.entry),
                "ripple": vars(
                    ripple_severity(
                        str(payload.get("action", "")),
                        match.score,
                        same_province=bool(payload.get("same_province", False)),
                        sanctions_hit=bool(payload.get("sanctions_hit", False)),
                    )
                ),
            }
            for match in matches
        ]
        return {"matches": assessments}

    @app.get("/evidence")
    def evidence_list() -> list[dict[str, Any]]:
        return vault.list_records()

    @app.get("/evidence/{evidence_id}/verify")
    def evidence_verify(evidence_id: str) -> dict[str, Any]:
        return vault.verify(evidence_id)

    @app.post("/evidence/seal/{evidence_id}")
    def evidence_seal(evidence_id: str) -> dict[str, Any]:
        try:
            return vault.seal(evidence_id)
        except FileNotFoundError as error:
            return JSONResponse({"error": str(error)}, status_code=404)

    return app


app = None  # populated by `uvicorn app.api.main:create_app --factory`
