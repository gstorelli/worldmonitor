"""Service-layer tests: radar scan, watchlist and legal qualification."""

import tempfile
import unittest
from pathlib import Path

from app.api import services
from app.config import Settings

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>GdF</title>
<item>
  <title>Sequestrato il deposito della Fratelli Rossi S.r.l. a Bari</title>
  <link>https://example.org/1</link>
  <pubDate>Mon, 14 Sep 2026 06:30:00 +0200</pubDate>
  <description>Denunciato il titolare, gasolio non assoggettato ad accisa.</description>
</item>
</channel></rss>"""

WATCHLIST = [{"entry_id": "w1", "name": "Fratelli Rossi S.r.l.", "kind": "deposit", "city": "Bari"}]


class RadarScanTests(unittest.TestCase):
    def test_scan_harvests_and_matches(self):
        result = services.radar_scan(
            feeds=["https://feed/x"],
            watchlist=WATCHLIST,
            fetch=lambda url: RSS,
        )
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["alerts"][0]["matched"][0]["entry_id"], "w1")
        self.assertTrue(result["alerts"][0]["flash"])

    def test_scan_without_feeds_reports_configuration(self):
        result = services.radar_scan(feeds=[], watchlist=[])
        self.assertEqual(result["items"], [])
        self.assertIn("nessun feed configurato", result["errors"][0])

    def test_scan_limit(self):
        result = services.radar_scan(feeds=["https://feed/x"], watchlist=WATCHLIST, fetch=lambda url: RSS, limit=1)
        self.assertEqual(len(result["items"]), 1)


class WatchlistServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings = Settings(watchlist_path=str(Path(self.tmp.name) / "watchlist.json"))

    def tearDown(self):
        self.tmp.cleanup()

    def test_upsert_list_remove(self):
        created = services.watchlist_upsert({"entry_id": "w1", "name": "Deposito Uno S.r.l."}, self.settings)
        self.assertEqual(created["entry_id"], "w1")
        self.assertEqual(len(services.watchlist_list(self.settings)), 1)

        services.watchlist_upsert({"entry_id": "w1", "name": "Deposito Uno S.p.A.", "aliases": ["Depositi Uno"]}, self.settings)
        entries = services.watchlist_list(self.settings)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["name"], "Deposito Uno S.p.A.")

        self.assertTrue(services.watchlist_remove("w1", self.settings))
        self.assertFalse(services.watchlist_remove("w1", self.settings))
        self.assertEqual(services.watchlist_list(self.settings), [])


class LegalServiceTests(unittest.TestCase):
    def test_legal_qualify_returns_urn(self):
        result = services.legal_qualify("Violazione del TUA art. 47, comma 1: deposito non autorizzato.")
        self.assertEqual(result["qualifications"][0]["act_key"], "tua")
        self.assertIn("~art47-com1", result["qualifications"][0]["urn"])


if __name__ == "__main__":
    unittest.main()
