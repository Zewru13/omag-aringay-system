"""A farmer account sees and changes only its own records on the crop endpoints the Farmer pages use (the
farmer counterpart of the fisherfolk "own records" rule in accounts/permissions.py)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from accounts.permissions import farmer_scope, is_farmer_citizen, scope_to_farmer
from associations.models import FarmersOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from farmers.models import FarmParcel
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(920001)


def make_farmer(first, last='Scopetest'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name=last, gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(
        username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


def make_staff(username, role='ADMIN'):
    return get_user_model().objects.create_user(username=username, password='pw', role=role, email=f'{username}@x.test')


def make_crop(farmer, **over):
    data = dict(farmer=farmer, farm_location_barangay='Alaska', land_status='Owner',
                crop_type=CropType.objects.order_by('id').first(), season='Wet', year=2026,
                date_planted=date(2026, 5, 1), area_planted_ha='1.00', status='Planted')
    data.update(over)
    return CropMonitoringRecord.objects.create(**data)


class FarmerScopeHelpersTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.farmer_a = make_farmer('Ana')
        cls.farmer_b = make_farmer('Ben')
        cls.user_a = make_citizen('farmer-a', 'FARMER', cls.farmer_a.id)
        cls.admin = make_staff('admin1')
        cls.evaluator = make_staff('eval1', 'EVALUATOR')

    def test_farmer_citizen_scope_is_own_farmer_id(self):
        self.assertTrue(is_farmer_citizen(self.user_a))
        self.assertEqual(farmer_scope(self.user_a), self.farmer_a.id)

    def test_staff_scope_is_none(self):
        for staff in (self.admin, self.evaluator):
            self.assertFalse(is_farmer_citizen(staff))
            self.assertIsNone(farmer_scope(staff))

    def test_organization_and_unlinked_and_fisherfolk_citizens_are_not_farmer_citizens(self):
        org = FarmersOrganization.objects.create(
            name='Org', barangay='Alaska', contact_person='X', contact_number='1', registration_number='O-1',
            date_organized=date(2020, 1, 1))
        fisher = Fisherfolk.objects.create(
            first_name='Fi', last_name='Sh', gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        others = [make_citizen('org1', 'FARMERS_ORG', org.id), make_citizen('fish1', 'FISHERFOLK', fisher.id),
                  get_user_model().objects.create_user(username='nolink', password='pw', role='CITIZEN', email='nolink@x.test')]
        for user in others:
            self.assertFalse(is_farmer_citizen(user), user.username)
            self.assertIsNone(farmer_scope(user), user.username)

    def test_farmer_id_equal_to_a_fisherfolk_id_does_not_match(self):
        # a fisherfolk row whose id is exactly the farmer's id, linked to its own citizen account
        fisher = Fisherfolk.objects.create(
            id=self.farmer_a.id, first_name='Same', last_name='Id', gender='Male', birthdate=date(1990, 1, 1),
            barangay='Alaska', fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        user = make_citizen('fish2', 'FISHERFOLK', fisher.id)
        self.assertEqual(user.linked_record_id, self.farmer_a.id)      # the numbers collide...
        self.assertFalse(is_farmer_citizen(user))                       # ...but the TYPE does not
        self.assertIsNone(farmer_scope(user))
        make_crop(self.farmer_a)
        self.assertEqual(scope_to_farmer(CropMonitoringRecord.objects.all(), user, 'farmer_id').count(), 0)

    def test_a_user_who_is_neither_staff_nor_farmer_gets_nothing_not_everything(self):
        make_crop(self.farmer_a)
        nobody = get_user_model().objects.create_user(username='nolink2', password='pw', role='CITIZEN', email='nolink2@x.test')
        self.assertEqual(scope_to_farmer(CropMonitoringRecord.objects.all(), nobody, 'farmer_id').count(), 0)

    def test_scope_to_farmer_filters_for_farmer_and_not_for_staff(self):
        crop_a, crop_b = make_crop(self.farmer_a), make_crop(self.farmer_b)
        qs = CropMonitoringRecord.objects.all()
        self.assertEqual(list(scope_to_farmer(qs, self.user_a, 'farmer_id')), [crop_a])
        self.assertEqual(set(scope_to_farmer(qs, self.admin, 'farmer_id')), {crop_a, crop_b})


class FarmerReadRoutesTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.farmer_a, cls.farmer_b = make_farmer('Ana'), make_farmer('Ben')
        cls.user_a = make_citizen('farmer-a', 'FARMER', cls.farmer_a.id)
        cls.user_b = make_citizen('farmer-b', 'FARMER', cls.farmer_b.id)
        cls.admin = make_staff('admin1')
        cls.crop_a, cls.crop_b = make_crop(cls.farmer_a), make_crop(cls.farmer_b)
        cls.crop_type = CropType.objects.filter(activity_stages__isnull=False).distinct().first()
        org = FarmersOrganization.objects.create(
            name='Org', barangay='Alaska', contact_person='X', contact_number='1', registration_number='O-2',
            date_organized=date(2020, 1, 1))
        fisher = Fisherfolk.objects.create(
            first_name='Fi', last_name='Sh', gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        cls.rejected = [make_citizen('org1', 'FARMERS_ORG', org.id), make_citizen('fish1', 'FISHERFOLK', fisher.id)]

    def detail(self, crop):
        return f'/api/production/monitoring/{crop.id}/'

    def test_farmer_reads_own_crop_record_detail(self):
        self.client.force_authenticate(self.user_a)
        r = self.client.get(self.detail(self.crop_a))
        self.assertEqual((r.status_code, r.data['id']), (200, self.crop_a.id))

    def test_farmer_gets_404_for_another_farmers_crop_record(self):
        self.client.force_authenticate(self.user_a)
        self.assertEqual(self.client.get(self.detail(self.crop_b)).status_code, 404)
        self.client.force_authenticate(self.user_b)
        self.assertEqual(self.client.get(self.detail(self.crop_b)).status_code, 200)

    def test_farmer_cannot_patch_or_delete_a_crop_record(self):
        self.client.force_authenticate(self.user_a)
        self.assertEqual(self.client.patch(self.detail(self.crop_a), {'area_planted_ha': '9.00'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(self.detail(self.crop_a)).status_code, 403)
        self.crop_a.refresh_from_db()
        self.assertEqual(str(self.crop_a.area_planted_ha), '1.00')

    def test_staff_can_still_patch_a_crop_record(self):
        self.client.force_authenticate(self.admin)
        r = self.client.patch(self.detail(self.crop_a), {'area_planted_ha': '2.50'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)

    def test_farmer_lists_crop_types_and_stages_but_cannot_create_them(self):
        self.client.force_authenticate(self.user_a)
        types = self.client.get('/api/production/crop-types/')
        self.assertEqual(types.status_code, 200)
        self.assertGreater(len(types.json()), 0)
        stages = self.client.get(f'/api/production/crop-types/{self.crop_type.id}/stages/')
        self.assertEqual(stages.status_code, 200)
        self.assertGreater(len(stages.json()), 0)
        self.assertEqual(self.client.post('/api/production/crop-types/', {'name': 'Hack'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/production/crop-types/{self.crop_type.id}/stages/',
                                          {'stage_name': 'x', 'day_after_planting': 1}, format='json').status_code, 403)

    def test_fisherfolk_and_organization_citizens_are_rejected_on_all_three(self):
        urls = [self.detail(self.crop_a), '/api/production/crop-types/', f'/api/production/crop-types/{self.crop_type.id}/stages/']
        for user in self.rejected:
            self.client.force_authenticate(user)
            for url in urls:
                self.assertEqual(self.client.get(url).status_code, 403, (user.username, url))


class FarmerDisasterLogTests(APITestCase):
    LIST = '/api/production/disaster-logs/'

    @classmethod
    def setUpTestData(cls):
        from production.models import CropDisasterReport
        cls.farmer_a, cls.farmer_b = make_farmer('Ana', 'Alpha'), make_farmer('Ben', 'Bravo')
        cls.user_a = make_citizen('farmer-a', 'FARMER', cls.farmer_a.id)
        cls.admin = make_staff('admin1')
        cls.crop_a, cls.crop_b = make_crop(cls.farmer_a), make_crop(cls.farmer_b)
        make = lambda crop: CropDisasterReport.objects.create(
            monitoring_record=crop, disaster_type='Typhoon', date_of_occurrence=date(2026, 9, 1), estimated_damage='x')
        cls.log_a, cls.log_b = make(cls.crop_a), make(cls.crop_b)

    def ids(self, response):
        data = response.json()
        rows = data['results'] if isinstance(data, dict) else data
        return {row['id'] for row in rows}

    def test_farmer_list_contains_only_own_logs(self):
        self.client.force_authenticate(self.user_a)
        r = self.client.get(self.LIST)
        self.assertEqual((r.status_code, self.ids(r)), (200, {self.log_a.id}))

    def test_farmer_cannot_widen_the_list_with_query_params(self):
        self.client.force_authenticate(self.user_a)
        for params in ({'search': 'Bravo'}, {'farmer': self.farmer_b.id}, {'barangay': 'Alaska', 'search': 'Ben'}, {'page': 1, 'search': 'Bravo'}):
            r = self.client.get(self.LIST, params)
            self.assertEqual(r.status_code, 200, params)
            self.assertNotIn(self.log_b.id, self.ids(r), params)

    def test_farmer_document_and_pdf_of_another_farmers_log_are_404(self):
        self.client.force_authenticate(self.user_a)
        self.assertEqual(self.client.get(f'{self.LIST}{self.log_b.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'{self.LIST}{self.log_b.id}/pdf/').status_code, 404)
        self.assertEqual(self.client.get(f'{self.LIST}{self.log_a.id}/').status_code, 200)

    def test_farmer_pdf_of_own_log_is_a_pdf(self):
        self.client.force_authenticate(self.user_a)
        r = self.client.get(f'{self.LIST}{self.log_a.id}/pdf/')
        self.assertEqual((r.status_code, r.content[:5]), (200, b'%PDF-'))

    def test_staff_list_still_sees_every_log(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.ids(self.client.get(self.LIST)), {self.log_a.id, self.log_b.id})
        self.assertEqual(self.client.get(f'{self.LIST}{self.log_b.id}/').status_code, 200)

    def test_fisherfolk_citizen_is_rejected(self):
        fisher = Fisherfolk.objects.create(
            first_name='Fi', last_name='Sh', gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        self.client.force_authenticate(make_citizen('fish1', 'FISHERFOLK', fisher.id))
        self.assertEqual(self.client.get(self.LIST).status_code, 403)


class FarmerCropHistoryTests(APITestCase):
    URL = '/api/reports/farmer-crop-history/'

    @classmethod
    def setUpTestData(cls):
        cls.farmer_a, cls.farmer_b = make_farmer('Ana', 'Alpha'), make_farmer('Ben', 'Bravo')
        cls.user_a = make_citizen('farmer-a', 'FARMER', cls.farmer_a.id)
        cls.admin = make_staff('admin1')
        cls.crop_a, cls.crop_b = make_crop(cls.farmer_a), make_crop(cls.farmer_b)

    def farmers_in(self, response):
        return {row['farmer'] for row in response.json()['records']}

    def test_farmer_history_is_always_their_own(self):
        self.client.force_authenticate(self.user_a)
        for params in ({'format': 'json'}, {'format': 'json', 'farmer': self.farmer_b.id}, {'format': 'json', 'farmer': ''}):
            r = self.client.get(self.URL, params)
            self.assertEqual(r.status_code, 200, params)
            self.assertEqual(self.farmers_in(r), {self.farmer_a.full_name}, params)

    def test_staff_history_unchanged(self):
        self.client.force_authenticate(self.admin)
        both = self.client.get(self.URL, {'format': 'json'})
        self.assertEqual(self.farmers_in(both), {self.farmer_a.full_name, self.farmer_b.full_name})
        only_b = self.client.get(self.URL, {'format': 'json', 'farmer': self.farmer_b.id})
        self.assertEqual(self.farmers_in(only_b), {self.farmer_b.full_name})

    def test_farmer_cannot_use_other_report_routes(self):
        self.client.force_authenticate(self.user_a)
        for url in ('/api/reports/farmers/masterlist/', '/api/reports/production/', '/api/reports/production/harvested-crop/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)


class FarmerRouteSweepTests(APITestCase):
    """The regression net for the whole farmer rule."""

    @classmethod
    def setUpTestData(cls):
        from production.models import CropActivityLog, CropDisasterReport
        cls.farmer_a, cls.farmer_b = make_farmer('Ana', 'Alpha'), make_farmer('Ben', 'Bravo')
        cls.user_a = make_citizen('farmer-a', 'FARMER', cls.farmer_a.id)
        cls.user_b = make_citizen('farmer-b', 'FARMER', cls.farmer_b.id)
        done = dict(status='Harvested', actual_harvest_date=date(2026, 9, 1))
        cls.crop_a, cls.crop_b = make_crop(cls.farmer_a, **done), make_crop(cls.farmer_b, **done)
        for crop in (cls.crop_a, cls.crop_b):
            CropActivityLog.objects.create(monitoring_record=crop, activity_type='Irrigation', date_of_activity=date(2026, 6, 1))
        cls.disaster_a = CropDisasterReport.objects.create(monitoring_record=cls.crop_a, disaster_type='Typhoon', date_of_occurrence=date(2026, 9, 1))
        cls.disaster_b = CropDisasterReport.objects.create(monitoring_record=cls.crop_b, disaster_type='Typhoon', date_of_occurrence=date(2026, 9, 1))

    def test_farmer_is_refused_on_every_staff_only_route(self):
        a = self.crop_a.id
        routes = [
            'production/yield-analysis/summary/', 'production/monitoring/bulk/', 'production/monitoring/check-duplicate/',
            'production/varieties/', 'production/seed-sources/', f'production/monitoring/{a}/remarks/',
            f'production/monitoring/{a}/labor/', f'production/monitoring/{a}/inputs/', f'production/monitoring/{a}/pest-disease/',
            'farmers/', f'farmers/{self.farmer_a.id}/', f'farmers/{self.farmer_a.id}/parcels/', 'fisheries/fisherfolk/',
            'organizations/farmers/', 'reports/farmers/masterlist/', 'reports/production/', 'accounts/users/', 'auditlog/',
        ]
        self.client.force_authenticate(self.user_a)
        for route in routes:
            self.assertEqual(self.client.get('/api/' + route).status_code, 403, route)

    def test_two_farmers_cannot_see_each_others_records(self):
        def ids(response, key='id'):
            data = response.json()
            rows = data.get('results', data.get('records', [])) if isinstance(data, dict) else data
            return {row[key] for row in rows}

        for me, other_crop, my_crop, my_disaster, other_disaster in (
                (self.user_a, self.crop_b, self.crop_a, self.disaster_a, self.disaster_b),
                (self.user_b, self.crop_a, self.crop_b, self.disaster_b, self.disaster_a)):
            self.client.force_authenticate(me)
            self.assertEqual(ids(self.client.get('/api/production/monitoring/')), {my_crop.id})
            self.assertEqual(ids(self.client.get('/api/production/yield-analysis/')), {my_crop.id})
            self.assertEqual(ids(self.client.get('/api/production/disaster-logs/')), {my_disaster.id})
            self.assertEqual(self.client.get(f'/api/production/monitoring/{my_crop.id}/logs/').status_code, 200)
            for url in (f'/api/production/monitoring/{other_crop.id}/', f'/api/production/disaster-logs/{other_disaster.id}/',
                        f'/api/production/disaster-logs/{other_disaster.id}/pdf/'):
                self.assertEqual(self.client.get(url).status_code, 404, url)
            for url in (f'/api/production/monitoring/{other_crop.id}/logs/', f'/api/production/monitoring/{other_crop.id}/suggestions/',
                        f'/api/production/monitoring/{other_crop.id}/disasters/'):
                self.assertIn(self.client.get(url).status_code, (403, 404), url)


class IdCollisionAndParcelTests(APITestCase):
    """Review findings: the older crop views a farmer already used must also refuse a Fisherfolk-linked citizen whose
    record id happens to equal the farmer's id, and a harvest may only carry a parcel of the crop's own farmer."""

    @classmethod
    def setUpTestData(cls):
        cls.farmer_a, cls.farmer_b = make_farmer('Ana', 'Alpha'), make_farmer('Ben', 'Bravo')
        cls.user_a = make_citizen('collide-a', 'FARMER', cls.farmer_a.id)
        cls.crop_a, cls.crop_b = make_crop(cls.farmer_a), make_crop(cls.farmer_b)
        parcel = dict(barangay='Alaska', area_hectares='1.00', land_ownership='Owner', commodity_type='Rice')
        cls.parcel_a = FarmParcel.objects.create(farmer=cls.farmer_a, **parcel)
        cls.parcel_b = FarmParcel.objects.create(farmer=cls.farmer_b, **parcel)
        # a fisherfolk citizen whose own record id is the same number as farmer A's id
        cls.collider = make_citizen('collide-fish', 'FISHERFOLK', cls.farmer_a.id)

    def test_fisherfolk_citizen_with_a_matching_number_is_refused_on_crop_routes(self):
        self.client.force_authenticate(self.collider)
        a = self.crop_a.id
        for url in (f'/api/production/monitoring/{a}/logs/', f'/api/production/monitoring/{a}/suggestions/',
                    f'/api/production/monitoring/{a}/disasters/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)
        harvest = {'monitoring_record': a, 'harvest_start_date': '2026-09-20', 'volume_kg': '100', 'unit_of_measure': 'kg', 'early_late_reason': 'Weather'}
        self.assertEqual(self.client.post('/api/production/create/', harvest, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/production/disasters/0/resolve/', {}, format='json').status_code, 403)

    def test_farmer_cannot_attach_another_farmers_parcel_to_a_harvest(self):
        self.client.force_authenticate(self.user_a)
        body = {'monitoring_record': self.crop_a.id, 'farm_parcel': self.parcel_b.id, 'harvest_start_date': '2026-09-20',
                'season': 'Wet', 'year': 2026, 'crop_name': 'Rice', 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg', 'early_late_reason': 'Weather'}
        response = self.client.post('/api/production/create/', body, format='json')
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn('farm_parcel', response.json())

    def test_farmer_can_still_record_a_harvest_on_their_own_parcel(self):
        self.client.force_authenticate(self.user_a)
        body = {'monitoring_record': self.crop_a.id, 'farm_parcel': self.parcel_a.id, 'harvest_start_date': '2026-09-20',
                'season': 'Wet', 'year': 2026, 'crop_name': 'Rice', 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg', 'early_late_reason': 'Weather'}
        response = self.client.post('/api/production/create/', body, format='json')
        self.assertEqual(response.status_code, 201, response.content)

    def test_farmer_can_edit_their_own_activity_log_but_not_another_farmers(self):
        from production.models import CropActivityLog
        mine = CropActivityLog.objects.create(monitoring_record=self.crop_a, activity_type='Irrigation', date_of_activity=date(2026, 6, 1))
        theirs = CropActivityLog.objects.create(monitoring_record=self.crop_b, activity_type='Irrigation', date_of_activity=date(2026, 6, 1))
        self.client.force_authenticate(self.user_a)
        ok = self.client.patch(f'/api/production/monitoring/logs/{mine.id}/detail/', {'notes': 'Corrected'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        mine.refresh_from_db()
        self.assertEqual(mine.notes, 'Corrected')
        self.assertIn(self.client.patch(f'/api/production/monitoring/logs/{theirs.id}/detail/', {'notes': 'Hijack'}, format='json').status_code, (403, 404))
        theirs.refresh_from_db()
        self.assertNotEqual(theirs.notes, 'Hijack')
