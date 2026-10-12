"""An organization confirms that assistance reached several of its members at once.

The organization picks the members (their assistance records that are waiting for confirmation) and sends ONE set of proof
photos for all of them. The confirmation is final: every selected record becomes Confirmed immediately, there is no staff
approval step; staff get one notification saying who confirmed how many. For the record, each member keeps a
confirmation request row (already Approved, no reviewer) pointing at the same stored photo files, so the photos are
uploaded and stored once however many members there are.

Both domains (farmers and fisherfolk) share this module; DOMAINS says what differs.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.utils import accountless_or_unactivated_ids
from associations.models import FarmersOrganizationMember, FisherfolkOrganizationMember
from core.notifications import notify_staff
from core.photos import discard_uploaded_files, validated_photos

from .models import (
    BeneficiaryConfirmationRequest, BeneficiaryConfirmationRequestPhoto, BeneficiaryRecord, DistributionStatus,
    FisherfolkBeneficiaryConfirmationRequest, FisherfolkBeneficiaryConfirmationRequestPhoto, FisherfolkBeneficiaryRecord,
)

# An organization vouches for the members it confirms for, so it must show proof: at least this many photos, once.
MIN_PROOF_PHOTOS = 2
MAX_RECORDS_AT_ONCE = 100

DOMAINS = {
    'crop': {
        'record_model': BeneficiaryRecord,
        'person_attr': 'farmer',
        'person_id_attr': 'farmer_id',
        'person_type': 'FARMER',
        'org_type': 'FARMERS_ORG',
        'member_model': FarmersOrganizationMember,
        'member_person_field': 'farmer_id',
        'request_model': BeneficiaryConfirmationRequest,
        'photo_model': BeneficiaryConfirmationRequestPhoto,
        'notify_type': 'beneficiary_obo_confirmed',
    },
    'fisheries': {
        'record_model': FisherfolkBeneficiaryRecord,
        'person_attr': 'fisherfolk',
        'person_id_attr': 'fisherfolk_id',
        'person_type': 'FISHERFOLK',
        'org_type': 'FISHERFOLK_ORG',
        'member_model': FisherfolkOrganizationMember,
        'member_person_field': 'fisherfolk_id',
        'request_model': FisherfolkBeneficiaryConfirmationRequest,
        'photo_model': FisherfolkBeneficiaryConfirmationRequestPhoto,
        'notify_type': 'ff_beneficiary_obo_confirmed',
    },
}


def _record_ids(request):
    data = request.data
    raw = data.getlist('record_ids') if hasattr(data, 'getlist') else data.get('record_ids', [])
    if isinstance(raw, str):
        raw = [raw]
    ids = []
    for item in raw:
        for part in str(item).split(','):
            part = part.strip()
            if not part:
                continue
            if not part.isdigit():
                raise ValidationError({'record_ids': ['Send the ids of the assistance records to confirm.']})
            if int(part) not in ids:
                ids.append(int(part))
    if not ids:
        raise ValidationError({'record_ids': ['Select at least one member to confirm for.']})
    if len(ids) > MAX_RECORDS_AT_ONCE:
        raise ValidationError({'record_ids': [f'Confirm at most {MAX_RECORDS_AT_ONCE} members at a time.']})
    return ids


def confirm_for_members(request, domain, record_ids=None):
    """Confirm the selected records for their members (record_ids, or the ones named in the request). Returns
    {'confirmed': n, 'record_ids': [...]}.
    All or nothing: if any selected record cannot be confirmed, nothing is changed and the problems are listed."""
    cfg = DOMAINS[domain]
    user = request.user
    if user.role != 'CITIZEN' or user.linked_record_type != cfg['org_type']:
        raise PermissionDenied('You do not have permission to perform this action.')
    org_id = user.linked_record_id
    ids = list(record_ids) if record_ids is not None else _record_ids(request)

    records = list(cfg['record_model'].objects.filter(pk__in=ids).select_related(cfg['person_attr']))
    found = {r.pk for r in records}
    if set(ids) - found:
        raise ValidationError({'record_ids': ['Some of the selected assistance records no longer exist. Reload the list and try again.']})

    # Only the organization's own current members: anyone else's record is not its to confirm.
    person_ids = [getattr(r, cfg['person_id_attr']) for r in records]
    members = set(cfg['member_model'].objects.filter(
        organization_id=org_id, is_active=True, **{f"{cfg['member_person_field']}__in": person_ids},
    ).values_list(cfg['member_person_field'], flat=True))
    if any(pid not in members for pid in person_ids):
        raise PermissionDenied('You do not have permission to perform this action.')

    photos = validated_photos(request, 'photos', legacy_field='photo', limit=cfg['photo_model'].MAX_PER_PARENT)
    if len(photos) < MIN_PROOF_PHOTOS:
        raise ValidationError({'photos': [f'Add at least {MIN_PROOF_PHOTOS} photos as proof.']})

    written = []
    try:
        with transaction.atomic():
            locked = list(cfg['record_model'].objects.select_for_update().select_related(cfg['person_attr']).filter(pk__in=ids).order_by('pk'))
            eligible = accountless_or_unactivated_ids(cfg['person_type'], [getattr(r, cfg['person_id_attr']) for r in locked])
            pending = set(cfg['request_model'].objects.filter(
                beneficiary_record__in=locked, status=cfg['request_model'].Status.PENDING).values_list('beneficiary_record_id', flat=True))
            problems = []
            for record in locked:
                person = getattr(record, cfg['person_attr'])
                if record.status != DistributionStatus.AWAITING_CONFIRMATION:
                    problems.append(f'{person.full_name}: not awaiting confirmation ({record.get_status_display()}).')
                elif getattr(record, cfg['person_id_attr']) not in eligible:
                    problems.append(f'{person.full_name}: has a working account and must confirm receipt themselves.')
                elif record.pk in pending:
                    problems.append(f'{person.full_name}: a confirmation is already waiting for OMAg review.')
            if problems:
                raise ValidationError({'record_ids': problems})

            now = timezone.now()
            first_request = None
            for record in locked:
                req = cfg['request_model'].objects.create(
                    beneficiary_record=record, submitted_by_organization_id=org_id, submitted_by=user,
                    status=cfg['request_model'].Status.APPROVED, reviewed_at=now,
                )
                if first_request is None:
                    first_request = req
                    for f in photos:                       # written to storage once...
                        row = cfg['photo_model'].objects.create(confirmation_request=req, image=f, uploaded_by=user)
                        written.append(row.image.name)
                else:
                    for name in written:                   # ...and every other member points at the same files
                        cfg['photo_model'].objects.create(confirmation_request=req, image=name, uploaded_by=user)
                record.status = DistributionStatus.CONFIRMED
                record.confirmed_at = now
                record.save()
    except Exception:
        discard_uploaded_files(written)
        raise

    org = user.get_linked_record()
    kinds = sorted({r.assistance_type for r in locked if r.assistance_type})
    count = len(locked)
    notify_staff(
        actor=user, verb='confirmed receipt of assistance for',
        record_type=cfg['notify_type'], record_id=first_request.id,
        record_label=f"{count} member{'' if count == 1 else 's'} of {org.name if org else 'an organization'}"
                     + (f" · {', '.join(kinds)}" if kinds else ''),
    )
    return {'confirmed': count, 'record_ids': [r.pk for r in locked]}
