"""Harvest reminders for farmers and fisherfolk: 30 / 7 / 3 days before, the harvest day, 7 days overdue."""
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core import harvest_reminders as hr
from core.models import Notification
from farmers.models import FarmParcel, Farmer
from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import AquacultureProductionCycle
from production.models import CropMonitoringRecord, CropType

TODAY = date(2026, 10, 23)
CROP = 'crop_harvest_reminder'
FISH = 'fisheries_harvest_reminder'


class MilestoneTests(TestCase):
    def test_which_milestone_each_number_of_days_left_gets(self):
        expected = {
            40: None, 31: None, 30: '30d', 28: '30d', 27: '30d', 26: None, 10: None, 8: None,
            7: '7d', 5: '7d', 4: '7d', 3: '3d', 2: '3d', 1: '3d', 0: 'today', -1: 'today', -3: 'today',
            -4: None, -6: None, -7: 'overdue', -9: 'overdue', -10: 'overdue', -11: None, -200: None,
        }
        for days_left, key in expected.items():
            self.assertEqual(hr.milestone_for(days_left), key, f'{days_left} days left')

    def test_wording_uses_the_real_days_left(self):
        on = date(2026, 11, 4)
        self.assertEqual(hr.texts('7d', 7, 'Palay', on, 'Alaska')[0], 'Harvest expected in 7 days for your')
        self.assertEqual(hr.texts('7d', 4, 'Palay', on, 'Alaska')[0], 'Harvest expected in 4 days for your')
        self.assertEqual(hr.texts('3d', 1, 'Palay', on, 'Alaska')[0], 'Harvest expected in 1 day for your')
        self.assertEqual(hr.texts('today', 0, 'Palay', on, '')[0], 'Harvest is expected today for your')
        self.assertEqual(hr.texts('today', -2, 'Palay', on, '')[0], 'Harvest was expected 2 days ago for your')
        self.assertEqual(hr.texts('overdue', -7, 'Palay', on, '')[0], 'Harvest is 7 days overdue for your')
        verb, label, detail = hr.texts('30d', 30, 'Palay · Wet 2026', on, 'Alaska')
        self.assertEqual((label, detail), ('Palay · Wet 2026', 'expected Nov 04, 2026 · Alaska'))
        self.assertEqual(hr.texts('overdue', -7, 'Palay', on, '')[2], 'expected Nov 04, 2026')


class HarvestReminderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000701', first_name='Maria', last_name='Santos', gender='Female',
            birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, parcel_number='P-1', area_hectares='1.00', barangay='Alaska')
        cls.farmer_user = User.objects.create_user(username='maria', password='pw', role='CITIZEN', email='m@x.test')
        UserLinkedRecord.objects.create(user=cls.farmer_user, record_type=User.LinkedRecordType.FARMER, record_id=cls.farmer.id, is_active=True)
        cls.crop_type = CropType.objects.order_by('id').first()

        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-000801', first_name='Pedro', last_name='Cruz', gender='Male',
            birthdate=date(1980, 1, 1), barangay='Samara', fisherfolk_type='Aquaculture')
        cls.fisher_user = User.objects.create_user(username='pedro', password='pw', role='CITIZEN', email='p@x.test')
        UserLinkedRecord.objects.create(user=cls.fisher_user, record_type=User.LinkedRecordType.FISHERFOLK, record_id=cls.fisher.id, is_active=True)
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Bangus', defaults=dict(
            category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25')))

    def crop(self, harvest_on, **over):
        # the model works the expected date out from the planting date on save, so the test sets it afterwards
        data = dict(farmer=self.farmer, farm_parcel=self.parcel, farm_location_barangay='Alaska', land_status='Owner',
                    crop_type=self.crop_type, season='Wet', year=2026, date_planted=TODAY - timedelta(days=100),
                    area_planted_ha='1.00')
        status = over.pop('status', 'Planted')
        expected = over.pop('expected_harvest_date', harvest_on)
        data.update(over)
        record = CropMonitoringRecord.objects.create(**data)
        CropMonitoringRecord.objects.filter(pk=record.pk).update(expected_harvest_date=expected, status=status)
        return record

    def cycle(self, harvest_on, fisherfolk=None, **over):
        fisherfolk = fisherfolk or self.fisher
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=fisherfolk, cycle_name='Grow-out', species_farmed='Bangus', culture_system='Fishpond',
            stocking_date=harvest_on - timedelta(days=120), status=over.pop('cycle_status', 'Active'))
        stock = StockingRecord.objects.create(
            fisherfolk=fisherfolk, production_cycle=cycle, species=self.species, culture_type='Pond',
            date_stocked=harvest_on - timedelta(days=120), number_of_fingerlings=500, season='Dry', year=2026,
            pond_location_barangay='Samara')
        StockingRecord.objects.filter(pk=stock.pk).update(expected_harvest_date=harvest_on, **over)
        return cycle

    def run_on(self, days_before_harvest, harvest_on):
        return hr.run(harvest_on - timedelta(days=days_before_harvest))

    def sent(self, record_type=None, **f):
        qs = Notification.objects.filter(**f)
        return qs.filter(record_type=record_type) if record_type else qs

    # --- every milestone, for crops
    def test_a_farmer_gets_each_crop_reminder_once_on_its_day(self):
        harvest_on = TODAY + timedelta(days=60)
        record = self.crop(harvest_on)
        for days, key in ((31, None), (30, '30d'), (29, None), (8, None), (7, '7d'), (6, None), (3, '3d'), (2, None),
                          (0, 'today'), (-1, None), (-7, 'overdue'), (-8, None)):
            before = Notification.objects.count()
            self.run_on(days, harvest_on)
            self.run_on(days, harvest_on)   # running again the same day adds nothing
            self.assertEqual(Notification.objects.count(), before + (1 if key else 0), f'{days} days before')
        types = list(Notification.objects.order_by('id').values_list('record_type', flat=True))
        self.assertEqual(types, [f'{CROP}_{k}' for k in ('30d', '7d', '3d', 'today', 'overdue')])
        n = self.sent(f'{CROP}_7d').get()
        self.assertEqual((n.recipient_id, n.record_id, n.actor_id), (self.farmer_user.id, record.id, None))
        self.assertEqual(n.verb, 'Harvest expected in 7 days for your')
        self.assertEqual(n.record_label, f'{self.crop_type.name} · Wet 2026')
        self.assertIn('Alaska', n.detail)

    def test_only_the_owner_is_told_never_staff_or_other_farmers(self):
        other = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000702', first_name='Jose', last_name='Reyes', gender='Male',
            birthdate=date(1980, 1, 1), barangay='Alaska', civil_status='Single')
        other_user = get_user_model().objects.create_user(username='jose', password='pw', role='CITIZEN', email='j@x.test')
        UserLinkedRecord.objects.create(user=other_user, record_type='FARMER', record_id=other.id, is_active=True)
        self.crop(TODAY + timedelta(days=7))
        hr.run(TODAY)
        self.assertEqual(list(Notification.objects.values_list('recipient_id', flat=True)), [self.farmer_user.id])

    def test_a_farmer_without_an_active_account_gets_nothing_and_is_reminded_once_they_have_one(self):
        self.farmer_user.is_active = False
        self.farmer_user.save()
        self.crop(TODAY + timedelta(days=7))
        self.assertEqual(hr.run(TODAY), (0, 0))
        self.farmer_user.is_active = True
        self.farmer_user.save()
        self.assertEqual(hr.run(TODAY), (1, 1))

    def test_the_owner_comes_from_the_parcel_when_the_record_has_no_farmer(self):
        self.crop(TODAY + timedelta(days=7), farmer=None)
        hr.run(TODAY)
        self.assertEqual(self.sent(recipient=self.farmer_user).count(), 1)

    def test_a_record_owned_only_by_an_organization_is_skipped(self):
        self.crop(TODAY + timedelta(days=7), farmer=None, farm_parcel=None)
        self.assertEqual(hr.run(TODAY), (0, 0))

    def test_harvested_or_lost_crops_and_unset_dates_get_nothing(self):
        for status in ('Harvested', 'Total Loss'):
            self.crop(TODAY + timedelta(days=7), status=status)
        self.crop(TODAY + timedelta(days=7), expected_harvest_date=None)
        self.assertEqual(hr.run(TODAY), (0, 0))

    def test_a_planting_date_that_is_only_an_estimate_gets_no_reminders(self):
        self.crop(TODAY + timedelta(days=7), date_planted_is_estimated=True)
        self.assertEqual(hr.run(TODAY), (0, 0))

    def test_near_harvest_crops_are_reminded_too(self):
        self.crop(TODAY + timedelta(days=3), status='Near Harvest')
        self.assertEqual(hr.run(TODAY), (1, 1))

    # --- catching up when nobody used the system on the exact day
    def test_a_missed_day_is_sent_late_with_the_real_days_left(self):
        self.crop(TODAY + timedelta(days=5))
        hr.run(TODAY)
        n = Notification.objects.get()
        self.assertEqual((n.record_type, n.verb), (f'{CROP}_7d', 'Harvest expected in 5 days for your'))

    def test_old_open_records_do_not_flood_the_owner(self):
        self.crop(TODAY - timedelta(days=60))      # long past its dates, never closed
        self.crop(TODAY - timedelta(days=15))
        self.assertEqual(hr.run(TODAY), (0, 0))

    def test_a_record_created_late_gets_only_its_latest_milestone(self):
        self.crop(TODAY + timedelta(days=2))
        hr.run(TODAY)
        self.assertEqual(list(Notification.objects.values_list('record_type', flat=True)), [f'{CROP}_3d'])

    # --- fisheries
    def test_a_fisherfolk_gets_each_cycle_reminder_once(self):
        harvest_on = TODAY + timedelta(days=60)
        cycle = self.cycle(harvest_on)
        for days in (30, 7, 3, 0, -7):
            self.run_on(days, harvest_on)
            self.run_on(days, harvest_on)
        types = list(Notification.objects.order_by('id').values_list('record_type', flat=True))
        self.assertEqual(types, [f'{FISH}_{k}' for k in ('30d', '7d', '3d', 'today', 'overdue')])
        self.assertEqual({(n.recipient_id, n.record_id) for n in Notification.objects.all()}, {(self.fisher_user.id, cycle.id)})
        n = self.sent(f'{FISH}_7d').get()
        self.assertEqual(n.verb, 'Harvest expected in 7 days for your')
        self.assertIn('Bangus', n.record_label)
        self.assertIn('Samara', n.detail)

    def test_fisheries_staff_get_nothing(self):
        self.cycle(TODAY + timedelta(days=7))
        hr.run(TODAY)
        self.assertFalse(self.sent(recipient=self.admin).exists())

    def test_inactive_cycles_and_harvested_stock_get_nothing(self):
        self.cycle(TODAY + timedelta(days=7), cycle_status='Failed')
        self.cycle(TODAY + timedelta(days=7), status='Harvested')
        self.cycle(TODAY + timedelta(days=7), status='Total Loss')
        self.assertEqual(hr.run(TODAY), (0, 0))

    def test_a_cycle_with_several_stocks_is_reminded_once(self):
        cycle = self.cycle(TODAY + timedelta(days=7))
        StockingRecord.objects.create(
            fisherfolk=self.fisher, production_cycle=cycle, species=self.species, culture_type='Pond',
            date_stocked=TODAY - timedelta(days=100), number_of_fingerlings=100, season='Dry', year=2026)
        StockingRecord.objects.filter(production_cycle=cycle).update(expected_harvest_date=TODAY + timedelta(days=7))
        self.assertEqual(hr.run(TODAY), (1, 1))

    def test_crop_and_fisheries_with_the_same_id_do_not_block_each_other(self):
        self.crop(TODAY + timedelta(days=7))
        self.cycle(TODAY + timedelta(days=7))
        self.assertEqual(hr.run(TODAY), (2, 2))

    # --- the command, dry run and the once-a-day trigger
    def test_commands_send_and_dry_run_saves_nothing(self):
        self.crop(TODAY + timedelta(days=7))
        self.cycle(TODAY + timedelta(days=7))
        out = StringIO()
        call_command('send_harvest_reminders', date=TODAY.isoformat(), dry_run=True, stdout=out)
        self.assertIn('Would send 2 reminder event(s) as 2 notification(s)', out.getvalue())
        self.assertEqual(Notification.objects.count(), 0)
        call_command('send_harvest_reminders', date=TODAY.isoformat(), stdout=out)
        self.assertEqual(Notification.objects.count(), 2)
        # the old fisheries command still works and finds nothing more to send
        out = StringIO()
        call_command('send_fisheries_harvest_reminders', date=TODAY.isoformat(), stdout=out)
        self.assertIn('Sent 0 reminder event(s)', out.getvalue())
        self.assertEqual(Notification.objects.count(), 2)

    def test_the_fisheries_command_only_does_fisheries(self):
        self.crop(TODAY + timedelta(days=7))
        self.cycle(TODAY + timedelta(days=7))
        call_command('send_fisheries_harvest_reminders', date=TODAY.isoformat(), stdout=StringIO())
        self.assertEqual(list(Notification.objects.values_list('record_type', flat=True)), [f'{FISH}_7d'])

    def test_a_bad_date_is_refused(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command('send_harvest_reminders', date='23/10/2026', stdout=StringIO())


class DailyTriggerTests(APITestCase):
    def setUp(self):
        hr._last_run['date'] = None
        self.user = get_user_model().objects.create_user(username='cit', password='pw', role='CITIZEN', email='c@x.test')
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000901', first_name='Ana', last_name='Lim', gender='Female',
            birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        UserLinkedRecord.objects.create(user=self.user, record_type='FARMER', record_id=farmer.id, is_active=True)
        today = timezone.localdate()
        record = CropMonitoringRecord.objects.create(
            farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=today.year, date_planted=today - timedelta(days=90), area_planted_ha='1.00')
        CropMonitoringRecord.objects.filter(pk=record.pk).update(expected_harvest_date=today + timedelta(days=7))
        self.client.force_authenticate(self.user)

    def tearDown(self):
        hr._last_run['date'] = None

    def test_the_first_notification_poll_of_the_day_creates_the_reminder_once(self):
        listed = self.client.get('/api/notifications/').data
        self.assertEqual(listed['count'], 1)
        self.assertEqual(listed['results'][0]['record_type'], f'{CROP}_7d')
        self.assertEqual(listed['unread_count'], 1)
        self.client.get('/api/notifications/')
        self.assertEqual(Notification.objects.count(), 1)

    def test_it_runs_once_a_day_per_process(self):
        from unittest import mock
        with mock.patch.object(hr, 'run') as run:
            self.client.get('/api/notifications/')
            self.client.get('/api/notifications/')
        self.assertEqual(run.call_count, 1)

    def test_a_failure_never_breaks_the_poll_and_is_retried(self):
        from unittest import mock
        with mock.patch.object(hr, 'run', side_effect=RuntimeError('boom')) as run:
            r = self.client.get('/api/notifications/')
            self.client.get('/api/notifications/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(run.call_count, 2)   # not marked as done, so the next poll tries again
