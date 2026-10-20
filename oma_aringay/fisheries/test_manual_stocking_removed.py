"""Stocking is only ever created by "Start Production Cycle" (monitoring.AquacultureProductionCycle): the manual
create / bulk create / spreadsheet import endpoints are gone, and PCIC is asked for on the cycle form."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.urls import Resolver404, resolve
from rest_framework.test import APITestCase

from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord

CYCLES = '/api/monitoring/aquaculture-cycles/'
STOCKING = '/api/fisheries/stocking/'
_RSBSA = itertools.count(910001)


class ManualStockingRemovedTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='adm@x.test')
        cls.ff = Fisherfolk.objects.create(
            first_name='Pablo', last_name='Test', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Inland', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA),
        )
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(
            species_name='Tilapia', defaults=dict(
                category=cat, culture_environment='Freshwater', culture_duration_days=120,
                default_survival_rate_pct=80, default_avg_body_weight_kg=0.25,
            ),
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _payload(self, **over):
        data = {
            'fisherfolk': self.ff.id, 'cycle_name': 'Grow-out Phase', 'species_farmed': 'Tilapia',
            'species_option': self.species.id, 'culture_system': 'Fishpond',
            'pond_location_barangay': 'Poblacion', 'water_source': 'River',
            'stocking_date': str(date.today() - timedelta(days=1)),
            'units': [{'length_m': 4, 'width_m': 2, 'fingerling_count': 20}],
        }
        data.update(over)
        return data

    # --- the manual paths are gone
    def test_stocking_can_no_longer_be_created_directly(self):
        r = self.client.post(STOCKING, {'fisherfolk': self.ff.id, 'species': self.species.id, 'culture_type': 'Pond',
                                        'date_stocked': str(date.today()), 'number_of_fingerlings': 100}, format='json')
        self.assertEqual(r.status_code, 405)
        self.assertEqual(StockingRecord.objects.count(), 0)

    def test_stocking_bulk_create_and_spreadsheet_import_routes_are_gone(self):
        # Resolved, not requested: an unknown URL answers with Django's HTML 404 page, not a JSON API error.
        for path in ('bulk/', 'forecasting/import/', 'forecasting/template/'):
            with self.assertRaises(Resolver404, msg=path):
                resolve(STOCKING + path)

    def test_stocking_list_still_works(self):
        self.assertEqual(self.client.post(CYCLES, self._payload(), format='json').status_code, 201)
        r = self.client.get(STOCKING)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['results']), 1)

    # --- PCIC on Start Production Cycle
    def test_cycle_records_pcic_insurance_on_its_stocking_record(self):
        r = self.client.post(CYCLES, self._payload(has_pcic_insurance=True), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        record = StockingRecord.objects.get(production_cycle_id=r.data['id'])
        self.assertTrue(record.has_pcic_insurance)
        # the form uploads the PCIC photo to the stocking record afterwards, so the cycle tells it which one
        self.assertEqual(r.data['stocking_record_id'], record.id)

    def test_cycle_without_pcic_is_not_insured(self):
        r = self.client.post(CYCLES, self._payload(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertFalse(StockingRecord.objects.get(production_cycle_id=r.data['id']).has_pcic_insurance)

    def test_pcic_without_a_species_is_rejected(self):
        data = self._payload(has_pcic_insurance=True)
        del data['species_option']
        r = self.client.post(CYCLES, data, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('has_pcic_insurance', r.data)
