"""A member who is also an officer is still a member: every way an organization gives or follows assistance includes them."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
    FisherfolkOrganizationOfficer, OrganizationOfficer,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()

DOMAINS = {
    'farmers': dict(link='FARMERS_ORG', org=FarmersOrganization, member=FarmersOrganizationMember, person_field='farmer',
                    record=BeneficiaryRecord, type='Seeds', adhoc='/api/interventions/beneficiaries/adhoc/',
                    distribute='/api/organizations/farmers/{}/distribute-assistance/',
                    history='/api/interventions/my-org-distributions/', list='/api/interventions/beneficiaries/'),
    'fisherfolk': dict(link='FISHERFOLK_ORG', org=FisherfolkOrganization, member=FisherfolkOrganizationMember,
                       person_field='fisherfolk', record=FisherfolkBeneficiaryRecord, type='Fishing Gear',
                       adhoc='/api/interventions/fisherfolk-beneficiaries/adhoc/',
                       distribute='/api/organizations/fisherfolk/{}/distribute-assistance/',
                       history='/api/interventions/my-org-fisherfolk-distributions/',
                       list='/api/interventions/fisherfolk-beneficiaries/'),
}


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'OFR-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_person(domain, first):
    n = next(_N)
    if domain == 'farmers':
        return Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (980000 + n), first_name=first, last_name='Officer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    return Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (981000 + n), first_name=first, last_name='Officer', gender='Male',
        birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')


class OfficersReceiveAssistanceTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ctx = {}
        for domain, cfg in DOMAINS.items():
            org = make_org(cfg['org'], f'Officers {domain}')
            people = {name: make_person(domain, name) for name in ('Chief', 'Plain', 'Clerk')}
            members = {name: cfg['member'].objects.create(
                organization=org, date_joined=date(2025, 1, 1), is_main=True, **{cfg['person_field']: p}) for name, p in people.items()}
            if domain == 'farmers':
                OrganizationOfficer.objects.create(organization=org, farmer=people['Chief'], position='President', full_name='Chief Officer')
                OrganizationOfficer.objects.create(organization=org, farmer=people['Clerk'], position='Secretary', full_name='Clerk Officer')
            else:
                FisherfolkOrganizationOfficer.objects.create(organization=org, member=members['Chief'], position='President', full_name='Chief Officer')
                FisherfolkOrganizationOfficer.objects.create(organization=org, member=members['Clerk'], position='Secretary', full_name='Clerk Officer')
            user = User.objects.create_user(username=f'ofr-{domain}', password='pw', role='CITIZEN', email=f'ofr-{domain}@x.test')
            UserLinkedRecord.objects.create(user=user, record_type=cfg['link'], record_id=org.id, is_active=True)
            cls.ctx[domain] = dict(org=org, people=people, user=user)

    def body(self, domain, **extra):
        data = {'assistance_type': DOMAINS[domain]['type'], 'source_agencies': ['DA'], 'quantity': '1 unit',
                'date_given': str(timezone.localdate())}
        data.update(extra)
        return data

    def test_the_whole_roster_preview_and_distribution_include_the_officers(self):
        for domain, cfg in DOMAINS.items():
            ctx = self.ctx[domain]
            self.client.force_authenticate(ctx['user'])
            url = cfg['distribute'].format(ctx['org'].id)
            everyone = {p.id for p in ctx['people'].values()}
            preview = self.client.post(url, self.body(domain, dry_run=True), format='json')
            self.assertEqual(preview.status_code, 200, (domain, preview.data))
            self.assertEqual(preview.data['member_count'], 3, domain)
            done = self.client.post(url, self.body(domain), format='json')
            self.assertEqual(done.status_code, 200, (domain, done.data))
            got = set(cfg['record'].objects.filter(distributed_by_organization=ctx['org']).values_list(cfg['person_field'] + '_id', flat=True))
            self.assertEqual(got, everyone, domain)

    def test_an_officer_can_be_given_assistance_individually_and_is_listed_in_the_history(self):
        for domain, cfg in DOMAINS.items():
            ctx = self.ctx[domain]
            self.client.force_authenticate(ctx['user'])
            chief = ctx['people']['Chief']
            res = self.client.post(cfg['adhoc'], self.body(domain, **{cfg['person_field']: chief.id, 'year': timezone.localdate().year,
                                                                       'unit': 'Pieces' if domain == 'fisherfolk' else ''}), format='json')
            self.assertEqual(res.status_code, 201, (domain, res.data))
            history = self.client.get(cfg['history'])
            self.assertEqual(history.status_code, 200, (domain, history.data))
            names = [m['name'] for group in history.data for m in group['members']]
            self.assertIn(chief.full_name, names, domain)
