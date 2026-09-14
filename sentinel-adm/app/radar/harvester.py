"""SENTINEL-ADM — institutional/regional news harvester.

Polls RSS 2.0 and Atom feeds (Guardia di Finanza, ADM, EPPO, regional press)
and normalises items into :class:`NewsItem`. Network access is injected so the
module is testable offline and the same code can run behind a departmental
proxy.

Stdlib only.
"""

from __future__ import annotations

import html
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable

_ATOM = "{http://www.w3.org/2005/Atom}"
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


@dataclass
class NewsItem:
    title: str
    link: str
    source: str = ""
    published: str = ""
    summary: str = ""
    raw: dict[str, str] = field(default_factory=dict)


def strip_html(value: str) -> str:
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def parse_date(value: str) -> str:
    """Best-effort RFC 822 / ISO 8601 → ISO UTC string (empty when unknown)."""
    raw = (value or "").strip()
    if not raw:
        return ""
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(raw, fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return ""


def _text(element: ET.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def _child(node: ET.Element, *names: str) -> ET.Element | None:
    """Find the first matching child, tolerating the Atom default namespace."""
    for name in names:
        found = node.find(name)
        if found is None:
            found = node.find(f"{_ATOM}{name}")
        if found is not None:
            return found
    return None


def parse_feed(xml_text: str, source_hint: str = "") -> list[NewsItem]:
    """Parse RSS 2.0 or Atom content into news items."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    items: list[NewsItem] = []
    channel = root.find("channel")
    channel_title = _child(channel, "title") if channel is not None else None
    source = _text(channel_title) or _text(_child(root, "title") if root.tag.endswith("feed") else None) or source_hint

    for node in root.iter():
        tag = node.tag.split("}")[-1]
        if tag not in {"item", "entry"}:
            continue
        title = strip_html(_text(_child(node, "title")))
        link = _text(_child(node, "link"))
        if not link:
            atom_link = node.find(f"{_ATOM}link")
            link = atom_link.get("href", "") if atom_link is not None else ""
        date_element = _child(node, "pubDate", "published", "updated")
        published = parse_date(_text(date_element))
        summary = strip_html(_text(_child(node, "description", "summary", "content")))
        if title:
            items.append(
                NewsItem(
                    title=title,
                    link=link,
                    source=source or source_hint,
                    published=published,
                    summary=summary,
                    raw={"guid": _text(_child(node, "guid", "id"))},
                )
            )
    return items


def _default_fetch(url: str, timeout: float = 20.0) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "SENTINEL-ADM News Radar/0.1 (+on-prem)", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (configured feeds)
        return response.read().decode("utf-8", "replace")


@dataclass
class HarvestResult:
    items: list[NewsItem] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class MediaHarvester:
    """Polls a set of feeds and returns deduplicated, newest-first items."""

    def __init__(self, feeds: list[str], fetch: Callable[[str], str] | None = None) -> None:
        self.feeds = [feed for feed in feeds if feed]
        self._fetch = fetch or _default_fetch

    def harvest(self, limit: int | None = None) -> HarvestResult:
        result = HarvestResult()
        seen_links: set[str] = set()
        seen_titles: set[str] = set()
        for feed in self.feeds:
            try:
                xml_text = self._fetch(feed)
            except (urllib.error.URLError, TimeoutError, OSError) as error:  # pragma: no cover - network path
                result.errors.append(f"{feed}: {error}")
                continue
            for item in parse_feed(xml_text, source_hint=feed):
                link_key = item.link.rstrip("/").casefold()
                title_key = item.title.casefold()
                if (link_key and link_key in seen_links) or title_key in seen_titles:
                    continue
                if link_key:
                    seen_links.add(link_key)
                seen_titles.add(title_key)
                result.items.append(item)
        result.items.sort(key=lambda item: item.published or "", reverse=True)
        if limit is not None:
            result.items = result.items[:limit]
        return result
