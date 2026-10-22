"""Assistance confirmations take up to 10 proof photos: the recipient's own confirmation and the organization's
on-behalf-of requests (farmers and fisherfolk); the older single photo field still works."""
import itertools
import os
import shutil
import tempfile
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from core.test_photos import big_png, png
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import (
    BeneficiaryConfirmationRequest, BeneficiaryConfirmationRequestPhoto, BeneficiaryRecord, BeneficiaryRecordPhoto,
    DistributionStatus, FisherfolkBeneficiaryConfirmationRequest, FisherfolkBeneficiaryConfirmationRequestPhoto,
    FisherfolkBeneficiaryRecord,
)

_N = itertools.count(1)
AWAITING = DistributionStatus.AWAITING_CONFIRMATION
OWN_DIR = os.path.join('beneficiary_confirmations', 'photos')
FARMER_REQUEST_DIR = os.path.join('beneficiary_confirmations', 'farmers', 'photos')
FISHERFOLK_REQUEST_DIR = os.path.join('beneficiary_confirmations', 'fisherfolk', 'photos')


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'CONF-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class ConfirmationPhotoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        n = next(_N)
        cls.staff = get_user_model().objects.create_user(username='cp-staff', password='pw', role='ADMIN', email='cp-staff@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (960000 + n), first_name='Ana', last_name='Proof', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.fisherfolk = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (961000 + n), first_name='Ben', last_name='Proof', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        # people WITHOUT a citizen account: only they can be confirmed on their behalf by their organization
        cls.lonely_farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (962000 + n), first_name='Cora', last_name='Proof', gender='Female',
            birthdate=date(1980, 1, 1), barangay='Alaska', civil_status='Single')
        cls.farm_org = make_org(FarmersOrganization, 'Proof Farmers')
        cls.fish_org = make_org(FisherfolkOrganization, 'Proof Fisherfolk')
        FarmersOrganizationMember.objects.create(organization=cls.farm_org, farmer=cls.lonely_farmer, date_joined=date(2026, 1, 1))
        FisherfolkOrganizationMember.objects.create(organization=cls.fish_org, fisherfolk=cls.fisherfolk, date_joined=date(2026, 1, 1))
        cls.farm_org_user = make_citizen('cp-farm-org', 'FARMERS_ORG', cls.farm_org.id)
        cls.fish_org_user = make_citizen('cp-fish-org', 'FISHERFOLK_ORG', cls.fish_org.id)
        cls.farmer_user = make_citizen('cp-farmer', 'FARMER', cls.farmer.id)

    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)

    def files_in(self, folder):
        path = os.path.join(self.media, folder)
        return sorted(os.listdir(path)) if os.path.isdir(path) else []

    def awaiting_farmer_record(self, farmer=None):
        record = BeneficiaryRecord.objects.create(
            farmer=farmer or self.farmer, assistance_type='Seeds', date_given=date(2026, 8, 1), recorded_by=self.staff)
        BeneficiaryRecord.objects.filter(pk=record.pk).update(status=AWAITING)
        return record

    def awaiting_fisherfolk_record(self):
        record = FisherfolkBeneficiaryRecord.objects.create(
            fisherfolk=self.fisherfolk, assistance_type='Feed', date_given=date(2026, 8, 1), recorded_by=self.staff)
        FisherfolkBeneficiaryRecord.objects.filter(pk=record.pk).update(status=AWAITING)
        return record

    # ── the recipient's own confirmation ─────────────────────────────────────

    def confirm(self, record, files=(), **extra):
        data = {'confirmation_note': 'received'}
        for field, f in files:
            data.setdefault(field, []).append(f)
        data.update(extra)
        return self.client.post(f'/api/interventions/beneficiaries/{record.id}/confirm-received/', data, format='multipart')

    def test_own_confirmation_with_zero_three_and_ten_photos(self):
        self.client.force_authenticate(self.farmer_user)
        for count in (0, 3, 10):
            record = self.awaiting_farmer_record()
            response = self.confirm(record, [('confirmation_photos', png(f'c{count}-{i}.png')) for i in range(count)])
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(len(response.json()['confirmation_photos']), count)
            record.refresh_from_db()
            self.assertEqual(record.status, DistributionStatus.CONFIRMED)
            self.assertEqual(record.photos.count(), count)
            self.assertFalse(record.confirmation_photo)

    def test_own_confirmation_with_too_many_or_a_bad_photo_changes_nothing(self):
        self.client.force_authenticate(self.farmer_user)
        record = self.awaiting_farmer_record()
        response = self.confirm(record, [('confirmation_photos', png(f'p{i}.png')) for i in range(11)])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['confirmation_photos'], ['Maximum of 10 photos allowed.'])
        bad = self.confirm(record, [('confirmation_photos', png('a.png')),
                                    ('confirmation_photos', SimpleUploadedFile('b.png', b'nope', content_type='image/png'))])
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.confirm(record, [('confirmation_photos', big_png())]).status_code, 400)
        record.refresh_from_db()
        self.assertEqual(record.status, AWAITING)
        self.assertEqual(record.photos.count(), 0)
        self.assertEqual(self.files_in(OWN_DIR), [])

    def test_own_confirmation_legacy_single_photo_is_a_row_and_counts(self):
        self.client.force_authenticate(self.farmer_user)
        record = self.awaiting_farmer_record()
        response = self.confirm(record, [('confirmation_photo', png('legacy.png'))])
        self.assertEqual(response.status_code, 200, response.content)
        record.refresh_from_db()
        self.assertFalse(record.confirmation_photo)
        self.assertEqual(record.photos.count(), 1)
        other = self.awaiting_farmer_record()
        too_many = self.confirm(other, [('confirmation_photos', png(f'p{i}.png')) for i in range(10)] + [('confirmation_photo', png('l.png'))])
        self.assertEqual(too_many.status_code, 400)

    def test_own_confirmation_failure_after_files_were_written_rolls_everything_back(self):
        self.client.force_authenticate(self.farmer_user)
        self.client.raise_request_exception = False
        record = self.awaiting_farmer_record()
        real_create = BeneficiaryRecordPhoto.objects.create
        calls = {'n': 0}

        def second_fails(*args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 2:
                raise RuntimeError('simulated')
            return real_create(*args, **kwargs)

        with mock.patch('interventions.views.BeneficiaryRecordPhoto.objects.create', side_effect=second_fails):
            response = self.confirm(record, [('confirmation_photos', png(f'p{i}.png')) for i in range(3)])
        self.assertEqual(response.status_code, 500)
        record.refresh_from_db()
        self.assertEqual(record.status, AWAITING)
        self.assertEqual(record.photos.count(), 0)
        self.assertEqual(self.files_in(OWN_DIR), [])

    def test_a_second_confirmation_adds_no_more_photos(self):
        self.client.force_authenticate(self.farmer_user)
        record = self.awaiting_farmer_record()
        self.assertEqual(self.confirm(record, [('confirmation_photos', png('a.png'))]).status_code, 200)
        again = self.confirm(record, [('confirmation_photos', png('b.png'))])
        self.assertEqual(again.status_code, 400)
        self.assertEqual(record.photos.count(), 1)

    def test_two_simultaneous_confirmations_add_photos_only_once(self):
        """The other request finishes between this one's status check and its save: the status is re-checked under a
        row lock inside the transaction, so this one is refused and adds no photo rows."""
        from interventions import views as intervention_views
        self.client.force_authenticate(self.farmer_user)
        record = self.awaiting_farmer_record()
        real = intervention_views.validated_photos

        def other_request_wins(*args, **kwargs):
            BeneficiaryRecord.objects.filter(pk=record.pk).update(status=DistributionStatus.CONFIRMED)
            return real(*args, **kwargs)

        with mock.patch('interventions.views.validated_photos', side_effect=other_request_wins):
            response = self.confirm(record, [('confirmation_photos', png('late.png'))])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(record.photos.count(), 0)
        self.assertEqual(self.files_in(OWN_DIR), [])

    def test_the_assistance_list_loads_confirmation_photos_in_one_query(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        for _ in range(3):
            record = self.awaiting_farmer_record()
            for i in range(2):
                BeneficiaryRecordPhoto.objects.create(beneficiary_record=record, image=png(f'l{i}.png'), uploaded_by=self.staff)
        self.client.force_authenticate(self.staff)
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get('/api/interventions/beneficiaries/adhoc/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sum(len(r['confirmation_photos']) for r in response.json()), 6)
        photo_queries = [q for q in ctx.captured_queries if 'beneficiaryrecordphoto' in q['sql'].lower()]
        self.assertEqual(len(photo_queries), 1)

    def test_confirmation_response_and_detail_expose_the_photo_list(self):
        record = self.awaiting_farmer_record()
        self.client.force_authenticate(self.farmer_user)
        self.confirm(record, [('confirmation_photos', png('a.png')), ('confirmation_photos', png('b.png'))])
        self.client.force_authenticate(self.staff)
        detail = self.client.get(f'/api/interventions/beneficiaries/{record.id}/detail/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.json()['confirmation_photos']), 2)

    # ── on behalf of an account-less recipient ───────────────────────────────

    def on_behalf(self, url, files=()):
        data = {}
        for field, f in files:
            data.setdefault(field, []).append(f)
        return self.client.post(url, data, format='multipart')

    def farmer_url(self, record):
        return f'/api/interventions/beneficiaries/{record.id}/confirm-on-behalf/'

    def fisherfolk_url(self, record):
        return f'/api/interventions/fisherfolk-beneficiaries/{record.id}/confirm-on-behalf/'

    def test_on_behalf_farmer_and_fisherfolk_with_several_photos(self):
        farmer_record, fisherfolk_record = self.awaiting_farmer_record(self.lonely_farmer), self.awaiting_fisherfolk_record()
        cases = [
            (self.farm_org_user, self.farmer_url(farmer_record), farmer_record, BeneficiaryConfirmationRequest, FARMER_REQUEST_DIR),
            (self.fish_org_user, self.fisherfolk_url(fisherfolk_record), fisherfolk_record, FisherfolkBeneficiaryConfirmationRequest, FISHERFOLK_REQUEST_DIR),
        ]
        for user, url, record, model, folder in cases:
            self.client.force_authenticate(user)
            response = self.on_behalf(url, [('photos', png(f'o{i}.png')) for i in range(3)])
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(response.json()['confirmed'], 1)
            self.assertEqual(model.objects.get(beneficiary_record=record).photos.count(), 3)
            self.assertEqual(len(self.files_in(folder)), 3)

    def test_on_behalf_with_too_many_or_a_bad_photo_creates_no_request(self):
        for user, url, model, folder in [
            (self.farm_org_user, self.farmer_url(self.awaiting_farmer_record(self.lonely_farmer)), BeneficiaryConfirmationRequest, FARMER_REQUEST_DIR),
            (self.fish_org_user, self.fisherfolk_url(self.awaiting_fisherfolk_record()), FisherfolkBeneficiaryConfirmationRequest, FISHERFOLK_REQUEST_DIR),
        ]:
            self.client.force_authenticate(user)
            self.assertEqual(self.on_behalf(url, [('photos', png(f'p{i}.png')) for i in range(11)]).status_code, 400)
            bad = self.on_behalf(url, [('photos', png('a.png')), ('photos', SimpleUploadedFile('b.png', b'nope', content_type='image/png'))])
            self.assertEqual(bad.status_code, 400)
            self.assertEqual(model.objects.count(), 0)
            self.assertEqual(self.files_in(folder), [])

    def test_on_behalf_legacy_photo_is_a_row(self):
        self.client.force_authenticate(self.farm_org_user)
        # the older single field counts as one of the (at least two) proof photos
        record = self.awaiting_farmer_record(self.lonely_farmer)
        response = self.on_behalf(self.farmer_url(record), [('photo', png('legacy.png')), ('photos', png('second.png'))])
        self.assertEqual(response.status_code, 201, response.content)
        request = BeneficiaryConfirmationRequest.objects.get(beneficiary_record=record)
        self.assertFalse(request.photo)
        self.assertEqual(request.photos.count(), 2)

    def test_on_behalf_failure_after_files_were_written_leaves_nothing(self):
        self.client.force_authenticate(self.farm_org_user)
        self.client.raise_request_exception = False
        real_create = BeneficiaryConfirmationRequestPhoto.objects.create
        calls = {'n': 0}

        def second_fails(*args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 2:
                raise RuntimeError('simulated')
            return real_create(*args, **kwargs)

        with mock.patch('interventions.views.BeneficiaryConfirmationRequestPhoto.objects.create', side_effect=second_fails):
            response = self.on_behalf(self.farmer_url(self.awaiting_farmer_record(self.lonely_farmer)), [('photos', png(f'p{i}.png')) for i in range(3)])
        self.assertEqual(response.status_code, 500)
        self.assertEqual(BeneficiaryConfirmationRequest.objects.count(), 0)
        self.assertEqual(BeneficiaryConfirmationRequestPhoto.objects.count(), 0)
        self.assertEqual(self.files_in(FARMER_REQUEST_DIR), [])

    def test_a_second_confirmation_of_the_same_record_is_refused_and_adds_no_photos(self):
        self.client.force_authenticate(self.farm_org_user)
        record = self.awaiting_farmer_record(self.lonely_farmer)
        self.assertEqual(self.on_behalf(self.farmer_url(record), [('photos', png('a.png')), ('photos', png('a2.png'))]).status_code, 201)
        again = self.on_behalf(self.farmer_url(record), [('photos', png('b.png')), ('photos', png('b2.png'))])
        self.assertEqual(again.status_code, 400)
        self.assertEqual(BeneficiaryConfirmationRequestPhoto.objects.count(), 2)

    def test_staff_review_queue_shows_every_photo(self):
        # an older request still waiting for staff (new confirmations are final and never wait)
        request = BeneficiaryConfirmationRequest.objects.create(
            beneficiary_record=self.awaiting_farmer_record(self.lonely_farmer), submitted_by_organization=self.farm_org, submitted_by=self.farm_org_user)
        for name in ('a.png', 'b.png'):
            BeneficiaryConfirmationRequestPhoto.objects.create(confirmation_request=request, image=png(name), uploaded_by=self.farm_org_user)
        self.client.force_authenticate(self.staff)
        rows = self.client.get('/api/interventions/beneficiary-confirmation-requests/').json()
        self.assertEqual(len(rows[0]['photo_urls']), 2)
