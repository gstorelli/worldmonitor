"""SENTINEL-ADM — deterministic pre-flight privacy masking.

Italian administrative identifiers must never leave the on-premise boundary in
clear text. This module finds them, replaces each occurrence with a stable
surrogate token (``[[CF_1]]``), and keeps the mapping in a session-scoped,
non-persistent dictionary so responses can be restored locally.

The detection is *validated*, not just pattern-based: Codice Fiscale check
characters, Partita IVA check digits and IBAN mod-97 are verified so ordinary
16-character strings are not masked by accident.

Stdlib only — runs on the on-prem host with zero third-party dependencies.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

# ── Italian identifier validators ────────────────────────────────────────────

_CF_ODD = {
    "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
    "A": 1, "B": 0, "C": 5, "D": 7, "E": 9, "F": 13, "G": 15, "H": 17, "I": 19, "J": 21,
    "K": 2, "L": 4, "M": 18, "N": 20, "O": 11, "P": 3, "Q": 6, "R": 8, "S": 12, "T": 14,
    "U": 16, "V": 10, "W": 22, "X": 25, "Y": 24, "Z": 23,
}


def _cf_check_char(first_fifteen: str) -> str:
    total = 0
    for index, char in enumerate(first_fifteen):
        if index % 2 == 0:  # odd positions are 1-indexed in the official tables
            total += _CF_ODD[char]
        else:
            total += int(char) if char.isdigit() else ord(char) - ord("A")
    return chr(ord("A") + (total % 26))


def is_valid_codice_fiscale(value: str) -> bool:
    """Structural + checksum validation of a 16-character Italian tax code."""
    candidate = value.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{16}", candidate):
        return False
    if not re.fullmatch(r"[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]", candidate):
        return False
    return _cf_check_char(candidate[:15]) == candidate[15]


def compute_codice_fiscale_check(first_fifteen: str) -> str:
    """Exposed for tests/tools that build synthetic but valid tax codes."""
    return _cf_check_char(first_fifteen.strip().upper())


def is_valid_partita_iva(value: str) -> bool:
    """11-digit Italian VAT number with the official check-digit algorithm."""
    digits = value.strip()
    if not re.fullmatch(r"\d{11}", digits):
        return False
    total = 0
    for index, char in enumerate(digits[:10]):
        digit = int(char)
        if index % 2 == 0:
            total += digit
        else:
            doubled = digit * 2
            total += doubled - 9 if doubled > 9 else doubled
    return (10 - total % 10) % 10 == int(digits[10])


def compute_partita_iva_check(first_ten: str) -> str:
    digits = first_ten.strip()
    if not re.fullmatch(r"\d{10}", digits):
        raise ValueError("serve un prefisso di 10 cifre")
    total = 0
    for index, char in enumerate(digits):
        digit = int(char)
        if index % 2 == 0:
            total += digit
        else:
            doubled = digit * 2
            total += doubled - 9 if doubled > 9 else doubled
    return str((10 - total % 10) % 10)


def is_valid_iban(value: str) -> bool:
    compact = re.sub(r"\s+", "", value).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", compact):
        return False
    rearranged = compact[4:] + compact[:4]
    digits = "".join(str(int(ch, 36)) for ch in rearranged)
    return int(digits) % 97 == 1


# ── Masking engine ───────────────────────────────────────────────────────────

# Ordered: the most specific identifiers first so a CF embedded in a longer
# token is not partially masked by the generic number rule.
_PATTERNS: tuple[tuple[str, str, object], ...] = (
    ("IBAN", r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", is_valid_iban),
    ("CF", r"\b[A-Za-z]{6}\d{2}[A-Za-z]\d{2}[A-Za-z]\d{3}[A-Za-z]\b", is_valid_codice_fiscale),
    ("PIVA", r"\b\d{11}\b", is_valid_partita_iva),
    ("TARGA", r"\b[A-Z]{2}\d{3}[A-Z]{2}\b|\b[A-Z]{2}\d{5}\b", None),
    ("EMAIL", r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", None),
    ("TELEFONO", r"(?<!\w)(?:\+39[\s.-]?)?(?:0\d{1,3}[\s.-]?\d{5,8}|3\d{2}[\s.-]?\d{6,7})(?!\w)", None),
    ("INDIRIZZO", r"\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada)\s+[A-ZÀ-Ù][\w'’.\-]*(?:\s+[A-ZÀ-Ù0-9][\w'’.\-]*){0,3},?\s*\d{1,4}[A-Za-z]?\b", None),
)

_DEFAULT_PLACEHOLDERS = {
    "IBAN": "IBAN",
    "CF": "CF",
    "PIVA": "PIVA",
    "TARGA": "TARGA",
    "EMAIL": "EMAIL",
    "TELEFONO": "TEL",
    "INDIRIZZO": "INDIRIZZO",
    "NOME": "NOME",
}

# Contextual personal names: a marker followed by two capitalised words
# ("il sig. Mario Rossi", "indagato Giuseppe Bianchi").
_NAME_MARKER = r"(?:sig\.?|signor|signora|dott\.?|dottor|ing\.?|avv\.?|indagato|indagata|sospettato|sospettata|titolare|amministratore)\s+"
_NAME_PATTERN = re.compile(rf"\b({_NAME_MARKER})([A-ZÀ-Ù][a-zà-ù]+)\s+([A-ZÀ-Ù][a-zà-ù]+)\b")


@dataclass
class SanitizationResult:
    """Sanitized text plus the mapping needed to restore the original."""

    text: str
    mapping: dict[str, str] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)

    @property
    def masked(self) -> bool:
        return bool(self.mapping)


class PrivacyMasker:
    """Deterministic, session-scoped masking with reversible surrogates."""

    def __init__(self, kinds: Iterable[str] | None = None) -> None:
        enabled = set(kinds) if kinds else {name for name, _, _ in _PATTERNS} | {"NOME"}
        self._counters: dict[str, int] = {}
        self._mapping: dict[str, str] = {}
        self._reverse: dict[str, str] = {}
        self._patterns = [
            (kind, re.compile(pattern, re.IGNORECASE if kind not in {"CF", "TARGA"} else 0), validator)
            for kind, pattern, validator in _PATTERNS
            if kind in enabled
        ]
        self._names_enabled = "NOME" in enabled

    # -- public API ---------------------------------------------------------

    def mask(self, text: str) -> SanitizationResult:
        sanitized = text
        counts: dict[str, int] = {}

        if self._names_enabled:
            sanitized = _NAME_PATTERN.sub(self._mask_name, sanitized)

        for kind, pattern, validator in self._patterns:
            def replace(match: re.Match[str], kind_: str = kind, validator_: object = validator) -> str:
                value = match.group(0)
                if callable(validator_) and not validator_(value):
                    return value
                token = self._token(kind_, value)
                counts[kind_] = counts.get(kind_, 0) + 1
                return token

            sanitized = pattern.sub(replace, sanitized)

        return SanitizationResult(text=sanitized, mapping=dict(self._mapping), counts=counts)

    def unmask(self, text: str) -> str:
        """Restore real values inside the authenticated local interface."""
        restored = text
        for token, original in self._reverse.items():
            restored = restored.replace(token, original)
        return restored

    def clear(self) -> None:
        """Drop the session dictionary (call between investigations)."""
        self._counters.clear()
        self._mapping.clear()
        self._reverse.clear()

    # -- internals ----------------------------------------------------------

    def _token(self, kind: str, value: str) -> str:
        key = f"{kind}:{value.casefold()}"
        if key in self._mapping:
            return self._mapping[key]
        self._counters[kind] = self._counters.get(kind, 0) + 1
        token = f"[[{_DEFAULT_PLACEHOLDERS.get(kind, kind)}_{self._counters[kind]}]]"
        self._mapping[key] = token
        self._reverse[token] = value
        return token

    def _mask_name(self, match: re.Match[str]) -> str:
        marker, first, last = match.group(1), match.group(2), match.group(3)
        token = self._token("NOME", f"{first} {last}")
        return f"{marker}{token}"


def sanitize(text: str, masker: PrivacyMasker | None = None, kinds: Iterable[str] | None = None) -> SanitizationResult:
    """Convenience wrapper: one-shot masking with a throwaway or shared masker."""
    engine = masker or PrivacyMasker(kinds=kinds)
    return engine.mask(text)
