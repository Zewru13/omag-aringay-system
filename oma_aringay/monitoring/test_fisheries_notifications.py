"""Fisheries notifications: Production Cycle Started, Force Harvest Recorded, 7-/3-day harvest reminders and the
Fisherfolk disaster report notification to Admin. All built on core.models.Notification.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date, timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.models import Notification
from fisheries import notifications as fn
from fisheries.models import FisheriesDisasterReport, Fisherfolk, Pond, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import AquacultureHealthLog, AquacultureProductionCycle, AquacultureProductionUnit

_RSBSA = itertools.count(900001)


def _rsbsa():
    """A unique, well-formed RSBSA number: every fisherfolk now needs one."""
    return '01-033-02-019-%06d' % next(_RSBSA)


REMINDER_7D = 'fisheries_harvest_reminder_7d'
REMINDER_3D = 'fisheries_harvest_reminder_3d'
CYCLES = '/api/monitoring/aquaculture-cycles/'
STOCKING = '/api/fisheries/stocking/'
GENERAL_DISASTERS = '/api/monitoring/fisherfolk-disasters/'


class FisheriesNotificationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='admin1', password='pw', role='ADMIN', email='a1@x.test', full_name='Ana Admin')
        cls.admin2 = User.objects.create_user(username='admin2', password='pw', role='ADMIN', email='a2@x.test', full_name='Ben Admin')
        cls.evaluator = User.objects.create_user(username='eval1', password='pw', role='EVALUATOR', email='e1@x.test', full_name='Eva Evaluator')
        cls.inactive_admin = User.objects.create_user(username='admin3', password='pw', role='ADMIN', email='a3@x.test', is_active=False)
        make = lambda first, last: Fisherfolk.objects.create(
            first_name=first, middle_name='', last_name=last, gender='Female', birthdate=date(1985, 5, 5),
            barangay='Samara', fisherfolk_type='Aquaculture', rsbsa_number=_rsbsa())
        cls.ff_a, cls.ff_b = make('Felicitas', 'Manabat'), make('Pablo', 'Dulay')
        Pond.objects.create(fisherfolk=cls.ff_a, name='Pond 1')   # a disaster can only be logged by a fisherfolk with a pond

        def citizen(ff, name):
            u = User.objects.create_user(username=name, password='pw', role='CITIZEN', email=f'{name}@x.test', full_name=ff.full_name)
            UserLinkedRecord.objects.create(user=u, record_type=User.LinkedRecordType.FISHERFOLK, record_id=ff.id, is_active=True)
            return u
        cls.user_a, cls.user_b = citizen(cls.ff_a, 'ffa'), citizen(cls.ff_b, 'ffb')
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Bangus', defaults=dict(
            category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg=0.25))

    # ── helpers ──
    def as_(self, user):
        self.client.force_authenticate(user)

    def start_cycle(self, user=None, ponds=2, **over):
        self.as_(user or self.admin)
        data = {
            'fisherfolk': self.ff_a.id, 'cycle_name': 'Grow-out Phase', 'species_farmed': 'Bangus',
            'species_option': self.species.id, 'ownership': 'Owner', 'culture_system': 'Fishpond', 'pond_location_barangay': 'Samara',
            'water_source': 'River', 'stocking_date': str(date.today() - timedelta(days=1)),
            'units': [{'length_m': 10, 'width_m': 5, 'fingerling_count': 100} for _ in range(ponds)],
        }
        data.update(over)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(CYCLES, data, format='json')

    def units(self, cycle_id):
        return list(AquacultureProductionUnit.objects.filter(production_cycle_id=cycle_id).order_by('unit_number'))

    def affect(self, cycle_id, unit, observation='Fish Mortality', mortality=4):
        AquacultureHealthLog.objects.create(production_cycle_id=cycle_id, production_unit=unit, log_date=date.today(),
                                            observation=observation, mortality_count=mortality)

    def force_harvest(self, stock, kg_by_unit, user=None, **extra):
        self.as_(user or self.admin)
        body = {'harvest_date': str(date.today()), 'notes': '',
                'unit_quantities': [{'production_unit': u.id, 'quantity_kg': kg} for u, kg in kg_by_unit]}
        body.update(extra)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f'{STOCKING}{stock.id}/harvests/', body, format='json')

    def notes(self, record_type, **f):
        return Notification.objects.filter(record_type=record_type, **f)

    def reminders(self, on_date):
        out = StringIO()
        call_command('send_fisheries_harvest_reminders', date=on_date.isoformat(), stdout=out)
        return out.getvalue()

    # ── A. Production Cycle Started ──
    def test_cycle_started_notifies_owner_and_staff_with_cycle_details(self):
        r = self.start_cycle()
        self.assertEqual(r.status_code, 201, r.data)
        cid = r.data['id']
        stock = StockingRecord.objects.get(production_cycle_id=cid)
        mine = self.notes(fn.CYCLE_STARTED, recipient=self.user_a)
        self.assertEqual(mine.count(), 1)
        n = mine.get()
        self.assertEqual((n.record_id, n.actor_id), (cid, self.admin.id))
        self.assertIn('Bangus', n.record_label)
        self.assertIn('Cycle #1', n.record_label)
        self.assertNotIn('Felicitas', n.record_label)                       # their own wording
        self.assertIn('Fishpond', n.detail)
        self.assertIn(stock.expected_harvest_date.strftime('%b %d, %Y'), n.detail)
        staff = self.notes(fn.CYCLE_STARTED)
        self.assertEqual(set(staff.exclude(recipient=self.user_a).values_list('recipient_id', flat=True)),
                         {self.admin2.id, self.evaluator.id})              # the acting admin and inactive accounts excluded
        self.assertIn('for Felicitas Manabat', staff.get(recipient=self.admin2).record_label)
        self.assertFalse(self.notes(fn.CYCLE_STARTED, recipient=self.user_b).exists())

    def test_fisherfolk_starting_own_cycle_is_notified_and_staff_too(self):
        r = self.start_cycle(user=self.user_a, fisherfolk=self.ff_b.id)        # a foreign id is ignored (own record forced)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.notes(fn.CYCLE_STARTED, recipient=self.user_a).count(), 1)
        self.assertEqual(self.notes(fn.CYCLE_STARTED, recipient=self.admin).count(), 1)
        self.assertFalse(self.notes(fn.CYCLE_STARTED, recipient=self.user_b).exists())

    def test_failed_cycle_creation_creates_no_notification(self):
        r = self.start_cycle(culture_system='Fishpen', units=[])
        self.assertEqual(r.status_code, 400)
        r = self.start_cycle(units=[])                                         # Fishpond without ponds
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Notification.objects.count(), 0)

    # ── B. Force Harvest ──
    def _two_affected_ponds(self, ponds=2):
        cid = self.start_cycle(ponds=ponds).data['id']
        Notification.objects.all().delete()          # isolate this test's harvest notifications (test DB only)
        units = self.units(cid)
        self.affect(cid, units[0], 'Fungal Infection', 0)
        self.affect(cid, units[1], 'Fish Mortality', 6)
        return cid, units, StockingRecord.objects.get(production_cycle_id=cid)

    def test_force_harvest_creates_one_notification_per_recipient_with_units_and_reason(self):
        cid, (p1, p2, p3), stock = self._two_affected_ponds(ponds=3)
        r = self.force_harvest(stock, [(p1, '5'), (p2, '5')])
        self.assertEqual(r.status_code, 201, r.data)
        mine = self.notes(fn.FORCE_HARVEST, recipient=self.user_a)
        self.assertEqual(mine.count(), 1)                                      # ONE for the event, not one per pond
        n = mine.get()
        self.assertEqual(n.record_id, cid)
        self.assertIn('Pond 1, Pond 2', n.detail)
        self.assertIn('10.00 kg', n.detail)
        self.assertIn('Fungal Infection; Fish Mortality', n.detail)
        self.assertEqual(set(self.notes(fn.FORCE_HARVEST).exclude(recipient=self.user_a).values_list('recipient_id', flat=True)),
                         {self.admin2.id, self.evaluator.id})
        self.assertIn('Felicitas Manabat', self.notes(fn.FORCE_HARVEST, recipient=self.admin2).get().record_label)
        # no second, generic "recorded a harvest" message for the owner
        self.assertFalse(Notification.objects.filter(recipient=self.user_a, record_type='stocking').exists())
        self.assertFalse(self.notes(fn.FORCE_HARVEST, recipient=self.user_b).exists())

    def test_retried_or_failed_force_harvest_creates_no_extra_notification(self):
        cid, (p1, p2), stock = self._two_affected_ponds()
        future = str(date.today() + timedelta(days=2))
        self.assertEqual(self.force_harvest(stock, [(p1, '5'), (p2, '5')], harvest_date=future).status_code, 400)
        self.assertEqual(self.force_harvest(stock, [(p1, '0'), (p2, '5')]).status_code, 400)
        self.assertEqual(Notification.objects.count(), 0)                      # failed requests notify no one
        self.assertEqual(self.force_harvest(stock, [(p1, '5'), (p2, '5')]).status_code, 201)
        total = Notification.objects.count()
        self.assertEqual(self.force_harvest(stock, [(p1, '5'), (p2, '5')]).status_code, 400)   # the same request again
        self.assertEqual(Notification.objects.count(), total)

    def test_fisherfolk_recording_own_force_harvest_notifies_staff(self):
        cid, (p1, p2), stock = self._two_affected_ponds()
        self.assertEqual(self.force_harvest(stock, [(p1, '3')], user=self.user_a).status_code, 201)
        self.assertEqual(self.notes(fn.FORCE_HARVEST, recipient=self.admin).count(), 1)
        self.assertEqual(self.notes(fn.FORCE_HARVEST, recipient=self.user_a).count(), 1)

    def test_normal_harvest_keeps_its_existing_notification(self):
        stock = StockingRecord.objects.create(fisherfolk=self.ff_a, species=self.species, date_stocked=date.today() - timedelta(days=100),
                                              number_of_fingerlings=100, culture_type='Pond', season='Wet', year=date.today().year)
        self.as_(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(f'{STOCKING}{stock.id}/harvests/', {'harvest_date': str(date.today()), 'quantity_kg': '40',
                                                                     'is_final': True, 'early_late_reason': 'Buyer demand'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Notification.objects.filter(recipient=self.user_a, record_type='stocking', verb='recorded a harvest for').count(), 1)
        self.assertFalse(self.notes(fn.FORCE_HARVEST).exists())

    def test_many_units_are_summarized_compactly(self):
        labels = [f'Pond {i}' for i in range(1, 11)]
        self.assertEqual(fn.units_summary(labels[:3]), 'Pond 1, Pond 2, Pond 3')
        self.assertEqual(fn.units_summary(labels), 'Pond 1, Pond 2, Pond 3, Pond 4 +6 more')

    # ── C/D. Harvest reminders ──
    def _cycle_with_harvest_date(self):
        cid = self.start_cycle().data['id']
        Notification.objects.all().delete()
        stock = StockingRecord.objects.get(production_cycle_id=cid)
        return cid, stock, stock.expected_harvest_date

    def test_seven_day_reminder_once(self):
        cid, stock, harvest_on = self._cycle_with_harvest_date()
        self.reminders(harvest_on - timedelta(days=8))                          # not yet due
        self.assertEqual(Notification.objects.count(), 0)
        out = self.reminders(harvest_on - timedelta(days=7))
        self.assertIn('Sent 1 reminder event', out)
        self.assertEqual(self.notes(REMINDER_7D, recipient=self.user_a, record_id=cid).count(), 1)
        self.assertFalse(self.notes(REMINDER_7D, recipient__in=[self.admin, self.evaluator, self.inactive_admin]).exists())   # owner only
        n = self.notes(REMINDER_7D, recipient=self.user_a).get()
        self.assertIsNone(n.actor_id)                                         # an automatic reminder
        self.assertIn('7 days', n.verb)
        self.assertIn(harvest_on.strftime('%b %d, %Y'), n.detail)
        before = Notification.objects.count()
        self.reminders(harvest_on - timedelta(days=7))                          # the same day again
        self.reminders(harvest_on - timedelta(days=7))
        self.assertEqual(Notification.objects.count(), before)

    def test_three_day_reminder_once(self):
        cid, stock, harvest_on = self._cycle_with_harvest_date()
        self.reminders(harvest_on - timedelta(days=3))
        self.reminders(harvest_on - timedelta(days=3))
        self.assertEqual(self.notes(REMINDER_3D, recipient=self.user_a, record_id=cid).count(), 1)
        self.assertFalse(self.notes(REMINDER_3D, recipient=self.admin).exists())
        self.assertFalse(self.notes(REMINDER_7D).exists())

    def test_moved_harvest_date_does_not_repeat_a_sent_reminder(self):
        cid, stock, harvest_on = self._cycle_with_harvest_date()
        self.reminders(harvest_on - timedelta(days=7))
        StockingRecord.objects.filter(pk=stock.pk).update(expected_harvest_date=harvest_on + timedelta(days=10))
        self.reminders(harvest_on + timedelta(days=3))                          # 7 days before the NEW date
        self.assertEqual(self.notes(REMINDER_7D, recipient=self.user_a).count(), 1)
        self.reminders(harvest_on + timedelta(days=7))                          # 3 days before the new date
        self.assertEqual(self.notes(REMINDER_3D, recipient=self.user_a).count(), 1)

    def test_dry_run_saves_nothing(self):
        cid, stock, harvest_on = self._cycle_with_harvest_date()
        out = StringIO()
        call_command('send_fisheries_harvest_reminders', date=(harvest_on - timedelta(days=7)).isoformat(), dry_run=True, stdout=out)
        self.assertIn('Would send 1 reminder event', out.getvalue())
        self.assertEqual(Notification.objects.count(), 0)

    # ── E/F. Completed vs partial cycles ──
    def test_no_reminder_after_the_cycle_is_fully_harvested(self):
        cid, (p1, p2), stock = self._two_affected_ponds()
        harvest_on = stock.expected_harvest_date
        self.assertEqual(self.force_harvest(stock, [(p1, '5'), (p2, '5')]).status_code, 201)   # every pond -> final
        stock.refresh_from_db()
        self.assertEqual(stock.status, StockingRecord.Status.HARVESTED)
        self.reminders(harvest_on - timedelta(days=7))
        self.reminders(harvest_on - timedelta(days=3))
        self.assertFalse(Notification.objects.filter(record_type__in=(REMINDER_7D, REMINDER_3D)).exists())

    def test_partially_harvested_cycle_still_gets_reminders(self):
        cid, (p1, p2), stock = self._two_affected_ponds()
        harvest_on = stock.expected_harvest_date
        self.assertEqual(self.force_harvest(stock, [(p1, '5')]).status_code, 201)            # Pond 2 still growing
        stock.refresh_from_db()
        self.assertNotEqual(stock.status, StockingRecord.Status.HARVESTED)
        self.reminders(harvest_on - timedelta(days=7))
        self.assertEqual(self.notes(REMINDER_7D, recipient=self.user_a).count(), 1)

    def test_inactive_cycle_or_total_loss_gets_no_reminder(self):
        cid, stock, harvest_on = self._cycle_with_harvest_date()
        AquacultureProductionCycle.objects.filter(pk=cid).update(status='Failed')
        self.reminders(harvest_on - timedelta(days=7))
        self.assertEqual(Notification.objects.count(), 0)

    # ── G/H. Ownership and Admin visibility through the existing API ──
    def test_each_account_sees_only_its_own_notifications(self):
        self.start_cycle()                                                     # for Felicitas (A)
        self.as_(self.user_b)
        listed = self.client.get('/api/notifications/').data
        self.assertEqual(listed['count'], 0)
        mine_id = self.notes(fn.CYCLE_STARTED, recipient=self.user_a).get().id
        self.assertEqual(self.client.post(f'/api/notifications/{mine_id}/read/').status_code, 404)
        self.as_(self.user_a)
        listed = self.client.get('/api/notifications/').data
        self.assertEqual((listed['count'], listed['unread_count']), (1, 1))
        self.assertEqual(listed['results'][0]['record_type'], fn.CYCLE_STARTED)
        self.assertEqual(self.client.post(f'/api/notifications/{mine_id}/read/').status_code, 200)
        self.assertEqual(self.client.get('/api/notifications/').data['unread_count'], 0)
        self.as_(self.admin2)
        self.assertEqual(self.client.get('/api/notifications/').data['results'][0]['record_type'], fn.CYCLE_STARTED)

    # ── I. Date handling ──
    def test_command_uses_django_local_date(self):
        cid, stock, harvest_on = self._cycle_with_harvest_date()
        target = 'core.management.commands.send_harvest_reminders.timezone.localdate'
        with mock.patch(target, return_value=harvest_on - timedelta(days=3)) as localdate:
            call_command('send_fisheries_harvest_reminders', stdout=StringIO())
        localdate.assert_called_once()
        self.assertEqual(self.notes(REMINDER_3D, recipient=self.user_a).count(), 1)

    # ── Fisherfolk disaster -> Admin notification (existing submit-on-log path) ──
    def disaster(self, user, **over):
        self.as_(user)
        data = {'fisherfolk': self.ff_a.id, 'disaster_type': 'Flooding', 'date_of_occurrence': str(date.today()),
                'estimated_damage': 'Dike overflowed', 'volume_lost_kg': '12.5', 'equipment_damaged': 'Fishpond Dike'}
        data.update(over)
        return self.client.post(GENERAL_DISASTERS, data, format='multipart')

    def test_fisherfolk_disaster_notifies_staff_once_with_details(self):
        r = self.disaster(self.user_a)
        self.assertEqual(r.status_code, 201, r.data)
        report = FisheriesDisasterReport.objects.get()
        self.assertEqual(report.submission_status, FisheriesDisasterReport.SubmissionStatus.SUBMITTED)
        rows = Notification.objects.filter(record_type='fisheries_disaster_report', record_id=report.pk)
        self.assertEqual(set(rows.values_list('recipient_id', flat=True)), {self.admin.id, self.admin2.id, self.evaluator.id})
        n = rows.get(recipient=self.admin)
        self.assertEqual(n.actor_id, self.user_a.id)
        self.assertIn('Felicitas Manabat', n.record_label)
        for part in ('Flooding', 'aquaculture equipment', date.today().strftime('%b %d, %Y'), '12.5 kg lost'):
            self.assertIn(part, n.detail)
        # a retry of the same log: one report, no second notification
        again = self.disaster(self.user_a)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(FisheriesDisasterReport.objects.count(), 1)
        self.assertEqual(rows.count(), 3)
        self.assertFalse(Notification.objects.filter(recipient__in=[self.user_a, self.user_b], record_type='fisheries_disaster_report').exists())

    def test_failed_fisherfolk_disaster_creates_no_notification(self):
        r = self.disaster(self.user_a, disaster_type='Disease Outbreak')      # not a fisherfolk disaster type
        self.assertEqual(r.status_code, 400)
        r = self.disaster(self.user_a, date_of_occurrence=str(date.today() + timedelta(days=3)))
        self.assertEqual(r.status_code, 400)
        self.assertEqual((FisheriesDisasterReport.objects.count(), Notification.objects.count()), (0, 0))

    def test_admin_logged_disaster_does_not_notify_the_admin_who_logged_it(self):
        r = self.disaster(self.admin)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertFalse(Notification.objects.filter(recipient=self.admin).exists())
        self.assertFalse(Notification.objects.filter(record_type='fisheries_disaster_report').exists())
        # existing behaviour: the affected fisherfolk is told, and so are the other staff
        self.assertTrue(Notification.objects.filter(recipient=self.user_a, record_type='fisherfolk_disaster').exists())
        self.assertFalse(Notification.objects.filter(recipient=self.user_b).exists())
