"""An organization confirms that assistance reached several of its members in one go: one set of photos for all of them,
no staff approval step (the confirmation is final), and staff are told."""
import itertools
import os
import shutil
import tempfile
from datetime import date

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from core.models import Notification
from core.test_photos import png
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import (
    BeneficiaryConfirmationRequest, BeneficiaryConfirmationRequestPhoto, BeneficiaryRecord, DistributionStatus,
    FisherfolkBeneficiaryConfirmationRequest, FisherfolkBeneficiaryRecord,
)
from interventions.test_confirmation_photos import FARMER_REQUEST_DIR, make_citizen, make_org

AWAITING = DistributionStatus.AWAITING_CONFIRMATION
BULK = '/api/interventions/beneficiaries/confirm-on-behalf/'
FISH_BULK = '/api/interventions/fisherfolk-beneficiaries/confirm-on-behalf/'
_N = itertools.count(1)


def farmer(first):
    n = next(_N)
    return Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (870000 + n), first_name=first, last_name='Bulk', gender='Male',
                                 birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def awaiting_record(person, assistance='Seeds'):
    record = BeneficiaryRecord.objects.create(farmer=person, assistance_type=assistance, date_given=date(2026, 8, 1))
    BeneficiaryRecord.objects.filter(pk=record.pk).update(status=AWAITING)
    return BeneficiaryRecord.objects.get(pk=record.pk)


class BulkConfirmationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='bulk-staff', password='pw', role='ADMIN', email='bulk@x.test')
        cls.org = make_org(FarmersOrganization, 'Bulk Farmers')
        cls.other_org = make_org(FarmersOrganization, 'Other Farmers')
        cls.org_user = make_citizen('bulk-org', 'FARMERS_ORG', cls.org.id)
        cls.other_org_user = make_citizen('bulk-other-org', 'FARMERS_ORG', cls.other_org.id)

    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.people = [farmer(name) for name in ('Ana', 'Ben', 'Cora')]
        for person in self.people:
            FarmersOrganizationMember.objects.create(organization=self.org, farmer=person, date_joined=date(2026, 1, 1))
        self.records = [awaiting_record(p) for p in self.people]

    def send(self, records, photos=2, user=None, url=BULK):
        self.client.force_authenticate(user or self.org_user)
        data = {'record_ids': [str(r.id) for r in records]}
        data['photos'] = [png(f'p{i}.png') for i in range(photos)]
        return self.client.post(url, data, format='multipart')

    def status_of(self, record):
        return BeneficiaryRecord.objects.get(pk=record.pk).status

    def files(self):
        folder = os.path.join(self.media, FARMER_REQUEST_DIR)
        return sorted(os.listdir(folder)) if os.path.isdir(folder) else []

    # ── the happy path ───────────────────────────────────────────────────
    def test_every_selected_member_is_confirmed_at_once_with_no_review_step(self):
        response = self.send(self.records)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['confirmed'], 3)
        self.assertEqual({self.status_of(r) for r in self.records}, {DistributionStatus.CONFIRMED})
        requests = BeneficiaryConfirmationRequest.objects.filter(beneficiary_record__in=self.records)
        self.assertEqual(requests.count(), 3)
        self.assertEqual({r.status for r in requests}, {'APPROVED'})                 # nothing is waiting for staff
        self.assertFalse(BeneficiaryConfirmationRequest.objects.filter(status='PENDING').exists())

    def test_the_photos_are_stored_once_and_attached_to_every_member(self):
        self.send(self.records, photos=3)
        self.assertEqual(len(self.files()), 3)                                       # three files on disk, not nine
        for record in self.records:
            rows = BeneficiaryConfirmationRequestPhoto.objects.filter(confirmation_request__beneficiary_record=record)
            self.assertEqual(rows.count(), 3, record.id)
        names = {row.image.name for row in BeneficiaryConfirmationRequestPhoto.objects.all()}
        self.assertEqual(len(names), 3)

    def test_only_the_selected_members_are_confirmed(self):
        self.send(self.records[:2])
        self.assertEqual([self.status_of(r) for r in self.records], ['CONFIRMED', 'CONFIRMED', AWAITING])

    def test_staff_are_told_once_how_many_were_confirmed(self):
        self.send(self.records)
        notes = Notification.objects.filter(recipient=self.staff)
        self.assertEqual(notes.count(), 1)
        self.assertIn('3', notes[0].record_label)
        self.assertIn('Bulk Farmers', notes[0].record_label)
        self.assertEqual(notes[0].record_type, 'beneficiary_obo_confirmed')

    def test_the_single_member_endpoint_is_final_too(self):
        self.client.force_authenticate(self.org_user)
        response = self.client.post(f'/api/interventions/beneficiaries/{self.records[0].id}/confirm-on-behalf/',
                                    {'photos': [png('a.png'), png('b.png')]}, format='multipart')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.status_of(self.records[0]), 'CONFIRMED')

    def test_the_staff_report_lists_them(self):
        self.send(self.records)
        self.client.force_authenticate(self.staff)
        response = self.client.get('/api/reports/beneficiary-confirmations/', {'format': 'json'})
        self.assertEqual(response.status_code, 200)

    # ── the rules ────────────────────────────────────────────────────────
    def test_at_least_two_photos_are_needed_once_for_all(self):
        for count in (0, 1):
            response = self.send(self.records, photos=count)
            self.assertEqual(response.status_code, 400, count)
            self.assertEqual(response.json()['photos'], ['Add at least 2 photos as proof.'])
        self.assertEqual({self.status_of(r) for r in self.records}, {AWAITING})

    def test_nothing_is_selected(self):
        self.assertEqual(self.send([]).status_code, 400)

    def test_a_member_of_another_organization_stops_the_whole_request(self):
        stranger = farmer('Dan')
        FarmersOrganizationMember.objects.create(organization=self.other_org, farmer=stranger, date_joined=date(2026, 1, 1))
        foreign = awaiting_record(stranger)
        response = self.send(self.records + [foreign])
        self.assertEqual(response.status_code, 403)
        self.assertEqual({self.status_of(r) for r in self.records + [foreign]}, {AWAITING})

    def test_a_record_that_is_not_awaiting_stops_the_whole_request(self):
        BeneficiaryRecord.objects.filter(pk=self.records[1].pk).update(status=DistributionStatus.CONFIRMED)
        response = self.send(self.records)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Ben', ' '.join(response.json()['record_ids']))
        self.assertEqual(self.status_of(self.records[0]), AWAITING)

    def test_a_member_with_a_working_account_must_confirm_themselves(self):
        make_citizen('bulk-ana', 'FARMER', self.people[0].id)
        response = self.send(self.records)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.status_of(self.records[1]), AWAITING)

    def test_a_request_still_pending_staff_review_blocks_that_member(self):
        BeneficiaryConfirmationRequest.objects.create(beneficiary_record=self.records[2], submitted_by_organization=self.org,
                                                      submitted_by=self.org_user)
        response = self.send(self.records)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.status_of(self.records[0]), AWAITING)

    def test_only_the_organization_itself_can_do_this(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.send(self.records, user=self.staff).status_code, 403)
        farmer_user = make_citizen('bulk-farmer-user', 'FARMER', farmer('Eve').id)
        self.assertEqual(self.send(self.records, user=farmer_user).status_code, 403)

    def test_an_unknown_record_is_refused(self):
        self.client.force_authenticate(self.org_user)
        response = self.client.post(BULK, {'record_ids': ['999999'], 'photos': [png('a.png'), png('b.png')]}, format='multipart')
        self.assertEqual(response.status_code, 400)

    def test_too_many_records_at_once_are_refused(self):
        self.client.force_authenticate(self.org_user)
        response = self.client.post(BULK, {'record_ids': [str(i) for i in range(1, 102)], 'photos': [png('a.png'), png('b.png')]}, format='multipart')
        self.assertEqual(response.status_code, 400)


class BulkFisherfolkConfirmationTests(APITestCase):
    def test_fisherfolk_organizations_do_the_same(self):
        staff = get_user_model().objects.create_user(username='bulkf-staff', password='pw', role='ADMIN', email='bulkf@x.test')
        org = make_org(FisherfolkOrganization, 'Bulk Fisherfolk')
        user = make_citizen('bulkf-org', 'FISHERFOLK_ORG', org.id)
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, True)
        with override_settings(MEDIA_ROOT=media):
            records = []
            for name in ('Ann', 'Bo'):
                person = Fisherfolk.objects.create(rsbsa_number='01-033-02-019-%06d' % (860000 + next(_N)), first_name=name, last_name='Bulk',
                                                   gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
                FisherfolkOrganizationMember.objects.create(organization=org, fisherfolk=person, date_joined=date(2026, 1, 1))
                record = FisherfolkBeneficiaryRecord.objects.create(fisherfolk=person, assistance_type='Feed', date_given=date(2026, 8, 1))
                FisherfolkBeneficiaryRecord.objects.filter(pk=record.pk).update(status=AWAITING)
                records.append(record)
            self.client.force_authenticate(user)
            response = self.client.post(FISH_BULK, {'record_ids': [str(r.id) for r in records], 'photos': [png('a.png'), png('b.png')]}, format='multipart')
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual({FisherfolkBeneficiaryRecord.objects.get(pk=r.pk).status for r in records}, {'CONFIRMED'})
            self.assertFalse(FisherfolkBeneficiaryConfirmationRequest.objects.filter(status='PENDING').exists())
            self.assertEqual(Notification.objects.filter(recipient=staff).count(), 1)
