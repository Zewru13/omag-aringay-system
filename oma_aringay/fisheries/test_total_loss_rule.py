"""A pond disaster can be a Total Loss only when the whole stocked area is affected."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord

_RSBSA = itertools.count(940001)


def _report(area, total_loss):
    return {'disaster_type': 'Flooding', 'date_of_occurrence': '2026-09-01', 'area_affected_ha': area,
            'is_total_loss': total_loss}


class PondTotalLossRuleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='ptl-staff', password='pw', role='ADMIN', email='ptl@x.test')
        cls.fisherfolk = Fisherfolk.objects.create(
            first_name='Pond', last_name='Loss', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def new_stock(self, area='2.00'):
        return StockingRecord.objects.create(
            fisherfolk=self.fisherfolk, species=self.species, date_stocked=date(2026, 8, 1), number_of_fingerlings=10,
            season='Wet', year=2026, area_hectares=area)

    def post(self, stock, area, total_loss):
        return self.client.post(f'/api/fisheries/stocking/{stock.id}/disasters/', _report(area, total_loss), format='json')

    def test_total_loss_with_the_whole_area_is_accepted(self):
        response = self.post(self.new_stock(), 2.0, True)
        self.assertEqual(response.status_code, 201, response.content)

    def test_total_loss_with_less_than_the_whole_area_is_refused(self):
        response = self.post(self.new_stock(), 1.99, True)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn('is_total_loss', response.json())

    def test_partial_loss_is_unchanged(self):
        response = self.post(self.new_stock(), 1.0, False)
        self.assertEqual(response.status_code, 201, response.content)

    def test_total_loss_compares_decimals_not_strings(self):
        for area in ('2', '2.0', '2.0000', 2):
            response = self.post(self.new_stock(), area, True)
            self.assertEqual(response.status_code, 201, (area, response.content))
