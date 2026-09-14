"""ArchiveBox integration tests: snapshot request, WARC discovery and import."""

import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from app.forensics.archivebox import ArchiveBoxClient, ArchiveBoxError, find_warcs, import_newest_warc
from app.forensics.evidence import EvidenceVault, TsaClient

WARC = b"WARC/1.0\r\nWARC-Type: response\r\nContent-Length: 5\r\n\r\nhello"


class ArchiveBoxClientTests(unittest.TestCase):
    def setUp(self):
        self.client = ArchiveBoxClient(base_url="http://archivebox.local", timeout=5)

    def test_add_requires_http_urls(self):
        with self.assertRaises(ArchiveBoxError):
            self.client.add("ftp://example.org")

    def test_add_posts_form_and_reports_acceptance(self):
        captured = {}

        def fake_post(url, fields):
            captured["url"] = url
            captured["fields"] = fields
            return 200, "ok"

        self.client._post_form = fake_post  # type: ignore[method-assign]
        result = self.client.add("https://example.org/news")
        self.assertTrue(result["accepted"])
        self.assertEqual(captured["url"], "http://archivebox.local/add")
        self.assertEqual(captured["fields"]["url"], "https://example.org/news")

    def test_add_reports_rejection(self):
        self.client._post_form = lambda url, fields: (500, "boom")  # type: ignore[method-assign]
        self.assertFalse(self.client.add("https://example.org/news")["accepted"])


class WarcDiscoveryTests(unittest.TestCase):
    def test_find_warcs_orders_newest_first_and_filters_since(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            old = root / "archive" / "old.warc.gz"
            new = root / "archive" / "new.warc"
            old.parent.mkdir(parents=True)
            old.write_bytes(WARC)
            new.write_bytes(WARC)
            now = datetime.now(timezone.utc)
            os.utime(old, ((now - timedelta(days=2)).timestamp(),) * 2)
            os.utime(new, (now.timestamp(),) * 2)

            candidates = find_warcs(root)
            self.assertEqual([candidate.path.name for candidate in candidates], ["new.warc", "old.warc.gz"])

            recent = find_warcs(root, since=now - timedelta(hours=1))
            self.assertEqual([candidate.path.name for candidate in recent], ["new.warc"])

    def test_missing_directory_is_empty(self):
        self.assertEqual(find_warcs("definitely-missing-dir"), [])


class ImportTests(unittest.TestCase):
    def _vault(self, folder: str) -> EvidenceVault:
        def runner(args, data):
            out_index = args.index("-out") + 1
            Path(args[out_index]).write_bytes(b"TSQ")
            return 0, b"", b""

        return EvidenceVault(root=folder, tsa=TsaClient(tsa_url="http://tsa.local", runner=runner))

    def test_import_newest_warc_stores_verifies_and_seals(self):
        with tempfile.TemporaryDirectory() as output_dir, tempfile.TemporaryDirectory() as vault_dir:
            warc = Path(output_dir) / "capture.warc"
            warc.write_bytes(WARC)
            vault = self._vault(vault_dir)

            fake_response = mock.MagicMock()
            fake_response.read.return_value = b"TSR"
            fake_response.__enter__ = lambda self: self
            fake_response.__exit__ = lambda self, *args: False

            with mock.patch("urllib.request.urlopen", return_value=fake_response):
                record, verification = import_newest_warc(vault, output_dir, "https://example.org/news")

            self.assertEqual(verification["status"], "ok")
            self.assertEqual(verification["tsa"]["status"], "sealed")
            self.assertTrue(Path(record.folder, "capture.warc.sha256").exists())

    def test_import_without_warc_raises(self):
        with tempfile.TemporaryDirectory() as output_dir, tempfile.TemporaryDirectory() as vault_dir:
            vault = self._vault(vault_dir)
            with self.assertRaises(ArchiveBoxError):
                import_newest_warc(vault, output_dir, "https://example.org/news")


if __name__ == "__main__":
    unittest.main()
