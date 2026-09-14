"""Evidence vault tests: hashing, sidecar integrity, tamper detection, TSA sealing."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.forensics.evidence import EvidenceVault, TsaClient, sha256_bytes, sha256_file

WARC_BYTES = b"WARC/1.0\r\nWARC-Type: warcinfo\r\nContent-Length: 5\r\n\r\nhello"


class HashingTests(unittest.TestCase):
    def test_sha256_known_vector(self):
        self.assertEqual(sha256_bytes(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")

    def test_sha256_file_matches_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "x.bin"
            path.write_bytes(WARC_BYTES)
            self.assertEqual(sha256_file(path), sha256_bytes(WARC_BYTES))


class VaultTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = EvidenceVault(root=self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_store_capture_writes_warc_sidecar_and_manifest(self):
        record = self.vault.store_capture("https://example.org/notizia", WARC_BYTES, agent="tester", notes="nota")
        folder = Path(record.folder)
        self.assertTrue((folder / "capture.warc").exists())
        self.assertTrue((folder / "capture.warc.sha256").exists())
        sidecar = (folder / "capture.warc.sha256").read_text(encoding="utf-8")
        self.assertTrue(sidecar.startswith(record.sha256))
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["source_url"], "https://example.org/notizia")
        self.assertEqual(manifest["agent"], "tester")
        self.assertEqual(manifest["tsa"]["status"], "pending")
        self.assertEqual(self.vault.verify(record.evidence_id)["status"], "ok")

    def test_tampering_is_detected(self):
        record = self.vault.store_capture("https://example.org/x", WARC_BYTES)
        warc = Path(record.folder) / "capture.warc"
        warc.write_bytes(WARC_BYTES + b"tampered")
        self.assertEqual(self.vault.verify(record.evidence_id)["status"], "mismatch")

    def test_missing_evidence_reported(self):
        self.assertEqual(self.vault.verify("does-not-exist")["status"], "missing")

    def test_list_records_sorted(self):
        self.vault.store_capture("https://example.org/a", WARC_BYTES)
        self.vault.store_capture("https://example.org/b", WARC_BYTES)
        self.assertEqual(len(self.vault.list_records()), 2)


class TsaTests(unittest.TestCase):
    def _runner(self, args, data):
        # Emulate `openssl ts -query ... -out <file>` by creating the .tsq file.
        out_index = args.index("-out") + 1
        Path(args[out_index]).write_bytes(b"TSQ-REQUEST")
        return 0, b"", b""

    def test_seal_with_fake_openssl_and_tsa(self):
        with tempfile.TemporaryDirectory() as folder:
            warc = Path(folder) / "capture.warc"
            warc.write_bytes(WARC_BYTES)
            client = TsaClient(tsa_url="http://tsa.local", runner=self._runner)

            fake_response = mock.MagicMock()
            fake_response.read.return_value = b"TSR-TOKEN"
            fake_response.__enter__ = lambda self: self
            fake_response.__exit__ = lambda self, *args: False

            with mock.patch("urllib.request.urlopen", return_value=fake_response) as urlopen:
                result = client.seal(warc)

            self.assertEqual(result["status"], "sealed")
            self.assertTrue((Path(folder) / "tsa_response.tsr").exists())
            self.assertEqual((Path(folder) / "tsa_response.tsr").read_bytes(), b"TSR-TOKEN")
            sent_request = urlopen.call_args[0][0]
            self.assertEqual(sent_request.headers["Content-type"], "application/timestamp-query")

    def test_seal_reports_when_openssl_missing(self):
        with tempfile.TemporaryDirectory() as folder:
            warc = Path(folder) / "capture.warc"
            warc.write_bytes(WARC_BYTES)
            client = TsaClient(runner=lambda args, data: (1, b"", b"openssl not available"))
            self.assertEqual(client.seal(warc)["status"], "unavailable")

    def test_seal_updates_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            vault = EvidenceVault(root=folder, tsa=TsaClient(tsa_url="http://tsa.local", runner=self._runner))
            record = vault.store_capture("https://example.org/x", WARC_BYTES)

            fake_response = mock.MagicMock()
            fake_response.read.return_value = b"TSR-TOKEN"
            fake_response.__enter__ = lambda self: self
            fake_response.__exit__ = lambda self, *args: False
            with mock.patch("urllib.request.urlopen", return_value=fake_response):
                manifest = vault.seal(record.evidence_id)

            self.assertEqual(manifest["tsa"]["status"], "sealed")
            self.assertEqual(vault.verify(record.evidence_id)["tsa_status"], "sealed")


if __name__ == "__main__":
    unittest.main()
