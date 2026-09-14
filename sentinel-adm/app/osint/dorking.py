"""SENTINEL-ADM — institutional registry dorking.

Builds structured, pre-configured queries against Italian public administration
repositories (judicial sales portal PVP, cohesion funds OpenCoesione, budget
portal BDAP, ANAC, Gazzetta Ufficiale). Only passive public-source lookups.

Stdlib only.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote_plus, urlencode

# `query` is the dork template ({term} placeholder); `search` builds the URL for
# the portal's own search when it exists, otherwise a search-engine dork URL.
PORTALS: dict[str, dict[str, str]] = {
    "pvp": {
        "label": "Portale delle Vendite Pubbliche (beni sequestrati e confiscati)",
        "query": 'site:venditepubbliche.giustizia.it "{term}"',
        "search": "https://venditepubbliche.giustizia.it/ricerca?{params}",
    },
    "opencoesione": {
        "label": "OpenCoesione (spesa dei fondi di coesione)",
        "query": 'site:opencoesione.gov.it "{term}"',
        "search": "https://opencoesione.gov.it/it/ricerca/?{params}",
    },
    "bdap": {
        "label": "BDAP — Banca Dati Amministrazioni Pubbliche",
        "query": 'site:bdap.tesoro.it "{term}"',
        "search": "https://bdap.tesoro.it/opencms/it/ricerca.html?{params}",
    },
    "anac": {
        "label": "ANAC (appalti e contratti pubblici)",
        "query": 'site:anac.it "{term}"',
        "search": "https://www.anac.it/ricerca?{params}",
    },
    "gazzetta": {
        "label": "Gazzetta Ufficiale",
        "query": 'site:gazzettaufficiale.it "{term}"',
        "search": "https://www.gazzettaufficiale.it/ricerca/semplice?{params}",
    },
    "agenziaentrate": {
        "label": "Agenzia delle Entrate (beni immobili)",
        "query": 'site:agenziaentrate.gov.it "{term}"',
        "search": "https://www.agenziaentrate.gov.it/portale/ricerca?{params}",
    },
}

ENGINE_FALLBACK = "https://www.google.com/search?q="


@dataclass
class DorkQuery:
    portal: str
    label: str
    term: str
    query: str
    url: str


def build_dork(term: str, portal: str) -> DorkQuery:
    definition = PORTALS[portal]
    query = definition["query"].format(term=term)
    template = definition["search"]
    if template.startswith("https://www.google.com"):
        url = ENGINE_FALLBACK + quote_plus(query)
    else:
        params = urlencode({key: term for key in ("q", "query", "testo")})
        url = template.format(params=params)
    return DorkQuery(portal=portal, label=definition["label"], term=term, query=query, url=url)


def build_dorks(terms: list[str], portals: list[str] | None = None) -> list[DorkQuery]:
    selected = portals or list(PORTALS)
    unknown = [portal for portal in selected if portal not in PORTALS]
    if unknown:
        raise KeyError(f"portali sconosciuti: {', '.join(unknown)}")
    return [build_dork(term, portal) for term in terms if str(term).strip() for portal in selected]


def portal_catalog() -> list[dict[str, str]]:
    return [{"portal": key, "label": value["label"]} for key, value in PORTALS.items()]
