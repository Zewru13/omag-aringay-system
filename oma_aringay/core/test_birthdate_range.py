"""A birthdate must give a believable age: at least 10 (already enforced) and not over 110 (audit 2026-11-20: a birthdate of 1800 was accepted)."""
from datetime import date

from django.test import SimpleTestCase
from rest_framework import serializers

from farmers.serializers import FarmerCreateSerializer, FarmerDetailSerializer
from fisheries.serializers import FisherfolkCreateSerializer, FisherfolkDetailSerializer

from .validators import validate_birthdate_range


def years_ago(n, extra_days=0):
    today = date.today()
    return date(today.year - n, today.month, min(today.day, 28)).replace(day=min(today.day, 28))


class BirthdateRangeTests(SimpleTestCase):
    def test_a_normal_birthdate_passes(self):
        self.assertEqual(validate_birthdate_range(date(1985, 1, 1)), date(1985, 1, 1))
        self.assertIsNone(validate_birthdate_range(None))

    def test_an_age_over_110_is_refused(self):
        with self.assertRaisesMessage(serializers.ValidationError, '110'):
            validate_birthdate_range(date(1800, 1, 1))
        with self.assertRaises(serializers.ValidationError):
            validate_birthdate_range(years_ago(111))

    def test_the_oldest_allowed_age_passes(self):
        validate_birthdate_range(years_ago(105))

    def test_under_ten_is_still_refused(self):
        with self.assertRaisesMessage(serializers.ValidationError, 'at least 10'):
            validate_birthdate_range(years_ago(5))

    def test_all_four_registration_serializers_use_it(self):
        for cls in (FarmerCreateSerializer, FarmerDetailSerializer, FisherfolkCreateSerializer, FisherfolkDetailSerializer):
            with self.assertRaises(serializers.ValidationError, msg=cls.__name__):
                cls().validate_birthdate(date(1800, 1, 1))
