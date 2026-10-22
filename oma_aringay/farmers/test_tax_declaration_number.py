"""A parcel's tax declaration number is exactly 18 digits (RR-MMM-BBBBB-YYYY-NNNN); the form stops typing at 18."""
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from core.validators import validate_tax_declaration_number
from farmers.models import FarmParcel


class TaxDeclarationNumberTests(SimpleTestCase):
    def test_eighteen_digits_in_the_fixed_groups_are_accepted(self):
        validate_tax_declaration_number('01-002-00005-2023-0142')

    def test_nineteen_digits_are_refused(self):
        with self.assertRaises(ValidationError):
            validate_tax_declaration_number('01-002-00005-2023-01421')

    def test_seventeen_digits_are_refused(self):
        with self.assertRaises(ValidationError):
            validate_tax_declaration_number('01-002-00005-2023-014')

    def test_letters_and_other_groupings_are_refused(self):
        for bad in ('01-002-00005-2023-01A2', '010020000520230142', '1-0020-00005-2023-0142'):
            with self.assertRaises(ValidationError, msg=bad):
                validate_tax_declaration_number(bad)

    def test_a_blank_number_is_allowed_because_the_field_is_optional(self):
        validate_tax_declaration_number('')
        self.assertTrue(FarmParcel._meta.get_field('tax_declaration_number').blank)
