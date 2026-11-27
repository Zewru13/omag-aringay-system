"""A cooperative gives NEW assistance only to its current members. Someone whose membership has ended is refused on every way of
giving it; what was given while they were a member stays, and the office can still give to anyone."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.test_helpers import SCHEDULE, farmer, make_citizen, make_org

User = get_user_model()


def fisherfolk(first):
    number = Fisherfolk.objects.count() + 1
    return Fisherfolk.objects.create(rsbsa_number=f'01-033-02-019-865{number:03d}', first_name=first, last_name='Former', gender='Male',
                                     birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')


DOMAINS = {
    'crop': dict(org=FarmersOrganization, member=FarmersOrganizationMember, field='farmer', link='FARMERS_ORG', person=farmer,
                 record=BeneficiaryRecord, kind='Seeds', path='beneficiaries', org_path='farmers', history='my-org-distributions'),
    'fisheries': dict(org=FisherfolkOrganization, member=FisherfolkOrganizationMember, field='fisherfolk', link='FISHERFOLK_ORG',
                      person=fisherfolk, record=FisherfolkBeneficiaryRecord, kind='Fishing Gear', path='fisherfolk-beneficiaries',
                      org_path='fisherfolk', history='my-org-fisherfolk-distributions'),
}


class FormerMemberTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='fm-admin', password='pw', role='ADMIN', email='fm-admin@x.test')
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], f'Former {domain}')
            current, former = cfg['person']('Current'), cfg['person']('Former')
            rows = {who: cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), **{cfg['field']: p})
                    for who, p in (('current', current), ('former', former))}
            cls.ctx[domain] = dict(org=org, current=current, former=former, rows=rows,
                                   user=make_citizen(f'fm-{domain}', cfg['link'], org.id))

    def end_membership(self, domain, who='former'):
        DOMAINS[domain]['member'].objects.filter(pk=self.ctx[domain]['rows'][who].pk).update(is_active=False)

    def body(self, domain, **extra):
        return {'assistance_type': DOMAINS[domain]['kind'], 'source_agencies': ['DA'], 'quantity': '1', **SCHEDULE,
                'date_given': str(date.today() + timedelta(days=3)), **extra}

    def given(self, domain, person):
        return DOMAINS[domain]['record'].objects.filter(**{DOMAINS[domain]['field']: person}).count()

    def one(self, domain, person):
        cfg = DOMAINS[domain]
        return self.client.post(f"/api/interventions/{cfg['path']}/adhoc/", self.body(domain, **{cfg['field']: person.id}), format='json')

    def selected(self, domain, people, **extra):
        cfg = DOMAINS[domain]
        return self.client.post(f"/api/interventions/{cfg['path']}/adhoc/bulk/",
                                self.body(domain, **{f"{cfg['field']}_ids": [p.id for p in people]}, **extra), format='json')

    def test_a_former_member_is_refused_when_one_person_is_given_assistance(self):
        for domain, ctx in self.ctx.items():
            self.end_membership(domain)
            self.client.force_authenticate(ctx['user'])
            res = self.one(domain, ctx['former'])
            self.assertEqual(res.status_code, 403, (domain, res.content))
            self.assertEqual(self.given(domain, ctx['former']), 0, domain)

    def test_selected_people_skips_the_former_member_and_serves_the_current_one(self):
        for domain, ctx in self.ctx.items():
            self.end_membership(domain)
            self.client.force_authenticate(ctx['user'])
            for dry_run in (True, False):
                res = self.selected(domain, [ctx['current'], ctx['former']], **({'dry_run': True} if dry_run else {}))
                self.assertEqual(res.status_code, 200, (domain, res.content))
                rows = {r['person_id']: r for r in res.data['results']}
                self.assertEqual(rows[ctx['current'].id]['status'], 'would_create' if dry_run else 'created', domain)
                self.assertEqual((rows[ctx['former'].id]['status'], rows[ctx['former'].id]['reason']),
                                 ('error', 'Not a current member of your cooperative.'), domain)
            self.assertEqual((self.given(domain, ctx['current']), self.given(domain, ctx['former'])), (1, 0), domain)

    def test_someone_who_rejoins_can_be_given_assistance_again(self):
        for domain, ctx in self.ctx.items():
            self.end_membership(domain)
            DOMAINS[domain]['member'].objects.filter(pk=ctx['rows']['former'].pk).update(is_active=True)
            self.client.force_authenticate(ctx['user'])
            self.assertEqual(self.one(domain, ctx['former']).status_code, 201, domain)

    def test_what_was_given_before_stays_and_can_still_be_corrected(self):
        for domain, ctx in self.ctx.items():
            cfg = DOMAINS[domain]
            self.client.force_authenticate(ctx['user'])
            record_id = self.one(domain, ctx['former']).data['id']
            self.end_membership(domain)
            history = self.client.get(f"/api/interventions/{cfg['history']}/").data
            self.assertIn(record_id, [m['record_id'] for group in history for m in group['members']], domain)
            res = self.client.patch(f"/api/interventions/{cfg['path']}/{record_id}/detail/", {'remarks': 'corrected'}, format='json')
            self.assertEqual(res.status_code, 200, (domain, res.content))
            self.assertEqual(self.given(domain, ctx['former']), 1, domain)

    def test_the_office_can_still_give_to_anyone(self):
        for domain, ctx in self.ctx.items():
            self.end_membership(domain)
            self.client.force_authenticate(self.staff)
            self.assertEqual(self.one(domain, ctx['former']).status_code, 201, domain)

    def test_the_members_list_can_leave_former_members_out(self):
        for domain, ctx in self.ctx.items():
            cfg = DOMAINS[domain]
            self.end_membership(domain)
            self.client.force_authenticate(ctx['user'])
            res = self.client.get(f"/api/organizations/{cfg['org_path']}/{ctx['org'].id}/members/", {'active_only': 1})
            rows = res.data['results'] if isinstance(res.data, dict) else res.data
            self.assertEqual([r[cfg['field']] for r in rows], [ctx['current'].id], domain)
