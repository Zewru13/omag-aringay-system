"""An organization may edit the assistance records it submitted only while they are Pending; once a record is
Confirmed (or later) it is the recipient's record and only staff can change it. The screens already hide the edit
button; this pins the backend so a hand-made request cannot get around it."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'ORGEDIT-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_citizen(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


DOMAINS = {
    'farmers': ('FARMERS_ORG', 'beneficiaries'),
    'fisherfolk': ('FISHERFOLK_ORG', 'fisherfolk-beneficiaries'),
}


class OrganizationEditsOnlyPendingRecordsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        n = next(_N)
        cls.staff = User.objects.create_user(username='oe-staff', password='pw', role='ADMIN', email='oe-staff@x.test')
        farm_org = make_org(FarmersOrganization, 'Edit Farmers')
        fish_org = make_org(FisherfolkOrganization, 'Edit Fisherfolk')
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (970000 + n), first_name='Ana', last_name='Editor', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (971000 + n), first_name='Ben', last_name='Editor', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        FarmersOrganizationMember.objects.create(organization=farm_org, farmer=farmer, date_joined=date(2025, 1, 1), is_main=True)
        FisherfolkOrganizationMember.objects.create(organization=fish_org, fisherfolk=fisher, date_joined=date(2025, 1, 1), is_main=True)
        cls.org_users = {
            'farmers': make_citizen('oe-farm-org', 'FARMERS_ORG', farm_org.id),
            'fisherfolk': make_citizen('oe-fish-org', 'FISHERFOLK_ORG', fish_org.id),
        }
        cls.person = {'farmers': farmer, 'fisherfolk': fisher}

    def make_record(self, domain, status):
        user = self.org_users[domain]
        if domain == 'farmers':
            record = BeneficiaryRecord.objects.create(
                farmer=self.person[domain], assistance_type='Seeds', source_agencies=['DA'],
                date_given=date(2026, 1, 1), recorded_by=user)
        else:
            record = FisherfolkBeneficiaryRecord.objects.create(
                fisherfolk=self.person[domain], assistance_type='Fish Cage', source_agencies=['BFAR'],
                date_given=date(2026, 1, 1), recorded_by=user)
        type(record).objects.filter(pk=record.pk).update(status=status)
        return record

    def patch(self, domain, record, user, remarks='changed'):
        self.client.force_authenticate(user)
        return self.client.patch(f'/api/interventions/{DOMAINS[domain][1]}/{record.pk}/detail/', {'remarks': remarks}, format='json')

    def test_an_organization_can_edit_its_pending_record(self):
        for domain in DOMAINS:
            record = self.make_record(domain, DistributionStatus.PENDING)
            res = self.patch(domain, record, self.org_users[domain])
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(type(record).objects.get(pk=record.pk).remarks, 'changed')

    def test_an_organization_cannot_edit_its_confirmed_record(self):
        for domain in DOMAINS:
            record = self.make_record(domain, DistributionStatus.CONFIRMED)
            res = self.patch(domain, record, self.org_users[domain])
            self.assertEqual(res.status_code, 400, (domain, res.data))
            self.assertEqual(type(record).objects.get(pk=record.pk).remarks, '')

    def test_an_organization_cannot_edit_a_record_that_is_awaiting_confirmation(self):
        for domain in DOMAINS:
            record = self.make_record(domain, DistributionStatus.AWAITING_CONFIRMATION)
            self.assertEqual(self.patch(domain, record, self.org_users[domain]).status_code, 400)

    def test_staff_can_still_edit_a_confirmed_record(self):
        for domain in DOMAINS:
            record = self.make_record(domain, DistributionStatus.CONFIRMED)
            res = self.patch(domain, record, self.staff)
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(type(record).objects.get(pk=record.pk).remarks, 'changed')


class StaffCorrectionsTests(OrganizationEditsOnlyPendingRecordsTests):
    """New assistance is Awaiting Confirmation from the moment it is logged, so staff must still be able to fix a typo then;
    once the recipient has reported or the case is followed up, staff cannot rewrite it."""

    def test_staff_can_edit_a_record_that_is_awaiting_confirmation(self):
        for domain in DOMAINS:
            record = self.make_record(domain, DistributionStatus.AWAITING_CONFIRMATION)
            res = self.patch(domain, record, self.staff)
            self.assertEqual(res.status_code, 200, (domain, res.data))
            self.assertEqual(type(record).objects.get(pk=record.pk).remarks, 'changed')

    def test_staff_cannot_edit_a_record_the_recipient_reported_or_that_was_resolved(self):
        for domain in DOMAINS:
            for status in (DistributionStatus.NOT_RECEIVED, DistributionStatus.RESOLVED):
                record = self.make_record(domain, status)
                self.assertEqual(self.patch(domain, record, self.staff).status_code, 400, (domain, status))
