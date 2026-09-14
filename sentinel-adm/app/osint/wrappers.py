"""SENTINEL-ADM — wrappers for username/email reconnaissance tools.

The API never shells out: a wrapper *builds* a job spec and only executes when
a runner is explicitly injected (the dedicated OSINT toolbox container). This
keeps the request-handling process free of command execution while still
letting the toolbox run Maigret/Holehe and return structured dossiers.

Inputs are validated before they reach argv, so no argument can inject flags.

Stdlib only.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from typing import Callable

Runner = Callable[[list[str]], tuple[int, str, str]]

_USERNAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$")
_EMAIL = re.compile(r"^[\w.+-]+@[\w-]+\.[\w.-]{2,}$")


class OsintInputError(ValueError):
    pass


@dataclass
class JobSpec:
    tool: str
    args: list[str]
    description: str
    output_dir: str = ""


@dataclass
class ToolResult:
    tool: str
    executed: bool
    exit_code: int | None = None
    payload: dict | list | None = None
    stderr: str = ""
    spec: JobSpec | None = None
    notes: list[str] = field(default_factory=list)


def parse_maigret_json(text: str) -> dict:
    """Maigret `--json simple` output → normalised dossier."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"sites": [], "count": 0, "raw": text[:2000]}
    sites: list[dict[str, str]] = []
    if isinstance(data, dict):
        entries = data.get("sites") or data.get("results") or data
        if isinstance(entries, dict):
            for name, payload in entries.items():
                status = (payload or {}).get("status", {}) if isinstance(payload, dict) else {}
                if status.get("status") == "Claimed":
                    sites.append(
                        {
                            "site": name,
                            "url": str(status.get("url_user") or status.get("url") or ""),
                            "tags": ",".join(status.get("tags") or []),
                        }
                    )
        elif isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, dict) and entry.get("url_user"):
                    sites.append({"site": str(entry.get("site_name", "")), "url": str(entry["url_user"]), "tags": ""})
    return {"sites": sites, "count": len(sites)}


def parse_holehe_stdout(text: str) -> list[str]:
    """Holehe stdout → list of services where the email is registered."""
    services: list[str] = []
    for line in text.splitlines():
        match = re.match(r"^\[\+\]\s+([\w.\-]+)", line.strip())
        if match:
            services.append(match.group(1))
    return services


class OsintTool:
    name = "tool"
    description = ""

    def validate(self, target: str) -> str:  # pragma: no cover - overridden
        raise NotImplementedError

    def build_args(self, target: str, output_dir: str = "") -> list[str]:  # pragma: no cover - overridden
        raise NotImplementedError

    def parse(self, stdout: str) -> dict | list:  # pragma: no cover - overridden
        raise NotImplementedError

    def job(self, target: str, output_dir: str = "") -> JobSpec:
        clean = self.validate(target)
        return JobSpec(tool=self.name, args=self.build_args(clean, output_dir), description=self.description, output_dir=output_dir)

    def run(self, target: str, output_dir: str = "", runner: Runner | None = None) -> ToolResult:
        spec = self.job(target, output_dir)
        if runner is None:
            return ToolResult(tool=self.name, executed=False, spec=spec, notes=["runner non configurato: eseguire nel toolbox OSINT"])
        code, stdout, stderr = runner(spec.args)
        if code != 0:
            return ToolResult(tool=self.name, executed=True, exit_code=code, stderr=stderr[:500], spec=spec)
        return ToolResult(tool=self.name, executed=True, exit_code=0, payload=self.parse(stdout), spec=spec)

    @staticmethod
    def default_runner(args: list[str]) -> tuple[int, str, str]:  # pragma: no cover - toolbox only
        completed = subprocess.run(args, capture_output=True, text=True, check=False)  # noqa: S603 (validated argv)
        return completed.returncode, completed.stdout, completed.stderr


class MaigretTool(OsintTool):
    name = "maigret"
    description = "Ricognizione username multi-piattaforma"

    def validate(self, target: str) -> str:
        username = str(target).strip().lstrip("@")
        if not _USERNAME.match(username):
            raise OsintInputError("username non valido (2-64 caratteri: lettere, cifre, . _ -)")
        return username

    def build_args(self, target: str, output_dir: str = "") -> list[str]:
        args = ["maigret", target, "--json", "simple", "--no-color", "--no-progressbar"]
        if output_dir:
            args += ["--folderoutput", output_dir]
        return args

    def parse(self, stdout: str) -> dict:
        return parse_maigret_json(stdout)


class HoleheTool(OsintTool):
    name = "holehe"
    description = "Verifica passiva di registrazioni su servizi online"

    def validate(self, target: str) -> str:
        email = str(target).strip()
        if not _EMAIL.match(email):
            raise OsintInputError("email non valida")
        return email

    def build_args(self, target: str, output_dir: str = "") -> list[str]:
        return ["holehe", "--only-used", "--no-color", target]

    def parse(self, stdout: str) -> list[str]:
        return parse_holehe_stdout(stdout)


TOOLS: dict[str, OsintTool] = {"maigret": MaigretTool(), "holehe": HoleheTool()}
