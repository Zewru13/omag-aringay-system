"""A crop record's Wet / Dry season follows its Date Planted (Wet: June 1 - November 30, Dry: December 1 - May 31) - whatever the form
sends - and is worked out again whenever the date changes.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.models import CropMonitoringRecord, CropType
from production.test_crop_record_duplicates import make_farmer, make_parcel, make_record, payload

MONITORING = '/api/production/monitoring/'


class CropSeasonAutoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='season-admin', password='pw', role='ADMIN', email='season-admin@x.test')
        cls.crop = CropType.objects.create(name='Season Rice', days_to_harvest=110)
        cls.farmer = make_farmer('Sia')
        cls.parcel = make_parcel(cls.farmer)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_the_season_boundaries(self):
        wanted = {date(2026, 5, 31): 'Dry', date(2026, 6, 1): 'Wet', date(2026, 11, 30): 'Wet', date(2026, 12, 1): 'Dry', date(2026, 1, 15): 'Dry',
                  date(2026, 8, 20): 'Wet'}
        for planted, season in wanted.items():
            # the record is made with the OPPOSITE season on purpose: saving must put the right one back
            wrong = 'Wet' if season == 'Dry' else 'Dry'
            rec = make_record(self.farmer, self.crop, date_planted=planted, season=wrong, variety_used=f'v{planted}')
            self.assertEqual(rec.season, season, f'{planted}')

    def test_a_new_record_gets_its_season_from_the_date_even_when_the_form_sends_another(self):
        response = self.client.post(MONITORING, payload(self.farmer, self.crop, self.parcel, date_planted='2026-01-10', season='Wet', variety_used='A'), format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['season'], 'Dry')

    def test_a_new_record_needs_no_season_from_the_form(self):
        data = payload(self.farmer, self.crop, self.parcel, date_planted='2026-07-10', variety_used='B')
        data.pop('season')
        response = self.client.post(MONITORING, data, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['season'], 'Wet')

    def test_changing_the_date_planted_changes_the_season(self):
        rec = make_record(self.farmer, self.crop, date_planted=date(2026, 7, 1), variety_used='C')
        self.assertEqual(rec.season, 'Wet')
        response = self.client.patch(f'{MONITORING}{rec.id}/', {'date_planted': '2026-02-01'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        rec.refresh_from_db()
        self.assertEqual(rec.season, 'Dry')
        self.assertEqual(response.json()['season'], 'Dry')

    def test_a_season_sent_on_an_edit_is_ignored(self):
        rec = make_record(self.farmer, self.crop, date_planted=date(2026, 7, 1), variety_used='D')
        response = self.client.patch(f'{MONITORING}{rec.id}/', {'season': 'Dry', 'notes': 'x'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        rec.refresh_from_db()
        self.assertEqual(rec.season, 'Wet')

    def test_saving_a_record_again_keeps_the_right_season(self):
        rec = make_record(self.farmer, self.crop, date_planted=date(2026, 3, 1), variety_used='E')
        CropMonitoringRecord.objects.filter(pk=rec.pk).update(season='Wet')   # an old record with a hand-typed, wrong season
        rec.refresh_from_db()
        rec.notes = 'touched'
        rec.save()
        rec.refresh_from_db()
        self.assertEqual(rec.season, 'Dry')
