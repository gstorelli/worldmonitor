"""SENTINEL-ADM — deterministic URN:LEX generation and legal qualification.

Turns an officer's free-text reconstruction of an incident into structured
qualifications: canonical act, article, comma, the CNIPA URN-NIR identifier and
a deep link to the in-force text on Normattiva (IT) or EUR-Lex (EU).

No model is involved here: this module is deterministic so the generated links
are reproducible and auditable. The LLM adapter is used to *extract* facts and
propose acts, but this builder validates and renders them.

Stdlib only.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from .acts import ACTS, LegalAct, all_aliases, find_act, get_act

NORMATTIVA_BASE = "https://www.normattiva.it/uri-res/N2Ls"
EURLEX_BASE = "https://eur-lex.europa.eu/legal-content/IT/TXT/"

# Keywords → acts, used when the text does not cite a norm explicitly.
KEYWORD_ACT_MAP: tuple[tuple[str, str], ...] = (
    ("contrabbando", "tuld"),
    ("doganale", "tuld"),
    ("dogana", "tuld"),
    ("accisa", "tua"),
    ("accise", "tua"),
    ("gasolio", "tua"),
    ("carburante", "tua"),
    ("deposito", "tua"),
    ("e-das", "tua"),
    ("fattur", "dlgs74"),
    ("iva", "dlgs74"),
    ("contabil", "dlgs74"),
    ("scommess", "l401"),
    ("gioco", "l401"),
    ("slot", "tulps"),
    ("contraffaz", "cp"),
    ("frode", "cp"),
    ("segni mendaci", "cp"),
    ("tabacch", "tle"),
    ("sigarett", "tle"),
)


@dataclass
class LegalQualification:
    act_key: str
    title: str
    article: str | None = None
    comma: str | None = None
    article_title: str | None = None
    urn: str | None = None
    normattiva_url: str | None = None
    eurlex_url: str | None = None
    needs_review: bool = False
    confidence: float = 1.0
    notes: str = ""


@dataclass
class LegalQualificationReport:
    qualifications: list[LegalQualification] = field(default_factory=list)
    suggested_acts: list[str] = field(default_factory=list)
    unresolved_mentions: list[str] = field(default_factory=list)


def build_urn(act: LegalAct, article: str | None = None, comma: str | None = None, in_force: bool = True) -> str:
    """CNIPA URN-NIR, e.g. ``urn:nir:stato:decreto.legislativo:1995-10-26;504~art47``."""
    if not act.verified or not act.date or not act.number:
        raise ValueError(f"metadati non verificati per l'atto '{act.key}': URN non generabile")
    urn = f"urn:nir:{act.urn_authority}:{act.urn_type}:{act.date};{act.number}"
    if article:
        urn += f"~art{article}"
        if comma:
            urn += f"-com{comma}"
    if in_force:
        urn += "!vig="
    return urn


def normattiva_url(act: LegalAct, article: str | None = None, comma: str | None = None) -> str:
    return f"{NORMATTIVA_BASE}?{build_urn(act, article, comma)}"


def eurlex_url(celex: str) -> str:
    return f"{EURLEX_BASE}?uri=CELEX:{celex.strip().upper()}"


_ARTICLE_PATTERN = re.compile(
    r"(?:artt?\.?|articol[oi])\s*(\d{1,3})(?:\s*(?:e|,|ed)\s*(\d{1,3}))?(?:[^.;\n]{0,40}?comma\s*(\d{1,2}))?",
    re.IGNORECASE,
)

# How far an article may sit from the act mention it belongs to ("art. 40" and
# "TUA" are commonly split by a period, so sentence splitting is not viable).
_ASSOCIATION_WINDOW = 120


def _detect_in_force(text: str) -> bool:
    # Stems, not full words: Italian inflects ("abrogato" / "abrogata" /
    # "abrogati"), and accents must not defeat the match ("più" → "piu").
    lowered = unicodedata.normalize("NFKD", text.casefold())
    lowered = "".join(ch for ch in lowered if not unicodedata.combining(ch))
    if any(marker in lowered for marker in ("abrogat", "previgent", "non piu in vigore", "versione storica")):
        return False
    return True


def _numeric_patterns(act: LegalAct) -> tuple[str, ...]:
    year = act.date[:4]
    return (
        f"legge {act.number} {year}",
        f"l {act.number} {year}",
        f"decreto legislativo {act.number} {year}",
        f"d lgs {act.number} {year}",
        f"dpr {act.number} {year}",
        f"regolamento {act.number} {year}",
    )


def _act_mentions(text: str) -> list[tuple[int, int, LegalAct]]:
    """All act citations with their positions, word-boundary matched."""
    lowered = text.casefold()
    mentions: set[tuple[int, int, LegalAct]] = set()
    for act in ACTS:
        patterns = list(act.aliases)
        if act.verified and act.number and act.date:
            patterns.extend(_numeric_patterns(act))
        for alias in patterns:
            pattern = f"(?<![a-z0-9]){re.escape(alias.casefold())}(?![a-z0-9])"
            for match in re.finditer(pattern, lowered):
                mentions.add((match.start(), match.end(), act))
    return sorted(mentions, key=lambda mention: mention[0])


def qualify(text: str) -> LegalQualificationReport:
    """Produce structured qualifications from an incident description."""
    report = LegalQualificationReport()
    in_force = _detect_in_force(text)
    mentions = _act_mentions(text)
    article_matches = list(_ARTICLE_PATTERN.finditer(text))
    assigned_articles: set[int] = set()
    seen: set[tuple[str, str | None, str | None]] = set()

    for start, end, act in mentions:
        window: list[tuple[int, int, re.Match[str]]] = []
        for index, match in enumerate(article_matches):
            if index in assigned_articles:
                continue
            distance = min(abs(match.start() - end), abs(start - match.end()))
            if distance <= _ASSOCIATION_WINDOW:
                window.append((distance, index, match))
        window.sort(key=lambda item: item[0])

        if not window:
            key = (act.key, None, None)
            if key not in seen:
                seen.add(key)
                report.qualifications.append(_qualify_act(act, None, None, in_force))
            continue

        for _, index, match in window[:2]:
            assigned_articles.add(index)
            for article in (match.group(1), match.group(2)):
                if not article:
                    continue
                key = (act.key, article, match.group(3))
                if key in seen:
                    continue
                seen.add(key)
                report.qualifications.append(_qualify_act(act, article, match.group(3), in_force))

    # No explicit act: suggest acts from offence keywords (needs review).
    if not report.qualifications:
        lowered = text.casefold()
        suggested: list[str] = []
        for keyword, act_key in KEYWORD_ACT_MAP:
            if keyword in lowered and act_key not in [act.key for act in (get_act(k) for k in suggested) if act]:
                if act_key not in suggested:
                    suggested.append(act_key)
        report.suggested_acts = suggested
        for act_key in suggested:
            act = get_act(act_key)
            if act:
                report.qualifications.append(_qualify_act(act, None, None, in_force, confidence=0.4, needs_review=not act.verified))

    # 3. Aliases that never resolved (e.g. an unknown acronym).
    lowered = text.casefold()
    for alias in all_aliases():
        if alias in lowered and not find_act(alias):
            report.unresolved_mentions.append(alias)

    return report


def _qualify_act(
    act: LegalAct,
    article: str | None,
    comma: str | None,
    in_force: bool,
    confidence: float = 1.0,
    needs_review: bool | None = None,
) -> LegalQualification:
    review = (not act.verified) if needs_review is None else needs_review
    qualification = LegalQualification(
        act_key=act.key,
        title=act.title,
        article=article,
        comma=comma,
        article_title=act.articles.get(article) if article else None,
        needs_review=review,
        confidence=confidence,
        notes=act.notes,
    )
    if not review and act.verified and act.date and act.number:
        qualification.urn = build_urn(act, article, comma, in_force)
        qualification.normattiva_url = normattiva_url(act, article, comma)
    if act.celex and not review:
        qualification.eurlex_url = eurlex_url(act.celex)
    return qualification


def catalog() -> list[dict[str, object]]:
    """Compact catalogue for the UI/assistant context."""
    return [
        {
            "key": act.key,
            "title": act.title,
            "aliases": list(act.aliases),
            "articles": act.articles,
            "verified": act.verified,
        }
        for act in ACTS
    ]
