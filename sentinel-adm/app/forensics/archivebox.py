"""SENTINEL-ADM — ArchiveBox integration for the forensic vault.

ArchiveBox performs the headless capture into the ISO 28500 WARC format and
writes it into a shared volume; this module requests the snapshot and adopts
the resulting archive into the evidence vault (hash + manifest + optional
RFC 3161 sealing).

The HTTP transport is injectable so the workflow is testable without a live
ArchiveBox instance.

Stdlib only.
"""

from __future__ import annotations

import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .evidence import EvidenceRecord, EvidenceVault


class ArchiveBoxError(RuntimeError):
    pass


@dataclass
class WarcCandidate:
    path: Path
    size: int
    modified: str


class ArchiveBoxClient:
    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        self.base_url = (base_url or os.environ.get("ARCHIVEBOX_URL") or "http://archivebox:8000").rstrip("/")
        self.timeout = float(os.environ.get("ARCHIVEBOX_TIMEOUT", "30")) if timeout is None else timeout

    # -- transport (overridable in tests) -----------------------------------

    def _post_form(self, url: str, fields: dict[str, str]) -> tuple[int, str]:
        payload = urllib.parse.urlencode(fields).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "text/html, application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 (local service)
                return response.status, response.read().decode("utf-8", "replace")[:500]
        except urllib.error.HTTPError as error:  # pragma: no cover - network path
            return error.code, error.read().decode("utf-8", "replace")[:200]
        except urllib.error.URLError as error:  # pragma: no cover - network path
            raise ArchiveBoxError(f"ArchiveBox non raggiungibile: {error.reason}") from error

    # -- API ----------------------------------------------------------------

    def add(self, url: str, depth: int = 0) -> dict[str, Any]:
        """Request a snapshot; the WARC lands in the shared output volume."""
        if not url.startswith(("http://", "https://")):
            raise ArchiveBoxError("URL non valido: sono ammessi solo http/https")
        status, body = self._post_form(f"{self.base_url}/add", {"url": url, "depth": str(depth), "parser": "warc"})
        return {"status": status, "accepted": status < 400, "detail": body[:200], "url": url}

    def health(self) -> bool:
        try:
            with urllib.request.urlopen(f"{self.base_url}/health", timeout=self.timeout) as response:  # noqa: S310
                return response.status == 200
        except Exception:  # noqa: BLE001 - health probes never raise
            return False


def find_warcs(output_dir: str | Path, since: datetime | None = None) -> list[WarcCandidate]:
    root = Path(output_dir)
    if not root.exists():
        return []
    candidates: list[WarcCandidate] = []
    for path in root.rglob("*.warc*"):
        if not path.is_file():
            continue
        stat = path.stat()
        modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        if since and modified < since:
            continue
        candidates.append(WarcCandidate(path=path, size=stat.st_size, modified=modified.isoformat()))
    return sorted(candidates, key=lambda candidate: candidate.modified, reverse=True)


def import_newest_warc(
    vault: EvidenceVault,
    output_dir: str | Path,
    source_url: str,
    *,
    agent: str = "archivebox",
    notes: str = "",
    since: datetime | None = None,
    seal: bool = True,
) -> tuple[EvidenceRecord, dict[str, Any]]:
    """Adopt the newest WARC from the ArchiveBox volume and seal it."""
    candidates = find_warcs(output_dir, since=since)
    if not candidates:
        raise ArchiveBoxError(f"nessun WARC trovato in {output_dir} (ArchiveBox ha completato la cattura?)")
    record = vault.import_warc(candidates[0].path, source_url, agent=agent, notes=notes)
    verification = vault.verify(record.evidence_id)
    if seal:
        manifest = vault.seal(record.evidence_id)
        verification = vault.verify(record.evidence_id)
        verification["tsa"] = manifest.get("tsa")
    return record, verification
