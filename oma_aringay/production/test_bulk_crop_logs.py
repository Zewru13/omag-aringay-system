"""One activity logged on many crops at once: POST /api/production/monitoring/bulk-logs/.

A farmer who did the same thing on many crops in a day logs it once. The log is saved on every crop named, each exactly like a log
made on that crop's own window (same checks, same late rule); a farmer account reaches only its OWN crops. All or nothing: if one
crop cannot take the log, nothing is saved and the answer names that crop."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import FarmParcel, Farmer
from production.models import CropActivityLog, CropActivityStage, CropMonitoringRecord, CropType

URL = '/api/production/monitoring/bulk-logs/'
_RSBSA = itertools.count(980001)


def make_farmer(first):
    farmer = Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Bulk', gender='Female',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    parcel = FarmParcel.objects.create(farmer=farmer, parcel_number='01-33-02-005-001-03-%03d' % farmer.id, area_hectares='9.00',
                                       land_ownership='Owner', barangay='Alaska')
    return farmer, parcel


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class BulkCropLogTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='bl-adm', password='pw', role='ADMIN', email='bla@x.test')
        cls.ana, cls.ana_parcel = make_farmer('Ana')
        cls.ben, cls.ben_parcel = make_farmer('Ben')
        cls.ana_user = make_citizen('bl-ana', 'FARMER', cls.ana.id)
        cls.fisher_user = make_citizen('bl-fish', 'FISHERFOLK', cls.ana.id)   # a fisherfolk whose id happens to match
        cls.rice, _ = CropType.objects.get_or_create(name='Bulk Log Rice', defaults=dict(days_to_harvest=100))
        cls.rice.days_to_harvest = 100
        cls.rice.save()

    def setUp(self):
        self.client.force_authenticate(self.ana_user)

    def crop(self, farmer=None, planted_days_ago=40, **over):
        farmer = farmer or self.ana
        data = dict(farmer=farmer, farm_parcel=self.ana_parcel if farmer == self.ana else self.ben_parcel,
                    farm_location_barangay='Alaska', land_status='Owner', crop_type=self.rice, season='Wet', year=2026,
                    date_planted=date.today() - timedelta(days=planted_days_ago), area_planted_ha='1.00', status='Planted', variety_used='')
        data.update(over)
        return CropMonitoringRecord.objects.create(**data)

    def post(self, crops, **over):
        data = {'record_ids': [c.id for c in crops], 'activity_type': 'Weeding', 'date_of_activity': str(date.today()), 'notes': 'Weeded the rows'}
        data.update(over)
        return self.client.post(URL, data, format='json')

    def test_one_activity_is_logged_on_every_crop_named(self):
        crops = [self.crop(), self.crop(), self.crop()]
        r = self.post(crops)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['logged'], 3)
        self.assertEqual(CropActivityLog.objects.count(), 3)
        for crop in crops:
            log = CropActivityLog.objects.get(monitoring_record=crop)
            self.assertEqual((log.activity_type, log.notes, log.date_of_activity), ('Weeding', 'Weeded the rows', date.today()))
            self.assertEqual(log.recorded_by_id, self.ana_user.id)

    def test_the_fertilizer_details_are_saved_on_each_crop(self):
        crops = [self.crop(), self.crop()]
        r = self.post(crops, activity_type='Fertilizer Application', fertilizer_type='Urea', quantity_applied='25', quantity_unit='kg')
        self.assertEqual(r.status_code, 201, r.content)
        for log in CropActivityLog.objects.all():
            self.assertEqual((log.fertilizer_type, str(log.quantity_applied), log.quantity_unit), ('Urea', '25.00', 'kg'))

    def test_a_farmer_cannot_name_another_farmers_crop(self):
        mine, theirs = self.crop(), self.crop(self.ben)
        r = self.post([mine, theirs])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('could not be found', str(r.json()))
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_a_fisherfolk_account_cannot_use_it(self):
        self.client.force_authenticate(self.fisher_user)
        r = self.post([self.crop()])
        self.assertIn(r.status_code, (400, 403), r.content)
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_one_crop_that_cannot_take_the_log_stops_everything(self):
        good, harvested = self.crop(), self.crop(status='Harvested', variety_used='Dwarf')
        r = self.post([good, harvested])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Dwarf', r.json()['detail'])           # names the crop (its variety tells the crops apart)
        self.assertEqual([e['monitoring_record'] for e in r.json()['errors']], [harvested.id])
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_a_date_before_planting_names_the_crop(self):
        young = self.crop(planted_days_ago=2, variety_used='Young')
        old = self.crop(planted_days_ago=40)
        r = self.post([old, young], date_of_activity=str(date.today() - timedelta(days=5)))
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Young', r.json()['detail'])
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_a_future_date_is_refused(self):
        r = self.post([self.crop()], date_of_activity=str(date.today() + timedelta(days=1)))
        self.assertEqual(r.status_code, 400, r.content)

    def test_pest_control_needs_the_severity_because_the_area_differs_per_crop(self):
        crops = [self.crop(), self.crop()]
        r = self.post(crops, activity_type='Pest Control', pest_disease_name='Rice bug')
        self.assertEqual(r.status_code, 400, r.content)
        r = self.post(crops, activity_type='Pest Control', pest_disease_name='Rice bug', severity='Medium')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual({log.severity for log in CropActivityLog.objects.all()}, {'Medium'})

    def test_disaster_remedy_is_not_logged_in_bulk(self):
        r = self.post([self.crop()], activity_type='Disaster Remedy')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Disaster Remedy', str(r.json()))

    def test_other_needs_its_description(self):
        r = self.post([self.crop()], activity_type='Other')
        self.assertEqual(r.status_code, 400, r.content)
        r = self.post([self.crop()], activity_type='Other', activity_type_other_specify='Fixed the dike')
        self.assertEqual(r.status_code, 201, r.content)

    def test_the_list_of_crops_is_checked(self):
        crop = self.crop()
        self.assertEqual(self.post([]).status_code, 400)
        self.assertEqual(self.post([crop, crop]).status_code, 400)                       # the same crop twice
        too_many = self.client.post(URL, {'record_ids': list(range(1, 102)), 'activity_type': 'Weeding', 'date_of_activity': str(date.today())}, format='json')
        self.assertEqual(too_many.status_code, 400)
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_a_late_log_is_tied_to_its_overdue_step_on_each_crop(self):
        CropActivityStage.objects.create(crop_type=self.rice, stage_name='Weeding', day_after_planting=10, window_days=2)
        crop = self.crop(planted_days_ago=40)             # day 10 was 30 days ago: the step is overdue
        r = self.post([crop])
        self.assertEqual(r.status_code, 201, r.content)
        log = CropActivityLog.objects.get(monitoring_record=crop)
        self.assertEqual(log.target_day, 10)
        self.assertTrue(log.is_late)

    def test_staff_can_log_for_any_crops(self):
        self.client.force_authenticate(self.admin)
        r = self.post([self.crop(), self.crop(self.ben)])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(CropActivityLog.objects.count(), 2)

    def test_an_anonymous_caller_is_refused(self):
        self.client.force_authenticate(None)
        self.assertIn(self.post([self.crop()]).status_code, (401, 403))
