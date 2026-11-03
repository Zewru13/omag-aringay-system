"""One position per person: a person who already holds a position (an officer term, or a position other than Member on their
membership) cannot be given a second one, and a position that is taken (by an officer or by a member) cannot be given to someone
else. Plain "Member" is never taken. Ended terms and deactivated members free their position."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
    FisherfolkOrganizationOfficer, OrganizationOfficer,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk

_N = itertools.count(1)
User = get_user_model()

DOMAINS = {
    'farmers': dict(org=FarmersOrganization, member=FarmersOrganizationMember, officer=OrganizationOfficer, person=Farmer, fk='farmer'),
    'fisherfolk': dict(org=FisherfolkOrganization, member=FisherfolkOrganizationMember, officer=FisherfolkOrganizationOfficer,
                       person=Fisherfolk, fk='fisherfolk'),
}


def make_org(model):
    n = next(_N)
    return model.objects.create(
        name=f'One role {n}', barangay='Alaska', registration_number=f'ONE-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_person(model, first, **extra):
    n = next(_N)
    if model is Fisherfolk:
        extra.setdefault('fisherfolk_type', 'Aquaculture')
    return model.objects.create(
        rsbsa_number=f'01-033-02-019-{n:06d}', first_name=first, last_name='Tester', gender='Male', birthdate=date(1980, 1, 1),
        barangay='Alaska', **extra)


class OneRoleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='one-staff', password='pw', role='ADMIN', email='one-staff@x.test')
        cls.ctx = {d: dict(org=make_org(c['org'])) for d, c in DOMAINS.items()}

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def member(self, domain, name, position='Member', active=True):
        cfg, org = DOMAINS[domain], self.ctx[domain]['org']
        person = make_person(cfg['person'], name)
        row = cfg['member'].objects.create(organization=org, position=position, date_joined=date(2021, 1, 1), is_active=active, **{cfg['fk']: person})
        return person, row

    def assign(self, domain, person, position):
        org = self.ctx[domain]['org']
        return self.client.post(f'/api/organizations/{domain}/{org.id}/officers/', {DOMAINS[domain]['fk']: person.id, 'position': position}, format='json')

    def add_member(self, domain, person, position):
        org = self.ctx[domain]['org']
        return self.client.post(f'/api/organizations/{domain}/{org.id}/members/',
                                {DOMAINS[domain]['fk']: person.id, 'position': position, 'date_joined': '2021-01-01'}, format='json')

    # --- officers
    def test_an_officer_cannot_be_given_a_second_position(self):
        for domain in DOMAINS:
            person, _ = self.member(domain, f'A-{domain}')
            self.assertEqual(self.assign(domain, person, 'President').status_code, 201, domain)
            res = self.assign(domain, person, 'Treasurer')
            self.assertEqual(res.status_code, 400, domain)
            self.assertIn('already', str(res.data).lower(), domain)
            self.assertIn('President', str(res.data), domain)
            self.assertEqual(DOMAINS[domain]['officer'].objects.filter(organization=self.ctx[domain]['org'], is_active=True).count(), 1, domain)

    def test_a_person_whose_term_ended_can_hold_another_position(self):
        for domain in DOMAINS:
            person, _ = self.member(domain, f'B-{domain}')
            first = self.assign(domain, person, 'Secretary')
            self.assertEqual(first.status_code, 201, domain)
            DOMAINS[domain]['officer'].objects.filter(pk=first.data['id']).update(is_active=False)
            self.assertEqual(self.assign(domain, person, 'Auditor').status_code, 201, domain)

    def test_a_member_whose_membership_position_is_not_member_cannot_also_be_made_an_officer(self):
        for domain in DOMAINS:
            person, _ = self.member(domain, f'C-{domain}', position='Chairperson')
            res = self.assign(domain, person, 'Manager')
            self.assertEqual(res.status_code, 400, domain)
            self.assertIn('Chairperson', str(res.data), domain)

    def test_a_position_held_by_a_member_cannot_be_given_to_an_officer(self):
        for domain in DOMAINS:
            self.member(domain, f'D1-{domain}', position='Treasurer')
            other, _ = self.member(domain, f'D2-{domain}')
            res = self.assign(domain, other, 'Treasurer')
            self.assertEqual(res.status_code, 400, domain)
            self.assertIn('Treasurer', str(res.data), domain)

    # --- members
    def test_a_taken_position_cannot_be_given_to_a_new_member(self):
        for domain in DOMAINS:
            holder, _ = self.member(domain, f'E1-{domain}')
            self.assertEqual(self.assign(domain, holder, 'Board Member').status_code, 201, domain)
            newcomer = make_person(DOMAINS[domain]['person'], f'E2-{domain}')
            res = self.add_member(domain, newcomer, 'Board Member')
            self.assertEqual(res.status_code, 400, domain)
            self.assertIn('position', res.data, domain)
            self.assertFalse(DOMAINS[domain]['member'].objects.filter(**{DOMAINS[domain]['fk']: newcomer}).exists(), domain)

    def test_a_position_held_by_another_member_is_taken_too(self):
        for domain in DOMAINS:
            self.member(domain, f'F1-{domain}', position='President')
            newcomer = make_person(DOMAINS[domain]['person'], f'F2-{domain}')
            self.assertEqual(self.add_member(domain, newcomer, 'President').status_code, 400, domain)
            self.assertEqual(self.add_member(domain, newcomer, 'Vice President').status_code, 201, domain)

    def test_member_is_never_taken(self):
        for domain in DOMAINS:
            for i in range(3):
                person = make_person(DOMAINS[domain]['person'], f'G{i}-{domain}')
                self.assertEqual(self.add_member(domain, person, 'Member').status_code, 201, (domain, i))

    def test_a_deactivated_members_position_is_free_again(self):
        for domain in DOMAINS:
            self.member(domain, f'H1-{domain}', position='Secretary', active=False)
            newcomer = make_person(DOMAINS[domain]['person'], f'H2-{domain}')
            self.assertEqual(self.add_member(domain, newcomer, 'Secretary').status_code, 201, domain)


class ImportTests(APITestCase):
    def test_an_imported_position_that_is_taken_is_invalid_and_the_rest_are_added(self):
        from associations.test_member_import import HEADERS, make_org as make_import_org, make_person as make_import_person, sheet
        staff = User.objects.create_user(username='one-import', password='pw', role='ADMIN', email='one-import@x.test')
        self.client.force_authenticate(staff)
        for domain, cfg in DOMAINS.items():
            org = make_import_org(domain)
            a, b, c = (make_import_person(domain) for _ in range(3))
            rows = [[a.rsbsa_number, 'President', '2026-01-15'], [b.rsbsa_number, 'President', '2026-01-15'], [c.rsbsa_number, 'Member', '2026-01-15']]
            res = self.client.post(f'/api/organizations/{domain}/{org.id}/members/import/', {'file': sheet(rows, HEADERS), 'dry_run': 'false'}, format='multipart')
            self.assertEqual([r['status'] for r in res.data['rows']], ['ready', 'invalid', 'ready'], domain)
            self.assertIn('President is already held', res.data['rows'][1]['detail'], domain)
            self.assertEqual(cfg['member'].objects.filter(organization=org).count(), 2, domain)
