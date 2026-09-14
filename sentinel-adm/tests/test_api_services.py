"""Service-layer tests: radar scan, watchlist, dorks, OSINT jobs, evidence."""

import tempfile
import unittest
from pathlib import Path

from app.api import services
from app.config import Settings
from app.forensics.archivebox import ArchiveBoxError

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


class FakeArchiveBox:
    def __init__(self, accepted: bool = True) -> None:
        self.accepted = accepted
        self.requests: list[str] = []

    def add(self, url: str, depth: int = 0) -> dict:
        self.requests.append(url)
        return {"status": 200 if self.accepted else 500, "accepted": self.accepted, "url": url}


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


class DorkAndOsintTests(unittest.TestCase):
    def test_dork_response(self):
        response = services.dork_response(["Fratelli Rossi"], ["pvp", "anac"])
        self.assertEqual(len(response["queries"]), 2)
        self.assertEqual(len(response["portals"]), 6)

    def test_unknown_portal_raises(self):
        with self.assertRaises(KeyError):
            services.dork_response(["x"], ["nope"])

    def test_osint_job_specs(self):
        job = services.osint_job("maigret", "@target", "/dossiers")
        self.assertEqual(job["spec"]["args"][:2], ["maigret", "target"])
        self.assertEqual(job["execution"], "toolbox")
        with self.assertRaises(services.OsintInputError):
            services.osint_job("unknown", "target")
        with self.assertRaises(services.OsintInputError):
            services.osint_job("holehe", "not-an-email")


class LegalServiceTests(unittest.TestCase):
    def test_legal_qualify_returns_urn(self):
        result = services.legal_qualify("Violazione del TUA art. 47, comma 1: deposito non autorizzato.")
        self.assertEqual(result["qualifications"][0]["act_key"], "tua")
        self.assertIn("~art47-com1", result["qualifications"][0]["urn"])


class EvidenceServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.archivebox_dir = root / "archivebox"
        self.archivebox_dir.mkdir()
        self.settings = Settings(
            archivebox_output_dir=str(self.archivebox_dir),
            evidence_dir=str(root / "evidence"),
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _write_warc(self, name: str = "capture.warc", content: bytes = b"WARC/1.0\r\n\r\nbody") -> Path:
        path = self.archivebox_dir / name
        path.write_bytes(content)
        return path

    def test_capture_and_seal_without_tsa(self):
        self._write_warc()
        client = FakeArchiveBox()
        result = services.capture_and_seal("https://example.org/news", settings=self.settings, client=client, seal=False)
        self.assertEqual(client.requests, ["https://example.org/news"])
        self.assertEqual(result["verification"]["status"], "ok")
        self.assertTrue(Path(result["evidence"]["folder"], "capture.warc.sha256").exists())

    def test_capture_reports_archivebox_rejection(self):
        with self.assertRaises(ArchiveBoxError):
            services.capture_and_seal("https://example.org/news", settings=self.settings, client=FakeArchiveBox(accepted=False), seal=False)

    def test_capture_without_warc_raises(self):
        with self.assertRaises(ArchiveBoxError):
            services.capture_and_seal("https://example.org/news", settings=self.settings, client=FakeArchiveBox(), seal=False)

    def test_evidence_import_happy_path_and_traversal_guard(self):
        warc = self._write_warc("manual.warc")
        result = services.evidence_import(str(warc), "https://example.org/manual", settings=self.settings, seal=False)
        self.assertEqual(result["verification"]["status"], "ok")

        outside = Path(self.tmp.name) / "outside.warc"
        outside.write_bytes(b"data")
        with self.assertRaises(ArchiveBoxError):
            services.evidence_import(str(outside), "https://example.org/outside", settings=self.settings, seal=False)


if __name__ == "__main__":
    unittest.main()
