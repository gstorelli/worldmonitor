"""SENTINEL-ADM — local watchlist store.

The watchlist holds the commercial storage facilities, fuel stations,
distributors and transport contractors registered in the target directorate.
It is plain JSON on disk (no external DB) with atomic writes, and it is
validated on load so a malformed entry can never silently disable matching.

Stdlib only.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict
from pathlib import Path

from .fuzzy import WatchlistEntry

REQUIRED_FIELDS = ("entry_id", "name")


class WatchlistError(ValueError):
    pass


def validate_entry(raw: dict) -> WatchlistEntry:
    if not isinstance(raw, dict):
        raise WatchlistError("voce watchlist non è un oggetto")
    for field in REQUIRED_FIELDS:
        if not str(raw.get(field, "")).strip():
            raise WatchlistError(f"campo obbligatorio mancante: {field}")
    aliases = raw.get("aliases", [])
    if not isinstance(aliases, list):
        raise WatchlistError("aliases deve essere una lista")
    return WatchlistEntry(
        entry_id=str(raw["entry_id"]).strip(),
        name=str(raw["name"]).strip(),
        kind=str(raw.get("kind", "deposit")).strip() or "deposit",
        city=str(raw.get("city", "")).strip(),
        vat=str(raw.get("vat", "")).strip(),
        aliases=[str(alias).strip() for alias in aliases if str(alias).strip()],
    )


def load_watchlist(path: str | Path | None = None) -> list[WatchlistEntry]:
    resolved = Path(path or os.environ.get("WATCHLIST_PATH") or "./data/watchlist.json")
    if not resolved.is_file():
        return []
    try:
        payload = json.loads(resolved.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise WatchlistError(f"watchlist non è JSON valido: {error}") from error
    entries = payload.get("entries") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        raise WatchlistError("watchlist deve essere una lista o un oggetto con 'entries'")
    return [validate_entry(entry) for entry in entries]


def save_watchlist(entries: list[WatchlistEntry], path: str | Path | None = None) -> Path:
    """Atomic write so a crash during save cannot corrupt the watchlist."""
    resolved = Path(path or os.environ.get("WATCHLIST_PATH") or "./data/watchlist.json")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schema_version": 1, "entries": [asdict(entry) for entry in entries]}
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=resolved.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        temporary = Path(handle.name)
    temporary.replace(resolved)
    return resolved


def find_entry(entries: list[WatchlistEntry], entry_id: str) -> WatchlistEntry | None:
    return next((entry for entry in entries if entry.entry_id == entry_id), None)


def upsert_entry(entries: list[WatchlistEntry], entry: WatchlistEntry) -> list[WatchlistEntry]:
    remaining = [candidate for candidate in entries if candidate.entry_id != entry.entry_id]
    return [*remaining, entry]


def remove_entry(entries: list[WatchlistEntry], entry_id: str) -> tuple[list[WatchlistEntry], bool]:
    remaining = [candidate for candidate in entries if candidate.entry_id != entry_id]
    return remaining, len(remaining) != len(entries)
