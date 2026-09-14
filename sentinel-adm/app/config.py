"""SENTINEL-ADM — centralised configuration (environment driven, safe defaults).

Nothing here carries a secret default: external endpoints and credentials come
from the environment so the same image runs on-prem with local services and
"edge" with external inference, without code changes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass
class Settings:
    app_name: str = "SENTINEL-ADM"
    environment: str = "on-prem"

    # Inference (OpenAI-compatible; local or external)
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.1
    llm_timeout: float = 60.0
    llm_json_schema_strict: bool = True

    # Local services
    yente_url: str = "http://yente:8000"
    yente_dataset: str = "default"
    archivebox_url: str = "http://archivebox:8000"
    archivebox_output_dir: str = "/data/archivebox"
    evidence_dir: str = "/data/evidence"
    watchlist_path: str = "./data/watchlist.json"
    tsa_url: str = "https://freetsa.org/tsr"

    # Thresholds
    sanctions_match_threshold: float = 0.7
    sanctions_flash_threshold: float = 0.9
    watchlist_fuzzy_threshold: float = 0.88

    # Notifications
    sentinel_webhook_url: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    smtp_url: str = ""

    # News radar sources
    news_feeds: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Settings":
        feeds = [url.strip() for url in _env("SENTINEL_NEWS_FEEDS").split(",") if url.strip()]
        return cls(
            environment=_env("SENTINEL_ENV", "on-prem"),
            llm_base_url=_env("LLM_BASE_URL"),
            llm_api_key=_env("LLM_API_KEY"),
            llm_model=_env("LLM_MODEL", "gpt-4o-mini"),
            llm_temperature=float(_env("LLM_TEMPERATURE", "0.1")),
            llm_timeout=float(_env("LLM_TIMEOUT", "60")),
            llm_json_schema_strict=_env("LLM_JSON_SCHEMA_STRICT", "true").lower() in {"1", "true", "yes"},
            yente_url=_env("YENTE_URL", "http://yente:8000"),
            yente_dataset=_env("YENTE_DATASET", "default"),
            archivebox_url=_env("ARCHIVEBOX_URL", "http://archivebox:8000"),
            archivebox_output_dir=_env("ARCHIVEBOX_OUTPUT_DIR", "/data/archivebox"),
            evidence_dir=_env("EVIDENCE_DIR", "/data/evidence"),
            watchlist_path=_env("WATCHLIST_PATH", "./data/watchlist.json"),
            tsa_url=_env("TSA_URL", "https://freetsa.org/tsr"),
            sanctions_match_threshold=float(_env("SANCTIONS_MATCH_THRESHOLD", "0.7")),
            sanctions_flash_threshold=float(_env("SANCTIONS_FLASH_THRESHOLD", "0.9")),
            watchlist_fuzzy_threshold=float(_env("WATCHLIST_FUZZY_THRESHOLD", "0.88")),
            sentinel_webhook_url=_env("SENTINEL_WEBHOOK_URL"),
            telegram_bot_token=_env("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=_env("TELEGRAM_CHAT_ID"),
            smtp_url=_env("SMTP_URL"),
            news_feeds=feeds,
        )

    def describe(self) -> dict[str, object]:
        """Redacted snapshot for the health endpoint."""
        return {
            "app": self.app_name,
            "environment": self.environment,
            "llm_configured": bool(self.llm_base_url),
            "llm_model": self.llm_model,
            "yente_url": self.yente_url,
            "archivebox_url": self.archivebox_url,
            "evidence_dir": self.evidence_dir,
            "watchlist_path": self.watchlist_path,
            "tsa_url": self.tsa_url,
            "news_feeds": len(self.news_feeds),
            "notify_channels": [
                name
                for name, value in (
                    ("webhook", self.sentinel_webhook_url),
                    ("telegram", self.telegram_bot_token and self.telegram_chat_id),
                    ("email", self.smtp_url),
                )
                if value
            ],
        }
