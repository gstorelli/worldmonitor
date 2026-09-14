"""Privacy masking tests: validators, round trip and false positives."""

import unittest

from app.privacy.sanitizer import (
    PrivacyMasker,
    compute_codice_fiscale_check,
    compute_partita_iva_check,
    is_valid_codice_fiscale,
    is_valid_iban,
    is_valid_partita_iva,
    sanitize,
)


class IdentifierValidatorTests(unittest.TestCase):
    def test_codice_fiscale_checksum(self):
        base = "RSSMRA80A01H501"
        valid = base + compute_codice_fiscale_check(base)
        self.assertTrue(is_valid_codice_fiscale(valid))
        tampered = valid[:-1] + ("A" if valid[-1] != "A" else "B")
        self.assertFalse(is_valid_codice_fiscale(tampered))
        self.assertFalse(is_valid_codice_fiscale("NOTACF1234567890"))

    def test_partita_iva_check_digit(self):
        base = "1234567890"
        valid = base + compute_partita_iva_check(base)
        self.assertTrue(is_valid_partita_iva(valid))
        wrong = base + str((int(valid[-1]) + 1) % 10)
        self.assertFalse(is_valid_partita_iva(wrong))
        self.assertFalse(is_valid_partita_iva("1234567890"))

    def test_iban_mod97(self):
        self.assertTrue(is_valid_iban("IT60X0542811101000000123456"))
        self.assertFalse(is_valid_iban("IT60X0542811101000000123457"))
        self.assertFalse(is_valid_iban("XX00"))


class MaskingTests(unittest.TestCase):
    def setUp(self):
        self.cf_base = "RSSMRA80A01H501"
        self.cf = self.cf_base + compute_codice_fiscale_check(self.cf_base)
        self.piva = "1234567890" + compute_partita_iva_check("1234567890")

    def test_masks_identifiers_and_restores_round_trip(self):
        text = (
            f"Il sig. Mario Rossi (CF {self.cf}, P.IVA {self.piva}) ha sede in via Roma 12, "
            "IBAN IT60X0542811101000000123456, email mario.rossi@example.it, tel. 3351234567."
        )
        masker = PrivacyMasker()
        result = masker.mask(text)

        self.assertNotIn(self.cf, result.text)
        self.assertNotIn(self.piva, result.text)
        self.assertNotIn("IT60X0542811101000000123456", result.text)
        self.assertNotIn("mario.rossi@example.it", result.text)
        self.assertNotIn("Mario Rossi", result.text)
        self.assertIn("[[CF_1]]", result.text)
        self.assertIn("[[PIVA_1]]", result.text)
        self.assertIn("[[NOME_1]]", result.text)
        self.assertGreaterEqual(result.counts.get("CF", 0), 1)

        self.assertEqual(masker.unmask(result.text), text)

    def test_stable_tokens_and_no_persistence_after_clear(self):
        masker = PrivacyMasker()
        first = masker.mask(f"CF {self.cf}")
        second = masker.mask(f"di nuovo {self.cf}")
        self.assertEqual(first.text, second.text)
        masker.clear()
        third = masker.mask(f"CF {self.cf}")
        self.assertEqual(first.text, third.text)

    def test_invalid_identifiers_are_not_masked(self):
        text = "Riferimento pratica ABCDEF12G34H567I e numero 12345678901."
        result = sanitize(text)
        self.assertEqual(result.text, text)
        self.assertFalse(result.masked)

    def test_can_restrict_masked_kinds(self):
        text = f"CF {self.cf} e IBAN IT60X0542811101000000123456"
        result = sanitize(text, kinds=["CF"])
        self.assertNotIn(self.cf, result.text)
        self.assertIn("IT60X0542811101000000123456", result.text)


if __name__ == "__main__":
    unittest.main()
