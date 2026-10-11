"""The "Senior Citizens Only" filter on the Farmer and Fisherfolk registries.

A person is a senior citizen from their 60th birthday. The filter must return exactly the people who are 60 or
older today, including someone whose 60th birthday is today, and nobody who turns 60 tomorrow."""
import itertools
from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk

_RSBSA = itertools.count(940001)


def _rsbsa():
    return '01-033-02-019-%06d' % next(_RSBSA)


def years_ago(years, today):
    """The same calendar day `years` ago (Feb 29 falls back to Feb 28)."""
    try:
        return today.replace(year=today.year - years)
    except ValueError:
        return today.replace(year=today.year - years, day=28)


def age_on(birthdate, today):
    return today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))


class SeniorFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='admin1', password='pw', role='ADMIN', email='admin1@x.test')
        today = timezone.localdate()
        cls.today = today
        # name -> birthdate. "Turns60Tomorrow" is 59 today; "Turned60Today" is exactly 60.
        cls.people = {
            'Age30': years_ago(30, today),
            'Age59': years_ago(59, today),
            'Turns60Tomorrow': years_ago(60, today) + timedelta(days=1),
            'Turned60Today': years_ago(60, today),
            'Age61': years_ago(61, today),
            'Age75': years_ago(75, today),
        }
        for name, born in cls.people.items():
            Farmer.objects.create(
                rsbsa_number=_rsbsa(), first_name=name, last_name='Seniortest', gender='Male', birthdate=born,
                barangay='Alaska', civil_status='Single')
            Fisherfolk.objects.create(
                first_name=name, last_name='Seniortest', gender='Male', birthdate=born, barangay='Alaska',
                fisherfolk_type='Aquaculture', rsbsa_number=_rsbsa())

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _names(self, url):
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.content)
        return {row['full_name'].split()[0]: row for row in response.data['results']}

    def _assert_senior_filter(self, base):
        everyone = self._names(f'{base}?page_size=100')
        self.assertEqual(set(everyone), set(self.people), 'the unfiltered list should show every test person')

        seniors = self._names(f'{base}?is_senior=true')
        expected = {n for n, born in self.people.items() if age_on(born, self.today) >= 60}
        self.assertEqual(set(seniors), expected)
        # Nobody under 60 sneaks through, whatever their stored flag says.
        for name, row in seniors.items():
            born = date.fromisoformat(row['birthdate'])
            self.assertGreaterEqual(age_on(born, self.today), 60, f'{name} is under 60')
            self.assertTrue(row['is_senior_citizen'], f'{name} should be flagged as a senior citizen')

    def test_farmer_filter_returns_only_people_who_are_60_or_older(self):
        self._assert_senior_filter('/api/farmers/')

    def test_fisherfolk_filter_returns_only_people_who_are_60_or_older(self):
        self._assert_senior_filter('/api/fisheries/fisherfolk/')

    def test_the_cutoff_follows_the_manila_calendar_day_not_the_utc_day(self):
        """At 04:00 in Manila it is still the previous day in UTC. Someone whose 60th birthday is that Manila day
        is already 60 in the system (the Age column shows 60), so the filter must include them."""
        manila_early_morning = datetime(2026, 10, 10, 20, 0, tzinfo=dt_timezone.utc)   # = 2026-10-11 04:00 Asia/Manila
        born = date(1966, 10, 11)
        Farmer.objects.create(
            rsbsa_number=_rsbsa(), first_name='Birthday', last_name='Manilatest', gender='Male', birthdate=born,
            barangay='Alaska', civil_status='Single')
        Fisherfolk.objects.create(
            first_name='Birthday', last_name='Manilatest', gender='Male', birthdate=born, barangay='Alaska',
            fisherfolk_type='Aquaculture', rsbsa_number=_rsbsa())
        with patch('django.utils.timezone.now', return_value=manila_early_morning):
            for base in ('/api/farmers/', '/api/fisheries/fisherfolk/'):
                names = {r['full_name'] for r in self.client.get(f'{base}?is_senior=true&search=Manilatest').data['results']}
                self.assertEqual(names, {'Birthday Manilatest'}, base)

    def test_senior_flag_matches_age_on_both_lists(self):
        for base in ('/api/farmers/', '/api/fisheries/fisherfolk/'):
            for name, row in self._names(f'{base}?page_size=100').items():
                born = self.people[name]
                self.assertEqual(row['is_senior_citizen'], age_on(born, self.today) >= 60, f'{base} {name}')
