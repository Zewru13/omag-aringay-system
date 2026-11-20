"""Staff are warned when the same person already got the same type of assistance within 30 days (audit 2026-11-20).

It is a warning, not a block: the person can still be given it again once the staff member confirms. (Another ORGANIZATION giving the
same type within 30 days stays a hard block; that rule is in associations and is not touched here.)

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()
DOMAINS = {
    'crop': dict(bulk='/api/interventions/beneficiaries/adhoc/bulk/', adhoc='/api/interventions/beneficiaries/adhoc/', ids='farmer_ids',
                 person='farmer', record=BeneficiaryRecord, kind='Seeds', other_kind='Fertilizer'),
    'fisheries': dict(bulk='/api/interventions/fisherfolk-beneficiaries/adhoc/bulk/', adhoc='/api/interventions/fisherfolk-beneficiaries/adhoc/',
                      ids='fisherfolk_ids', person='fisherfolk', record=FisherfolkBeneficiaryRecord, kind='Feed', other_kind='Fishing Gear'),
}


class RecentAssistanceWarningTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='ra-admin', password='pw', role='ADMIN', email='ra-admin@x.test')
        n = next(_N)
        cls.people = {
            'crop': [Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (974000 + n * 10 + i), first_name=f'Far{i}', last_name='Recent',
                                           gender='Male', birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single') for i in range(2)],
            'fisheries': [Fisherfolk.objects.create(rsbsa_number='01-033-02-019-%06d' % (975000 + n * 10 + i), first_name=f'Fish{i}', last_name='Recent',
                                                    gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland') for i in range(2)],
        }

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.today = timezone.localdate()

    def earlier(self, domain, person, days_ago, kind=None, status=None):
        cfg = DOMAINS[domain]
        record = cfg['record'].objects.create(assistance_type=kind or cfg['kind'], source_agencies=['DA'], date_given=self.today - timedelta(days=days_ago),
                                              quantity='5 bags', **{cfg['person']: person})
        if status:
            cfg['record'].objects.filter(pk=record.pk).update(status=status)
        return record

    def body(self, domain, people, **over):
        cfg = DOMAINS[domain]
        data = {cfg['ids']: [p.id for p in people], 'assistance_type': cfg['kind'], 'source_agencies': ['DA'], 'quantity': '2 bags',
                'date_given': self.today.isoformat()}
        data.update(over)
        return data

    def rows(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        return {r['person_id']: r for r in response.json()['results']}

    def test_the_preview_warns_only_about_the_person_who_got_it_recently(self):
        for domain, (a, b) in ((d, self.people[d]) for d in DOMAINS):
            self.earlier(domain, a, 12)
            rows = self.rows(self.client.post(DOMAINS[domain]['bulk'], {**self.body(domain, [a, b]), 'dry_run': True}, format='json'))
            self.assertEqual(rows[a.id]['status'], 'would_create', domain)
            self.assertIn('within 30 days', rows[a.id]['warning'])
            self.assertIn('12 days', rows[a.id]['warning'])
            self.assertNotIn('warning', rows[b.id], domain)

    def test_saving_without_confirming_does_not_create_the_repeat(self):
        for domain, (a, b) in ((d, self.people[d]) for d in DOMAINS):
            cfg = DOMAINS[domain]
            self.earlier(domain, a, 5)
            rows = self.rows(self.client.post(cfg['bulk'], self.body(domain, [a, b]), format='json'))
            self.assertEqual(rows[a.id]['status'], 'needs_confirmation', domain)
            self.assertEqual(rows[b.id]['status'], 'created', domain)
            self.assertEqual(cfg['record'].objects.filter(**{cfg['person']: a}).count(), 1, 'the repeat was saved without being confirmed')

    def test_saving_with_confirmation_creates_the_repeat(self):
        for domain, (a, b) in ((d, self.people[d]) for d in DOMAINS):
            cfg = DOMAINS[domain]
            self.earlier(domain, a, 5)
            rows = self.rows(self.client.post(cfg['bulk'], {**self.body(domain, [a, b]), 'confirm_duplicate': True}, format='json'))
            self.assertEqual(rows[a.id]['status'], 'created', domain)
            self.assertEqual(cfg['record'].objects.filter(**{cfg['person']: a}).count(), 2)

    def test_nothing_to_warn_about_when_it_was_a_different_type_or_long_ago(self):
        for domain, (a, b) in ((d, self.people[d]) for d in DOMAINS):
            cfg = DOMAINS[domain]
            self.earlier(domain, a, 5, kind=cfg['other_kind'])
            self.earlier(domain, b, 45)
            rows = self.rows(self.client.post(cfg['bulk'], {**self.body(domain, [a, b]), 'dry_run': True}, format='json'))
            self.assertNotIn('warning', rows[a.id], domain)
            self.assertNotIn('warning', rows[b.id], domain)

    def test_a_gift_reported_as_not_received_does_not_count(self):
        farmer = self.people['crop'][0]
        self.earlier('crop', farmer, 3, status=DistributionStatus.NOT_RECEIVED)
        rows = self.rows(self.client.post(DOMAINS['crop']['bulk'], {**self.body('crop', [farmer]), 'dry_run': True}, format='json'))
        self.assertNotIn('warning', rows[farmer.id])

    def test_a_single_entry_asks_for_confirmation_with_a_409(self):
        for domain, (a, _b) in ((d, self.people[d]) for d in DOMAINS):
            cfg = DOMAINS[domain]
            self.earlier(domain, a, 8)
            single = {cfg['person']: a.id, 'assistance_type': cfg['kind'], 'source_agencies': ['DA'], 'quantity': '2 bags', 'date_given': self.today.isoformat()}
            r = self.client.post(cfg['adhoc'], single, format='json')
            self.assertEqual(r.status_code, 409, r.content)
            self.assertEqual(r.json()['code'], 'recent_assistance')
            self.assertIn('within 30 days', r.json()['detail'])
            self.assertEqual(cfg['record'].objects.filter(**{cfg['person']: a}).count(), 1)
            r = self.client.post(cfg['adhoc'], {**single, 'confirm_duplicate': True}, format='json')
            self.assertEqual(r.status_code, 201, r.content)
            self.assertEqual(cfg['record'].objects.filter(**{cfg['person']: a}).count(), 2)

    def test_a_single_entry_with_no_recent_record_is_unaffected(self):
        cfg = DOMAINS['crop']
        a = self.people['crop'][1]
        r = self.client.post(cfg['adhoc'], {'farmer': a.id, 'assistance_type': 'Seeds', 'source_agencies': ['DA'], 'quantity': '2 bags',
                                             'date_given': self.today.isoformat()}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
