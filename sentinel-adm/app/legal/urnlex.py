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


def _detect_in_force(text: str) -> bool:
    lowered = text.casefold()
    if any(marker in lowered for marker in ("abrogato", "non più in vigore", "previgente", "versione storica")):
        return False
    return True


def qualify(text: str) -> LegalQualificationReport:
    """Produce structured qualifications from an incident description."""
    report = LegalQualificationReport()
    in_force = _detect_in_force(text)

    # 1. Explicit citations ("TUA art. 47, comma 1", "d.lgs. 74/2000 art. 8").
    seen: set[tuple[str, str | None, str | None]] = set()
    for mention in re.split(r"[.;\n]", text):
        if not mention.strip():
            continue
        mention_act = find_act(mention)
        if not mention_act:
            continue
        articles = [match for match in _ARTICLE_PATTERN.finditer(mention)]
        if not articles:
            key = (mention_act.key, None, None)
            if key not in seen:
                seen.add(key)
                report.qualifications.append(_qualify_act(mention_act, None, None, in_force))
            continue
        for match in articles:
            for article in (match.group(1), match.group(2)):
                if not article:
                    continue
                key = (mention_act.key, article, match.group(3))
                if key in seen:
                    continue
                seen.add(key)
                report.qualifications.append(_qualify_act(mention_act, article, match.group(3), in_force))

    # 2. No explicit act: suggest acts from offence keywords (needs review).
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
