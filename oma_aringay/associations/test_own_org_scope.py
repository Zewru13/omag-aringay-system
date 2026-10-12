"""An organization account reads and manages only its own organization record: the detail view and its equipment
(the members, officers and assistance routes were already organization-scoped). Staff behave as before."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FisherfolkOrganization, FisherfolkOrganizationEquipment,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from associations.models import FarmersOrganizationMember, FisherfolkOrganizationMember

_REG = itertools.count(1)

DOMAINS = {
    'farmers': ('FARMERS_ORG', FarmersOrganization, FarmersOrganizationEquipment, 'Hand Tractor'),
    'fisherfolk': ('FISHERFOLK_ORG', FisherfolkOrganization, FisherfolkOrganizationEquipment, 'Fish Cage'),
}


def make_org(model, name):
    return model.objects.create(
        name=name, barangay='Alaska', registration_number='REG-%04d' % next(_REG), date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact',
        contact_number='09171234567')


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(
        username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


def make_staff(username, role='ADMIN'):
    return get_user_model().objects.create_user(username=username, password='pw', role=role, email=f'{username}@x.test')


def equipment_body(domain):
    return {'equipment_name': DOMAINS[domain][3], 'quantity': 2, 'condition': 'Good'}


class OrgFixtureMixin:
    @classmethod
    def setUpTestData(cls):
        cls.orgs, cls.others, cls.users, cls.equipment = {}, {}, {}, {}
        for domain, (link_type, model, equipment_model, _) in DOMAINS.items():
            cls.orgs[domain] = make_org(model, f'Own {domain}')
            cls.others[domain] = make_org(model, f'Other {domain}')
            cls.users[domain] = make_citizen(f'org-{domain}', link_type, cls.orgs[domain].id)
            cls.equipment[domain] = equipment_model.objects.create(
                organization=cls.orgs[domain], equipment_name=DOMAINS[domain][3], quantity=1, condition='Good')
        cls.staff = make_staff('org-staff')


class OwnOrgDetailTests(OrgFixtureMixin, APITestCase):
    def test_org_reads_its_own_detail_for_both_domains(self):
        for domain in DOMAINS:
            self.client.force_authenticate(self.users[domain])
            response = self.client.get(f'/api/organizations/{domain}/{self.orgs[domain].id}/')
            self.assertEqual(response.status_code, 200, domain)
            body = response.json()
            self.assertEqual(body['name'], f'Own {domain}')
            for key in ('members', 'officers', 'equipment', 'officer_history'):
                self.assertIn(key, body)
            self.assertEqual(len(body['equipment']), 1)

    def test_org_cannot_read_another_orgs_detail(self):
        for domain in DOMAINS:
            self.client.force_authenticate(self.users[domain])
            response = self.client.get(f'/api/organizations/{domain}/{self.others[domain].id}/')
            self.assertIn(response.status_code, (403, 404), domain)

    def test_org_response_has_no_citizen_account_but_staff_response_does(self):
        for domain in DOMAINS:
            url = f'/api/organizations/{domain}/{self.orgs[domain].id}/'
            self.client.force_authenticate(self.users[domain])
            self.assertNotIn('citizen_account', self.client.get(url).json(), domain)
            self.client.force_authenticate(self.staff)
            self.assertIn('citizen_account', self.client.get(url).json(), domain)

    def test_org_cannot_patch_its_own_record(self):
        for domain in DOMAINS:
            self.client.force_authenticate(self.users[domain])
            response = self.client.patch(
                f'/api/organizations/{domain}/{self.orgs[domain].id}/', {'name': 'Renamed'}, format='json')
            self.assertEqual(response.status_code, 403, domain)
            self.orgs[domain].refresh_from_db()
            self.assertEqual(self.orgs[domain].name, f'Own {domain}')

    def test_farmer_fisherfolk_and_unlinked_citizen_are_refused(self):
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-990101', first_name='F', last_name='Armer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        outsiders = [
            make_citizen('outsider-farmer', 'FARMER', farmer.id),
            get_user_model().objects.create_user(username='unlinked', password='pw', role='CITIZEN', email='u@x.test'),
        ]
        for user in outsiders:
            self.client.force_authenticate(user)
            for domain in DOMAINS:
                self.assertIn(self.client.get(f'/api/organizations/{domain}/{self.orgs[domain].id}/').status_code, (403, 404))

    def test_staff_detail_is_unchanged(self):
        self.client.force_authenticate(self.staff)
        for domain in DOMAINS:
            self.assertEqual(self.client.get(f'/api/organizations/{domain}/{self.orgs[domain].id}/').status_code, 200)
            self.assertEqual(self.client.patch(
                f'/api/organizations/{domain}/{self.orgs[domain].id}/', {'contact_person': 'New Person'},
                format='json').status_code, 200)


class OwnOrgEquipmentTests(OrgFixtureMixin, APITestCase):
    def test_org_adds_and_removes_its_own_equipment_for_both_domains(self):
        for domain, (_, _, equipment_model, _) in DOMAINS.items():
            self.client.force_authenticate(self.users[domain])
            created = self.client.post(
                f'/api/organizations/{domain}/{self.orgs[domain].id}/equipment/', equipment_body(domain), format='json')
            self.assertEqual(created.status_code, 201, created.content)
            equip_id = created.json()['id']
            self.assertEqual(equipment_model.objects.get(pk=equip_id).organization_id, self.orgs[domain].id)
            removed = self.client.delete(f'/api/organizations/{domain}/equipment/{equip_id}/')
            self.assertEqual(removed.status_code, 204, domain)
            self.assertFalse(equipment_model.objects.filter(pk=equip_id).exists())

    def test_org_cannot_add_equipment_to_another_org(self):
        for domain, (_, _, equipment_model, _) in DOMAINS.items():
            self.client.force_authenticate(self.users[domain])
            response = self.client.post(
                f'/api/organizations/{domain}/{self.others[domain].id}/equipment/', equipment_body(domain), format='json')
            self.assertIn(response.status_code, (403, 404), domain)
            self.assertFalse(equipment_model.objects.filter(organization=self.others[domain]).exists())

    def test_org_cannot_delete_another_orgs_equipment(self):
        for domain, (_, _, equipment_model, name) in DOMAINS.items():
            theirs = equipment_model.objects.create(
                organization=self.others[domain], equipment_name=name, quantity=1, condition='Good')
            self.client.force_authenticate(self.users[domain])
            response = self.client.delete(f'/api/organizations/{domain}/equipment/{theirs.id}/')
            self.assertIn(response.status_code, (403, 404), domain)
            self.assertTrue(equipment_model.objects.filter(pk=theirs.id).exists(), domain)

    def test_staff_unchanged(self):
        self.client.force_authenticate(self.staff)
        for domain, (_, _, equipment_model, _) in DOMAINS.items():
            created = self.client.post(
                f'/api/organizations/{domain}/{self.others[domain].id}/equipment/', equipment_body(domain), format='json')
            self.assertEqual(created.status_code, 201, domain)
            self.assertEqual(
                self.client.delete(f'/api/organizations/{domain}/equipment/{created.json()["id"]}/').status_code, 204)


class OrgIdCollisionTests(APITestCase):
    """A FISHERFOLK_ORG account whose id number equals a farmers' organization's pk (and the reverse) gets nothing."""

    @classmethod
    def setUpTestData(cls):
        cls.farmers_org = make_org(FarmersOrganization, 'Farmers Collide')
        # the fisherfolk organization is created until its pk equals the farmers' organization's pk
        fisherfolk_org = make_org(FisherfolkOrganization, 'Fisherfolk Collide')
        while fisherfolk_org.pk < cls.farmers_org.pk:
            fisherfolk_org = make_org(FisherfolkOrganization, 'Fisherfolk Collide')
        while cls.farmers_org.pk < fisherfolk_org.pk:
            cls.farmers_org = make_org(FarmersOrganization, 'Farmers Collide')
        cls.fisherfolk_org = fisherfolk_org
        assert cls.farmers_org.pk == cls.fisherfolk_org.pk
        cls.fish_user = make_citizen('collide-fish-org', 'FISHERFOLK_ORG', cls.fisherfolk_org.pk)
        cls.farm_user = make_citizen('collide-farm-org', 'FARMERS_ORG', cls.farmers_org.pk)
        cls.farm_equipment = FarmersOrganizationEquipment.objects.create(
            organization=cls.farmers_org, equipment_name='Hand Tractor', quantity=1, condition='Good')
        cls.fish_equipment = FisherfolkOrganizationEquipment.objects.create(
            organization=cls.fisherfolk_org, equipment_name='Fish Cage', quantity=1, condition='Good')

    def test_fisherfolk_org_cannot_reach_the_farmers_org_with_the_same_number(self):
        self.client.force_authenticate(self.fish_user)
        pk = self.farmers_org.pk
        self.assertIn(self.client.get(f'/api/organizations/farmers/{pk}/').status_code, (403, 404))
        self.assertIn(self.client.post(
            f'/api/organizations/farmers/{pk}/equipment/', equipment_body('farmers'), format='json').status_code, (403, 404))
        self.assertIn(self.client.delete(f'/api/organizations/farmers/equipment/{self.farm_equipment.id}/').status_code, (403, 404))
        self.assertTrue(FarmersOrganizationEquipment.objects.filter(pk=self.farm_equipment.id).exists())

    def test_farmers_org_cannot_reach_the_fisherfolk_org_with_the_same_number(self):
        self.client.force_authenticate(self.farm_user)
        pk = self.fisherfolk_org.pk
        self.assertIn(self.client.get(f'/api/organizations/fisherfolk/{pk}/').status_code, (403, 404))
        self.assertIn(self.client.post(
            f'/api/organizations/fisherfolk/{pk}/equipment/', equipment_body('fisherfolk'), format='json').status_code, (403, 404))
        self.assertIn(self.client.delete(f'/api/organizations/fisherfolk/equipment/{self.fish_equipment.id}/').status_code, (403, 404))
        self.assertTrue(FisherfolkOrganizationEquipment.objects.filter(pk=self.fish_equipment.id).exists())


class OrgStaffOnlyRoutesTests(OrgFixtureMixin, APITestCase):
    def test_org_is_refused_on_staff_only_routes(self):
        for domain in DOMAINS:
            org = self.orgs[domain].id
            self.client.force_authenticate(self.users[domain])
            for method, route in (
                    ('get', f'organizations/{domain}/'), ('post', f'organizations/{domain}/'),
                    ('post', f'organizations/{domain}/{org}/members/1/set-main/'),
                    ('patch', f'organizations/{domain}/members/1/'),
                    ('get', 'farmers/'), ('get', 'fisheries/fisherfolk/'), ('get', 'accounts/users/')):
                response = getattr(self.client, method)('/api/' + route, {}, format='json')
                self.assertEqual(response.status_code, 403, (method, route))


class OrgBeneficiaryCrossDomainTests(APITestCase):
    """Review finding: the beneficiary routes an organization already used compared a person id against the caller's
    own membership table without checking which domain the ROUTE belongs to. A fisherfolk organization whose member
    has the same id number as an unrelated farmer must get nothing on the crop routes (and the reverse)."""

    @classmethod
    def setUpTestData(cls):
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-990501', first_name='Collide', last_name='Farmer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        fisherfolk = Fisherfolk.objects.create(
            first_name='Collide', last_name='Fisher', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Inland', rsbsa_number='01-033-02-019-990502')
        # make the two person ids the same number
        while farmer.pk < fisherfolk.pk:
            farmer = Farmer.objects.create(
                rsbsa_number='01-033-02-019-99%04d' % (600 + farmer.pk), first_name='Pad', last_name='Farmer', gender='Male',
                birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        while fisherfolk.pk < farmer.pk:
            fisherfolk = Fisherfolk.objects.create(
                first_name='Pad', last_name='Fisher', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
                fisherfolk_type='Inland', rsbsa_number='01-033-02-019-98%04d' % (600 + fisherfolk.pk))
        assert farmer.pk == fisherfolk.pk
        cls.farmer, cls.fisherfolk = farmer, fisherfolk
        cls.farm_org, cls.fish_org = make_org(FarmersOrganization, 'Crop Org'), make_org(FisherfolkOrganization, 'Fish Org')
        FarmersOrganizationMember.objects.create(organization=cls.farm_org, farmer=farmer, date_joined=date(2026, 1, 1))
        FisherfolkOrganizationMember.objects.create(organization=cls.fish_org, fisherfolk=fisherfolk, date_joined=date(2026, 1, 1))
        cls.farm_user = make_citizen('xd-farm-org', 'FARMERS_ORG', cls.farm_org.id)
        cls.fish_user = make_citizen('xd-fish-org', 'FISHERFOLK_ORG', cls.fish_org.id)
        # a crop record for the farmer and a fisheries record for the fisherfolk, both reported by their own organization
        cls.crop_record = BeneficiaryRecord.objects.create(
            farmer=farmer, assistance_type='Seeds', date_given=date(2026, 8, 1), recorded_by=cls.farm_user)
        cls.fish_record = FisherfolkBeneficiaryRecord.objects.create(
            fisherfolk=fisherfolk, assistance_type='Feed', date_given=date(2026, 8, 1), recorded_by=cls.fish_user)

    def test_fisherfolk_org_cannot_read_or_create_crop_assistance_for_a_farmer_with_the_same_number(self):
        self.client.force_authenticate(self.fish_user)
        self.assertIn(self.client.get(f'/api/interventions/beneficiaries/{self.crop_record.id}/detail/').status_code, (403, 404))
        before = BeneficiaryRecord.objects.count()
        response = self.client.post('/api/interventions/beneficiaries/adhoc/', {
            'farmer': self.farmer.pk, 'assistance_type': 'Seeds', 'date_given': '2026-08-02', 'source_agencies': ['DA']}, format='json')
        self.assertIn(response.status_code, (403, 404), response.content)
        self.assertEqual(BeneficiaryRecord.objects.count(), before)

    def test_farmers_org_cannot_read_or_create_fisheries_assistance_for_a_fisherfolk_with_the_same_number(self):
        self.client.force_authenticate(self.farm_user)
        self.assertIn(self.client.get(f'/api/interventions/fisherfolk-beneficiaries/{self.fish_record.id}/detail/').status_code, (403, 404))
        before = FisherfolkBeneficiaryRecord.objects.count()
        response = self.client.post('/api/interventions/fisherfolk-beneficiaries/adhoc/', {
            'fisherfolk': self.fisherfolk.pk, 'assistance_type': 'Feed', 'date_given': '2026-08-02', 'source_agencies': ['DA']}, format='json')
        self.assertIn(response.status_code, (403, 404), response.content)
        self.assertEqual(FisherfolkBeneficiaryRecord.objects.count(), before)

    def test_each_organization_still_reaches_its_own_domain(self):
        self.client.force_authenticate(self.farm_user)
        self.assertEqual(self.client.get(f'/api/interventions/beneficiaries/{self.crop_record.id}/detail/').status_code, 200)
        self.client.force_authenticate(self.fish_user)
        self.assertEqual(self.client.get(f'/api/interventions/fisherfolk-beneficiaries/{self.fish_record.id}/detail/').status_code, 200)


def _farmer(n):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-97%04d' % n, first_name=f'Far{n}', last_name='Mer', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def _fisherfolk(n):
    return Fisherfolk.objects.create(
        first_name=f'Fis{n}', last_name='Her', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
        fisherfolk_type='Inland', rsbsa_number='01-033-02-019-96%04d' % n)


class OrgCannotStealMainTests(APITestCase):
    """Review finding: add-member honoured is_main from an organization, so a crafted request could take another
    organization's "main" status. Only staff may choose it."""

    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff('main-staff')
        cls.cases = {}
        for domain, (link_type, model, _, _) in DOMAINS.items():
            org_a, org_b = make_org(model, f'A {domain}'), make_org(model, f'B {domain}')
            if domain == 'farmers':
                person = _farmer(1)
                FarmersOrganizationMember.objects.create(organization=org_a, farmer=person, date_joined=date(2026, 1, 1), is_main=True)
            else:
                person = _fisherfolk(1)
                FisherfolkOrganizationMember.objects.create(organization=org_a, fisherfolk=person, date_joined=date(2026, 1, 1), is_main=True)
            cls.cases[domain] = (org_a, org_b, person, make_citizen(f'main-org-b-{domain}', link_type, org_b.id))

    def _mains(self, domain, org_a, org_b, person):
        key = 'farmer' if domain == 'farmers' else 'fisherfolk'
        member_model = FarmersOrganizationMember if domain == 'farmers' else FisherfolkOrganizationMember
        return (member_model.objects.get(organization=org_a, **{key: person}).is_main,
                member_model.objects.get(organization=org_b, **{key: person}).is_main)

    def _join(self, domain, org_b, person):
        key = 'farmer' if domain == 'farmers' else 'fisherfolk'
        return self.client.post(f'/api/organizations/{domain}/{org_b.id}/members/',
                                {key: person.pk, 'date_joined': '2026-02-01', 'is_main': True}, format='json')

    def test_an_organization_cannot_take_main_status_from_another_organization(self):
        for domain, (org_a, org_b, person, user) in self.cases.items():
            self.client.force_authenticate(user)
            self.assertEqual(self._join(domain, org_b, person).status_code, 201, domain)
            self.assertEqual(self._mains(domain, org_a, org_b, person), (True, False), domain)

    def test_staff_can_still_choose_main(self):
        self.client.force_authenticate(self.staff)
        for domain, (org_a, org_b, person, _) in self.cases.items():
            self.assertEqual(self._join(domain, org_b, person).status_code, 201, domain)
            self.assertEqual(self._mains(domain, org_a, org_b, person), (False, True), domain)


class OrgAssistanceIsolationTests(APITestCase):
    """History, confirmables and confirm-on-behalf stay inside the organization (review minor: no tests covered these)."""

    @classmethod
    def setUpTestData(cls):
        from interventions.models import BeneficiaryConfirmationRequest  # noqa: F401  (imported to make sure the model loads)
        cls.org1, cls.org2 = make_org(FarmersOrganization, 'Iso One'), make_org(FarmersOrganization, 'Iso Two')
        cls.user1, cls.user2 = make_citizen('iso-org-1', 'FARMERS_ORG', cls.org1.id), make_citizen('iso-org-2', 'FARMERS_ORG', cls.org2.id)
        cls.farmer1, cls.farmer2 = _farmer(11), _farmer(12)
        FarmersOrganizationMember.objects.create(organization=cls.org1, farmer=cls.farmer1, date_joined=date(2026, 1, 1))
        FarmersOrganizationMember.objects.create(organization=cls.org2, farmer=cls.farmer2, date_joined=date(2026, 1, 1))
        cls.rec1 = BeneficiaryRecord.objects.create(farmer=cls.farmer1, assistance_type='Seeds', date_given=date(2026, 8, 1), recorded_by=cls.user1)
        cls.rec2 = BeneficiaryRecord.objects.create(farmer=cls.farmer2, assistance_type='Seeds', date_given=date(2026, 8, 1), recorded_by=cls.user2)
        BeneficiaryRecord.objects.filter(pk__in=[cls.rec1.pk, cls.rec2.pk]).update(status='AWAITING_CONFIRMATION')

    def test_history_lists_only_what_this_organization_reported(self):
        self.client.force_authenticate(self.user1)
        ids = {r['id'] for r in self.client.get('/api/interventions/my-org-beneficiary-history/').json()}
        self.assertEqual(ids, {self.rec1.id})

    def test_confirmables_list_only_this_organizations_members(self):
        self.client.force_authenticate(self.user1)
        ids = {r['id'] for r in self.client.get('/api/interventions/my-org-accountless-confirmables/').json()}
        self.assertEqual(ids, {self.rec1.id})

    def test_an_organization_cannot_confirm_for_another_organizations_member(self):
        self.client.force_authenticate(self.user1)
        response = self.client.post(f'/api/interventions/beneficiaries/{self.rec2.id}/confirm-on-behalf/', {}, format='multipart')
        self.assertIn(response.status_code, (403, 404), response.content)
        self.rec2.refresh_from_db()
        self.assertEqual(self.rec2.status, 'AWAITING_CONFIRMATION')

    def test_a_fisherfolk_organization_cannot_use_the_crop_routes(self):
        fish_org = make_org(FisherfolkOrganization, 'Iso Fish')
        fish_user = make_citizen('iso-fish-org', 'FISHERFOLK_ORG', fish_org.id)
        self.client.force_authenticate(fish_user)
        self.assertEqual(self.client.get('/api/interventions/my-org-beneficiary-history/').json(), [])
        self.assertEqual(self.client.get('/api/interventions/my-org-accountless-confirmables/').json(), [])
        response = self.client.post(f'/api/interventions/beneficiaries/{self.rec1.id}/confirm-on-behalf/', {}, format='multipart')
        self.assertIn(response.status_code, (403, 404), response.content)
