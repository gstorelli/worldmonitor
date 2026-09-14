"""SENTINEL-ADM — forensic evidence vault (chain of custody).

Every acquisition is stored as a self-contained folder:

    <evidence_root>/<timestamp>-<slug>/
        capture.warc            ISO 28500 Web ARChive produced by ArchiveBox
        capture.warc.sha256     `<hash>  <filename>` sidecar
        manifest.json           URL, agent, timestamps, hash, TSA status, notes
        notes.txt               investigator notes
        tsa_request.tsq         RFC 3161 timestamp query (when sealing is run)
        tsa_response.tsr        RFC 3161 Timestamp Response token

Hashing and the manifest are pure stdlib; RFC 3161 sealing shells out to
OpenSSL (`ts -query`, `ts -reply`) when available, so no Python crypto
dependency is required on the on-prem host.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

EVIDENCE_SCHEMA_VERSION = 1


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _slug(value: str, max_length: int = 60) -> str:
    text = re.sub(r"^https?://", "", value or "")
    text = re.sub(r"[^\w.-]+", "-", text).strip("-")
    return (text[:max_length] or "capture").lower()


@dataclass
class EvidenceRecord:
    evidence_id: str
    folder: str
    source_url: str
    sha256: str
    captured_at: str
    warc_bytes: int
    tsa_status: str = "pending"
    notes: str = ""


class TsaClient:
    """RFC 3161 timestamping through OpenSSL (optional but standard tooling)."""

    def __init__(
        self,
        tsa_url: str | None = None,
        openssl: str | None = None,
        runner: Callable[[list[str], bytes | None], tuple[int, bytes, bytes]] | None = None,
    ) -> None:
        self.tsa_url = tsa_url or os.environ.get("TSA_URL") or "https://freetsa.org/tsr"
        self.openssl = openssl or shutil.which("openssl") or "openssl"
        self._runner = runner

    def _run(self, args: list[str], data: bytes | None = None) -> tuple[int, bytes, bytes]:
        if self._runner:
            return self._runner(args, data)
        completed = subprocess.run(args, input=data, capture_output=True, check=False)  # noqa: S603 (fixed args)
        return completed.returncode, completed.stdout, completed.stderr

    def available(self) -> bool:
        if self._runner:
            return True
        return shutil.which(self.openssl) is not None

    def seal(self, warc_path: str | Path) -> dict[str, Any]:
        """Create the .tsq query, fetch the TSA response and store the .tsr token."""
        warc = Path(warc_path)
        request_path = warc.parent / "tsa_request.tsq"
        response_path = warc.parent / "tsa_response.tsr"
        code, _, error = self._run([self.openssl, "ts", "-query", "-data", str(warc), "-sha256", "-cert", "-out", str(request_path)])
        if code != 0 or not request_path.exists():
            return {"status": "unavailable", "reason": error.decode("utf-8", "replace")[:200] or "openssl ts non disponibile"}
        try:
            query = request_path.read_bytes()
            request = urllib.request.Request(
                self.tsa_url,
                data=query,
                headers={"Content-Type": "application/timestamp-query", "Accept": "application/timestamp-reply"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 (configured TSA)
                token = response.read()
        except Exception as error:  # noqa: BLE001 - network/TSA failures are reported, not raised
            return {"status": "failed", "reason": str(error)[:200]}
        response_path.write_bytes(token)
        return {
            "status": "sealed",
            "provider": self.tsa_url,
            "request_file": request_path.name,
            "token_file": response_path.name,
            "token_bytes": len(token),
            "timestamped_at": datetime.now(timezone.utc).isoformat(),
        }


class EvidenceVault:
    def __init__(self, root: str | None = None, tsa: TsaClient | None = None) -> None:
        self.root = Path(root or os.environ.get("EVIDENCE_DIR") or "./data/evidence")
        self.root.mkdir(parents=True, exist_ok=True)
        self.tsa = tsa or TsaClient()

    def _new_folder(self, source_url: str) -> Path:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        folder = self.root / f"{stamp}-{_slug(source_url)}"
        counter = 1
        while folder.exists():
            counter += 1
            folder = self.root / f"{stamp}-{_slug(source_url)}-{counter}"
        folder.mkdir(parents=True)
        return folder

    def store_capture(
        self,
        source_url: str,
        warc_bytes: bytes,
        *,
        agent: str = "sentinel-adm",
        notes: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> EvidenceRecord:
        """Persist a WARC + SHA-256 sidecar + manifest (no TSA sealing yet)."""
        folder = self._new_folder(source_url)
        warc_path = folder / "capture.warc"
        warc_path.write_bytes(warc_bytes)
        digest = sha256_bytes(warc_bytes)
        sidecar = folder / "capture.warc.sha256"
        sidecar.write_text(f"{digest}  capture.warc\n", encoding="utf-8")
        captured_at = datetime.now(timezone.utc).isoformat()
        manifest = {
            "schema_version": EVIDENCE_SCHEMA_VERSION,
            "evidence_id": folder.name,
            "source_url": source_url,
            "agent": agent,
            "captured_at": captured_at,
            "warc_file": warc_path.name,
            "warc_bytes": len(warc_bytes),
            "sha256": digest,
            "sidecar_file": sidecar.name,
            "tsa": {"status": "pending"},
            "notes": notes,
            "metadata": metadata or {},
        }
        (folder / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        (folder / "notes.txt").write_text(notes or "", encoding="utf-8")
        return EvidenceRecord(
            evidence_id=folder.name,
            folder=str(folder),
            source_url=source_url,
            sha256=digest,
            captured_at=captured_at,
            warc_bytes=len(warc_bytes),
            tsa_status="pending",
            notes=notes,
        )

    def import_warc(self, warc_path: str | Path, source_url: str, *, agent: str = "archivebox", notes: str = "") -> EvidenceRecord:
        """Adopt a WARC written by the ArchiveBox service into the vault."""
        path = Path(warc_path)
        if not path.is_file():
            raise FileNotFoundError(f"WARC non trovato: {path}")
        return self.store_capture(source_url, path.read_bytes(), agent=agent, notes=notes)

    def seal(self, evidence_id: str) -> dict[str, Any]:
        """Run RFC 3161 timestamping and update the manifest."""
        folder = self.root / evidence_id
        manifest_path = folder / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"evidenza non trovata: {evidence_id}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        tsa_result = self.tsa.seal(folder / manifest["warc_file"])
        manifest["tsa"] = tsa_result
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        return manifest

    def verify(self, evidence_id: str) -> dict[str, Any]:
        """Recompute the digest and compare sidecar, manifest and WARC."""
        folder = self.root / evidence_id
        manifest_path = folder / "manifest.json"
        if not manifest_path.exists():
            return {"evidence_id": evidence_id, "status": "missing"}
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        warc = folder / manifest["warc_file"]
        if not warc.exists():
            return {"evidence_id": evidence_id, "status": "missing-warc"}
        digest = sha256_file(warc)
        sidecar_digest = ""
        sidecar = folder / manifest.get("sidecar_file", "capture.warc.sha256")
        if sidecar.exists():
            sidecar_digest = sidecar.read_text(encoding="utf-8").split()[0]
        ok = digest == manifest.get("sha256") and (not sidecar_digest or sidecar_digest == digest)
        return {
            "evidence_id": evidence_id,
            "status": "ok" if ok else "mismatch",
            "sha256": digest,
            "manifest_sha256": manifest.get("sha256"),
            "sidecar_sha256": sidecar_digest or None,
            "tsa_status": (manifest.get("tsa") or {}).get("status", "pending"),
        }

    def list_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for manifest_path in sorted(self.root.glob("*/manifest.json"), reverse=True):
            try:
                records.append(json.loads(manifest_path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                continue
        return records
