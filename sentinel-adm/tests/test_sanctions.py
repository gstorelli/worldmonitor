"""Sanctions screening tests with a mocked local Yente transport."""

import unittest

from app.sanctions.yente_client import ScreeningHit, YenteClient, is_flash_hit, normalize_hit

RESPONSE = {
    "responses": {
        "q1": {
            "results": [
                {"id": "Q1", "caption": "Mario Rossi", "score": 0.95, "schema": "Person", "datasets": ["eu_fsf"], "countries": ["it"], "properties": {"name": ["Mario Rossi"]}},
                {"id": "Q2", "caption": "Mario Rosso", "score": 0.62, "schema": "Person", "datasets": ["us_ofac"], "properties": {}},
            ]
        }
    }
}


class YenteClientTests(unittest.TestCase):
    def setUp(self):
        self.client = YenteClient(base_url="http://yente.local", dataset="default", threshold=0.7)
        self.sent: dict = {}

        def fake_transport(url, payload):
            self.sent = {"url": url, "payload": payload}
            return RESPONSE

        self.client._post_json = fake_transport  # type: ignore[method-assign]

    def test_match_filters_below_threshold_and_normalizes(self):
        hits = self.client.match("Mario Rossi", country="it")
        self.assertEqual(len(hits), 1)
        self.assertIsInstance(hits[0], ScreeningHit)
        self.assertEqual(hits[0].caption, "Mario Rossi")
        self.assertEqual(hits[0].datasets, ["eu_fsf"])
        self.assertEqual(self.sent["url"], "http://yente.local/match/default")
        properties = self.sent["payload"]["queries"]["q1"]["properties"]
        self.assertEqual(properties["name"], ["Mario Rossi"])
        self.assertEqual(properties["country"], ["it"])

    def test_empty_name_short_circuits(self):
        self.assertEqual(self.client.match("   "), [])

    def test_screen_queries_each_name(self):
        results = self.client.screen(["Mario Rossi", "ACME S.p.A."], schema="Company")
        self.assertEqual(set(results), {"Mario Rossi", "ACME S.p.A."})

    def test_normalize_hit_handles_missing_fields(self):
        hit = normalize_hit({}, matched_name="x")
        self.assertEqual(hit.entity_id, "")
        self.assertEqual(hit.score, 0.0)

    def test_flash_threshold(self):
        strong = [normalize_hit(RESPONSE["responses"]["q1"]["results"][0])]
        weak = [normalize_hit(RESPONSE["responses"]["q1"]["results"][1])]
        self.assertTrue(is_flash_hit(strong, flash_threshold=0.9))
        self.assertFalse(is_flash_hit(weak, flash_threshold=0.9))
        self.assertFalse(is_flash_hit([], flash_threshold=0.9))


if __name__ == "__main__":
    unittest.main()
