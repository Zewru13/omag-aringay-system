"""An organization's on-behalf-of confirmation needs at least 2 proof photos, and staff cannot reject one without
writing why: the note goes to the organization (notification and the assistance row)."""
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
    BeneficiaryConfirmationRequest, BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryConfirmationRequest,
    FisherfolkBeneficiaryRecord,
)
from interventions.test_confirmation_photos import make_citizen, make_org

AWAITING = DistributionStatus.AWAITING_CONFIRMATION
NOTE_MISSING = 'Write why you are rejecting this confirmation, so the organization knows what to fix.'


class OnBehalfRulesTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='obo-staff', password='pw', role='ADMIN', email='obo-staff@x.test')
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-980001', first_name='Cora', last_name='Rules', gender='Female',
            birthdate=date(1980, 1, 1), barangay='Alaska', civil_status='Single')
        fisherfolk = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-980002', first_name='Ben', last_name='Rules', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        farm_org, fish_org = make_org(FarmersOrganization, 'Rules Farmers'), make_org(FisherfolkOrganization, 'Rules Fisherfolk')
        FarmersOrganizationMember.objects.create(organization=farm_org, farmer=farmer, date_joined=date(2026, 1, 1))
        FisherfolkOrganizationMember.objects.create(organization=fish_org, fisherfolk=fisherfolk, date_joined=date(2026, 1, 1))
        cls.farm_user = make_citizen('obo-farm-org', 'FARMERS_ORG', farm_org.id)
        cls.fish_user = make_citizen('obo-fish-org', 'FISHERFOLK_ORG', fish_org.id)
        farm_record = BeneficiaryRecord.objects.create(farmer=farmer, assistance_type='Seeds', date_given=date(2026, 8, 1), recorded_by=cls.staff)
        fish_record = FisherfolkBeneficiaryRecord.objects.create(fisherfolk=fisherfolk, assistance_type='Feed', date_given=date(2026, 8, 1), recorded_by=cls.staff)
        BeneficiaryRecord.objects.filter(pk=farm_record.pk).update(status=AWAITING)
        FisherfolkBeneficiaryRecord.objects.filter(pk=fish_record.pk).update(status=AWAITING)
        cls.records = {'farmer': farm_record, 'fisherfolk': fish_record}
        # domain -> (organization account, confirm URL, review-queue base URL, request model, org's confirmables list)
        cls.domains = {
            'farmer': (cls.farm_user, f'/api/interventions/beneficiaries/{farm_record.id}/confirm-on-behalf/',
                       '/api/interventions/beneficiary-confirmation-requests/', BeneficiaryConfirmationRequest,
                       '/api/interventions/my-org-accountless-confirmables/'),
            'fisherfolk': (cls.fish_user, f'/api/interventions/fisherfolk-beneficiaries/{fish_record.id}/confirm-on-behalf/',
                           '/api/interventions/fisherfolk-beneficiary-confirmation-requests/', FisherfolkBeneficiaryConfirmationRequest,
                           '/api/interventions/my-org-fisherfolk-accountless-confirmables/'),
        }

    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)

    def submit(self, domain, files):
        user, url, _, _, _ = self.domains[domain]
        self.client.force_authenticate(user)
        data = {}
        for field, f in files:
            data.setdefault(field, []).append(f)
        return self.client.post(url, data, format='multipart')

    def two_photos(self):
        return [('photos', png('a.png')), ('photos', png('b.png'))]

    def pending_request(self, domain):
        """A request still waiting for staff: new confirmations are final, but older ones can still be waiting."""
        user, _, _, model, _ = self.domains[domain]
        return model.objects.create(beneficiary_record=self.records[domain], submitted_by_organization_id=user.linked_record_id,
                                    submitted_by=user).id

    def decide(self, domain, request_id, action, **body):
        self.client.force_authenticate(self.staff)
        return self.client.post(f'{self.domains[domain][2]}{request_id}/{action}/', body, format='json')

    # ── at least 2 proof photos ───────────────────────────────────────────────

    def test_fewer_than_two_photos_is_refused_and_creates_nothing(self):
        for domain, (_, _, _, model, _) in self.domains.items():
            for files in ([], [('photos', png('a.png'))], [('photo', png('legacy.png'))]):
                response = self.submit(domain, files)
                self.assertEqual(response.status_code, 400, f'{domain} {len(files)} photo(s)')
                self.assertEqual(response.json()['photos'], ['Add at least 2 photos as proof.'])
                self.assertEqual(model.objects.count(), 0)

    def test_exactly_two_photos_is_enough(self):
        for domain, (_, _, _, model, _) in self.domains.items():
            response = self.submit(domain, self.two_photos())
            self.assertEqual(response.status_code, 201, domain)
            self.assertEqual(model.objects.get(beneficiary_record=self.records[domain]).photos.count(), 2, domain)

    # ── a rejection needs a note, and the organization receives it ───────────

    def test_reject_without_a_note_is_refused_and_the_request_stays_pending(self):
        for domain, (org_user, _, _, model, _) in self.domains.items():
            request_id = self.pending_request(domain)
            for body in ({}, {'rejection_reason': ''}, {'rejection_reason': '   '}):
                response = self.decide(domain, request_id, 'reject', **body)
                self.assertEqual(response.status_code, 400, f'{domain} {body}')
                self.assertEqual(response.json()['rejection_reason'], [NOTE_MISSING])
            self.assertEqual(model.objects.get(pk=request_id).status, 'PENDING')
            self.assertFalse(Notification.objects.filter(recipient=org_user, verb__startswith='rejected').exists())

    def test_a_note_longer_than_255_characters_is_refused_not_cut(self):
        for domain, (_, _, _, model, _) in self.domains.items():
            request_id = self.pending_request(domain)
            response = self.decide(domain, request_id, 'reject', rejection_reason='x' * 256)
            self.assertEqual(response.status_code, 400, domain)
            self.assertIn('255', response.json()['rejection_reason'][0])
            self.assertEqual(model.objects.get(pk=request_id).status, 'PENDING')

    def test_the_note_reaches_the_organization(self):
        for domain, (org_user, _, _, model, confirmables) in self.domains.items():
            request_id = self.pending_request(domain)
            response = self.decide(domain, request_id, 'reject', rejection_reason='  The photos do not show the seeds.  ')
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(model.objects.get(pk=request_id).rejection_reason, 'The photos do not show the seeds.')
            note = Notification.objects.get(recipient=org_user, verb='rejected your on-behalf-of confirmation for')
            self.assertEqual(note.detail, 'The photos do not show the seeds.')
            # and the organization's own assistance row carries it, so it can fix and resubmit
            self.client.force_authenticate(org_user)
            row = self.client.get(confirmables).json()[0]
            self.assertEqual((row['latest_request_status'], row['latest_request_reason']), ('REJECTED', 'The photos do not show the seeds.'))

    def test_approving_needs_no_note(self):
        for domain, (_, _, _, model, _) in self.domains.items():
            request_id = self.pending_request(domain)
            self.assertEqual(self.decide(domain, request_id, 'approve').status_code, 200, domain)
            self.assertEqual(model.objects.get(pk=request_id).status, 'APPROVED')
