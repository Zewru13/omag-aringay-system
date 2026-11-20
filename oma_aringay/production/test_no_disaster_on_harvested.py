"""A harvested crop (or stock) cannot be reported as hit by a disaster: there is nothing left in the field or the water to lose.
The crop endpoints (one crop, several crops) and the older per-stock endpoint of fisheries refuse it; a crop still growing is unchanged."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import Farmer
from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from production.models import CropDisasterReport, CropMonitoringRecord, CropType

_RSBSA = itertools.count(975001)
MESSAGE = 'already harvested'


def make_farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Harvested', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def make_crop(farmer, status='Planted'):
    return CropMonitoringRecord.objects.create(
        farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
        season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='2.00', status=status)


def report(**over):
    data = {'disaster_type': 'Typhoon', 'date_of_occurrence': '2026-09-01', 'area_affected_ha': '1.00', 'estimated_damage': 'Wind'}
    data.update(over)
    return data


class NoDisasterOnHarvestedCropTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='nd-adm', password='pw', role='ADMIN', email='nd-adm@x.test')
        cls.ana = make_farmer('Ana')
        cls.ana_user = get_user_model().objects.create_user(username='nd-ana', password='pw', role='CITIZEN', email='nd-ana@x.test')
        UserLinkedRecord.objects.create(user=cls.ana_user, record_type='FARMER', record_id=cls.ana.id, is_active=True)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    # --- one crop: POST /production/monitoring/<id>/disasters/
    def test_staff_cannot_report_a_disaster_on_a_harvested_crop(self):
        crop = make_crop(self.ana, 'Harvested')
        r = self.client.post(f'/api/production/monitoring/{crop.id}/disasters/', report(), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn(MESSAGE, str(r.json()))
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_a_farmer_cannot_either(self):
        self.client.force_authenticate(self.ana_user)
        crop = make_crop(self.ana, 'Harvested')
        r = self.client.post(f'/api/production/monitoring/{crop.id}/disasters/', report(), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_a_growing_crop_still_can(self):
        crop = make_crop(self.ana)
        r = self.client.post(f'/api/production/monitoring/{crop.id}/disasters/', report(), format='json')
        self.assertEqual(r.status_code, 201, r.content)

    # --- several crops: POST /production/disasters/multi/
    def test_one_harvested_crop_among_several_saves_nothing(self):
        growing, harvested = make_crop(self.ana), make_crop(self.ana, 'Harvested')
        body = report(crops=[{'monitoring_record': growing.id, 'area_affected_ha': '1.00'}, {'monitoring_record': harvested.id, 'area_affected_ha': '1.00'}])
        r = self.client.post('/api/production/disasters/multi/', body, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn(MESSAGE, str(r.json()))
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_the_multi_endpoint_still_works_for_growing_crops(self):
        a, b = make_crop(self.ana), make_crop(self.ana)
        body = report(crops=[{'monitoring_record': a.id, 'area_affected_ha': '1.00'}, {'monitoring_record': b.id, 'area_affected_ha': '1.00'}])
        self.assertEqual(self.client.post('/api/production/disasters/multi/', body, format='json').status_code, 201)


class NoDisasterOnHarvestedStockTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='nds-adm', password='pw', role='ADMIN', email='nds-adm@x.test')
        cls.fisherfolk = Fisherfolk.objects.create(
            first_name='Pond', last_name='Harvested', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def stock(self, status):
        return StockingRecord.objects.create(
            fisherfolk=self.fisherfolk, species=self.species, date_stocked=date(2026, 8, 1), number_of_fingerlings=10,
            season='Wet', year=2026, area_hectares='2.00', status=status)

    def post(self, stock):
        return self.client.post(f'/api/fisheries/stocking/{stock.id}/disasters/', report(), format='json')

    def test_a_harvested_stock_cannot_be_reported(self):
        r = self.post(self.stock('Harvested'))
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn(MESSAGE, str(r.json()))

    def test_a_stock_still_in_the_water_can(self):
        self.assertEqual(self.post(self.stock('Stocked')).status_code, 201)
