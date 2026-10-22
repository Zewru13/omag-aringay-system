"""Dashboard "Season Snapshot": estimated vs actual yield, per crop (mt/ha) and per fisheries species (kg totals)."""
import itertools
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import Farmer
from fisheries.models import Fisherfolk, FisheriesHarvestRecord, SpeciesCategory, SpeciesOption, StockingRecord
from production.dashboard_activity import crop_yield_variance, fisheries_yield_variance
from production.models import CropMonitoringRecord, CropType

URL = '/api/production/dashboard/activity-status/'
_RSBSA = itertools.count(970001)


def species(name):
    cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
    sp, _ = SpeciesOption.objects.get_or_create(species_name=name, defaults=dict(
        category=cat, culture_environment='Freshwater', culture_duration_days=120,
        default_survival_rate_pct=80, default_avg_body_weight_kg=Decimal('0.25')))
    return sp


class FisheriesYieldVarianceTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ff = Fisherfolk.objects.create(
            first_name='Pablo', last_name='Dash', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Inland', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        cls.tilapia, cls.bangus = species('Dash Tilapia'), species('Dash Bangus')

    def stocking(self, sp, status='Harvested', fingerlings=1000, **over):
        rec = StockingRecord.objects.create(
            fisherfolk=self.ff, species=sp, culture_type='Pond', date_stocked=date(2026, 3, 1), number_of_fingerlings=fingerlings,
            season='Dry', year=2026, **over)
        StockingRecord.objects.filter(pk=rec.pk).update(status=status)
        rec.refresh_from_db()
        return rec

    def harvest(self, rec, kg):
        return FisheriesHarvestRecord.objects.create(stocking_record=rec, harvest_date=date(2026, 7, 1), quantity_kg=Decimal(str(kg)))

    def test_the_estimate_comes_from_the_species_figures(self):
        self.assertEqual(self.stocking(self.tilapia).estimated_harvest_kg, Decimal('200.00'))    # 1000 x 80% x 0.25 kg

    def test_totals_per_species_and_the_variance_percentage(self):
        a, b = self.stocking(self.tilapia), self.stocking(self.tilapia)
        self.harvest(a, 150); self.harvest(b, 190)
        c = self.stocking(self.bangus); self.harvest(c, 260)
        rows = {r['species']: r for r in fisheries_yield_variance()}
        self.assertEqual((rows['Dash Tilapia']['target_kg'], rows['Dash Tilapia']['actual_kg'], rows['Dash Tilapia']['variance_pct'], rows['Dash Tilapia']['records']),
                         (400.0, 340.0, -15.0, 2))
        self.assertEqual((rows['Dash Bangus']['target_kg'], rows['Dash Bangus']['actual_kg'], rows['Dash Bangus']['variance_pct']), (200.0, 260.0, 30.0))

    def test_several_harvests_of_one_stocking_add_up(self):
        rec = self.stocking(self.tilapia)
        self.harvest(rec, 60); self.harvest(rec, 90)
        row = fisheries_yield_variance()[0]
        self.assertEqual((row['actual_kg'], row['variance_pct']), (150.0, -25.0))

    def test_the_biggest_variance_comes_first_and_the_list_can_be_limited(self):
        self.harvest(self.stocking(self.tilapia), 150)      # -25%
        self.harvest(self.stocking(self.bangus), 260)       # +30%
        self.assertEqual([r['species'] for r in fisheries_yield_variance()], ['Dash Bangus', 'Dash Tilapia'])
        self.assertEqual([r['species'] for r in fisheries_yield_variance(limit=1)], ['Dash Bangus'])

    def test_only_harvested_stockings_with_an_estimate_and_a_recorded_harvest_count(self):
        still_growing = self.stocking(self.tilapia, status='Stocked'); self.harvest(still_growing, 100)
        self.stocking(self.tilapia)                                           # harvested but nothing recorded
        no_estimate = self.stocking(self.bangus); self.harvest(no_estimate, 100)
        StockingRecord.objects.filter(pk=no_estimate.pk).update(estimated_harvest_kg=None)
        self.assertEqual(fisheries_yield_variance(), [])

    def test_the_latest_season_and_year_are_reported(self):
        old = self.stocking(self.tilapia); self.harvest(old, 150)
        new = self.stocking(self.tilapia); self.harvest(new, 150)
        StockingRecord.objects.filter(pk=new.pk).update(season='Wet', year=2027)
        row = fisheries_yield_variance()[0]
        self.assertEqual((row['season'], row['year']), ('Wet', 2027))


class DashboardEndpointTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='dv-admin', password='pw', role='ADMIN', email='dv-admin@x.test')
        cls.evaluator = User.objects.create_user(username='dv-eval', password='pw', role='EVALUATOR', email='dv-eval@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Ana', last_name='Dash', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.citizen = User.objects.create_user(username='dv-farmer', password='pw', role='CITIZEN', email='dv-farmer@x.test')
        UserLinkedRecord.objects.create(user=cls.citizen, record_type='FARMER', record_id=cls.farmer.id, is_active=True)

    def test_staff_get_both_variance_lists(self):
        for user in (self.admin, self.evaluator):
            self.client.force_authenticate(user)
            data = self.client.get(URL).json()
            self.assertEqual(data['yield_variance'], [])
            self.assertEqual(data['fisheries_yield_variance'], [])

    def test_a_farmer_account_cannot_read_the_dashboard(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_the_crop_variance_is_unchanged(self):
        ct = CropType.objects.order_by('id').first()
        rec = CropMonitoringRecord.objects.create(
            farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=ct, season='Wet', year=2026,
            date_planted=date(2026, 5, 1), area_planted_ha='2.00', status='Planted')
        CropMonitoringRecord.objects.filter(pk=rec.pk).update(status='Harvested', estimated_yield_kg=Decimal('8000'), actual_yield_kg=Decimal('6000'))
        row = crop_yield_variance()[0]
        self.assertEqual((row['target_mt_ha'], row['actual_mt_ha'], row['variance_pct']), (4.0, 3.0, -25.0))
