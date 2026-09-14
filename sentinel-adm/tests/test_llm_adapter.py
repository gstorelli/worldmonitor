"""Inference adapter tests: schema enforcement and zero-leakage pipeline."""

import json
import unittest

from app.llm.adapter import (
    InferenceError,
    OpenAICompatibleClient,
    SanitizedInference,
    SchemaValidationError,
    validate_against_schema,
)
from app.privacy.sanitizer import PrivacyMasker, compute_codice_fiscale_check

SCHEMA = {
    "type": "object",
    "required": ["entities", "summary"],
    "properties": {
        "entities": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
}


def _completion(content: str) -> dict:
    return {"model": "test-model", "choices": [{"message": {"content": content}}], "usage": {"total_tokens": 10}}


class SchemaValidatorTests(unittest.TestCase):
    def test_reports_missing_and_wrong_types(self):
        errors = validate_against_schema({"entities": "x"}, SCHEMA)
        self.assertTrue(any("campo obbligatorio mancante 'summary'" in error for error in errors))
        self.assertTrue(any("entities: atteso array" in error for error in errors))

    def test_accepts_valid_payload(self):
        self.assertEqual(validate_against_schema({"entities": ["a"], "summary": "b"}, SCHEMA), [])


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.client = OpenAICompatibleClient(base_url="http://llm.local/v1", api_key="k", model="m")
        self.captured: dict = {}

        def fake_transport(url, payload, headers):
            self.captured = {"url": url, "payload": payload, "headers": headers}
            return _completion(json.dumps({"entities": ["ACME"], "summary": "ok"}))

        self.client._post_json = fake_transport  # type: ignore[method-assign]

    def test_enforces_json_schema_response_format(self):
        result = self.client.complete_json("sys", "user", SCHEMA)
        self.assertEqual(result["entities"], ["ACME"])
        response_format = self.captured["payload"]["response_format"]
        self.assertEqual(response_format["type"], "json_schema")
        self.assertTrue(response_format["json_schema"]["strict"])
        self.assertEqual(self.captured["url"], "http://llm.local/v1/chat/completions")
        self.assertEqual(self.captured["headers"]["Authorization"], "Bearer k")

    def test_raises_on_schema_violation_and_bad_json(self):
        self.client._post_json = lambda url, payload, headers: _completion('{"entities": "nope"}')  # type: ignore[method-assign]
        with self.assertRaises(SchemaValidationError):
            self.client.complete_json("sys", "user", SCHEMA)
        self.client._post_json = lambda url, payload, headers: _completion("not json")  # type: ignore[method-assign]
        with self.assertRaises(SchemaValidationError):
            self.client.complete_json("sys", "user", SCHEMA)

    def test_requires_configuration(self):
        with self.assertRaises(InferenceError):
            OpenAICompatibleClient(base_url="")

    def test_sanitized_pipeline_masks_prompt_and_restores_answer(self):
        base = "RSSMRA80A01H501"
        codice_fiscale = base + compute_codice_fiscale_check(base)
        client = OpenAICompatibleClient(base_url="http://llm.local/v1", api_key="k", model="m")
        sent: dict = {}

        def fake_transport(url, payload, headers):
            sent["user"] = payload["messages"][1]["content"]
            return _completion(json.dumps({"entities": ["[[CF_1]]"], "summary": "titolare [[CF_1]]"}))

        client._post_json = fake_transport  # type: ignore[method-assign]
        pipeline = SanitizedInference(client, PrivacyMasker())

        result = pipeline.run("sys", f"Verifica il codice fiscale {codice_fiscale} del titolare.", SCHEMA)

        self.assertNotIn(codice_fiscale, sent["user"])
        self.assertIn("[[CF_1]]", sent["user"])
        self.assertEqual(result["entities"], [codice_fiscale])
        self.assertIn(codice_fiscale, result["summary"])


if __name__ == "__main__":
    unittest.main()
