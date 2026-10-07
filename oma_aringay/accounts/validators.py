"""
Custom password-policy validators for the OMA Aringay system.

Policy: a minimum length of 8, at least 1 capital letter, at least 1 special
character and at least 3 numbers, plus a common-password list and an
OMAg/Aringay denylist. A long passphrase that has the three parts is fine.
"""
import unicodedata

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _

# Organization-specific terms a generic common-password list wouldn't know
# about. Checked as a case-insensitive substring match.
LOCAL_DENYLIST_TERMS = (
    'aringay',
    'omag',
    'oma aringay',
    'omaaringay',
    'password',
    'capstone',
    'municipalagriculturist',
    'launion',
    'la union',
    'agriculturist',
)


class LocalDenylistPasswordValidator:
    """Rejects passwords built from OMAg/Aringay-specific terms."""

    def validate(self, password, user=None):
        normalized = password.strip().lower()
        for term in LOCAL_DENYLIST_TERMS:
            if term in normalized:
                raise ValidationError(
                    _('This password is too easy to guess for this system.'),
                    code='password_too_local',
                )

    def get_help_text(self):
        return _('Your password can’t be a variation of common OMAg/Aringay terms.')


class MaximumLengthValidator:
    """Caps password length as a sane DoS guard — not a composition rule."""

    def __init__(self, max_length=128):
        self.max_length = max_length

    def validate(self, password, user=None):
        if len(password) > self.max_length:
            raise ValidationError(
                _('This password is too long (maximum %(max_length)d characters).'),
                code='password_too_long',
                params={'max_length': self.max_length},
            )

    def get_help_text(self):
        return _('Your password must be at most %(max_length)d characters.') % {
            'max_length': self.max_length,
        }


class CompositionPasswordValidator:
    """At least 1 capital letter, 1 special character and 3 numbers.

    Capital = an uppercase letter (any alphabet); number = a decimal digit;
    special = anything that is neither a letter, a digit nor whitespace
    (symbols and emoji count, letters with accents do not)."""

    MIN_DIGITS = 3

    def validate(self, password, user=None):
        problems = []
        if not any(ch.isupper() for ch in password):
            problems.append(ValidationError(
                _('Add at least 1 capital letter.'), code='password_no_capital'))
        if not any(not ch.isalnum() and not ch.isspace() for ch in password):
            problems.append(ValidationError(
                _('Add at least 1 special character.'), code='password_no_special'))
        if sum(1 for ch in password if unicodedata.category(ch) == 'Nd') < self.MIN_DIGITS:
            problems.append(ValidationError(
                _('Add at least %(count)d numbers.'), code='password_few_digits',
                params={'count': self.MIN_DIGITS}))
        if problems:
            raise ValidationError(problems)

    def get_help_text(self):
        return _('Your password needs at least 1 capital letter, 1 special character and 3 numbers.')
