"""OSINT tests: portal dorking and reconnaissance tool wrappers."""

import json
import unittest

from app.osint.dorking import PORTALS, build_dork, build_dorks, portal_catalog
from app.osint.wrappers import HoleheTool, MaigretTool, OsintInputError, TOOLS, parse_holehe_stdout, parse_maigret_json

MAIGRET_JSON = json.dumps(
    {
        "sites": {
            "Twitter": {"status": {"status": "Claimed", "url_user": "https://twitter.com/target", "tags": ["social"]}},
            "Example": {"status": {"status": "Available"}},
        }
    }
)

HOLEHE_OUTPUT = "\n".join(["[+] instagram", "[+] twitter", "[-] facebook", "some noise"])


class DorkingTests(unittest.TestCase):
    def test_build_dork_uses_portal_template(self):
        dork = build_dork("Fratelli Rossi", "pvp")
        self.assertEqual(dork.portal, "pvp")
        self.assertIn("Fratelli Rossi", dork.query)
        self.assertTrue(dork.url.startswith("https://"))
        self.assertIn("Fratelli+Rossi", dork.url)

    def test_build_dorks_is_cartesian_and_validates_portals(self):
        dorks = build_dorks(["Alfa", "Beta"], ["pvp", "anac"])
        self.assertEqual(len(dorks), 4)
        with self.assertRaises(KeyError):
            build_dorks(["Alfa"], ["unknown-portal"])

    def test_catalog_lists_every_portal(self):
        catalog = portal_catalog()
        self.assertEqual({entry["portal"] for entry in catalog}, set(PORTALS))


class MaigretTests(unittest.TestCase):
    def test_validation_blocks_injection_attempts(self):
        tool = MaigretTool()
        self.assertEqual(tool.validate("@target.user"), "target.user")
        for bad in ("a", "user; rm -rf /", "user name", "--flag", "user$(whoami)"):
            with self.assertRaises(OsintInputError):
                tool.validate(bad)

    def test_job_spec_is_built_without_executing(self):
        result = MaigretTool().run("target", output_dir="/tmp/out")
        self.assertFalse(result.executed)
        self.assertIsNotNone(result.spec)
        assert result.spec is not None
        self.assertEqual(result.spec.args[:2], ["maigret", "target"])
        self.assertIn("--folderoutput", result.spec.args)

    def test_run_with_runner_parses_dossier(self):
        def runner(args):
            return 0, MAIGRET_JSON, ""

        result = MaigretTool().run("target", runner=runner)
        self.assertTrue(result.executed)
        payload = result.payload or {}
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["sites"][0]["site"], "Twitter")

    def test_non_zero_exit_is_reported(self):
        result = MaigretTool().run("target", runner=lambda args: (2, "", "errore di rete"))
        self.assertTrue(result.executed)
        self.assertEqual(result.exit_code, 2)
        self.assertIn("errore", result.stderr)


class HoleheTests(unittest.TestCase):
    def test_email_validation(self):
        self.assertEqual(HoleheTool().validate("mario.rossi@example.it"), "mario.rossi@example.it")
        with self.assertRaises(OsintInputError):
            HoleheTool().validate("not-an-email")
        with self.assertRaises(OsintInputError):
            HoleheTool().validate("a@b; rm -rf /")

    def test_stdout_parser(self):
        self.assertEqual(parse_holehe_stdout(HOLEHE_OUTPUT), ["instagram", "twitter"])

    def test_run_with_runner(self):
        result = HoleheTool().run("mario@example.it", runner=lambda args: (0, HOLEHE_OUTPUT, ""))
        self.assertEqual(result.payload, ["instagram", "twitter"])

    def test_registry_exposes_tools(self):
        self.assertEqual(set(TOOLS), {"maigret", "holehe"})

    def test_maigret_parser_tolerates_garbage(self):
        self.assertEqual(parse_maigret_json("non json")["count"], 0)


if __name__ == "__main__":
    unittest.main()
