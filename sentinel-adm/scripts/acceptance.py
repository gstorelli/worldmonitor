"""SENTINEL-ADM — end-to-end acceptance script.

Deterministic, offline verification of the operating chain required by the
specification:

  1. ingest a judicial news report (RSS fixture);
  2. extract entities and fuzzy-match them against the local watchlist;
  3. validate the flash-alert policy for a high-confidence hit;
  4. qualify the facts legally and validate the generated Normattiva URN;
  5. verify the service layer payloads the HTTP routes return.

Run from the project root:

    python scripts/acceptance.py

Exit code is 0 only when every step passes.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.legal.urnlex import qualify  # noqa: E402
from app.radar.extraction import heuristic_extract  # noqa: E402
from app.radar.fuzzy import WatchlistEntry  # noqa: E402
from app.radar.harvester import parse_feed  # noqa: E402
from app.radar.pipeline import alerts_to_digest, run_radar  # noqa: E402

RSS_FIXTURE = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Guardia di Finanza — Comando Regionale Puglia</title>
  <item>
    <title>Sequestrato deposito della Frattelli Rossi S.r.l. a Bari: gasolio non assoggettato ad accisa</title>
    <link>https://example.org/news/sequestro-bari</link>
    <pubDate>Mon, 14 Sep 2026 06:30:00 +0200</pubDate>
    <description>Blitz in via Roma 12: denunciato il titolare, e-DAS mancante e autocisterna sequestrata.</description>
  </item>
</channel></rss>"""

WATCHLIST = [
    WatchlistEntry(entry_id="w1", name="Fratelli Rossi S.r.l.", kind="deposit", city="Bari", vat="12345678903"),
    WatchlistEntry(entry_id="w2", name="Depositi Tarantini S.p.A.", kind="deposit", city="Taranto"),
]

LEGAL_TEXT = (
    "Il deposito deteneva gasolio non assoggettato ad accisa con e-DAS mancante: "
    "violazione del TUA art. 40, comma 2, e del d.lgs. 74/2000 art. 8."
)


class StepReport:
    def __init__(self) -> None:
        self.steps: list[tuple[str, bool, str]] = []

    def check(self, name: str, condition: bool, detail: str = "") -> bool:
        self.steps.append((name, bool(condition), detail))
        print(f"[{'PASS' if condition else 'FAIL'}] {name}{f' — {detail}' if detail else ''}")
        return bool(condition)

    @property
    def ok(self) -> bool:
        return all(passed for _, passed, _ in self.steps)

    def summary(self) -> str:
        passed = sum(1 for _, ok, _ in self.steps if ok)
        return f"{passed}/{len(self.steps)} passi superati"


def run() -> StepReport:
    report = StepReport()

    # 1. Ingestion
    items = parse_feed(RSS_FIXTURE)
    report.check("1. Ingestione notizia giudiziaria (RSS)", len(items) == 1, f"{len(items)} item")

    # 2. Extraction + fuzzy matching
    alerts = run_radar(items, WATCHLIST)
    extraction = heuristic_extract(f"{items[0].title}. {items[0].summary}") if items else None
    print(
        f"      entità estratte: companies={extraction.companies if extraction else []} "
        f"actions={extraction.actions if extraction else []}"
    )
    matched = alerts[0].best_match if alerts else None
    report.check(
        "2. Estrazione entità e match watchlist",
        bool(alerts) and matched is not None and matched.entry.entry_id == "w1",
        f"match={matched.entry.name} score={matched.score:.2f}" if matched else "nessun match",
    )

    # 3. Flash policy
    report.check("3. Alert flash ad alta priorità", bool(alerts) and alerts[0].flash, f"score={alerts[0].score}" if alerts else "")
    if alerts:
        digest = alerts_to_digest(alerts)
        report.check("3b. Digest serializzabile", bool(digest and digest[0]["matched"]), digest[0]["level"] if digest else "")

    # 4. Legal qualification
    legal = qualify(LEGAL_TEXT)
    tua = next((item for item in legal.qualifications if item.act_key == "tua" and item.article == "40"), None)
    report.check(
        "4. Qualificazione TUA art. 40, comma 2",
        tua is not None and tua.comma == "2" and not tua.needs_review,
        (tua.urn or "") if tua else "qualificazione assente",
    )
    report.check(
        "4b. URN:LEX Normattiva deterministico",
        bool(tua and tua.normattiva_url and tua.normattiva_url.startswith("https://www.normattiva.it/uri-res/N2Ls?urn:nir:")),
    )
    penal = next((item for item in legal.qualifications if item.act_key == "dlgs74" and item.article == "8"), None)
    report.check("4c. Qualificazione D.Lgs. 74/2000 art. 8", penal is not None)

    # 5. Service layer (the payloads the HTTP routes return)
    from app.api import services  # imported here so the script stays import-light

    scan = services.radar_scan(feeds=["https://fixture.local/rss"], watchlist=WATCHLIST, fetch=lambda _url: RSS_FIXTURE)
    report.check(
        "5. Service layer: scansione radar",
        bool(scan["alerts"]) and scan["alerts"][0]["flash"],
        f"alert={len(scan['alerts'])}",
    )

    return report


if __name__ == "__main__":
    result = run()
    print(f"\nSENTINEL-ADM acceptance: {result.summary()}")
    raise SystemExit(0 if result.ok else 1)
