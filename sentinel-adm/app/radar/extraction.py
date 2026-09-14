"""SENTINEL-ADM — entity extraction from news text.

Two interchangeable extractors:
  * ``extract_with_model`` — zero-shot extraction through the sanitized
    inference gateway (JSON schema enforced);
  * ``heuristic_extract`` — a deterministic fallback that always works offline.

The heuristic path is not a toy: it recognises Italian company forms, target
region place names, enforcement actions and transport assets, so the radar
keeps producing structured output when the inference endpoint is unreachable.

Stdlib only.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from ..llm.adapter import OpenAICompatibleClient, SanitizedInference
from ..privacy.sanitizer import PrivacyMasker

EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["companies", "places", "actions", "assets"],
    "properties": {
        "companies": {"type": "array", "items": {"type": "string"}},
        "people": {"type": "array", "items": {"type": "string"}},
        "places": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "array", "items": {"type": "string"}},
        "assets": {"type": "array", "items": {"type": "string"}},
    },
}

SYSTEM_PROMPT = (
    "Sei un analista OSINT della Direzione Interregionale ADM Puglia, Molise e Basilicata. "
    "Estrai SOLO entità presenti nel testo: aziende (nomi commerciali completi di forma societaria), "
    "persone citate come indagate, luoghi (comuni, vie, depositi), azioni di polizia giudiziaria "
    "(sequestro, chiusura, denuncia, arresto, controllo, sanzione) e mezzi/asset (autocisterne, "
    "camion, depositi). Non inventare: se un campo è assente restituisci un array vuoto."
)

_COMPANY_PATTERN = re.compile(
    r"\b([A-ZÀ-Ù][\w&'’.\-]*(?:\s+[A-ZÀ-Ù][\w&'’.\-]*){0,3})\s+"
    r"(s\.?\s*r\.?\s*l\.?(?:\s*s)?|s\.?\s*p\.?\s*a\.?|s\.?\s*n\.?\s*c\.?|s\.?\s*a\.?\s*s\.?|srls?|spa|snc|sas)\b",
    re.IGNORECASE,
)
_COMPANY_MARKERS = re.compile(
    r"(?:ditta|società|societa|impresa|deposito|distributore|gestore|titolare)\s+"
    r"([A-ZÀ-Ù][\w&'’.\-]*(?:\s+[A-ZÀ-Ù][\w&'’.\-]*){0,3})",
)

_TARGET_PLACES = (
    "Bari", "Brindisi", "Taranto", "Foggia", "Barletta", "Andria", "Trani", "Lecce", "Modugno", "Bitonto",
    "Molfetta", "Corato", "Cerignola", "Manfredonia", "San Severo", "Lucera", "Monopoli", "Altamura",
    "Gravina", "Gioia del Colle", "Putignano", "Martina Franca", "Massafra", "Grottaglie", "Francavilla",
    "Ostuni", "Mesagne", "Campobasso", "Termoli", "Isernia", "Venosa", "Melfi", "Potenza", "Matera",
)
_STREET_PATTERN = re.compile(r"\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada|ss|sp)\s+[A-ZÀ-Ù][\w'’.\-]*(?:\s+[A-ZÀ-Ù0-9][\w'’.\-]*){0,3}\b", re.IGNORECASE)

_ACTIONS = {
    "sequestro": ("sequestr",),
    "chiusura": ("chiusur", "sigill", "sospension"),
    "denuncia": ("denunci", "indagat", "iscritt", "rinviat a giudizio"),
    "arresto": ("arrest", "fermo"),
    "controllo": ("controll", "ispezion", "verific"),
    "sanzione": ("sanzion", "multa", "ammend"),
    "fallimento": ("falliment", "liquidazion", "concors"),
}

_ASSETS = {
    "autocisterna": ("autocistern", "cistern"),
    "camion": ("camion", "autocarro", "mezzo pesante"),
    "furgone": ("furgone", "furgoni"),
    "deposito": ("deposito", "capannone", "magazzino"),
    "natante": ("natante", "imbarcazion", "motopesca", "barca"),
}


def _deaccent(value: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", value) if not unicodedata.combining(ch))


@dataclass
class EntityExtraction:
    companies: list[str] = field(default_factory=list)
    people: list[str] = field(default_factory=list)
    places: list[str] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    assets: list[str] = field(default_factory=list)

    def watchlist_candidates(self) -> list[str]:
        return [*self.companies, *self.people]


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        key = value.casefold().strip()
        if key and key not in seen:
            seen.add(key)
            output.append(value.strip())
    return output


def heuristic_extract(text: str) -> EntityExtraction:
    """Deterministic extraction: no model, no network, stable output."""
    lowered = _deaccent(text).casefold()

    companies: list[str] = []
    for match in _COMPANY_PATTERN.finditer(text):
        companies.append(f"{match.group(1).strip()} {match.group(2).strip()}")
    for match in _COMPANY_MARKERS.finditer(text):
        companies.append(match.group(1).strip())

    places = [place for place in _TARGET_PLACES if _deaccent(place).casefold() in lowered]
    places.extend(match.group(0) for match in _STREET_PATTERN.finditer(text))

    actions = [action for action, stems in _ACTIONS.items() if any(stem in lowered for stem in stems)]
    assets = [asset for asset, stems in _ASSETS.items() if any(stem in lowered for stem in stems)]

    return EntityExtraction(
        companies=_unique(companies),
        places=_unique(places),
        actions=_unique(actions),
        assets=_unique(assets),
    )


def extract_with_model(
    text: str,
    client: OpenAICompatibleClient,
    masker: PrivacyMasker | None = None,
) -> EntityExtraction:
    """Zero-shot extraction through the sanitized inference gateway."""
    pipeline = SanitizedInference(client, masker or PrivacyMasker())
    data = pipeline.run(SYSTEM_PROMPT, text, EXTRACTION_SCHEMA)
    return EntityExtraction(
        companies=_unique([str(value) for value in data.get("companies", [])]),
        people=_unique([str(value) for value in data.get("people", [])]),
        places=_unique([str(value) for value in data.get("places", [])]),
        actions=_unique([str(value) for value in data.get("actions", [])]),
        assets=_unique([str(value) for value in data.get("assets", [])]),
    )


def extract_entities(
    text: str,
    client: OpenAICompatibleClient | None = None,
    masker: PrivacyMasker | None = None,
) -> EntityExtraction:
    """Model extraction when configured, deterministic fallback otherwise."""
    if client is not None:
        try:
            return extract_with_model(text, client, masker)
        except Exception:  # noqa: BLE001 - availability must never break the radar
            pass
    return heuristic_extract(text)
