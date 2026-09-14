"""News harvester tests: RSS/Atom parsing, normalisation, dedupe, failures."""

import unittest

from app.radar.harvester import MediaHarvester, NewsItem, parse_date, parse_feed, strip_html

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Guardia di Finanza</title>
  <item>
    <title>Sequestrato deposito &amp; gasolio irregolare</title>
    <link>https://example.org/news/1</link>
    <pubDate>Mon, 14 Sep 2026 08:00:00 +0200</pubDate>
    <description><![CDATA[<p>Blitz in <b>via Roma 12</b> a Bari.</p>]]></description>
  </item>
  <item>
    <title>Chiusura sale scommesse abusive</title>
    <link>https://example.org/news/2</link>
    <pubDate>2026-09-13T10:00:00Z</pubDate>
    <description>Controlli a Taranto</description>
  </item>
</channel></rss>"""

ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>EPPO</title>
  <entry>
    <title>Indagine su frode IVA transfrontaliera</title>
    <link href="https://example.org/atom/1"/>
    <updated>2026-09-14T07:30:00Z</updated>
    <summary>Sequestro di 2 milioni</summary>
  </entry>
</feed>"""


class NormalisationTests(unittest.TestCase):
    def test_strip_html_unescapes_and_collapses(self):
        self.assertEqual(strip_html("<p>Ciao &amp;   benvenuti</p>"), "Ciao & benvenuti")
        self.assertEqual(strip_html(""), "")

    def test_parse_date_handles_rfc822_and_iso(self):
        self.assertTrue(parse_date("Mon, 14 Sep 2026 08:00:00 +0200").startswith("2026-09-14T06:00:00"))
        self.assertTrue(parse_date("2026-09-14T07:30:00Z").startswith("2026-09-14T07:30:00"))
        self.assertEqual(parse_date("non una data"), "")


class ParseFeedTests(unittest.TestCase):
    def test_parses_rss_items(self):
        items = parse_feed(RSS)
        self.assertEqual(len(items), 2)
        first = items[0]
        self.assertEqual(first.title, "Sequestrato deposito & gasolio irregolare")
        self.assertEqual(first.link, "https://example.org/news/1")
        self.assertEqual(first.source, "Guardia di Finanza")
        self.assertIn("via Roma 12", first.summary)
        self.assertTrue(first.published.startswith("2026-09-14T06:00:00"))

    def test_parses_atom_entries(self):
        items = parse_feed(ATOM)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].title, "Indagine su frode IVA transfrontaliera")
        self.assertEqual(items[0].link, "https://example.org/atom/1")
        self.assertEqual(items[0].source, "EPPO")
        self.assertTrue(items[0].published.startswith("2026-09-14T07:30:00"))

    def test_invalid_xml_returns_empty(self):
        self.assertEqual(parse_feed("<not-xml"), [])


class HarvestTests(unittest.TestCase):
    def test_harvest_dedupes_and_sorts_newest_first(self):
        feeds = {
            "https://feed/a": RSS,
            "https://feed/b": RSS.replace("https://example.org/news/2", "https://example.org/news/2"),
            "https://feed/c": ATOM,
        }
        harvester = MediaHarvester(list(feeds), fetch=lambda url: feeds[url])
        result = harvester.harvest()
        links = [item.link for item in result.items]
        self.assertEqual(sorted(links), ["https://example.org/atom/1", "https://example.org/news/1", "https://example.org/news/2"])

    def test_feed_errors_are_collected_not_raised(self):
        def failing(_url: str) -> str:
            raise OSError("dns failure")

        result = MediaHarvester(["https://feed/x"], fetch=failing).harvest()
        self.assertEqual(result.items, [])
        self.assertEqual(len(result.errors), 1)

    def test_limit_applies_after_sorting(self):
        harvester = MediaHarvester(["https://feed/a"], fetch=lambda _url: RSS)
        result = harvester.harvest(limit=1)
        self.assertEqual(len(result.items), 1)
        self.assertIsInstance(result.items[0], NewsItem)


if __name__ == "__main__":
    unittest.main()
