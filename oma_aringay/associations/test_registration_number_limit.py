"""An organization's registration number is 15 characters at most. The limit applies to what is typed: an
organization that already has a longer number can still be edited, as long as that field is left alone."""
from django.test import TestCase
from rest_framework import serializers

from associations.models import FarmersOrganization, FisherfolkOrganization
from associations.serializers import FarmersOrganizationDetailSerializer, FisherfolkOrganizationDetailSerializer

SERIALIZERS = (FarmersOrganizationDetailSerializer, FisherfolkOrganizationDetailSerializer)


class RegistrationNumberLimitTests(TestCase):
    def test_fifteen_characters_are_accepted_and_sixteen_are_not(self):
        for cls in SERIALIZERS:
            self.assertEqual(cls().validate_registration_number('A' * 15), 'A' * 15)
            with self.assertRaises(serializers.ValidationError) as ctx:
                cls().validate_registration_number('A' * 16)
            self.assertIn('15 characters', str(ctx.exception))

    def test_surrounding_spaces_do_not_count(self):
        for cls in SERIALIZERS:
            self.assertEqual(cls().validate_registration_number('  ' + 'B' * 15 + '  '), 'B' * 15)

    def test_an_existing_longer_number_can_be_kept_while_editing_other_fields(self):
        long_number = 'LEGACY-REG-NUMBER-0001'
        org = FarmersOrganization.objects.create(name='Old Farmers', registration_number=long_number, barangay='Alaska')
        self.assertEqual(
            FarmersOrganizationDetailSerializer(instance=org).validate_registration_number(long_number), long_number)
        org2 = FisherfolkOrganization.objects.create(name='Old Fishers', registration_number=long_number, barangay='Alaska')
        self.assertEqual(
            FisherfolkOrganizationDetailSerializer(instance=org2).validate_registration_number(long_number), long_number)

    def test_changing_an_existing_number_to_a_longer_one_is_refused(self):
        org = FarmersOrganization.objects.create(name='Old Farmers', registration_number='SHORT-1', barangay='Alaska')
        with self.assertRaises(serializers.ValidationError):
            FarmersOrganizationDetailSerializer(instance=org).validate_registration_number('X' * 16)
