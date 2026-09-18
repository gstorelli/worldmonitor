"""SENTINEL-ADM — news → contagion assessment pipeline.

For each harvested article: extract entities, resolve them against the local
watchlist, score the ripple severity and decide whether the item deserves a
flash alert. Articles that match nothing are dropped: the radar reports
contagion, not a generic news feed.

Stdlib only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from ..notify.dispatch import should_flash
from .extraction import EntityExtraction, extract_entities, heuristic_extract
from .fuzzy import RippleAssessment, WatchlistEntry, WatchlistMatch, match_watchlist, ripple_severity
from .harvester import NewsItem

Extractor = Callable[[str], EntityExtraction]


@dataclass
class RippleAlert:
    item: NewsItem
    extraction: EntityExtraction
    matches: list[WatchlistMatch] = field(default_factory=list)
    severity: RippleAssessment | None = None
    flash: bool = False

    @property
    def best_match(self) -> WatchlistMatch | None:
        return self.matches[0] if self.matches else None

    @property
    def score(self) -> int:
        return self.severity.score if self.severity else 0


def assess_item(
    item: NewsItem,
    watchlist: list[WatchlistEntry],
    extractor: Extractor = heuristic_extract,
    *,
    same_province: bool = False,
    accept: float | None = None,
    review_floor: float | None = None,
) -> RippleAlert | None:
    """Return an alert only when an extracted entity resolves to the watchlist."""
    text = f"{item.title}. {item.summary}".strip()
    if not text:
        return None
    extraction = extractor(text)
    matches = match_watchlist(extraction.watchlist_candidates(), watchlist, threshold=accept, review_floor=review_floor)
    if not matches:
        return None
    action = extraction.actions[0] if extraction.actions else ""
    severity = ripple_severity(action, matches[0].score, same_province=same_province)
    flash = should_flash({"watchlist_score": matches[0].score, "action": action})
    return RippleAlert(item=item, extraction=extraction, matches=matches, severity=severity, flash=flash)


def run_radar(
    items: list[NewsItem],
    watchlist: list[WatchlistEntry],
    extractor: Extractor = heuristic_extract,
    **options: object,
) -> list[RippleAlert]:
    alerts: list[RippleAlert] = []
    for item in items:
        alert = assess_item(item, watchlist, extractor, **options)  # type: ignore[arg-type]
        if alert:
            alerts.append(alert)
    return sorted(alerts, key=lambda alert: alert.score, reverse=True)


def alerts_to_digest(alerts: list[RippleAlert]) -> list[dict[str, object]]:
    """Serialisable form for the API/UI and the daily brief."""
    return [
        {
            "title": alert.item.title,
            "link": alert.item.link,
            "source": alert.item.source,
            "published": alert.item.published,
            "score": alert.score,
            "level": alert.severity.level if alert.severity else "low",
            "flash": alert.flash,
            "actions": alert.extraction.actions,
            "entities": alert.extraction.watchlist_candidates(),
            "matched": [
                {"entry_id": match.entry.entry_id, "name": match.entry.name, "score": match.score, "needs_review": match.needs_review}
                for match in alert.matches
            ],
            "rationale": alert.severity.rationale if alert.severity else "",
        }
        for alert in alerts
    ]


__all__ = ["RippleAlert", "assess_item", "run_radar", "alerts_to_digest", "extract_entities"]
