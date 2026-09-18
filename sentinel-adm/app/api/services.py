"""SENTINEL-ADM — service layer behind the HTTP routes.

All business logic lives here (not in the FastAPI handlers) so it is testable
with the standard library alone and reusable from scripts/CLI. Every external
dependency (feed fetch, inference) is injectable.

Stdlib only.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Callable

from ..config import Settings
from ..legal.urnlex import qualify
from ..llm.adapter import OpenAICompatibleClient
from ..radar.extraction import EntityExtraction, extract_entities, heuristic_extract
from ..radar.harvester import MediaHarvester
from ..radar.pipeline import alerts_to_digest, run_radar
from ..radar.watchlist import WatchlistError, load_watchlist, remove_entry, save_watchlist, upsert_entry, validate_entry

Extractor = Callable[[str], EntityExtraction]


def build_extractor(settings: Settings) -> Extractor:
    """Model extraction when the gateway is configured, deterministic otherwise."""
    if not settings.llm_base_url:
        return heuristic_extract
    client = OpenAICompatibleClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        temperature=settings.llm_temperature,
        timeout=settings.llm_timeout,
    )
    return lambda text: extract_entities(text, client=client)


# ── News radar ───────────────────────────────────────────────────────────────

def radar_scan(
    *,
    settings: Settings | None = None,
    feeds: list[str] | None = None,
    watchlist: list[Any] | None = None,
    fetch: Callable[[str], str] | None = None,
    extractor: Extractor | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    """Harvest the configured feeds, extract entities and assess contagion."""
    config = settings or Settings.from_env()
    feed_list = [feed for feed in (feeds if feeds is not None else config.news_feeds) if feed]
    if not feed_list:
        return {"items": [], "errors": ["nessun feed configurato (SENTINEL_NEWS_FEEDS)"], "alerts": [], "scanned_at": _now()}
    harvested = MediaHarvester(feed_list, fetch=fetch).harvest(limit=limit)
    raw_entries = watchlist if watchlist is not None else load_watchlist(config.watchlist_path)
    entries = [validate_entry(entry) if isinstance(entry, dict) else entry for entry in raw_entries]
    alerts = run_radar(harvested.items, entries, extractor or build_extractor(config))
    return {
        "items": [_jsonable(item) for item in harvested.items],
        "errors": harvested.errors,
        "alerts": alerts_to_digest(alerts),
        "scanned_at": _now(),
    }


# ── Watchlist ────────────────────────────────────────────────────────────────

def watchlist_list(settings: Settings | None = None) -> list[dict[str, Any]]:
    config = settings or Settings.from_env()
    return [asdict(entry) for entry in load_watchlist(config.watchlist_path)]


def watchlist_upsert(payload: dict[str, Any], settings: Settings | None = None) -> dict[str, Any]:
    config = settings or Settings.from_env()
    entry = validate_entry(payload)
    entries = upsert_entry(load_watchlist(config.watchlist_path), entry)
    save_watchlist(entries, config.watchlist_path)
    return asdict(entry)


def watchlist_remove(entry_id: str, settings: Settings | None = None) -> bool:
    config = settings or Settings.from_env()
    remaining, removed = remove_entry(load_watchlist(config.watchlist_path), entry_id)
    if removed:
        save_watchlist(remaining, config.watchlist_path)
    return removed


# ── Legal ────────────────────────────────────────────────────────────────────

def legal_qualify(text: str) -> dict[str, Any]:
    report = qualify(text)
    return {
        "qualifications": [asdict(item) for item in report.qualifications],
        "suggested_acts": report.suggested_acts,
        "unresolved_mentions": report.unresolved_mentions,
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _jsonable(item: Any) -> dict[str, Any]:
    return asdict(item)


__all__ = [
    "build_extractor",
    "radar_scan",
    "watchlist_list",
    "watchlist_upsert",
    "watchlist_remove",
    "legal_qualify",
    "WatchlistError",
]
