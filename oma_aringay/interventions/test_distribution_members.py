"""An organization can choose which members receive a distribution (`member_ids`), and every distribution carries one batch
id shared by its records."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()

DOMAINS = {
    'farmers': dict(link='FARMERS_ORG', org=FarmersOrganization, member=FarmersOrganizationMember, person_field='farmer',
                    record=BeneficiaryRecord, url='/api/organizations/farmers/{}/distribute-assistance/', type='Seeds'),
    'fisherfolk': dict(link='FISHERFOLK_ORG', org=FisherfolkOrganization, member=FisherfolkOrganizationMember,
                       person_field='fisherfolk', record=FisherfolkBeneficiaryRecord,
                       url='/api/organizations/fisherfolk/{}/distribute-assistance/', type='Fishing Gear'),
}


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'DM-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_person(domain, first):
    n = next(_N)
    if domain == 'farmers':
        return Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (990000 + n), first_name=first, last_name='Pick', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    return Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (991000 + n), first_name=first, last_name='Pick', gender='Male',
        birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')


def make_citizen(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class MemberSelectionTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], f'Pick {domain}')
            other = make_org(cfg['org'], f'Other {domain}')
            people = [make_person(domain, f'P{i}') for i in range(4)]
            for person in people:
                cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), is_main=True,
                                             **{cfg['person_field']: person})
            outsider = make_person(domain, 'Outsider')
            cfg['member'].objects.create(organization=other, date_joined=date(2025, 1, 1), is_main=True,
                                         **{cfg['person_field']: outsider})
            inactive = make_person(domain, 'Gone')
            cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), is_main=False, is_active=False,
                                         **{cfg['person_field']: inactive})
            cls.ctx[domain] = dict(org=org, people=people, outsider=outsider, inactive=inactive,
                                   user=make_citizen(f'dm-{domain}', cfg['link'], org.id))

    def body(self, domain, **extra):
        data = {'assistance_type': DOMAINS[domain]['type'], 'source_agencies': ['DA'], 'quantity': '1 unit',
                'date_given': str(timezone.localdate())}
        data.update(extra)
        return data

    def distribute(self, domain, **extra):
        self.client.force_authenticate(self.ctx[domain]['user'])
        return self.client.post(DOMAINS[domain]['url'].format(self.ctx[domain]['org'].id), self.body(domain, **extra), format='json')

    def records(self, domain):
        cfg = DOMAINS[domain]
        return cfg['record'].objects.filter(distributed_by_organization=self.ctx[domain]['org'])

    def received(self, domain):
        field = DOMAINS[domain]['person_field'] + '_id'
        return set(self.records(domain).values_list(field, flat=True))

    def test_a_subset_creates_records_only_for_the_chosen_members(self):
        for domain in DOMAINS:
            people = self.ctx[domain]['people']
            res = self.distribute(domain, member_ids=[people[0].id, people[2].id])
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(self.received(domain), {people[0].id, people[2].id})
            self.assertEqual([r['status'] for r in res.data['results']], ['created', 'created'])

    def test_every_id_behaves_like_omitting_the_list_and_omitting_still_reaches_everyone(self):
        for domain in DOMAINS:
            people = self.ctx[domain]['people']
            self.records(domain).delete()
            self.distribute(domain)
            everyone = self.received(domain)
            self.assertEqual(everyone, {p.id for p in people})
            self.records(domain).delete()
            self.distribute(domain, member_ids=[p.id for p in people])
            self.assertEqual(self.received(domain), everyone)

    def test_an_empty_list_is_refused(self):
        for domain in DOMAINS:
            res = self.distribute(domain, member_ids=[])
            self.assertEqual(res.status_code, 400, domain)
            self.assertIn('Select at least one member.', str(res.data))
            self.assertEqual(self.records(domain).count(), 0)

    def test_ids_that_are_not_active_members_of_this_organization_are_refused(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            for bad in (ctx['outsider'].id, ctx['inactive'].id, 999999999):
                res = self.distribute(domain, member_ids=[ctx['people'][0].id, bad])
                self.assertEqual(res.status_code, 400, (domain, bad))
                self.assertIn('member_ids', res.data)
                self.assertEqual(self.records(domain).count(), 0)

    def test_the_preview_ignores_the_selection_and_lists_the_whole_roster(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            res = self.distribute(domain, member_ids=[ctx['people'][0].id], dry_run=True)
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual({r['person_id'] for r in res.data['results']}, {p.id for p in ctx['people']})
            self.assertEqual({r['status'] for r in res.data['results']}, {'would_create'})
            self.assertEqual(self.records(domain).count(), 0)

    def test_the_records_of_one_distribution_share_a_batch_and_separate_requests_get_different_ones(self):
        for domain in DOMAINS:
            first = self.distribute(domain, member_ids=[self.ctx[domain]['people'][0].id, self.ctx[domain]['people'][1].id])
            batches = set(self.records(domain).values_list('distribution_batch', flat=True))
            self.assertEqual(len(batches), 1)
            batch = batches.pop()
            self.assertIsNotNone(batch)
            self.assertEqual(first.data['distribution_id'], str(batch))
            second = self.distribute(domain, member_ids=[self.ctx[domain]['people'][2].id], quantity='2 units')
            self.assertNotEqual(second.data['distribution_id'], first.data['distribution_id'])

    def test_new_records_await_confirmation_and_future_ones_are_pending(self):
        for domain in DOMAINS:
            self.records(domain).delete()
            ids = [self.ctx[domain]['people'][0].id]
            self.distribute(domain, member_ids=ids)
            self.distribute(domain, member_ids=ids, date_given=str(timezone.localdate() + timedelta(days=5)))
            self.assertEqual(sorted(self.records(domain).values_list('status', flat=True)), ['AWAITING_CONFIRMATION', 'PENDING'])

    def test_a_single_member_report_gets_a_batch_too(self):
        for domain, url in (('farmers', '/api/interventions/beneficiaries/adhoc/'),
                            ('fisherfolk', '/api/interventions/fisherfolk-beneficiaries/adhoc/')):
            person = self.ctx[domain]['people'][0]
            self.client.force_authenticate(self.ctx[domain]['user'])
            body = {DOMAINS[domain]['person_field']: person.id, 'assistance_type': DOMAINS[domain]['type'],
                    'source_agencies': ['DA'], 'quantity': '1', 'date_given': str(timezone.localdate())}
            res = self.client.post(url, body, format='json')
            self.assertEqual(res.status_code, 201, (domain, res.data))
            record = DOMAINS[domain]['record'].objects.get(pk=res.data['id'])
            self.assertIsNotNone(record.distribution_batch)
