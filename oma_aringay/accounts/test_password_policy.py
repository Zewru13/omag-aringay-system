"""The password policy: length 8, one capital, one special character, three numbers, plus the existing denylists."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

CAPITAL = 'Add at least 1 capital letter.'
SPECIAL = 'Add at least 1 special character.'
NUMBERS = 'Add at least 3 numbers.'


def problems(password):
    try:
        validate_password(password)
    except ValidationError as exc:
        return list(exc.messages)
    return []


class PasswordPolicyTests(SimpleTestCase):
    def test_accepts_all_parts(self):
        self.assertEqual(problems('Maganda#2024x'), [])

    def test_missing_capital_message(self):
        self.assertEqual(problems('maganda#2024x'), [CAPITAL])

    def test_missing_special_message(self):
        self.assertEqual(problems('Maganda2024xy'), [SPECIAL])

    def test_two_digits_is_not_enough(self):
        self.assertEqual(problems('Maganda#20xx'), [NUMBERS])
        self.assertEqual(problems('Maganda#202x'), [])

    def test_all_three_missing_lists_three_messages(self):
        self.assertEqual(problems('qwzxkvmplt'), [CAPITAL, SPECIAL, NUMBERS])

    def test_minimum_length_is_eight(self):
        self.assertTrue(any('too short' in m for m in problems('Ab#123')))
        self.assertEqual(problems('Ab#12345'), [])

    def test_non_ascii_capital_and_special(self):
        self.assertEqual(problems('Ñandu€123'), [])

    def test_emoji_counts_as_special(self):
        self.assertEqual(problems('Maganda😀2024'), [])

    def test_letters_are_not_special(self):
        self.assertEqual(problems('Éclair2024x'), [SPECIAL])

    def test_space_is_not_special(self):
        self.assertEqual(problems('Maganda 2024'), [SPECIAL])

    def test_denylist_still_applies(self):
        self.assertTrue(any('too easy to guess' in m for m in problems('Aringay#2024x')))

    def test_passphrase_still_works(self):
        self.assertEqual(problems('Correct Horse Battery #1 2 3'), [])
