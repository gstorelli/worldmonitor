"""Legal engine tests: deterministic URN:LEX, aliases, articles, review flags."""

import unittest

from app.legal.acts import find_act, get_act
from app.legal.urnlex import build_urn, catalog, eurlex_url, normattiva_url, qualify


class UrnLexTests(unittest.TestCase):
    def test_tua_urn_and_normattiva_url(self):
        act = get_act("tua")
        self.assertIsNotNone(act)
        self.assertEqual(build_urn(act), "urn:nir:stato:decreto.legislativo:1995-10-26;504!vig=")
        self.assertEqual(
            normattiva_url(act, "47", "2"),
            "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1995-10-26;504~art47-com2!vig=",
        )

    def test_tuld_and_penal_code_urns(self):
        self.assertEqual(build_urn(get_act("tuld"), "282"), "urn:nir:stato:decreto.del.presidente.della.repubblica:1973-01-23;43~art282!vig=")
        self.assertEqual(build_urn(get_act("cp"), "515"), "urn:nir:stato:regio.decreto:1930-10-19;1398~art515!vig=")
        self.assertEqual(build_urn(get_act("dlgs74"), "8"), "urn:nir:stato:decreto.legislativo:2000-03-10;74~art8!vig=")

    def test_eu_act_uses_celex(self):
        act = get_act("ucc")
        self.assertEqual(build_urn(act), "urn:nir:unione.europea:regolamento:2013-10-09;952!vig=")
        self.assertEqual(eurlex_url(act.celex or ""), "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32013R0952")

    def test_unverified_act_is_never_linked(self):
        with self.assertRaises(ValueError):
            build_urn(get_act("tle"))


class FindActTests(unittest.TestCase):
    def test_resolves_aliases_and_free_text(self):
        self.assertEqual(find_act("TUA").key, "tua")
        self.assertEqual(find_act("d.lgs. 504/1995").key, "tua")
        self.assertEqual(find_act("D.Lgs 74/2000").key, "dlgs74")
        self.assertEqual(find_act("legge 401 1989").key, "l401")
        self.assertEqual(find_act("regolamento 952/2013").key, "ucc")
        self.assertEqual(find_act("testo unico doganale").key, "tuld")
        self.assertIsNone(find_act("norma inesistente 999/1999"))


class QualifyTests(unittest.TestCase):
    def test_explicit_citation_with_article_and_comma(self):
        report = qualify("Deposito non autorizzato: violazione del TUA art. 40, comma 2, con gasolio non assoggettato.")
        self.assertEqual(len(report.qualifications), 1)
        qualification = report.qualifications[0]
        self.assertEqual(qualification.act_key, "tua")
        self.assertEqual(qualification.article, "40")
        self.assertEqual(qualification.comma, "2")
        self.assertFalse(qualification.needs_review)
        self.assertIn("~art40-com2", qualification.urn or "")
        self.assertTrue((qualification.normattiva_url or "").startswith("https://www.normattiva.it/uri-res/N2Ls?urn:nir:"))

    def test_multiple_articles_in_one_citation(self):
        report = qualify("Si contestano gli artt. 2 e 8 del d.lgs. 74/2000.")
        keys = {(item.act_key, item.article) for item in report.qualifications}
        self.assertIn(("dlgs74", "2"), keys)
        self.assertIn(("dlgs74", "8"), keys)

    def test_keyword_suggestion_without_a_norm(self):
        report = qualify("Sequestrati 2.000 kg di sigarette di contrabbando in un capannone.")
        self.assertIn("tuld", report.suggested_acts)
        self.assertTrue(any(item.act_key == "tle" and item.needs_review for item in report.qualifications))

    def test_abrogated_text_does_not_force_in_force_flag(self):
        report = qualify("La versione abrogata del TUA art. 40 non si applica.")
        self.assertNotIn("!vig=", report.qualifications[0].urn or "")

    def test_catalog_exposes_verified_flags(self):
        entries = {entry["key"]: entry for entry in catalog()}
        self.assertTrue(entries["tua"]["verified"])
        self.assertFalse(entries["tle"]["verified"])
        self.assertIn("d.lgs. 74/2000", entries["dlgs74"]["aliases"])


if __name__ == "__main__":
    unittest.main()
