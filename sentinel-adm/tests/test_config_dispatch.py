"""Configuration and notification dispatch tests."""

import os
import unittest
from unittest import mock

from app.config import Settings
from app.notify.dispatch import Dispatcher, Notification, build_daily_brief, should_flash

ENV = {
    "SENTINEL_ENV": "on-prem",
    "LLM_BASE_URL": "https://inference.example/v1",
    "LLM_API_KEY": "super-secret",
    "LLM_MODEL": "qwen2.5",
    "WATCHLIST_FUZZY_THRESHOLD": "0.9",
    "SENTINEL_NEWS_FEEDS": "https://www.gdf.gov.it/rss,https://www.adm.gov.it/rss",
    "TELEGRAM_BOT_TOKEN": "123:abc",
    "TELEGRAM_CHAT_ID": "-100",
}


class SettingsTests(unittest.TestCase):
    def test_from_env_reads_values_and_lists(self):
        with mock.patch.dict(os.environ, ENV, clear=False):
            settings = Settings.from_env()
        self.assertEqual(settings.llm_model, "qwen2.5")
        self.assertEqual(settings.watchlist_fuzzy_threshold, 0.9)
        self.assertEqual(len(settings.news_feeds), 2)
        self.assertTrue(settings.llm_json_schema_strict)

    def test_describe_is_redacted(self):
        with mock.patch.dict(os.environ, ENV, clear=False):
            described = Settings.from_env().describe()
        serialized = str(described)
        self.assertNotIn("super-secret", serialized)
        self.assertNotIn("123:abc", serialized)
        self.assertTrue(described["llm_configured"])
        self.assertIn("telegram", described["notify_channels"])


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.dispatcher = Dispatcher(webhook_url="http://hook.local", telegram_bot_token="t", telegram_chat_id="c")
        self.sent: list[tuple[str, dict]] = []

        def fake_transport(url, payload):
            self.sent.append((url, payload))
            return 200, "ok"

        self.dispatcher._post_json = fake_transport  # type: ignore[method-assign]

    def test_dispatch_routes_to_all_configured_channels(self):
        results = self.dispatcher.dispatch(Notification(tier="flash", title="Allerta", body="testo", tags=["x"]))
        channels = {entry["channel"] for entry in results}
        self.assertEqual(channels, {"webhook", "telegram"})
        self.assertEqual(len(self.sent), 2)
        self.assertIn("Allerta", self.sent[1][1]["text"])

    def test_no_channels_reported_clearly(self):
        dispatcher = Dispatcher(webhook_url="", telegram_bot_token="", telegram_chat_id="", smtp_url="")
        results = dispatcher.dispatch(Notification(tier="daily", title="x", body="y"))
        self.assertEqual(results[0]["channel"], "none")

    def test_flash_policy(self):
        self.assertTrue(should_flash({"watchlist_score": 0.92, "action": "sequestro"}))
        self.assertFalse(should_flash({"watchlist_score": 0.92, "action": "controllo"}))

    def test_daily_brief(self):
        brief = build_daily_brief([{"title": "Sequestro deposito"}], "2026-09-14")
        self.assertEqual(brief.tier, "daily")
        self.assertIn("Il Mattinale Antifrode", brief.title)
        self.assertIn("Sequestro deposito", brief.body)
        empty = build_daily_brief([], "2026-09-14")
        self.assertIn("Nessun elemento rilevante", empty.body)


if __name__ == "__main__":
    unittest.main()
