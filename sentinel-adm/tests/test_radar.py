"""Fuzzy matching and ripple-scoring tests."""

import unittest

from app.radar.fuzzy import (
    WatchlistEntry,
    levenshtein,
    match_watchlist,
    normalize_entity,
    ripple_severity,
    token_sort_ratio,
)


class FuzzyPrimitivesTests(unittest.TestCase):
    def test_normalization_strips_legal_suffixes_and_sorts_tokens(self):
        self.assertEqual(normalize_entity("Fratelli Rossi S.r.l."), "fratelli rossi")
        self.assertEqual(normalize_entity("Rossi Fratelli srl"), "fratelli rossi")

    def test_levenshtein(self):
        self.assertEqual(levenshtein("kitten", "sitting"), 3)
        self.assertEqual(levenshtein("", "abc"), 3)
        self.assertEqual(levenshtein("abc", "abc"), 0)

    def test_token_sort_ratio(self):
        self.assertAlmostEqual(token_sort_ratio("Fratelli Rossi S.r.l.", "Fratelli Rossi srl"), 1.0, places=6)
        self.assertGreater(token_sort_ratio("Fratelli Rossi srl", "Fratelli Rosi srl"), 0.9)
        self.assertLess(token_sort_ratio("Fratelli Rossi srl", "Panificio Bianchi"), 0.5)


class WatchlistMatchingTests(unittest.TestCase):
    def setUp(self):
        self.watchlist = [
            WatchlistEntry(entry_id="w1", name="Fratelli Rossi S.r.l.", kind="fuel_station", city="Bari", vat="1234567890"),
            WatchlistEntry(entry_id="w2", name="Deposito Tarantino S.p.A.", kind="deposit", city="Taranto", aliases=["Depositi Tarantini"]),
        ]

    def test_exact_and_misspelled_matches(self):
        matches = match_watchlist(["Fratelli Rossì srl", "Deposito Tarantino"], self.watchlist)
        self.assertEqual(len(matches), 2)
        self.assertEqual(matches[0].entry.entry_id, "w1")
        self.assertGreaterEqual(matches[0].score, 0.88)
        self.assertFalse(matches[0].needs_review)

    def test_grey_zone_flags_review(self):
        matches = match_watchlist(["Fratelli Rosi"], self.watchlist, threshold=0.95, review_floor=0.6)
        self.assertEqual(len(matches), 1)
        self.assertTrue(matches[0].needs_review)

    def test_unrelated_entity_is_not_matched(self):
        self.assertEqual(match_watchlist(["Panificio Bianchi"], self.watchlist), [])

    def test_empty_entities_ignored(self):
        self.assertEqual(match_watchlist(["", "  "], self.watchlist), [])


class RippleScoringTests(unittest.TestCase):
    def test_seizure_nearby_is_critical(self):
        assessment = ripple_severity("sequestro", 0.95, same_province=True)
        self.assertEqual(assessment.level, "critical")
        self.assertGreaterEqual(assessment.score, 75)
        self.assertIn("azione=sequestro", assessment.rationale)

    def test_routine_check_is_low(self):
        assessment = ripple_severity("controllo", 0.5)
        self.assertEqual(assessment.level, "low")
        self.assertLess(assessment.score, 35)


if __name__ == "__main__":
    unittest.main()
