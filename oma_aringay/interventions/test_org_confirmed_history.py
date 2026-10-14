"""Each organization keeps a history of what it confirmed for its members (newest first), visible to staff and to that
organization only; the confirmations themselves are final, so there is no review queue."""
import shutil
import tempfile
from datetime import date

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember
from core.test_photos import png
from fisheries.models import Fisherfolk
from interventions.models import DistributionStatus, FisherfolkBeneficiaryRecord
from interventions.test_confirmation_photos import make_citizen, make_org
from interventions.test_org_bulk_confirmation import AWAITING, BULK, FISH_BULK, awaiting_record, farmer

HISTORY = '/api/interventions/confirmed-for-members/{type}/{id}/'


class OrgConfirmedHistoryTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='hist-staff', password='pw', role='ADMIN', email='hist@x.test')
        cls.org = make_org(FarmersOrganization, 'History Farmers')
        cls.other = make_org(FarmersOrganization, 'Other History Farmers')
        cls.org_user = make_citizen('hist-org', 'FARMERS_ORG', cls.org.id)
        cls.other_user = make_citizen('hist-other', 'FARMERS_ORG', cls.other.id)

    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)
        self.people = [farmer(n) for n in ('Ana', 'Ben')]
        for p in self.people:
            FarmersOrganizationMember.objects.create(organization=self.org, farmer=p, date_joined=date(2026, 1, 1))
        self.records = [awaiting_record(p) for p in self.people]

    def confirm(self, records):
        self.client.force_authenticate(self.org_user)
        r = self.client.post(BULK, {'record_ids': [str(x.id) for x in records], 'photos': [png('a.png'), png('b.png')]}, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)

    def history(self, user, org_id=None, type_='farmers'):
        self.client.force_authenticate(user)
        return self.client.get(HISTORY.format(type=type_, id=org_id or self.org.id))

    def test_what_the_organization_confirmed_is_listed_with_member_assistance_and_photos(self):
        self.confirm(self.records)
        data = self.history(self.staff).json()
        self.assertEqual(data['count'], 2)
        row = data['results'][0]
        self.assertEqual(row['status'], 'APPROVED')
        self.assertTrue(row['member_rsbsa'].startswith('01-033-02-019-'))
        self.assertEqual(row['assistance_type'], 'Seeds')
        self.assertEqual(len(row['photo_urls']), 2)
        self.assertIn('farmer_full_name', row)

    def test_nothing_is_listed_before_a_confirmation_and_unconfirmed_records_never_appear(self):
        self.assertEqual(self.history(self.staff).json()['count'], 0)
        self.confirm(self.records[:1])
        self.assertEqual(self.history(self.staff).json()['count'], 1)

    def test_an_organization_sees_only_its_own_history(self):
        self.confirm(self.records)
        self.assertEqual(self.history(self.org_user).status_code, 200)
        self.assertEqual(self.history(self.org_user).json()['count'], 2)
        self.assertEqual(self.history(self.other_user).status_code, 403)               # another organization's page
        self.assertEqual(self.history(self.other_user, org_id=self.other.id).json()['count'], 0)

    def test_a_plain_citizen_cannot_read_it(self):
        member = make_citizen('hist-member', 'FARMER', self.people[0].id)
        self.assertEqual(self.history(member).status_code, 403)

    def test_an_unknown_organization_type_is_not_found(self):
        self.assertEqual(self.history(self.staff, type_='boats').status_code, 404)

    def test_the_fisherfolk_history_works_the_same_way(self):
        org = make_org(FisherfolkOrganization, 'History Fishers')
        user = make_citizen('hist-fish-org', 'FISHERFOLK_ORG', org.id)
        person = Fisherfolk.objects.create(
            first_name='Fin', last_name='Hist', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-871001')
        FisherfolkOrganizationMember.objects.create(organization=org, fisherfolk=person, date_joined=date(2026, 1, 1))
        record = FisherfolkBeneficiaryRecord.objects.create(fisherfolk=person, assistance_type='Feed', date_given=date(2026, 8, 1))
        FisherfolkBeneficiaryRecord.objects.filter(pk=record.pk).update(status=AWAITING)
        self.client.force_authenticate(user)
        r = self.client.post(FISH_BULK, {'record_ids': [str(record.id)], 'photos': [png('a.png'), png('b.png')]}, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        rows = self.history(self.staff, org_id=org.id, type_='fisherfolk').json()['results']
        self.assertEqual([x['assistance_type'] for x in rows], ['Feed'])
        self.assertEqual(rows[0]['member_rsbsa'], '01-033-02-019-871001')


class FinalizePendingCommandTests(APITestCase):
    def test_pending_requests_left_over_are_finalized_into_the_history(self):
        from io import StringIO

        from django.core.management import call_command
        from interventions.models import BeneficiaryConfirmationRequest

        org = make_org(FarmersOrganization, 'Legacy Farmers')
        person = farmer('Leo')
        record = awaiting_record(person)
        req = BeneficiaryConfirmationRequest.objects.create(beneficiary_record=record, submitted_by_organization=org)   # Pending
        call_command('finalize_pending_org_confirmations', '--dry-run', stdout=StringIO())
        req.refresh_from_db()
        self.assertEqual(req.status, 'PENDING')
        call_command('finalize_pending_org_confirmations', stdout=StringIO())
        req.refresh_from_db()
        record.refresh_from_db()
        self.assertEqual((req.status, record.status), ('APPROVED', DistributionStatus.CONFIRMED))
        self.assertIsNotNone(record.confirmed_at)
