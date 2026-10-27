"""What a crop's schedule suggests, using common sense about setup work.

A crop is already in the ground when it is added to the system, so Land Preparation and Planting are not part of its schedule at
all: never suggested, never counted as due or overdue. The other set-up steps that happen before or at planting (flagged
allows_pre_planting) are done once: a recorded one is done however many days before or after the schedule it happened, and one
that was never recorded stops being suggested once its time is over. Ordinary steps keep the old rule."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from production.dashboard_activity import crop_activity_status
from production.models import CropActivityLog, CropActivityStage, CropMonitoringRecord, CropType
from production.views import _activity_completion

_N = itertools.count(1)


class ScheduleRulesTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='sched-admin', password='pw', role='ADMIN', email='sched@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-990001', first_name='Sched', last_name='Farmer', gender='Male',
            birthdate=date(1980, 1, 1), barangay='Alaska', civil_status='Single')
        cls.crop = CropType.objects.create(name='Schedule Rice', days_to_harvest=120)
        stage = lambda name, day, **extra: CropActivityStage.objects.create(crop_type=cls.crop, stage_name=name, day_after_planting=day, **extra)
        stage('Land Preparation', 0, allows_pre_planting=True)
        stage('Seed Soaking', 1, allows_pre_planting=True)
        stage('Planting', 1)
        stage('Planting', 7)               # a second Planting step, as some crops have
        stage('Fertilizer Application', 10)
        stage('Weeding', 20)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def record(self, age, logs=()):
        """A crop planted `age` days ago; logs = [(activity, day relative to the planting day)]."""
        planted = date.today() - timedelta(days=age)
        record = CropMonitoringRecord.objects.create(
            farmer=self.farmer, crop_type=self.crop, season='Wet', year=planted.year, date_planted=planted,
            area_planted_ha='1.00', farm_location_barangay='Alaska', land_status='Owner')
        for activity, offset in logs:
            CropActivityLog.objects.create(monitoring_record=record, activity_type=activity, date_of_activity=planted + timedelta(days=offset))
        return record

    def statuses(self, record):
        response = self.client.get(f'/api/production/monitoring/{record.id}/suggestions/')
        self.assertEqual(response.status_code, 200, response.content)
        return {(s['activity_name'], s['day_after_planting']): s['status'] for s in response.json()['suggestions']}

    # ── the crop is already planted when it is added: Land Preparation and Planting are not part of the schedule ─────

    def test_land_preparation_and_planting_are_never_suggested(self):
        for age in (3, 40):
            got = self.statuses(self.record(age))
            for key in (('Land Preparation', 0), ('Planting', 1), ('Planting', 7)):
                self.assertNotIn(key, got, (age, key))

    def test_other_setup_steps_are_still_suggested_by_the_set_up_rule(self):
        # Seed Soaking is flagged allows_pre_planting but is not Land Preparation or Planting.
        self.assertEqual(self.statuses(self.record(3))[('Seed Soaking', 1)], 'due_now')
        self.assertEqual(self.statuses(self.record(40))[('Seed Soaking', 1)], 'passed')
        self.assertEqual(self.statuses(self.record(40, [('Seed Soaking', -3)]))[('Seed Soaking', 1)], 'done')

    def test_ordinary_steps_still_become_overdue(self):
        got = self.statuses(self.record(40))
        self.assertEqual(got[('Fertilizer Application', 10)], 'overdue')
        self.assertEqual(got[('Weeding', 20)], 'overdue')

    def test_ordinary_steps_are_done_by_a_log_inside_their_window_as_before(self):
        got = self.statuses(self.record(12, [('Fertilizer Application', 10)]))
        self.assertEqual(got[('Fertilizer Application', 10)], 'done')
        self.assertEqual(got[('Weeding', 20)], 'upcoming')

    # ── the dashboard counts and the yield analysis leave them out too ─────

    def test_the_dashboard_counts_only_the_remaining_steps(self):
        self.record(40)
        totals, _ = crop_activity_status()
        self.assertEqual(totals['overdue'], 2)          # Fertilizer Application and Weeding only
        self.assertEqual(totals['due_today'], 0)

    def test_the_dashboard_does_not_count_land_preparation_or_planting_while_their_time_is_on(self):
        self.record(3)
        totals, _ = crop_activity_status()
        self.assertEqual(totals['due_today'], 1)        # Seed Soaking only

    def test_the_yield_analysis_does_not_count_land_preparation_or_planting(self):
        record = self.record(40)
        total, completed, _, breakdown = _activity_completion(record)
        self.assertEqual(total, 3)                       # Seed Soaking, Fertilizer Application, Weeding
        self.assertEqual(completed, 0)
        self.assertEqual({b['activity'] for b in breakdown}, {'Seed Soaking', 'Fertilizer Application', 'Weeding'})
