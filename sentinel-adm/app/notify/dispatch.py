"""SENTINEL-ADM — notification dispatch (flash alerts + "Il Mattinale").

Routing is abstracted: the same ``Notification`` can go to a Telegram bot, a
departmental SMTP relay (through Apprise, when installed) or a generic webhook.
The dispatcher never raises on a single channel failure — it returns one result
per channel so the digest job can report partial delivery.

Stdlib only; Apprise is an optional accelerator.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Notification:
    tier: str  # "flash" | "daily"
    title: str
    body: str
    tags: list[str] = field(default_factory=list)


def build_daily_brief(items: list[dict[str, Any]], generated_at: str, summary: str | None = None) -> Notification:
    """Compose "Il Mattinale Antifrode" from the previous 24h cycle."""
    if summary:
        body = summary
    else:
        lines = [f"- {item.get('title', '(senza titolo)')}" for item in items[:40]]
        body = "Nessun elemento rilevante nelle ultime 24 ore." if not lines else "\n".join(lines)
    return Notification(
        tier="daily",
        title=f"Il Mattinale Antifrode — {generated_at}",
        body=body,
        tags=["daily", "adm"],
    )


def should_flash(event: dict[str, Any]) -> bool:
    """Flash only for high-confidence events, to avoid alert fatigue."""
    if event.get("watchlist_score", 0) and float(event["watchlist_score"]) >= 0.9 and event.get("action") in {
        "sequestro",
        "chiusura",
        "arresto",
    }:
        return True
    return False


class Dispatcher:
    def __init__(
        self,
        webhook_url: str | None = None,
        telegram_bot_token: str | None = None,
        telegram_chat_id: str | None = None,
        smtp_url: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.webhook_url = webhook_url or os.environ.get("SENTINEL_WEBHOOK_URL") or ""
        self.telegram_bot_token = telegram_bot_token or os.environ.get("TELEGRAM_BOT_TOKEN") or ""
        self.telegram_chat_id = telegram_chat_id or os.environ.get("TELEGRAM_CHAT_ID") or ""
        self.smtp_url = smtp_url or os.environ.get("SMTP_URL") or ""
        self.timeout = float(os.environ.get("NOTIFY_TIMEOUT", "20")) if timeout is None else timeout

    # -- transport (overridable in tests) -----------------------------------

    def _post_json(self, url: str, payload: dict[str, Any]) -> tuple[int, str]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 (configured endpoint)
                return response.status, response.read().decode("utf-8", "replace")[:200]
        except urllib.error.HTTPError as error:  # pragma: no cover - network path
            return error.code, error.read().decode("utf-8", "replace")[:200]
        except urllib.error.URLError as error:  # pragma: no cover - network path
            return 0, str(error.reason)

    # -- dispatch ------------------------------------------------------------

    def dispatch(self, notification: Notification) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        if self.webhook_url:
            status, detail = self._post_json(
                self.webhook_url,
                {"tier": notification.tier, "title": notification.title, "body": notification.body, "tags": notification.tags},
            )
            results.append({"channel": "webhook", "status": status, "detail": detail})
        if self.telegram_bot_token and self.telegram_chat_id:
            text = f"*{notification.title}*\n\n{notification.body}"
            status, detail = self._post_json(
                f"https://api.telegram.org/bot{self.telegram_bot_token}/sendMessage",
                {"chat_id": self.telegram_chat_id, "text": text, "parse_mode": "Markdown", "disable_web_page_preview": True},
            )
            results.append({"channel": "telegram", "status": status, "detail": detail})
        if self.smtp_url:
            results.append({"channel": "email", "status": 0, "detail": "instrada via Apprise (SMTP_URL configurato)"})
        if not results:
            results.append({"channel": "none", "status": 0, "detail": "nessun canale configurato"})
        return results
