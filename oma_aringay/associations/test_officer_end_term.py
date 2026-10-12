"""An organization account can end the term of one of its own officers early (with a reason); staff still can too.
It can never touch another organization's officers."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FisherfolkOrganization, FisherfolkOrganizationOfficer, OrganizationOfficer,
)

_N = itertools.count(1)
User = get_user_model()

DOMAINS = {
    'farmers': dict(org=FarmersOrganization, officer=OrganizationOfficer, link='FARMERS_ORG'),
    'fisherfolk': dict(org=FisherfolkOrganization, officer=FisherfolkOrganizationOfficer, link='FISHERFOLK_ORG'),
}


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'ENDT-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_citizen(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class EndTermTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org, other = make_org(cfg['org'], f'End {domain}'), make_org(cfg['org'], f'Other {domain}')
            cls.ctx[domain] = dict(
                org=org, other=other, user=make_citizen(f'end-{domain}', cfg['link'], org.id),
                other_user=make_citizen(f'end-other-{domain}', cfg['link'], other.id))
        cls.staff = User.objects.create_user(username='end-staff', password='pw', role='ADMIN', email='end-staff@x.test')
        cls.cross = {'farmers': 'fisherfolk', 'fisherfolk': 'farmers'}

    def officer(self, domain, org=None, position='President'):
        ctx = self.ctx[domain]
        return DOMAINS[domain]['officer'].objects.create(organization=org or ctx['org'], position=position, full_name='Pat Officer')

    def end(self, domain, officer, user, reason='Resigned'):
        self.client.force_authenticate(user)
        return self.client.post(f'/api/organizations/{domain}/officers/{officer.id}/end-term/', {'reason': reason}, format='json')

    def test_an_organization_ends_its_own_officers_term(self):
        for domain in DOMAINS:
            officer = self.officer(domain)
            res = self.end(domain, officer, self.ctx[domain]['user'])
            self.assertEqual(res.status_code, 200, (domain, res.data))
            officer.refresh_from_db()
            self.assertEqual((officer.is_active, officer.term_end_date, officer.early_exit_reason),
                             (False, timezone.localdate(), 'Resigned'), domain)

    def test_a_reason_is_required_and_a_term_ends_only_once(self):
        for domain in DOMAINS:
            officer = self.officer(domain)
            for blank in ('', '   '):
                self.assertEqual(self.end(domain, officer, self.ctx[domain]['user'], blank).status_code, 400, domain)
            self.assertEqual(self.end(domain, officer, self.ctx[domain]['user']).status_code, 200, domain)
            self.assertEqual(self.end(domain, officer, self.ctx[domain]['user']).status_code, 400, domain)

    def test_another_organizations_officer_cannot_be_touched(self):
        for domain in DOMAINS:
            theirs = self.officer(domain, org=self.ctx[domain]['other'])
            self.assertEqual(self.end(domain, theirs, self.ctx[domain]['user']).status_code, 404, domain)
            theirs.refresh_from_db()
            self.assertTrue(theirs.is_active, domain)

    def test_the_other_kind_of_organization_account_is_refused(self):
        for domain in DOMAINS:
            officer = self.officer(domain)
            res = self.end(domain, officer, self.ctx[self.cross[domain]]['user'])
            self.assertEqual(res.status_code, 403, domain)

    def test_staff_can_still_end_a_term(self):
        for domain in DOMAINS:
            officer = self.officer(domain)
            self.assertEqual(self.end(domain, officer, self.staff).status_code, 200, domain)


class OfficerMembershipFlagTests(APITestCase):
    """Each officer says whether they are an active member (only members can receive assistance)."""

    @classmethod
    def setUpTestData(cls):
        from farmers.models import Farmer
        from fisheries.models import Fisherfolk
        from associations.models import FarmersOrganizationMember, FisherfolkOrganizationMember

        cls.ctx = {}
        n = next(_N)
        farm_org, fish_org = make_org(FarmersOrganization, 'Flag farmers'), make_org(FisherfolkOrganization, 'Flag fisherfolk')
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (960000 + n), first_name='Fay', last_name='Flag', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (961000 + n), first_name='Fin', last_name='Flag', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        FarmersOrganizationMember.objects.create(organization=farm_org, farmer=farmer, date_joined=date(2025, 1, 1), is_main=True)
        fish_member = FisherfolkOrganizationMember.objects.create(organization=fish_org, fisherfolk=fisher, date_joined=date(2025, 1, 1), is_main=True)
        OrganizationOfficer.objects.create(organization=farm_org, farmer=farmer, position='President', full_name='Fay Flag')
        OrganizationOfficer.objects.create(organization=farm_org, position='Secretary', full_name='Typed Name Only')
        FisherfolkOrganizationOfficer.objects.create(organization=fish_org, member=fish_member, position='President', full_name='Fin Flag')
        FisherfolkOrganizationOfficer.objects.create(organization=fish_org, position='Secretary', full_name='Typed Name Only')
        cls.ctx = {'farmers': (farm_org, make_citizen('flag-farmers', 'FARMERS_ORG', farm_org.id)),
                   'fisherfolk': (fish_org, make_citizen('flag-fisherfolk', 'FISHERFOLK_ORG', fish_org.id))}

    def test_the_officer_list_and_the_organization_detail_flag_non_members(self):
        for domain, (org, user) in self.ctx.items():
            self.client.force_authenticate(user)
            listed = self.client.get(f'/api/organizations/{domain}/{org.id}/officers/')
            self.assertEqual(listed.status_code, 200, domain)
            self.assertEqual({o['position']: o['is_member'] for o in listed.data}, {'President': True, 'Secretary': False}, domain)
            detail = self.client.get(f'/api/organizations/{domain}/{org.id}/')
            self.assertEqual({o['position']: o['is_member'] for o in detail.data['officers']}, {'President': True, 'Secretary': False}, domain)
