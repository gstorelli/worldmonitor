"""SENTINEL-ADM — vendor-agnostic inference adapter (OpenAI-compatible).

All semantic work (entity extraction, legal pre-qualification, summarisation)
goes through this client. It speaks the standard OpenAI REST schema so the same
code targets a low-cost external endpoint today and an on-prem engine later by
changing environment variables only.

Two guarantees are enforced here:
  * structured output — every response is validated against a JSON schema;
  * zero leakage — the prompt is masked before the call and the response is
    de-masked locally by :class:`SanitizedInference`.

Stdlib only (urllib); no vendor SDK.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

from ..privacy.sanitizer import PrivacyMasker, SanitizationResult


class InferenceError(RuntimeError):
    pass


class SchemaValidationError(ValueError):
    pass


def validate_against_schema(data: Any, schema: dict[str, Any], path: str = "$") -> list[str]:
    """Minimal JSON-schema validator (type/required/properties/items/enum)."""
    errors: list[str] = []
    expected = schema.get("type")
    if expected == "object":
        if not isinstance(data, dict):
            return [f"{path}: atteso object, ricevuto {type(data).__name__}"]
        for key in schema.get("required", []):
            if key not in data:
                errors.append(f"{path}: campo obbligatorio mancante '{key}'")
        for key, subschema in (schema.get("properties") or {}).items():
            if key in data:
                errors.extend(validate_against_schema(data[key], subschema, f"{path}.{key}"))
    elif expected == "array":
        if not isinstance(data, list):
            return [f"{path}: atteso array, ricevuto {type(data).__name__}"]
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(data):
                errors.extend(validate_against_schema(item, item_schema, f"{path}[{index}]"))
    elif expected == "string":
        if not isinstance(data, str):
            errors.append(f"{path}: atteso string")
    elif expected == "number":
        if not isinstance(data, (int, float)) or isinstance(data, bool):
            errors.append(f"{path}: atteso number")
    elif expected == "integer":
        if not isinstance(data, int) or isinstance(data, bool):
            errors.append(f"{path}: atteso integer")
    elif expected == "boolean":
        if not isinstance(data, bool):
            errors.append(f"{path}: atteso boolean")
    if "enum" in schema and data not in schema["enum"]:
        errors.append(f"{path}: valore fuori enum {schema['enum']}")
    return errors


@dataclass
class Completion:
    content: str
    model: str
    usage: dict[str, Any]


class OpenAICompatibleClient:
    """Thin OpenAI `/chat/completions` client with schema-enforced JSON output."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        strict_json_schema: bool | None = None,
    ) -> None:
        self.base_url = (base_url or os.environ.get("LLM_BASE_URL") or "").rstrip("/")
        self.api_key = api_key or os.environ.get("LLM_API_KEY") or ""
        self.model = model or os.environ.get("LLM_MODEL") or "gpt-4o-mini"
        self.temperature = float(os.environ.get("LLM_TEMPERATURE", "0.1")) if temperature is None else temperature
        self.timeout = float(os.environ.get("LLM_TIMEOUT", "60")) if timeout is None else timeout
        env_strict = os.environ.get("LLM_JSON_SCHEMA_STRICT", "true").lower() in {"1", "true", "yes"}
        self.strict_json_schema = env_strict if strict_json_schema is None else strict_json_schema
        if not self.base_url:
            raise InferenceError("LLM_BASE_URL non configurato")

    # -- transport (overridable in tests) -----------------------------------

    def _post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 (configured endpoint)
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:  # pragma: no cover - network path
            detail = error.read().decode("utf-8", "replace")[:300]
            raise InferenceError(f"endpoint inferenza HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:  # pragma: no cover - network path
            raise InferenceError(f"endpoint inferenza non raggiungibile: {error.reason}") from error

    # -- completion ----------------------------------------------------------

    def complete(self, system: str, user: str, schema: dict[str, Any] | None = None) -> Completion:
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        payload: dict[str, Any] = {"model": self.model, "messages": messages, "temperature": self.temperature}
        if schema is not None:
            if self.strict_json_schema:
                payload["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {"name": "sentinel_adm_output", "strict": True, "schema": schema},
                }
            else:
                payload["response_format"] = {"type": "json_object"}
        body = self._post_json(
            f"{self.base_url}/chat/completions",
            payload,
            {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
        )
        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise InferenceError("risposta inferenza priva di choices[0].message.content") from error
        return Completion(content=content, model=body.get("model", self.model), usage=body.get("usage", {}))

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        completion = self.complete(system, user, schema)
        try:
            data = json.loads(completion.content)
        except json.JSONDecodeError as error:
            raise SchemaValidationError(f"risposta non JSON: {error.msg}") from error
        errors = validate_against_schema(data, schema)
        if errors:
            raise SchemaValidationError("; ".join(errors))
        return data


class SanitizedInference:
    """Mask → infer → restore, so no identifier leaves the premises."""

    def __init__(self, client: OpenAICompatibleClient, masker: PrivacyMasker | None = None) -> None:
        self.client = client
        self.masker = masker or PrivacyMasker()

    def _restore(self, value: Any) -> Any:
        if isinstance(value, str):
            return self.masker.unmask(value)
        if isinstance(value, list):
            return [self._restore(item) for item in value]
        if isinstance(value, dict):
            return {key: self._restore(item) for key, item in value.items()}
        return value

    def run(
        self,
        system: str,
        user: str,
        schema: dict[str, Any],
        on_masked: Callable[[SanitizationResult], None] | None = None,
    ) -> dict[str, Any]:
        sanitized = self.masker.mask(user)
        if on_masked:
            on_masked(sanitized)
        result = self.client.complete_json(system, sanitized.text, schema)
        return self._restore(result)
