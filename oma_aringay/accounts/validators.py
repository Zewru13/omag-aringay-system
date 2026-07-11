"""
Custom password-policy validators for the OMA Aringay system.

Policy: long-passphrase-friendly, no forced composition rules (no mandatory
symbol/number/uppercase), per NIST 800-63B guidance. Strength comes from
minimum length + a denylist, not character-class requirements.
"""
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
