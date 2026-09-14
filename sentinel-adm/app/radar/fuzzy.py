"""SENTINEL-ADM — fuzzy entity resolution and "ripple effect" scoring.

Journalistic text spells company names inconsistently ("F.lli Rossi S.r.l." vs
"Fratelli Rossi srl"), so watchlist matching uses a normalised token-sort
Levenshtein ratio with a grey zone that flags a match for human review instead
of silently accepting or dropping it.

Stdlib only.
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass, field

_LEGAL_SUFFIXES = {
    "srl", "srls", "spa", "snc", "sas", "soc", "coop", "cooperative", "societa", "società",
    "di", "del", "della", "dei", "delle", "e", "il", "la", "lo", "le", "gli",
}

# Company forms are written in many ways ("S.r.l.", "SRL", "s r l"): collapse
# the spaced/acronym variants before tokenising, otherwise the initials survive
# as single-letter tokens and wreck the similarity ratio.
_COMPANY_FORM_SPACED = re.compile(r"\b(?:s\s+r\s+l(?:\s+s)?|s\s+p\s+a|s\s+n\s+c|s\s+a\s+s)\b")
_FRATELLI = re.compile(r"\bf\s+lli\b")


def normalize_entity(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = re.sub(r"[^\w\s]", " ", text)
    text = _FRATELLI.sub("fratelli", text)
    text = _COMPANY_FORM_SPACED.sub(" ", text)
    tokens = [
        token
        for token in text.split()
        if len(token) > 1 and token not in _LEGAL_SUFFIXES
    ]
    return " ".join(sorted(tokens))


def levenshtein(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current = [i]
        for j, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1]


def token_sort_ratio(left: str, right: str) -> float:
    first = normalize_entity(left)
    second = normalize_entity(right)
    if not first and not second:
        return 1.0
    longest = max(len(first), len(second))
    if longest == 0:
        return 1.0
    return 1.0 - levenshtein(first, second) / longest


@dataclass
class WatchlistEntry:
    entry_id: str
    name: str
    kind: str = "deposit"  # deposit | distributor | fuel_station | transport | operator
    city: str = ""
    vat: str = ""
    aliases: list[str] = field(default_factory=list)


@dataclass
class WatchlistMatch:
    entity: str
    entry: WatchlistEntry
    score: float
    matched_alias: str
    needs_review: bool = False


@dataclass
class RippleAssessment:
    score: int
    level: str
    rationale: str


_ACTION_WEIGHTS = {
    "sequestro": 30,
    "chiusura": 25,
    "denuncia": 20,
    "arresto": 35,
    "controllo": 10,
    "sanzione": 15,
    "fallimento": 20,
}


def match_watchlist(
    entities: list[str],
    watchlist: list[WatchlistEntry],
    threshold: float | None = None,
    review_floor: float | None = None,
) -> list[WatchlistMatch]:
    accept = threshold if threshold is not None else float(os.environ.get("WATCHLIST_FUZZY_THRESHOLD", "0.88"))
    floor = review_floor if review_floor is not None else max(0.65, accept - 0.15)
    matches: list[WatchlistMatch] = []
    for entity in entities:
        if not str(entity).strip():
            continue
        best: WatchlistMatch | None = None
        for entry in watchlist:
            for candidate in [entry.name, *entry.aliases]:
                score = token_sort_ratio(entity, candidate)
                if best is None or score > best.score:
                    best = WatchlistMatch(entity=entity, entry=entry, score=round(score, 4), matched_alias=candidate)
        if best and best.score >= floor:
            best.needs_review = best.score < accept
            if best.score >= floor:
                matches.append(best)
    return sorted(matches, key=lambda match: match.score, reverse=True)


def ripple_severity(
    action_type: str,
    match_score: float,
    same_province: bool = False,
    sanctions_hit: bool = False,
) -> RippleAssessment:
    """Contagion risk for a local entity, 0-100, with an explainable rationale."""
    base = _ACTION_WEIGHTS.get(action_type.casefold(), 12)
    score = base + int(round(max(0.0, min(match_score, 1.0)) * 40))
    if same_province:
        score += 10
    if sanctions_hit:
        score += 15
    score = max(0, min(score, 100))
    if score >= 75:
        level = "critical"
    elif score >= 55:
        level = "high"
    elif score >= 35:
        level = "medium"
    else:
        level = "low"
    drivers = [f"azione={action_type or 'n/d'}", f"similarità={match_score:.2f}"]
    if same_province:
        drivers.append("stessa provincia")
    if sanctions_hit:
        drivers.append("hit sanzioni")
    return RippleAssessment(score=score, level=level, rationale="; ".join(drivers))
