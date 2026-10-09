"""An organization can remove entries (or a whole distribution) from its list before the recipients confirm them. The records stay
in the database for audit but vanish from every list, can no longer be confirmed, and no longer count."""
import itertools
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from auditlog.models import AuditLogEntry
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()
URL = '/api/interventions/assistance-removals/'

DOMAINS = {
    'crop': dict(link='FARMERS_ORG', person_link='FARMER', org=FarmersOrganization, member=FarmersOrganizationMember,
                 person_field='farmer', record=BeneficiaryRecord, type='Seeds',
                 history='/api/interventions/my-org-distributions/',
                 distribute='/api/organizations/farmers/{}/distribute-assistance/',
                 confirm='/api/interventions/beneficiaries/{}/confirm-received/', own='/api/interventions/my-beneficiary-history/'),
    'fisheries': dict(link='FISHERFOLK_ORG', person_link='FISHERFOLK', org=FisherfolkOrganization,
                      member=FisherfolkOrganizationMember, person_field='fisherfolk', record=FisherfolkBeneficiaryRecord,
                      type='Fishing Gear', history='/api/interventions/my-org-fisherfolk-distributions/',
                      distribute='/api/organizations/fisherfolk/{}/distribute-assistance/',
                      confirm='/api/interventions/fisherfolk-beneficiaries/{}/confirm-received/',
                      own='/api/interventions/my-fisherfolk-beneficiary-history/'),
}


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'RM-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_person(domain, first):
    n = next(_N)
    if domain == 'crop':
        return Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (994000 + n), first_name=first, last_name='Rem', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    return Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (995000 + n), first_name=first, last_name='Rem', gender='Male',
        birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')


def make_citizen(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class RemovalTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], f'Rem {domain}')
            rival = make_org(cfg['org'], f'Rival {domain}')
            people = [make_person(domain, n) for n in ('Ana', 'Ben', 'Cara')]
            for person in people:
                cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), is_main=True,
                                             **{cfg['person_field']: person})
            cls.ctx[domain] = dict(
                org=org, people=people, rival=rival,
                user=make_citizen(f'rm-{domain}', cfg['link'], org.id),
                rival_user=make_citizen(f'rm-rival-{domain}', cfg['link'], rival.id),
                recipient=make_citizen(f'rm-person-{domain}', cfg['person_link'], people[0].id),
            )
        cls.staff = User.objects.create_user(username='rm-staff', password='pw', role='ADMIN', email='rm-staff@x.test')

    def distribute(self, domain, member_idx=(0, 1, 2), when=None, quantity='1 unit'):
        cfg, ctx = DOMAINS[domain], self.ctx[domain]
        self.client.force_authenticate(ctx['user'])
        res = self.client.post(cfg['distribute'].format(ctx['org'].id), {
            'assistance_type': cfg['type'], 'source_agencies': ['DA'], 'quantity': quantity,
            'date_given': str(when or timezone.localdate()), 'member_ids': [ctx['people'][i].id for i in member_idx],
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        return res.data['distribution_id']

    def records(self, domain):
        cfg = DOMAINS[domain]
        return list(cfg['record'].all_objects.filter(recorded_by=self.ctx[domain]['user']).order_by('id'))

    def remove(self, domain, user=None, **body):
        self.client.force_authenticate(user or self.ctx[domain]['user'])
        body['domain'] = domain
        return self.client.post(URL, body, format='json')

    def set_status(self, domain, record, status):
        DOMAINS[domain]['record'].all_objects.filter(pk=record.pk).update(status=status)

    # single entries ------------------------------------------------------------
    def test_removing_awaiting_and_pending_entries_hides_them_but_keeps_the_rows(self):
        for domain, cfg in DOMAINS.items():
            self.distribute(domain, (0,))
            self.distribute(domain, (1,), when=timezone.localdate() + timedelta(days=4))
            awaiting, pending = self.records(domain)
            res = self.remove(domain, record_ids=[awaiting.id, pending.id])
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(sorted(res.data['removed']), sorted([awaiting.id, pending.id]))
            self.assertEqual(res.data['kept'], [])
            for record in self.records(domain):
                self.assertEqual(record.status, 'REMOVED')
                self.assertEqual(record.removed_by, self.ctx[domain]['user'])
                self.assertIsNotNone(record.removed_at)
            self.assertEqual(cfg['record'].objects.filter(recorded_by=self.ctx[domain]['user']).count(), 0)
            self.client.force_authenticate(self.ctx[domain]['user'])
            self.assertEqual(self.client.get(cfg['history']).data, [])

    def test_confirmed_or_followed_up_entries_are_kept_and_reported(self):
        for domain in DOMAINS:
            self.distribute(domain)
            first, second, third = self.records(domain)
            self.set_status(domain, first, DistributionStatus.CONFIRMED)
            self.set_status(domain, second, DistributionStatus.NOT_RECEIVED)
            res = self.remove(domain, record_ids=[first.id, second.id, third.id])
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.data['removed'], [third.id])
            self.assertEqual({k['id']: k['status'] for k in res.data['kept']},
                             {first.id: 'CONFIRMED', second.id: 'NOT_RECEIVED'})
            statuses = {r.id: r.status for r in self.records(domain)}
            self.assertEqual(statuses, {first.id: 'CONFIRMED', second.id: 'NOT_RECEIVED', third.id: 'REMOVED'})

    def test_removing_an_already_removed_entry_does_nothing(self):
        for domain in DOMAINS:
            self.distribute(domain, (0,))
            record = self.records(domain)[0]
            self.remove(domain, record_ids=[record.id])
            again = self.remove(domain, record_ids=[record.id])
            self.assertEqual(again.status_code, 200)
            self.assertEqual(again.data['removed'], [])

    # whole distributions -----------------------------------------------------------
    def test_removing_a_whole_distribution_removes_only_the_unconfirmed_members(self):
        for domain in DOMAINS:
            batch = self.distribute(domain)
            first, second, third = self.records(domain)
            self.set_status(domain, first, DistributionStatus.CONFIRMED)
            res = self.remove(domain, distribution=batch)
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(sorted(res.data['removed']), sorted([second.id, third.id]))
            self.assertEqual([k['id'] for k in res.data['kept']], [first.id])
            self.client.force_authenticate(self.ctx[domain]['user'])
            group = self.client.get(DOMAINS[domain]['history']).data[0]
            self.assertEqual(group['member_count'], 1)
            self.assertEqual(group['summary_status'], 'Confirmed')

    def test_a_legacy_group_id_removes_its_members(self):
        for domain, cfg in DOMAINS.items():
            self.distribute(domain, (0, 1))
            cfg['record'].all_objects.filter(recorded_by=self.ctx[domain]['user']).update(distribution_batch=None)
            self.client.force_authenticate(self.ctx[domain]['user'])
            gid = self.client.get(cfg['history']).data[0]['id']
            self.assertTrue(gid.startswith('legacy-'))
            res = self.remove(domain, distribution=gid)
            self.assertEqual(len(res.data['removed']), 2)

    # scope and permissions --------------------------------------------------------------
    def test_another_organizations_unknown_or_mixed_ids_are_refused_and_nothing_is_removed(self):
        for domain, cfg in DOMAINS.items():
            self.distribute(domain, (0,))
            mine = self.records(domain)[0]
            self.client.force_authenticate(self.ctx[domain]['rival_user'])
            res = self.client.post(URL, {'domain': domain, 'record_ids': [mine.id]}, format='json')
            self.assertEqual(res.status_code, 400, domain)
            self.assertEqual(self.remove(domain, record_ids=[mine.id, 999999999]).status_code, 400)
            self.assertEqual(self.records(domain)[0].status, 'AWAITING_CONFIRMATION')
            self.client.force_authenticate(self.ctx[domain]['rival_user'])
            self.assertEqual(self.client.post(URL, {'domain': domain, 'distribution': 'legacy-nothing'}, format='json').status_code, 400)

    def test_staff_can_remove_and_a_plain_citizen_cannot(self):
        for domain in DOMAINS:
            self.distribute(domain, (0,))
            record = self.records(domain)[0]
            denied = self.remove(domain, user=self.ctx[domain]['recipient'], record_ids=[record.id])
            self.assertEqual(denied.status_code, 403, domain)
            ok = self.remove(domain, user=self.staff, record_ids=[record.id])
            self.assertEqual(ok.status_code, 200, (domain, ok.data))
            self.assertEqual(self.records(domain)[0].removed_by, self.staff)

    def test_a_bad_request_body_is_refused(self):
        self.assertEqual(self.remove('crop', record_ids=[]).status_code, 400)
        self.client.force_authenticate(self.ctx['crop']['user'])
        # an organization may only name its own domain; staff naming an unknown one is a plain bad request
        self.assertEqual(self.client.post(URL, {'domain': 'nope', 'record_ids': [1]}, format='json').status_code, 403)
        self.assertEqual(self.client.post(URL, {'domain': 'crop'}, format='json').status_code, 400)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.post(URL, {'domain': 'nope', 'record_ids': [1]}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL, {'domain': 'crop', 'record_ids': 'x'}, format='json').status_code, 400)

    # effects on the recipient and the rest of the system ---------------------------------------
    def test_the_recipient_can_no_longer_confirm_or_see_a_removed_entry(self):
        for domain, cfg in DOMAINS.items():
            self.distribute(domain, (0,))
            record = self.records(domain)[0]
            self.remove(domain, record_ids=[record.id])
            self.client.force_authenticate(self.ctx[domain]['recipient'])
            res = self.client.post(cfg['confirm'].format(record.id), {}, format='json')
            self.assertIn(res.status_code, (400, 404), domain)
            self.assertEqual(self.records(domain)[0].status, 'REMOVED')
            own = self.client.get(cfg['own'])
            self.assertEqual(own.status_code, 200)
            ids = [row['id'] for row in (own.data if isinstance(own.data, list) else own.data.get('results', []))]
            self.assertNotIn(record.id, ids)

    def test_a_removed_entry_no_longer_blocks_another_organizations_distribution(self):
        for domain, cfg in DOMAINS.items():
            ctx = self.ctx[domain]
            # the person belongs to both organizations
            cfg['member'].objects.create(organization=ctx['rival'], date_joined=date(2025, 1, 1), is_main=False,
                                         **{cfg['person_field']: ctx['people'][0]})
            self.distribute(domain, (0,))
            rival_url = cfg['distribute'].format(ctx['rival'].id)
            body = {'assistance_type': cfg['type'], 'source_agencies': ['DA'], 'quantity': '1',
                    'date_given': str(timezone.localdate()), 'dry_run': True}
            self.client.force_authenticate(ctx['rival_user'])
            blocked = self.client.post(rival_url, body, format='json')
            self.assertIn('would_block', [r['status'] for r in blocked.data['results'] if r['person_id'] == ctx['people'][0].id])
            self.remove(domain, record_ids=[self.records(domain)[0].id])
            self.client.force_authenticate(ctx['rival_user'])
            freed = self.client.post(rival_url, body, format='json')
            self.assertIn('would_create', [r['status'] for r in freed.data['results'] if r['person_id'] == ctx['people'][0].id])

    def test_the_removal_is_written_to_the_audit_log(self):
        for domain, cfg in DOMAINS.items():
            self.distribute(domain, (0,))
            record = self.records(domain)[0]
            before = AuditLogEntry.objects.count()
            self.remove(domain, record_ids=[record.id])
            entries = AuditLogEntry.objects.order_by('-id')[:AuditLogEntry.objects.count() - before]
            self.assertTrue(any('Removed from the list' in e.object_repr and e.user_id == self.ctx[domain]['user'].id
                                for e in entries), domain)

    # concurrency ------------------------------------------------------------------------
    def test_an_entry_confirmed_between_the_read_and_the_lock_is_kept(self):
        for domain, cfg in DOMAINS.items():
            self.distribute(domain, (0, 1))
            first, second = self.records(domain)
            from interventions import distributions
            real = distributions._lock_records

            def confirm_then_lock(model, ids):
                model.all_objects.filter(pk=first.pk).update(status=DistributionStatus.CONFIRMED)
                return real(model, ids)

            with mock.patch('interventions.distributions._lock_records', side_effect=confirm_then_lock):
                res = self.remove(domain, record_ids=[first.id, second.id])
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.data['removed'], [second.id])
            self.assertEqual([k['id'] for k in res.data['kept']], [first.id])
            self.assertEqual({r.id: r.status for r in self.records(domain)}, {first.id: 'CONFIRMED', second.id: 'REMOVED'})
