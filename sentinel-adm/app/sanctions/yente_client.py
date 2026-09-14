"""SENTINEL-ADM — local Yente sanctions/PEP screening client.

Talks to the on-premise Yente container (OpenSanctions engine) over its REST
API. Queries never leave the host: only the local service is contacted.

Stdlib only (urllib).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any


class SanctionsError(RuntimeError):
    pass


@dataclass
class ScreeningHit:
    entity_id: str
    caption: str
    score: float
    schema: str
    datasets: list[str] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    properties: dict[str, Any] = field(default_factory=dict)
    matched_name: str = ""


def normalize_hit(raw: dict[str, Any], matched_name: str = "") -> ScreeningHit:
    """Map a Yente result into the internal hit shape."""
    properties = raw.get("properties") or {}
    return ScreeningHit(
        entity_id=str(raw.get("id", "")),
        caption=str(raw.get("caption", "")),
        score=float(raw.get("score", 0.0)),
        schema=str(raw.get("schema", "")),
        datasets=list(raw.get("datasets", []) or []),
        countries=list(raw.get("countries", []) or []),
        topics=list(raw.get("topics", []) or []),
        properties=properties,
        matched_name=matched_name,
    )


class YenteClient:
    """Minimal client for the Yente ``/match/<dataset>`` endpoint."""

    def __init__(
        self,
        base_url: str | None = None,
        dataset: str | None = None,
        timeout: float | None = None,
        threshold: float | None = None,
    ) -> None:
        self.base_url = (base_url or os.environ.get("YENTE_URL") or "http://yente:8000").rstrip("/")
        self.dataset = dataset or os.environ.get("YENTE_DATASET") or "default"
        self.timeout = float(os.environ.get("YENTE_TIMEOUT", "30")) if timeout is None else timeout
        self.threshold = float(os.environ.get("SANCTIONS_MATCH_THRESHOLD", "0.7")) if threshold is None else threshold

    # -- transport (overridable in tests) -----------------------------------

    def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 (local service)
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:  # pragma: no cover - network path
            raise SanctionsError(f"yente HTTP {error.code}") from error
        except urllib.error.URLError as error:  # pragma: no cover - network path
            raise SanctionsError(f"yente non raggiungibile: {error.reason}") from error

    def _get_json(self, url: str) -> dict[str, Any]:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 (local service)
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError) as error:
            raise SanctionsError(f"yente non raggiungibile: {error}") from error

    # -- public API ----------------------------------------------------------

    def match(
        self,
        name: str,
        schema: str = "Person",
        country: str | None = None,
        topics: list[str] | None = None,
        limit: int = 10,
    ) -> list[ScreeningHit]:
        if not name.strip():
            return []
        properties: dict[str, Any] = {"name": [name.strip()]}
        if country:
            properties["country"] = [country]
        if topics:
            properties["topics"] = topics
        payload = {"queries": {"q1": {"schema": schema, "properties": properties, "limit": limit}}}
        body = self._post_json(f"{self.base_url}/match/{self.dataset}", payload)
        results = body.get("responses", {}).get("q1", {}).get("results", [])
        hits = [normalize_hit(item, matched_name=name) for item in results]
        return [hit for hit in hits if hit.score >= self.threshold]

    def screen(self, names: list[str], schema: str = "Person") -> dict[str, list[ScreeningHit]]:
        return {name: self.match(name, schema=schema) for name in names}

    def health(self) -> bool:
        try:
            self._get_json(f"{self.base_url}/healthz")
            return True
        except SanctionsError:
            return False


def is_flash_hit(hits: list[ScreeningHit], flash_threshold: float | None = None) -> bool:
    """A sanctions hit is flash-worthy only above the confidence bar."""
    threshold = flash_threshold if flash_threshold is not None else float(os.environ.get("SANCTIONS_FLASH_THRESHOLD", "0.9"))
    return any(hit.score >= threshold for hit in hits)
