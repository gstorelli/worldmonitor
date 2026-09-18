"""SENTINEL-ADM — FastAPI application core (thin HTTP layer).

Every handler delegates to `app.api.services`, which owns the logic and is
tested with the standard library alone. FastAPI is imported lazily so the
deterministic core stays usable without web dependencies.
"""

from __future__ import annotations

import secrets
import time
from typing import Any

from ..config import Settings
from ..privacy.sanitizer import PrivacyMasker
from . import services

# Session-scoped maskers: the mapping is never persisted, and only the
# authenticated local interface may request unmasking.
_MASKERS: dict[str, tuple[PrivacyMasker, float]] = {}
_SESSION_TTL_SECONDS = 3600


def _get_masker(session_id: str | None) -> tuple[str, PrivacyMasker]:
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
    app = FastAPI(
        title="SENTINEL-ADM",
        version="0.3.0",
        description="Early Warning and Legal Intelligence for ADM",
    )

    def fail(error: Exception, status: int = 400) -> Any:
        return JSONResponse({"error": str(error)}, status_code=status)

    # ── System ───────────────────────────────────────────────────────────────
    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "config": config.describe()}

    # ── Privacy ──────────────────────────────────────────────────────────────
    @app.post("/privacy/mask")
    def privacy_mask(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        session_id, masker = _get_masker(payload.get("session_id"))
        result = masker.mask(str(payload.get("text", "")))
        return {"session_id": session_id, "text": result.text, "counts": result.counts}

    @app.post("/privacy/unmask")
    def privacy_unmask(payload: dict[str, Any] = Body(...)) -> Any:
        session_id = payload.get("session_id")
        if not session_id or session_id not in _MASKERS:
            return fail(ValueError("sessione di mascheramento non valida"), 400)
        return {"text": _MASKERS[session_id][0].unmask(str(payload.get("text", "")))}

    # ── Legal ────────────────────────────────────────────────────────────────
    @app.post("/legal/qualify")
    def legal_qualify(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        return services.legal_qualify(str(payload.get("text", "")))

    @app.get("/legal/catalog")
    def legal_catalog() -> list[dict[str, object]]:
        from ..legal.urnlex import catalog

        return catalog()

    # ── News radar & contagion ───────────────────────────────────────────────
    @app.get("/radar/feeds")
    def radar_feeds() -> dict[str, Any]:
        return {"feeds": config.news_feeds}

    @app.post("/radar/scan")
    def radar_scan(payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
        feeds = payload.get("feeds") if isinstance(payload.get("feeds"), list) else None
        limit = payload.get("limit") if isinstance(payload.get("limit"), int) else None
        return services.radar_scan(settings=config, feeds=feeds, limit=limit)

    # ── Watchlist ────────────────────────────────────────────────────────────
    @app.get("/watchlist")
    def watchlist_get() -> dict[str, Any]:
        return {"entries": services.watchlist_list(config)}

    @app.post("/watchlist")
    def watchlist_post(payload: dict[str, Any] = Body(...)) -> Any:
        try:
            return {"entry": services.watchlist_upsert(payload, config)}
        except (services.WatchlistError, ValueError) as error:
            return fail(error, 400)

    @app.delete("/watchlist/{entry_id}")
    def watchlist_delete(entry_id: str) -> Any:
        removed = services.watchlist_remove(entry_id, config)
        if not removed:
            return fail(ValueError("voce non trovata"), 404)
        return {"removed": entry_id}

    # ── Legacy alias kept for the original console ───────────────────────────
    @app.post("/radar/match")
    def radar_match(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        from ..radar.fuzzy import WatchlistEntry, match_watchlist, ripple_severity

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
        return {
            "matches": [
                {
                    **vars(match),
                    "entry": vars(match.entry),
                    "ripple": vars(
                        ripple_severity(
                            str(payload.get("action", "")),
                            match.score,
                            same_province=bool(payload.get("same_province", False)),
                        )
                    ),
                }
                for match in matches
            ]
        }

    return app


app = None  # populated by `uvicorn app.api.main:create_app --factory`
