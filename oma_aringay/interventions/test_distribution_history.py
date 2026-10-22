"""An organization's assistance history is a list of distributions (one row per distribution, expandable to its members), with
filters. Records made before distributions had batch ids are grouped by organization, type, date, quantity and agencies."""
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
from interventions.distributions import build_distributions
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()

DOMAINS = {
    'farmers': dict(link='FARMERS_ORG', org=FarmersOrganization, member=FarmersOrganizationMember, person_field='farmer',
                    record=BeneficiaryRecord, history='/api/interventions/my-org-distributions/',
                    distribute='/api/organizations/farmers/{}/distribute-assistance/', type='Seeds', other_type='Fertilizer'),
    'fisherfolk': dict(link='FISHERFOLK_ORG', org=FisherfolkOrganization, member=FisherfolkOrganizationMember,
                       person_field='fisherfolk', record=FisherfolkBeneficiaryRecord,
                       history='/api/interventions/my-org-fisherfolk-distributions/',
                       distribute='/api/organizations/fisherfolk/{}/distribute-assistance/', type='Fishing Gear',
                       other_type='Feed'),
}


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'DH-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_person(domain, first, last='Hist'):
    n = next(_N)
    if domain == 'farmers':
        return Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (992000 + n), first_name=first, last_name=last, gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    return Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (993000 + n), first_name=first, last_name=last, gender='Male',
        birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')


def make_citizen(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class DistributionHistoryTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], f'Hist {domain}')
            rival = make_org(cfg['org'], f'Rival {domain}')
            names = ['Ana', 'Ben', 'Cara', 'Dino']
            people = [make_person(domain, n) for n in names]
            for person in people:
                cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), is_main=True,
                                             **{cfg['person_field']: person})
            cls.ctx[domain] = dict(
                org=org, rival=rival, people=people,
                user=make_citizen(f'dh-{domain}', cfg['link'], org.id),
                rival_user=make_citizen(f'dh-rival-{domain}', cfg['link'], rival.id),
            )
        cls.staff = User.objects.create_user(username='dh-staff', password='pw', role='ADMIN', email='dh-staff@x.test')
        cls.plain_farmer_user = None

    # helpers -----------------------------------------------------------------
    def distribute(self, domain, member_idx, when=None, kind=None, quantity='1 unit', agencies=('DA',)):
        cfg, ctx = DOMAINS[domain], self.ctx[domain]
        self.client.force_authenticate(ctx['user'])
        body = {'assistance_type': kind or cfg['type'], 'source_agencies': list(agencies), 'quantity': quantity,
                'date_given': str(when or timezone.localdate()), 'member_ids': [ctx['people'][i].id for i in member_idx]}
        today = timezone.localdate()
        if when is not None and when < today:
            body['date_given'] = str(today)      # the form only takes today or later; the past date is put back below
        res = self.client.post(cfg['distribute'].format(ctx['org'].id), body, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        if when is not None and when < today:
            cfg['record'].objects.filter(distribution_batch=res.data['distribution_id']).update(date_given=when)
        return res.data['distribution_id']

    def legacy(self, domain, user, person, kind=None, when=None, quantity='1 unit', agencies=('DA',), status=None):
        """A record from before batches existed: no batch, no recorded_at."""
        cfg = DOMAINS[domain]
        record = cfg['record'].objects.create(
            assistance_type=kind or cfg['type'], source_agencies=list(agencies), quantity=quantity,
            date_given=when or timezone.localdate(), recorded_by=user, **{cfg['person_field']: person})
        updates = {'distribution_batch': None, 'recorded_at': None}
        if status:
            updates['status'] = status
        cfg['record'].objects.filter(pk=record.pk).update(**updates)
        return record

    def history(self, domain, user=None, **params):
        self.client.force_authenticate(user or self.ctx[domain]['user'])
        return self.client.get(DOMAINS[domain]['history'], params)

    def set_status(self, domain, record_id, status):
        DOMAINS[domain]['record'].objects.filter(pk=record_id).update(status=status)

    # grouping ---------------------------------------------------------------
    def test_one_distribution_is_one_group_with_its_members_and_counts(self):
        for domain in DOMAINS:
            batch = self.distribute(domain, [0, 1, 3])
            res = self.history(domain)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(len(res.data), 1)
            group = res.data[0]
            self.assertEqual(group['id'], batch)
            self.assertEqual(group['member_count'], 3)
            self.assertEqual(sorted(m['name'] for m in group['members']), ['Ana Hist', 'Ben Hist', 'Dino Hist'])
            self.assertEqual(group['status_counts']['AWAITING_CONFIRMATION'], 3)
            self.assertEqual(group['summary_status'], 'Awaiting confirmation')
            self.assertEqual(group['assistance_type'], DOMAINS[domain]['type'])
            self.assertIsNotNone(group['recorded_at'])
            self.assertEqual(set(group['members'][0]), {'record_id', 'person_id', 'name', 'status', 'confirmed_at'})

    def test_two_distributions_are_two_groups_newest_first(self):
        for domain in DOMAINS:
            today = timezone.localdate()
            old = self.distribute(domain, [0], when=today - timedelta(days=3), quantity='old')
            new = self.distribute(domain, [1], when=today)
            self.assertEqual([g['id'] for g in self.history(domain).data], [new, old])

    def test_records_without_a_batch_group_by_organization_type_date_quantity_and_agencies(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            a, b, c = ctx['people'][0], ctx['people'][1], ctx['people'][2]
            r1 = self.legacy(domain, ctx['user'], a)
            r2 = self.legacy(domain, ctx['user'], b)
            r3 = self.legacy(domain, ctx['user'], c, quantity='2 units')
            res = self.history(domain)
            groups = {g['id']: g for g in res.data}
            self.assertEqual(len(groups), 2)
            self.assertTrue(all(i.startswith('legacy-') for i in groups))
            sizes = sorted(g['member_count'] for g in groups.values())
            self.assertEqual(sizes, [1, 2])
            self.assertTrue(all(g['recorded_at'] is None for g in groups.values()))

    def test_an_identical_legacy_record_of_another_organization_never_joins_the_group(self):
        for domain in DOMAINS:
            ctx = self.ctx[domain]
            mine = self.legacy(domain, ctx['user'], ctx['people'][0])
            theirs = self.legacy(domain, ctx['rival_user'], ctx['people'][1])
            mine_groups = self.history(domain).data
            self.assertEqual(len(mine_groups), 1)
            self.assertEqual([m['record_id'] for m in mine_groups[0]['members']], [mine.id])
            rival_groups = self.history(domain, user=ctx['rival_user']).data
            self.assertEqual([m['record_id'] for m in rival_groups[0]['members']], [theirs.id])
            self.assertNotEqual(mine_groups[0]['id'], rival_groups[0]['id'])

    def test_summary_status_follows_awaiting_follow_up_and_confirmed(self):
        for domain in DOMAINS:
            self.distribute(domain, [0, 1])
            records = list(DOMAINS[domain]['record'].objects.filter(recorded_by=self.ctx[domain]['user']))
            self.set_status(domain, records[0].id, DistributionStatus.CONFIRMED)
            self.assertEqual(self.history(domain).data[0]['summary_status'], 'Awaiting confirmation')
            self.set_status(domain, records[1].id, DistributionStatus.NOT_RECEIVED)
            self.assertEqual(self.history(domain).data[0]['summary_status'], 'Needs follow-up')
            self.set_status(domain, records[1].id, DistributionStatus.RESOLVED)
            self.assertEqual(self.history(domain).data[0]['summary_status'], 'Confirmed')

    def test_removed_members_are_left_out_of_counts_and_the_summary(self):
        for domain in DOMAINS:
            self.distribute(domain, [0, 1, 2])
            records = list(DOMAINS[domain]['record'].objects.filter(recorded_by=self.ctx[domain]['user']).order_by('id'))
            DOMAINS[domain]['record'].all_objects.filter(pk=records[0].pk).update(status=DistributionStatus.REMOVED)
            self.set_status(domain, records[1].id, DistributionStatus.CONFIRMED)
            self.set_status(domain, records[2].id, DistributionStatus.CONFIRMED)
            group = self.history(domain).data[0]
            self.assertEqual(group['member_count'], 2)
            self.assertEqual(group['summary_status'], 'Confirmed')
            self.assertEqual(sum(group['status_counts'].values()), 2)
            self.assertNotIn(records[0].id, [m['record_id'] for m in group['members']])

    def test_a_deactivated_member_still_shows_in_the_old_distribution(self):
        for domain in DOMAINS:
            cfg, ctx = DOMAINS[domain], self.ctx[domain]
            self.distribute(domain, [0, 1])
            cfg['member'].objects.filter(organization=ctx['org'], **{cfg['person_field']: ctx['people'][0]}).update(is_active=False)
            self.assertEqual(self.history(domain).data[0]['member_count'], 2)

    # filters ----------------------------------------------------------------
    def seed_filter_data(self, domain):
        today = timezone.localdate()
        cfg = DOMAINS[domain]
        ids = {
            'seeds_today': self.distribute(domain, [0, 1], when=today, agencies=('DA',)),
            'other_old': self.distribute(domain, [2], when=today - timedelta(days=20), kind=cfg['other_type'], agencies=('LGU',)),
        }
        return ids

    def ids(self, res):
        return [g['id'] for g in res.data]

    def test_each_filter_narrows_the_list(self):
        for domain in DOMAINS:
            today = timezone.localdate()
            cfg = DOMAINS[domain]
            ids = self.seed_filter_data(domain)
            self.assertEqual(sorted(self.ids(self.history(domain))), sorted(ids.values()))
            self.assertEqual(self.ids(self.history(domain, assistance_type=cfg['type'])), [ids['seeds_today']])
            self.assertEqual(self.ids(self.history(domain, source_agency='LGU')), [ids['other_old']])
            self.assertEqual(self.ids(self.history(domain, date_from=str(today - timedelta(days=5)))), [ids['seeds_today']])
            self.assertEqual(self.ids(self.history(domain, date_to=str(today - timedelta(days=5)))), [ids['other_old']])
            self.assertEqual(self.ids(self.history(domain, status='AWAITING_CONFIRMATION')).__len__(), 2)
            self.assertEqual(self.ids(self.history(domain, status='CONFIRMED')), [])
            ncara = self.history(domain, member='cara')
            self.assertEqual(self.ids(ncara), [ids['other_old']])
            self.assertEqual([m['name'] for m in ncara.data[0]['members']], ['Cara Hist'])

    def test_needs_follow_up_selects_not_received_and_filters_combine(self):
        for domain in DOMAINS:
            ids = self.seed_filter_data(domain)
            record = DOMAINS[domain]['record'].objects.filter(recorded_by=self.ctx[domain]['user'],
                                                              assistance_type=DOMAINS[domain]['other_type']).get()
            self.set_status(domain, record.id, DistributionStatus.NOT_RECEIVED)
            self.assertEqual(self.ids(self.history(domain, status='needs-follow-up')), [ids['other_old']])
            self.assertEqual(self.ids(self.history(domain, status='needs-follow-up', source_agency='DA')), [])

    def test_a_status_filter_keeps_only_the_matching_members_in_a_group(self):
        for domain in DOMAINS:
            self.distribute(domain, [0, 1])
            records = list(DOMAINS[domain]['record'].objects.filter(recorded_by=self.ctx[domain]['user']).order_by('id'))
            self.set_status(domain, records[0].id, DistributionStatus.CONFIRMED)
            group = self.history(domain, status='CONFIRMED').data[0]
            self.assertEqual(group['member_count'], 1)
            self.assertEqual(group['members'][0]['record_id'], records[0].id)

    # scope ------------------------------------------------------------------
    def test_other_organizations_records_never_appear_and_other_accounts_are_refused(self):
        for domain in DOMAINS:
            cfg, ctx = DOMAINS[domain], self.ctx[domain]
            self.legacy(domain, ctx['rival_user'], ctx['people'][0])
            self.assertEqual(self.history(domain).data, [])
        farm, fish = self.ctx['farmers']['user'], self.ctx['fisherfolk']['user']
        self.assertEqual(self.history('farmers', user=fish).data, [])
        self.assertEqual(self.history('fisherfolk', user=farm).data, [])
        self.assertEqual(self.history('farmers', user=self.staff).status_code, 403)

    # the pure grouping function -----------------------------------------------
    def test_build_distributions_on_an_empty_queryset(self):
        for domain, cfg in DOMAINS.items():
            self.assertEqual(build_distributions(cfg['record'].objects.none(), cfg['person_field']), [])
