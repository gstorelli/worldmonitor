"""SENTINEL-ADM — canonical Italian / EU legal act registry.

Every entry carries the exact enacting metadata needed to build a Normattiva
URN (authority, act type, date, number) or a EUR-Lex CELEX identifier. Acts
whose metadata could not be verified are registered with ``verified=False``:
the qualification engine must return them as *needs review* instead of emitting
a URL that may not resolve (acceptance criterion: normative precision).

Stdlib only.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class LegalAct:
    key: str
    title: str
    urn_authority: str
    urn_type: str
    date: str
    number: str
    celex: str | None = None
    aliases: tuple[str, ...] = field(default_factory=tuple)
    articles: dict[str, str] = field(default_factory=dict)
    verified: bool = True
    notes: str = ""

    def __hash__(self) -> int:
        # `articles` is a dict (unhashable), so identity is the act key.
        return hash(self.key)


# Act types follow the CNIPA URN-NIR vocabulary (e.g. "decreto.legislativo").
ACTS: tuple[LegalAct, ...] = (
    LegalAct(
        key="tuld",
        title="Testo unico delle disposizioni in materia doganale (TULD)",
        urn_authority="stato",
        urn_type="decreto.del.presidente.della.repubblica",
        date="1973-01-23",
        number="43",
        aliases=("tuld", "testo unico doganale", "dpr 43/1973", "d.p.r. 43/1973", "dpr 43 1973"),
        articles={
            "282": "Contrabbando",
            "283": "Contrabbando aggravato",
            "292": "Omessa custodia e malversazione di merci in deposito",
            "295": "Deposito non autorizzato di merci estere",
        },
        notes="Alias storici del contrabbando e delle violazioni doganali.",
    ),
    LegalAct(
        key="tua",
        title="Testo unico delle disposizioni legislative concernenti le imposte sulla produzione e sui consumi (TUA)",
        urn_authority="stato",
        urn_type="decreto.legislativo",
        date="1995-10-26",
        number="504",
        aliases=("tua", "testo unico accise", "d.lgs. 504/1995", "dlgs 504/1995", "d.lgs 504/95"),
        articles={
            "40": "Sottrazione illegale di prodotti soggetti ad accisa",
            "43": "Violazioni relative alla circolazione dei prodotti",
            "47": "Detenzione o uso di prodotti non assoggettati ad accisa",
        },
        notes="Accise su energia e alcole: sottrazioni, miscelazioni, depositi non autorizzati, e-DAS mancanti.",
    ),
    LegalAct(
        key="dlgs74",
        title="Nuova disciplina dei reati in materia di imposte sui redditi e sul valore aggiunto",
        urn_authority="stato",
        urn_type="decreto.legislativo",
        date="2000-03-10",
        number="74",
        aliases=("d.lgs. 74/2000", "dlgs 74/2000", "reati tributari", "decreto 74/2000"),
        articles={
            "2": "Dichiarazione fraudolenta mediante uso di fatture per operazioni inesistenti",
            "8": "Emissione di fatture o altri documenti per operazioni inesistenti",
            "10": "Occultamento o distruzione di documenti contabili",
            "11": "Sottrazione fraudolenta al pagamento di imposte",
        },
        notes="Frodi IVA, fatture false, distruzione della contabilità (caroselli).",
    ),
    LegalAct(
        key="l401",
        title="Interventi nel settore del giuoco e delle scommesse clandestine",
        urn_authority="stato",
        urn_type="legge",
        date="1989-12-13",
        number="401",
        aliases=("legge 401/1989", "l. 401/1989", "401/89", "scommesse abusive", "gioco clandestino"),
        articles={
            "1": "Esercizio di giuochi d'azzardo e scommesse non autorizzati",
            "4": "Scommesse clandestine e giochi non autorizzati",
        },
        notes="Gioco illegale, sale scommesse non autorizzate.",
    ),
    LegalAct(
        key="cp",
        title="Codice penale",
        urn_authority="stato",
        urn_type="regio.decreto",
        date="1930-10-19",
        number="1398",
        aliases=("codice penale", "c.p.", "cp"),
        articles={
            "474": "Introduzione nello Stato e commercio di prodotti con segni falsi",
            "515": "Frode nell'esercizio del commercio",
            "517": "Vendita di prodotti industriali con segni mendaci",
            "648": "Ricettazione",
        },
        notes="Frode commerciale, contraffazione, segni mendaci.",
    ),
    LegalAct(
        key="tulps",
        title="Testo unico delle leggi di pubblica sicurezza (TULPS)",
        urn_authority="stato",
        urn_type="regio.decreto",
        date="1931-06-18",
        number="773",
        aliases=("tulps", "testo unico pubblica sicurezza"),
        articles={
            "86": "Autorizzazione per le sale da gioco",
            "88": "Divieto di giuochi d'azzardo nei locali pubblici",
        },
        notes="Titoli autorizzativi per sale giochi e locali pubblici.",
    ),
    LegalAct(
        key="l689",
        title="Modifiche al sistema penale (depenalizzazione e illecito amministrativo)",
        urn_authority="stato",
        urn_type="legge",
        date="1981-11-24",
        number="689",
        aliases=("legge 689/1981", "l. 689/1981"),
        notes="Cornice generale degli illeciti amministrativi e delle sanzioni.",
    ),
    LegalAct(
        key="ucc",
        title="Regolamento (UE) n. 952/2013 — Codice doganale dell'Unione",
        urn_authority="unione.europea",
        urn_type="regolamento",
        date="2013-10-09",
        number="952",
        celex="32013R0952",
        aliases=("ucc", "codice doganale unionale", "regolamento 952/2013", "reg. ue 952/2013", "regolamento 952/13"),
        notes="Obblighi di dichiarazione, gestione del rischio doganale, debito doganale.",
    ),
    LegalAct(
        key="tle",
        title="Testo unico delle leggi sulla tutela del tabacco (T.L.E.)",
        urn_authority="stato",
        urn_type="regio.decreto",
        date="",
        number="",
        aliases=("tle", "testo unico tabacchi", "legge tabacchi"),
        verified=False,
        notes="Metadati di promulgazione non verificati in questa sede: richiede conferma manuale prima di generare l'URN.",
    ),
)

_BY_KEY: dict[str, LegalAct] = {act.key: act for act in ACTS}


def get_act(key: str) -> LegalAct | None:
    return _BY_KEY.get(key.strip().casefold())


def _normalize(value: str) -> str:
    return " ".join(value.casefold().replace(".", " ").replace(",", " ").replace("/", " ").split())


def find_act(text: str) -> LegalAct | None:
    """Resolve an alias or a free-text citation ("d.lgs. 504/1995") to an act."""
    haystack = f" {_normalize(text)} "
    for act in ACTS:
        for alias in act.aliases:
            if f" {_normalize(alias)} " in haystack:
                return act
    for act in ACTS:
        if act.verified and act.number and act.date:
            year = act.date[:4]
            patterns = (
                f"legge {act.number} {year}",
                f"l {act.number} {year}",
                f"decreto legislativo {act.number} {year}",
                f"d lgs {act.number} {year}",
                f"dpr {act.number} {year}",
                f"regolamento {act.number} {year}",
            )
            if any(pattern in haystack for pattern in patterns):
                return act
    return None


def all_aliases() -> list[str]:
    return sorted({alias for act in ACTS for alias in act.aliases})
