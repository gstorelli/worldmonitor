"""Radar pipeline tests: watchlist store, extraction (heuristic + model) and alerts."""

import json
import tempfile
import unittest
from pathlib import Path

from app.llm.adapter import OpenAICompatibleClient
from app.radar.extraction import extract_entities, heuristic_extract
from app.radar.fuzzy import WatchlistEntry
from app.radar.harvester import NewsItem
from app.radar.pipeline import alerts_to_digest, assess_item, run_radar
from app.radar.watchlist import WatchlistError, load_watchlist, save_watchlist, upsert_entry, validate_entry

HEADLINE = "Sequestrato il deposito della Fratelli Rossi S.r.l. in via Roma 12 a Bari: denunciato il titolare"


class WatchlistStoreTests(unittest.TestCase):
    def test_validate_entry_rejects_missing_fields(self):
        with self.assertRaises(WatchlistError):
            validate_entry({"name": "Senza id"})
        with self.assertRaises(WatchlistError):
            validate_entry({"entry_id": "w1"})

    def test_round_trip_and_upsert(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "watchlist.json"
            entries = [validate_entry({"entry_id": "w1", "name": "Deposito Uno S.r.l.", "city": "Bari", "aliases": ["Depositi Uno"]})]
            save_watchlist(entries, path)
            loaded = load_watchlist(path)
            self.assertEqual(loaded[0].name, "Deposito Uno S.r.l.")
            self.assertEqual(loaded[0].aliases, ["Depositi Uno"])
            updated = upsert_entry(loaded, validate_entry({"entry_id": "w1", "name": "Deposito Uno S.p.A."}))
            self.assertEqual(len(updated), 1)
            self.assertEqual(updated[0].name, "Deposito Uno S.p.A.")

    def test_missing_file_is_empty_not_error(self):
        self.assertEqual(load_watchlist("definitely-missing.json"), [])

    def test_corrupt_file_raises(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.json"
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaises(WatchlistError):
                load_watchlist(path)


class ExtractionTests(unittest.TestCase):
    def test_heuristic_extracts_companies_places_actions(self):
        extraction = heuristic_extract(HEADLINE)
        self.assertTrue(any("Fratelli Rossi" in company for company in extraction.companies))
        self.assertIn("Bari", extraction.places)
        self.assertTrue(any("via Roma 12" in place for place in extraction.places))
        self.assertIn("sequestro", extraction.actions)
        self.assertIn("denuncia", extraction.actions)
        self.assertIn("deposito", extraction.assets)

    def test_model_extraction_uses_sanitized_gateway(self):
        client = OpenAICompatibleClient(base_url="http://llm.local/v1", api_key="k", model="m")
        sent = {}

        def fake_transport(url, payload, headers):
            sent["user"] = payload["messages"][1]["content"]
            content = json.dumps(
                {
                    "companies": ["Fratelli Rossi S.r.l."],
                    "people": [],
                    "places": ["Bari"],
                    "actions": ["sequestro"],
                    "assets": ["deposito"],
                }
            )
            return {"choices": [{"message": {"content": content}}], "model": "m"}

        client._post_json = fake_transport  # type: ignore[method-assign]
        extraction = extract_entities(HEADLINE, client=client)
        self.assertEqual(extraction.companies, ["Fratelli Rossi S.r.l."])
        self.assertIn("Bari", sent["user"])

    def test_model_failure_falls_back_to_heuristics(self):
        client = OpenAICompatibleClient(base_url="http://llm.local/v1", api_key="k", model="m")
        client._post_json = lambda url, payload, headers: (_ for _ in ()).throw(RuntimeError("endpoint giù"))  # type: ignore[method-assign]
        extraction = extract_entities(HEADLINE, client=client)
        self.assertTrue(any("Fratelli Rossi" in company for company in extraction.companies))


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.watchlist = [
            WatchlistEntry(entry_id="w1", name="Fratelli Rossi S.r.l.", kind="deposit", city="Bari"),
            WatchlistEntry(entry_id="w2", name="Depositi Tarantini S.p.A.", kind="deposit", city="Taranto"),
        ]

    def _item(self, title: str, summary: str = "") -> NewsItem:
        return NewsItem(title=title, link="https://example.org/1", source="GdF", published="2026-09-14T06:00:00+00:00", summary=summary)

    def test_match_produces_alert_with_severity_and_flash(self):
        alert = assess_item(self._item(HEADLINE), self.watchlist)
        self.assertIsNotNone(alert)
        assert alert is not None
        self.assertEqual(alert.best_match.entry.entry_id, "w1")
        self.assertGreaterEqual(alert.score, 55)
        self.assertTrue(alert.flash)  # sequestro + match quasi esatto

    def test_non_matching_news_is_dropped(self):
        self.assertIsNone(assess_item(self._item("Aumento delle accise sui carburanti nel 2027"), self.watchlist))

    def test_run_radar_sorts_by_score_and_serialises(self):
        items = [
            self._item("Controllo formale su Depositi Tarantini S.p.A."),
            self._item(HEADLINE),
        ]
        alerts = run_radar(items, self.watchlist)
        self.assertEqual(len(alerts), 2)
        self.assertGreaterEqual(alerts[0].score, alerts[1].score)
        digest = alerts_to_digest(alerts)
        self.assertEqual(digest[0]["matched"][0]["entry_id"], alerts[0].best_match.entry.entry_id)
        self.assertIn("rationale", digest[0])

    def test_sanctions_hit_forces_flash(self):
        alert = assess_item(self._item(HEADLINE), self.watchlist, sanctions_hit=True)
        assert alert is not None
        self.assertTrue(alert.flash)


if __name__ == "__main__":
    unittest.main()
