"""Every registered fisherfolk is Aquaculture: a new registration needs no type, and a blank or 'Unspecified' (Not Yet Classified) type
is saved as Aquaculture. A fisherfolk who already has a real type (Capture, Inland, Mariculture) keeps it, so Capture Monitoring and the
trips logged there keep working.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import importlib
import itertools
from datetime import date

from django.apps import apps
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from fisheries.models import Fisherfolk

_RSBSA = itertools.count(970001)
LIST = '/api/fisheries/fisherfolk/'


def make(first, ftype):
    return Fisherfolk.objects.create(
        first_name=first, last_name='Typetest', gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type=ftype,
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))


def registration(**over):
    data = {'rsbsa_number': '01-033-02-019-%06d' % next(_RSBSA), 'first_name': 'New', 'last_name': 'Fisher', 'gender': 'Male',
            'birthdate': '1990-01-01', 'barangay': 'Alaska', 'contact_number': '09171234567'}
    data.update(over)
    return data


class FisherfolkAquacultureTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='aq-admin', password='pw', role='ADMIN', email='aq-admin@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    # ── the model
    def test_an_unspecified_or_blank_type_is_saved_as_aquaculture(self):
        self.assertEqual(make('Una', 'Unspecified').fisherfolk_type, 'Aquaculture')
        self.assertEqual(make('Blanca', '').fisherfolk_type, 'Aquaculture')
        self.assertEqual(Fisherfolk.objects.get(first_name='Una').fisherfolk_type, 'Aquaculture')

    def test_saving_an_old_unspecified_record_again_makes_it_aquaculture(self):
        ff = make('Olga', 'Aquaculture')
        Fisherfolk.objects.filter(pk=ff.pk).update(fisherfolk_type='Unspecified')
        ff.refresh_from_db()
        self.assertEqual(ff.fisherfolk_type, 'Unspecified')
        ff.save()
        ff.refresh_from_db()
        self.assertEqual(ff.fisherfolk_type, 'Aquaculture')

    def test_a_real_type_is_kept(self):
        for ftype in ('Capture', 'Inland', 'Mariculture', 'Aquaculture'):
            ff = make(f'K{ftype}', ftype)
            ff.save()
            ff.refresh_from_db()
            self.assertEqual(ff.fisherfolk_type, ftype)

    # ── registering and editing through the API
    def test_a_registration_needs_no_type_and_is_aquaculture(self):
        r = self.client.post(LIST, registration(), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['fisherfolk_type'], 'Aquaculture')
        self.assertEqual(Fisherfolk.objects.get(pk=r.json()['id']).fisherfolk_type, 'Aquaculture')

    def test_a_registration_that_sends_unspecified_is_aquaculture(self):
        r = self.client.post(LIST, registration(fisherfolk_type='Unspecified'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['fisherfolk_type'], 'Aquaculture')

    def test_the_list_and_the_detail_show_aquaculture(self):
        ff = make('Lita', 'Unspecified')
        listed = self.client.get(LIST, {'search': 'Lita'}).json()
        row = (listed['results'] if isinstance(listed, dict) else listed)[0]
        self.assertEqual(row['fisherfolk_type'], 'Aquaculture')
        self.assertEqual(self.client.get(f'{LIST}{ff.id}/').json()['fisherfolk_type'], 'Aquaculture')

    def test_editing_a_capture_fisherfolk_keeps_capture(self):
        ff = make('Cap', 'Capture')
        r = self.client.patch(f'{LIST}{ff.id}/', {'barangay': 'Basca', 'rsbsa_number': ff.rsbsa_number}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        ff.refresh_from_db()
        self.assertEqual((ff.fisherfolk_type, ff.barangay), ('Capture', 'Basca'))

    # ── the one-time fix of the registered fisherfolk
    def test_the_data_fix_changes_only_unspecified_and_blank_rows(self):
        a, b, c, d = make('A', 'Aquaculture'), make('B', 'Aquaculture'), make('C', 'Capture'), make('D', 'Inland')
        Fisherfolk.objects.filter(pk=a.pk).update(fisherfolk_type='Unspecified')
        Fisherfolk.objects.filter(pk=b.pk).update(fisherfolk_type='')
        migration = importlib.import_module('fisheries.migrations.0079_fisherfolk_aquaculture')
        migration.set_aquaculture(apps, None)
        types = {ff.first_name: ff.fisherfolk_type for ff in Fisherfolk.objects.filter(first_name__in='ABCD')}
        self.assertEqual(types, {'A': 'Aquaculture', 'B': 'Aquaculture', 'C': 'Capture', 'D': 'Inland'})
        self.assertFalse(Fisherfolk.objects.filter(fisherfolk_type__in=['Unspecified', '']).exists())
