"""Assistance is scheduled, not confirmed: every new distribution says where and when it is claimed; recipients with accounts are
told straight away; it shows Scheduled until that time and Received after it, with nobody confirming; staff or the cooperative
can take an unclaimed person off; and the old confirmation actions are gone."""
from datetime import datetime, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.urls import Resolver404, resolve
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Notification
from interventions.models import DistributionStatus
from interventions.test_distribution_history import DOMAINS, make_citizen, make_org, make_person

User = get_user_model()

URLS = {
    'farmers': dict(adhoc='/api/interventions/beneficiaries/adhoc/', bulk='/api/interventions/beneficiaries/adhoc/bulk/',
                    ids='farmer_ids', mine='/api/interventions/my-beneficiary-history/', staff='/api/interventions/beneficiaries/distributions/',
                    detail='/api/interventions/beneficiaries/{}/detail/', person_link='FARMER'),
    'fisherfolk': dict(adhoc='/api/interventions/fisherfolk-beneficiaries/adhoc/', bulk='/api/interventions/fisherfolk-beneficiaries/adhoc/bulk/',
                       ids='fisherfolk_ids', mine='/api/interventions/my-fisherfolk-beneficiary-history/',
                       staff='/api/interventions/fisherfolk-beneficiaries/distributions/',
                       detail='/api/interventions/fisherfolk-beneficiaries/{}/detail/', person_link='FISHERFOLK'),
}


def today():
    return timezone.localdate()


def at(day, hour, minute=0):
    """An aware moment on `day` at hour:minute, in the office's time zone."""
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


def body(domain, **over):
    data = {'assistance_type': DOMAINS[domain]['type'], 'source_agencies': ['DA'], 'quantity': '2 sacks',
            'date_given': (today() + timedelta(days=1)).isoformat(), 'distribution_time': '09:00',
            'distribution_place': 'Barangay Hall, Alaska'}
    data.update(over)
    return data


class ScheduleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='sch-admin', password='pw', role='ADMIN', email='sch@x.test')
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], f'Sched {domain}')
            people = [make_person(domain, n) for n in ('Ana', 'Ben')]
            for person in people:
                cfg['member'].objects.create(organization=org, date_joined=today(), is_main=True, **{cfg['person_field']: person})
            account = make_citizen(f'sch-{domain}', URLS[domain]['person_link'], people[0].id)   # Ana has an account, Ben does not
            cls.ctx[domain] = dict(org=org, people=people, account=account, org_user=make_citizen(f'sch-org-{domain}', cfg['link'], org.id))

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def give(self, domain, **over):
        """One scheduled assistance for Ana, made by staff."""
        person = self.ctx[domain]['people'][0]
        response = self.client.post(URLS[domain]['adhoc'], body(domain, **{DOMAINS[domain]['person_field']: person.id}, **over), format='json')
        self.assertEqual(response.status_code, 201, (domain, response.content))
        return DOMAINS[domain]['record'].objects.get(pk=response.json()['id'])

    def notices(self, domain):
        return list(Notification.objects.filter(recipient=self.ctx[domain]['account']).order_by('id'))

    # ── where and when are required ─────────────────────────────────────────

    def test_a_new_record_needs_a_place_and_a_time(self):
        for domain, cfg in DOMAINS.items():
            person = self.ctx[domain]['people'][0]
            for missing in ('distribution_place', 'distribution_time'):
                data = body(domain, **{cfg['person_field']: person.id})
                data.pop(missing)
                response = self.client.post(URLS[domain]['adhoc'], data, format='json')
                self.assertEqual(response.status_code, 400, (domain, missing, response.content))
                self.assertIn(missing, response.json(), (domain, missing))
            response = self.client.post(URLS[domain]['adhoc'], body(domain, **{cfg['person_field']: person.id}, distribution_place='   '), format='json')
            self.assertEqual(response.status_code, 400, (domain, response.content))
            self.assertFalse(cfg['record'].objects.exists(), domain)

    def test_giving_to_several_people_or_a_cooperative_needs_them_too(self):
        for domain, cfg in DOMAINS.items():
            ids = [p.id for p in self.ctx[domain]['people']]
            for url, data in ((URLS[domain]['bulk'], body(domain, **{URLS[domain]['ids']: ids})),
                              (cfg['distribute'].format(self.ctx[domain]['org'].id), body(domain))):
                data.pop('distribution_place')
                response = self.client.post(url, data, format='json')
                self.assertEqual(response.status_code, 400, (domain, url, response.content))
                self.assertIn('distribution_place', response.json(), (domain, url))
            self.assertFalse(cfg['record'].objects.exists(), domain)

    def test_place_and_time_are_saved_and_shown(self):
        for domain, cfg in DOMAINS.items():
            response = self.client.post(cfg['distribute'].format(self.ctx[domain]['org'].id), body(domain), format='json')
            self.assertEqual(response.status_code, 200, (domain, response.content))
            for record in cfg['record'].objects.all():
                self.assertEqual((record.distribution_place, record.distribution_time), ('Barangay Hall, Alaska', time(9, 0)), domain)
            row = self.client.get(URLS[domain]['staff']).json()['results'][0]
            self.assertEqual((row['distribution_place'], row['distribution_time']), ('Barangay Hall, Alaska', '09:00'), domain)

    # ── Scheduled, then Received by itself ──────────────────────────────────

    def test_it_is_scheduled_until_the_time_and_received_after_it(self):
        for domain, cfg in DOMAINS.items():
            day = today() + timedelta(days=1)
            record = self.give(domain, date_given=day.isoformat(), distribution_time='14:00')
            self.assertEqual(record.status, DistributionStatus.PENDING, domain)
            self.assertEqual(record.get_status_display(), 'Scheduled', domain)
            for moment, expected in ((at(day, 13, 59), 'PENDING'), (at(day, 14, 0), 'CONFIRMED')):
                with mock.patch('django.utils.timezone.now', return_value=moment):
                    rows = self.client.get(URLS[domain]['staff']).json()['results']
                self.assertEqual(rows[0]['members'][0]['status'], expected, (domain, moment))
            record.refresh_from_db()
            self.assertEqual(record.get_status_display(), 'Received', domain)
            self.assertIsNone(record.confirmed_at, domain)   # nobody confirmed it
            record.delete()

    def test_a_time_already_past_today_is_received_at_once(self):
        for domain in DOMAINS:
            record = self.give(domain, date_given=today().isoformat(), distribution_time='00:00')
            self.assertEqual(record.status, DistributionStatus.CONFIRMED, domain)

    def test_the_recipient_sees_it_received_when_the_time_has_passed(self):
        for domain in DOMAINS:
            day = today() + timedelta(days=1)
            self.give(domain, date_given=day.isoformat())
            self.client.force_authenticate(self.ctx[domain]['account'])
            with mock.patch('django.utils.timezone.now', return_value=at(day, 9, 1)):
                mine = self.client.get(URLS[domain]['mine']).json()
            self.assertEqual([r['status'] for r in mine], ['CONFIRMED'], domain)
            self.assertEqual((mine[0]['distribution_place'], mine[0]['distribution_time'][:5]), ('Barangay Hall, Alaska', '09:00'), domain)
            self.client.force_authenticate(self.staff)

    def test_moving_the_schedule_moves_the_status_back_and_tells_the_recipient(self):
        for domain in DOMAINS:
            record = self.give(domain, date_given=today().isoformat(), distribution_time='00:00')
            later = (today() + timedelta(days=3)).isoformat()
            response = self.client.patch(URLS[domain]['detail'].format(record.id), {'date_given': later, 'distribution_place': 'Municipal Gym'}, format='json')
            self.assertEqual(response.status_code, 200, (domain, response.content))
            record.refresh_from_db()
            self.assertEqual(record.status, DistributionStatus.PENDING, domain)
            self.assertIn('Municipal Gym', self.notices(domain)[-1].detail, domain)
            self.assertEqual(self.notices(domain)[-1].verb, 'changed the schedule of your assistance:', domain)

    def test_the_place_cannot_be_emptied(self):
        for domain in DOMAINS:
            record = self.give(domain)
            response = self.client.patch(URLS[domain]['detail'].format(record.id), {'distribution_place': ''}, format='json')
            self.assertEqual(response.status_code, 400, (domain, response.content))

    # ── telling the recipient ───────────────────────────────────────────────

    def test_a_recipient_with_an_account_is_told_where_and_when_straight_away(self):
        for domain in DOMAINS:
            self.give(domain)
            [notice] = self.notices(domain)
            self.assertEqual(notice.verb, 'scheduled assistance for you:', domain)
            day = today() + timedelta(days=1)
            self.assertIn(f'claim it on {day:%b} {day.day}, {day.year} at 9:00 AM, Barangay Hall, Alaska', notice.detail, domain)
            self.assertIn('2 sacks', notice.detail, domain)

    def test_a_cooperative_distribution_tells_each_member_with_an_account_once(self):
        for domain, cfg in DOMAINS.items():
            self.client.post(cfg['distribute'].format(self.ctx[domain]['org'].id), body(domain), format='json')
            self.assertEqual(len(self.notices(domain)), 1, domain)

    def test_a_cash_amount_saved_as_a_plain_number_reads_as_pesos(self):
        for domain in DOMAINS:
            record = self.give(domain, assistance_type='Cash Assistance', quantity='500')
            self.assertTrue(self.notices(domain)[-1].detail.startswith('₱500 — claim it on '), (domain, self.notices(domain)[-1].detail))
            record.delete()

    def test_nothing_more_is_sent_when_the_time_passes(self):
        for domain in DOMAINS:
            day = today() + timedelta(days=1)
            self.give(domain, date_given=day.isoformat())
            self.client.force_authenticate(self.ctx[domain]['account'])
            with mock.patch('django.utils.timezone.now', return_value=at(day, 10)):
                self.client.get('/api/accounts/me/')
                self.client.get(URLS[domain]['mine'])
            self.assertEqual(len(self.notices(domain)), 1, domain)
            self.client.force_authenticate(self.staff)

    # ── taking an unclaimed person off ──────────────────────────────────────

    def remove(self, domain, record, user):
        self.client.force_authenticate(user)
        crop = 'crop' if domain == 'farmers' else 'fisheries'
        return self.client.post('/api/interventions/assistance-removals/', {'domain': crop, 'record_ids': [record.id]}, format='json')

    def test_a_scheduled_person_can_be_removed_and_is_told(self):
        for domain in DOMAINS:
            record = self.give(domain)
            response = self.remove(domain, record, self.staff)
            self.assertEqual(response.json()['removed'], [record.id], domain)
            self.assertEqual(self.notices(domain)[-1].verb, 'removed you from a scheduled distribution:', domain)

    def test_an_unclaimed_received_entry_can_still_be_removed_without_a_notice(self):
        for domain in DOMAINS:
            record = self.give(domain, date_given=today().isoformat(), distribution_time='00:00')
            response = self.remove(domain, record, self.staff)
            self.assertEqual(response.json()['removed'], [record.id], domain)
            self.assertEqual(len(self.notices(domain)), 1, domain)   # only the first notice
            self.client.force_authenticate(self.staff)

    def test_a_receipt_somebody_confirmed_before_stays(self):
        for domain, cfg in DOMAINS.items():
            record = self.give(domain, date_given=today().isoformat(), distribution_time='00:00')
            cfg['record'].objects.filter(pk=record.pk).update(confirmed_at=timezone.now())
            response = self.remove(domain, record, self.staff)
            self.assertEqual((response.json()['removed'], [k['id'] for k in response.json()['kept']]), ([], [record.id]), domain)
            self.client.force_authenticate(self.staff)

    def test_a_cooperative_removes_what_it_recorded_even_after_the_time(self):
        for domain, cfg in DOMAINS.items():
            self.client.force_authenticate(self.ctx[domain]['org_user'])
            response = self.client.post(cfg['distribute'].format(self.ctx[domain]['org'].id),
                                        body(domain, date_given=today().isoformat(), distribution_time='00:00'), format='json')
            self.assertEqual(response.status_code, 200, (domain, response.content))
            record = cfg['record'].objects.order_by('id').first()
            self.assertEqual(self.remove(domain, record, self.ctx[domain]['org_user']).json()['removed'], [record.id], domain)
            self.client.force_authenticate(self.staff)


class ConfirmationIsGoneTests(APITestCase):
    def test_the_confirmation_addresses_are_gone(self):
        for path in (
            'beneficiaries/1/confirm-received/', 'beneficiaries/1/report-not-received/', 'beneficiaries/1/mark-resolved/',
            'fisherfolk-beneficiaries/1/confirm-received/', 'fisherfolk-beneficiaries/1/report-not-received/',
            'fisherfolk-beneficiaries/1/mark-resolved/', 'my-org-accountless-confirmables/', 'my-org-fisherfolk-accountless-confirmables/',
            'beneficiaries/confirm-on-behalf/', 'fisherfolk-beneficiaries/confirm-on-behalf/', 'beneficiaries/1/confirm-on-behalf/',
            'fisherfolk-beneficiaries/1/confirm-on-behalf/', 'beneficiary-confirmation-requests/', 'fisherfolk-beneficiary-confirmation-requests/',
        ):
            with self.assertRaises(Resolver404, msg=path):
                resolve(f'/api/interventions/{path}')

    def test_the_earlier_confirmation_history_can_still_be_read(self):
        for path in ('confirmed-for-members/farmers/1/', 'confirmed-for-members/farmers/1/assistances/'):
            resolve(f'/api/interventions/{path}')
