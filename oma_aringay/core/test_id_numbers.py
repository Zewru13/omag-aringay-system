"""RSBSA and FishR numbers are typed by hand: any digit groups separated by single dashes, 20 digits at most. The
five older RSBSA shapes stay valid. Two spellings of one number (with and without dashes) are the same number
everywhere it is compared: duplicate checks, login and the imports."""
from datetime import date

from django.core.exceptions import ValidationError
from django.test import TestCase

from accounts.models import User, UserLinkedRecord
from accounts.views import _resolve_login_identifier
from core.idnumbers import by_id_key, id_key, is_free_id
from core.validators import validate_fishr, validate_rsbsa
from farmers.models import Farmer
from farmers.serializers import FarmerCreateSerializer
from fisheries.models import Fisherfolk


class FreeFormatValidationTests(TestCase):
    def test_any_digit_groups_up_to_twenty_digits_are_accepted(self):
        for value in ('12345678901234567890', '12-34-56-789-01234567890', '1', '01-33-02-014-058212', '0133020'):
            validate_rsbsa(value)
            validate_fishr(value)

    def test_the_older_rsbsa_shapes_still_validate(self):
        for value in ('BF-01-033-02-023-00000033', '01-033-02-019-000151', '01-033-02-011-XIIRZA', 'BF-01-033-02-004-000007'):
            validate_rsbsa(value)

    def test_more_than_twenty_digits_is_refused(self):
        for value in ('123456789012345678901', '12-34-56-789-012345678901'):
            with self.assertRaises(ValidationError):
                validate_rsbsa(value)
            with self.assertRaises(ValidationError):
                validate_fishr(value)

    def test_stray_dashes_and_letters_are_refused(self):
        for value in ('12--34', '-1234', '1234-', 'ABC-123', '12 34', '12_34'):
            with self.assertRaises(ValidationError):
                validate_rsbsa(value)
            with self.assertRaises(ValidationError):
                validate_fishr(value)

    def test_blank_is_left_to_the_required_rule(self):
        validate_rsbsa('')
        validate_fishr('')

    def test_is_free_id_counts_digits_not_dashes(self):
        self.assertTrue(is_free_id('12-34-56-789-01234567890'))
        self.assertFalse(is_free_id('12-34-56-789-012345678901'))


class SameNumberDifferentSpellingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-33-02-014-058212', first_name='Far', last_name='Mer', gender='Male',
            birthdate=date(1985, 5, 5), barangay='Alaska', civil_status='Single')
        cls.legacy = Farmer.objects.create(
            rsbsa_number='01-033-02-011-XIIRZA', first_name='Leg', last_name='Acy', gender='Male',
            birthdate=date(1985, 5, 5), barangay='Alaska', civil_status='Single')

    def test_id_key_drops_dashes_and_spaces_and_upper_cases(self):
        self.assertEqual(id_key(' 01-33-02-014-058212 '), '013302014058212')
        self.assertEqual(id_key('01 33 02 014 058212'), '013302014058212')
        self.assertEqual(id_key('01-033-02-011-xiirza'), '0103302011XIIRZA')
        self.assertEqual(id_key(None), '')

    def test_by_id_key_finds_the_record_whatever_the_dashes(self):
        for typed in ('013302014058212', '01-33-02-014-058212', '0133-02014-058212'):
            self.assertEqual(list(by_id_key(Farmer.objects.all(), 'rsbsa_number', typed)), [self.farmer], typed)
        self.assertEqual(list(by_id_key(Farmer.objects.all(), 'rsbsa_number', '01-033-02-011-xiirza')), [self.legacy])

    def test_a_blank_value_matches_nothing(self):
        self.assertEqual(list(by_id_key(Farmer.objects.all(), 'rsbsa_number', '')), [])
        self.assertEqual(list(by_id_key(Farmer.objects.all(), 'rsbsa_number', ' - ')), [])

    def test_registering_a_farmer_with_the_same_number_without_dashes_is_a_duplicate(self):
        with self.assertRaises(Exception) as ctx:
            FarmerCreateSerializer().validate_rsbsa_number('013302014058212')
        self.assertIn('already registered', str(ctx.exception))

    def test_a_fisherfolk_cannot_reuse_a_farmers_number_in_another_spelling(self):
        from fisheries.serializers import FisherfolkCreateSerializer
        with self.assertRaises(Exception) as ctx:
            FisherfolkCreateSerializer().validate_rsbsa_number('013302014058212')
        self.assertIn('already belongs to a registered farmer', str(ctx.exception))

    def test_login_by_rsbsa_number_ignores_the_dashes(self):
        user = User.objects.create_user(username='cit-farmer', password='pw', role='CITIZEN', email='cf@x.test')
        UserLinkedRecord.objects.create(
            user=user, record_type=User.LinkedRecordType.FARMER, record_id=self.farmer.id, is_active=True)
        for typed in ('01-33-02-014-058212', '013302014058212'):
            self.assertEqual(_resolve_login_identifier(typed), user, typed)
        self.assertIsNone(_resolve_login_identifier('013302014058299'))
