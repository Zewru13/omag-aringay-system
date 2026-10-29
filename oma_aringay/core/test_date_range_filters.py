"""The "From / To" date filters of the crop, fisheries and organization pages: Date Planted (Crop Monitoring and Crop Records), Date
Stocked (Aquaculture Monitoring), Trip Date (Capture Monitoring) and Date Registered (the two organization tables). Both ends are
included, either may be left out, and a bad date or a "To" before the "From" is a 400."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from core.utils import date_range_params
from farmers.models import FarmParcel, Farmer
from fisheries.models import FishingTripLog, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(960001)


def rsbsa():
    return '01-033-02-019-%06d' % next(_RSBSA)


class DateRangeParamTests(APITestCase):
    def test_both_ends_are_parsed_and_either_may_be_left_out(self):
        self.assertEqual(date_range_params({'a': '2026-05-01', 'b': '2026-05-31'}, 'a', 'b'), (date(2026, 5, 1), date(2026, 5, 31)))
        self.assertEqual(date_range_params({'a': '2026-05-01'}, 'a', 'b'), (date(2026, 5, 1), None))
        self.assertEqual(date_range_params({'b': ' 2026-05-31 '}, 'a', 'b'), (None, date(2026, 5, 31)))
        self.assertEqual(date_range_params({}, 'a', 'b'), (None, None))
        self.assertEqual(date_range_params({'a': '2026-05-01', 'b': '2026-05-01'}, 'a', 'b'), (date(2026, 5, 1), date(2026, 5, 1)))

    def test_a_bad_date_or_a_to_before_the_from_is_refused(self):
        from rest_framework.exceptions import ValidationError
        for params in ({'a': 'yesterday'}, {'b': '2026-13-01'}, {'a': '2026-05-31', 'b': '2026-05-01'}):
            with self.assertRaises(ValidationError, msg=str(params)):
                date_range_params(params, 'a', 'b')


class DateRangeEndpointTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='dr-admin', password='pw', role='ADMIN', email='dr-admin@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number=rsbsa(), first_name='Dina', last_name='Range', gender='Female', birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.parcel_a = FarmParcel.objects.create(farmer=cls.farmer, parcel_number='A', area_hectares='5.00', land_ownership='Owner', barangay='Alaska')
        cls.parcel_b = FarmParcel.objects.create(farmer=cls.farmer, parcel_number='B', area_hectares='5.00', land_ownership='Owner', barangay='Alaska')
        crop_type = CropType.objects.order_by('id').first()

        def crop(parcel, planted):
            return CropMonitoringRecord.objects.create(
                farmer=cls.farmer, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=crop_type,
                season='Wet', year=planted.year, date_planted=planted, area_planted_ha='1.00')
        cls.crop_may = crop(cls.parcel_a, date(2026, 5, 10))
        cls.crop_jun = crop(cls.parcel_a, date(2026, 6, 20))
        cls.crop_jul = crop(cls.parcel_b, date(2026, 7, 5))

        cls.ff = Fisherfolk.objects.create(
            first_name='Pablo', last_name='Range', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number=rsbsa())
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=cat, culture_environment='Freshwater', culture_duration_days=120, default_survival_rate_pct=80, default_avg_body_weight_kg=0.25))
        for stocked in (date(2026, 3, 1), date(2026, 4, 15), date(2026, 5, 30)):
            StockingRecord.objects.create(
                fisherfolk=cls.ff, species=species, culture_type='Pond', date_stocked=stocked, number_of_fingerlings=100,
                season='Wet', year=2026)
        cls.catcher = Fisherfolk.objects.create(
            first_name='Cora', last_name='Range', gender='Female', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Capture', rsbsa_number=rsbsa())
        for trip in (date(2026, 2, 1), date(2026, 2, 15), date(2026, 3, 1)):
            FishingTripLog.objects.create(fisherfolk=cls.catcher, trip_date=trip, fishing_ground='Lingayen Gulf', gear_used='Gill net')

        for registered in (date(2026, 1, 5), date(2026, 2, 5), date(2026, 3, 5)):
            FarmersOrganization.objects.create(
                name=f'Farm Org {registered}', barangay='Alaska', contact_person='X', contact_number='1', registration_number=f'F{registered}',
                date_organized=date(2025, 1, 1), date_registered=registered)
            FisherfolkOrganization.objects.create(
                name=f'Fish Org {registered}', barangay='Alaska', contact_person='X', contact_number='1', registration_number=f'S{registered}',
                date_organized=date(2025, 1, 1), date_registered=registered)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def rows(self, url, **params):
        r = self.client.get(url, params)
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        return data['results'] if isinstance(data, dict) else data

    # --- Date Planted: Crop Monitoring
    def test_crop_monitoring_keeps_the_crops_planted_in_the_range_with_both_ends_included(self):
        url = '/api/production/monitoring/'
        ids = lambda **p: sorted(r['id'] for r in self.rows(url, **p))
        self.assertEqual(ids(planted_from='2026-05-10', planted_to='2026-06-20'), sorted([self.crop_may.id, self.crop_jun.id]))
        self.assertEqual(ids(planted_from='2026-06-01'), sorted([self.crop_jun.id, self.crop_jul.id]))
        self.assertEqual(ids(planted_to='2026-05-31'), [self.crop_may.id])
        self.assertEqual(ids(planted_from='2026-08-01'), [])
        self.assertEqual(len(ids()), 3)

    def test_crop_monitoring_refuses_a_bad_range(self):
        url = '/api/production/monitoring/'
        self.assertEqual(self.client.get(url, {'planted_from': 'nope'}).status_code, 400)
        self.assertEqual(self.client.get(url, {'planted_from': '2026-06-01', 'planted_to': '2026-05-01'}).status_code, 400)

    # --- Date Planted: Crop Records (parcels)
    def test_crop_records_lists_only_parcels_with_a_crop_planted_in_the_range_and_counts_just_those_crops(self):
        url = '/api/farmers/parcels/directory/'
        by_parcel = {r['id']: r['crop_count'] for r in self.rows(url, planted_from='2026-05-01', planted_to='2026-06-30')}
        self.assertEqual(by_parcel, {self.parcel_a.id: 2})                       # parcel B's only crop is in July
        by_parcel = {r['id']: r['crop_count'] for r in self.rows(url, planted_from='2026-06-15')}
        self.assertEqual(by_parcel, {self.parcel_a.id: 1, self.parcel_b.id: 1})
        self.assertEqual(len(self.rows(url)), 2)
        self.assertEqual(self.client.get(url, {'planted_to': 'x'}).status_code, 400)

    def test_crop_records_groups_use_the_same_range(self):
        r = self.client.get('/api/farmers/parcels/directory/groups/', {'group_by': 'farmer', 'planted_from': '2026-07-01'})
        self.assertEqual(r.status_code, 200)
        groups = r.json()['results']
        self.assertEqual([(g['parcels'], g['crops']) for g in groups], [(1, 1)])

    # --- Date Stocked: Aquaculture Monitoring
    def test_aquaculture_monitoring_keeps_the_stockings_in_the_range(self):
        url = '/api/fisheries/stocking/'
        stocked = lambda **p: sorted(r['date_stocked'] for r in self.rows(url, status='Stocked,Near Harvest,Harvested', **p))
        self.assertEqual(stocked(stocked_from='2026-04-15', stocked_to='2026-05-30'), ['2026-04-15', '2026-05-30'])
        self.assertEqual(stocked(stocked_from='2026-05-01'), ['2026-05-30'])
        self.assertEqual(stocked(stocked_to='2026-03-31'), ['2026-03-01'])
        self.assertEqual(self.client.get(url, {'stocked_from': 'x'}).status_code, 400)
        self.assertEqual(self.client.get(url, {'stocked_from': '2026-05-01', 'stocked_to': '2026-04-01'}).status_code, 400)

    # --- Trip Date: Capture Monitoring
    def test_capture_monitoring_keeps_the_trips_in_the_range(self):
        url = '/api/fisheries/fishing-trips/'
        days = lambda **p: sorted(r['trip_date'] for r in self.rows(url, **p))
        self.assertEqual(days(trip_from='2026-02-15', trip_to='2026-03-01'), ['2026-02-15', '2026-03-01'])
        self.assertEqual(days(trip_to='2026-02-01'), ['2026-02-01'])
        self.assertEqual(len(days()), 3)

    def test_the_capture_summary_describes_the_same_trips_as_the_range(self):
        url = '/api/fisheries/fishing-trips/summary/'
        r = self.client.get(url, {'trip_from': '2026-02-15', 'trip_to': '2026-03-01'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['totals']['trip_count'], 2)
        self.assertEqual(self.client.get(url).json()['totals']['trip_count'], 3)
        self.assertEqual(self.client.get(url, {'trip_from': 'x'}).status_code, 400)

    # --- Date Registered: the organization tables
    def test_organization_tables_keep_the_organizations_registered_in_the_range(self):
        for url, prefix in (('/api/organizations/farmers/', 'Farm Org'), ('/api/organizations/fisherfolk/', 'Fish Org')):
            names = lambda **p: sorted(r['name'] for r in self.rows(url, **p))
            self.assertEqual(names(registered_from='2026-02-05', registered_to='2026-03-05'), [f'{prefix} 2026-02-05', f'{prefix} 2026-03-05'], url)
            self.assertEqual(names(registered_to='2026-01-31'), [f'{prefix} 2026-01-05'], url)
            self.assertEqual(len(names()), 3, url)
            self.assertEqual(self.client.get(url, {'registered_from': '2026-03-01', 'registered_to': '2026-01-01'}).status_code, 400, url)

    # --- Print Report asks for bigger pages
    def test_a_list_can_be_asked_for_a_bigger_page_but_never_more_than_200(self):
        url = '/api/organizations/farmers/'
        self.assertEqual(len(self.client.get(url).json()['results']), 3)                    # the default page is unchanged (10)
        self.assertEqual(len(self.client.get(url, {'page_size': 2}).json()['results']), 2)
        self.assertEqual(self.client.get(url, {'page_size': 2}).json()['count'], 3)
        self.assertEqual(self.client.get(url, {'page_size': 100000}).status_code, 200)       # clamped to the maximum, not an error
