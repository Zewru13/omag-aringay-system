"""What a crop's schedule suggests, using common sense about setup work.

Land Preparation and Planting (and the other set-up steps that happen before or at planting) are done once. When the
farmer has recorded one, it is done, however many days before or after the schedule it happened, and every step of that
activity is done with it. One that was never recorded stops being suggested once its time is over (the crop is in the
ground), instead of staying "overdue" for the rest of the season. Ordinary steps keep the old rule."""
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

    # ── something recorded is done, whenever it was done ─────────────────────

    def test_recorded_setup_activities_are_done_even_when_done_outside_the_window(self):
        record = self.record(40, [('Land Preparation', -8), ('Planting', 0)])   # prepared a week before planting
        got = self.statuses(record)
        self.assertEqual(got[('Land Preparation', 0)], 'done')
        self.assertEqual(got[('Planting', 1)], 'done')
        self.assertEqual(got[('Planting', 7)], 'done')   # one Planting log covers every Planting step

    def test_a_recorded_setup_activity_is_done_for_every_step_of_the_same_name_only(self):
        got = self.statuses(self.record(40, [('Land Preparation', -3)]))
        self.assertEqual(got[('Land Preparation', 0)], 'done')
        self.assertNotEqual(got[('Seed Soaking', 1)], 'done')      # a different activity
        self.assertNotEqual(got[('Planting', 1)], 'done')

    # ── something never recorded stops being suggested once its time has passed ─

    def test_an_unrecorded_setup_activity_is_not_overdue_long_after_planting(self):
        got = self.statuses(self.record(40))
        for key in (('Land Preparation', 0), ('Seed Soaking', 1), ('Planting', 1), ('Planting', 7)):
            self.assertEqual(got[key], 'passed', key)

    def test_ordinary_steps_still_become_overdue(self):
        got = self.statuses(self.record(40))
        self.assertEqual(got[('Fertilizer Application', 10)], 'overdue')
        self.assertEqual(got[('Weeding', 20)], 'overdue')

    def test_an_unrecorded_setup_activity_is_still_suggested_while_its_time_is_on(self):
        got = self.statuses(self.record(3))
        self.assertEqual(got[('Land Preparation', 0)], 'due_now')
        self.assertEqual(got[('Planting', 1)], 'due_now')
        self.assertEqual(got[('Planting', 7)], 'upcoming')

    def test_ordinary_steps_are_done_by_a_log_inside_their_window_as_before(self):
        got = self.statuses(self.record(12, [('Fertilizer Application', 10)]))
        self.assertEqual(got[('Fertilizer Application', 10)], 'done')
        self.assertEqual(got[('Weeding', 20)], 'upcoming')

    # ── the dashboard counts and the yield analysis follow the same rule ─────

    def test_the_dashboard_does_not_count_a_passed_setup_step_as_overdue(self):
        self.record(40)
        totals, _ = crop_activity_status()
        self.assertEqual(totals['overdue'], 2)          # Fertilizer Application and Weeding only
        self.assertEqual(totals['due_today'], 0)

    def test_the_dashboard_does_not_count_a_recorded_setup_step(self):
        self.record(40, [('Land Preparation', -8), ('Planting', 0)])
        totals, _ = crop_activity_status()
        self.assertEqual(totals['overdue'], 2)

    def test_the_yield_analysis_counts_recorded_setup_steps_as_completed(self):
        record = self.record(40, [('Land Preparation', -8), ('Planting', 0)])
        total, completed, _, breakdown = _activity_completion(record)
        self.assertEqual(total, 6)
        self.assertEqual(completed, 3)                   # Land Preparation and both Planting steps
        self.assertEqual({(b['activity'], b['scheduled_day']) for b in breakdown if b['completed']},
                         {('Land Preparation', 0), ('Planting', 1), ('Planting', 7)})
