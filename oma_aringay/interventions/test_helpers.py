"""Shared by the assistance tests (not a test module itself)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.utils import timezone

from accounts.models import UserLinkedRecord
from core.test_photos import png
from farmers.models import Farmer
from interventions.models import (
    BeneficiaryConfirmationRequest, BeneficiaryConfirmationRequestPhoto, FisherfolkBeneficiaryConfirmationRequest,
    FisherfolkBeneficiaryConfirmationRequestPhoto, FisherfolkBeneficiaryRecord,
)

_N = itertools.count(1)

# Where and when a distribution is claimed: every new one sent to the server needs both. Midnight, so that one dated today has
# already taken place whatever hour the tests run.
SCHEDULE = {'distribution_place': 'Barangay Hall', 'distribution_time': '00:00'}


def make_org(model, name):
    n = next(_N)
    return model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'CONF-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567')


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


def farmer(first):
    n = next(_N)
    return Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (870000 + n), first_name=first, last_name='Bulk', gender='Male',
                                 birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def earlier_confirmation(records, organization, user, photos=2):
    """What a cooperative's confirmation for its members saved while receipt had to be confirmed (nothing creates these any
    more): one approved request per record, the proof photos stored once and shared, and the record marked confirmed."""
    fisheries = isinstance(records[0], FisherfolkBeneficiaryRecord)
    request_model = FisherfolkBeneficiaryConfirmationRequest if fisheries else BeneficiaryConfirmationRequest
    photo_model = FisherfolkBeneficiaryConfirmationRequestPhoto if fisheries else BeneficiaryConfirmationRequestPhoto
    now = timezone.now()
    stored = []
    for record in records:
        request = request_model.objects.create(
            beneficiary_record=record, submitted_by_organization=organization, submitted_by=user,
            status=request_model.Status.APPROVED, reviewed_at=now)
        if not stored:
            for i in range(photos):
                row = photo_model.objects.create(confirmation_request=request, image=png(f'proof{i}.png'), uploaded_by=user)
                stored.append(row.image.name)
        else:
            for name in stored:
                photo_model.objects.create(confirmation_request=request, image=name, uploaded_by=user)
        record.confirmed_at = now
        record.save()
