"""
Citizen self-editing of their own registry record, split two ways:

  INSTANT   profile picture / organization logo, contact number
            — cosmetic or self-asserted, no registry consequence.
  REVIEWED  name, barangay, organization name/street address
            — these identify the person or organization in a government
              registry, so they go through ProfileChangeRequest and a staff
              approval instead of being written directly.

Everything here is own-record-only. The record is never taken from the
request body: it is resolved from request.user.linked_record_type /
linked_record_id, so there is no id for a client to tamper with. That is
also why these views need no object-level permission class — there is no
way to address someone else's record in the first place.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdminOrEvaluator
from associations.models import FarmersOrganization, FisherfolkOrganization
from core.constants import BARANGAY_CHOICES
from core.models import ProfileChangeRequest
from core.notifications import fit, notify_staff, notify_user
from core.validators import validate_contact_number, validate_uploaded_image
from farmers.models import Farmer
from fisheries.models import Fisherfolk

RECORD_MODELS = {
    ProfileChangeRequest.RecordType.FARMER: Farmer,
    ProfileChangeRequest.RecordType.FISHERFOLK: Fisherfolk,
    ProfileChangeRequest.RecordType.FARMERS_ORG: FarmersOrganization,
    ProfileChangeRequest.RecordType.FISHERFOLK_ORG: FisherfolkOrganization,
}

# Which attribute holds the uploaded image on each record type. Farmer and
# Fisherfolk call it profile_picture; organizations call it logo.
IMAGE_FIELD = {
    ProfileChangeRequest.RecordType.FARMER: 'profile_picture',
    ProfileChangeRequest.RecordType.FISHERFOLK: 'profile_picture',
    ProfileChangeRequest.RecordType.FARMERS_ORG: 'logo',
    ProfileChangeRequest.RecordType.FISHERFOLK_ORG: 'logo',
}

VALID_BARANGAYS = {b[0] for b in BARANGAY_CHOICES}

# Human-readable, for the notification text an evaluator reads.
FIELD_LABELS = {
    'first_name': 'first name',
    'middle_name': 'middle name',
    'last_name': 'last name',
    'barangay': 'barangay',
    'name': 'organization name',
    'street_address': 'street address',
    'email_address': 'email address',
    'contact_person': 'contact person',
}


def _own_record(user):
    """(record_type, record) for this user, or (None, None)."""
    rtype = user.linked_record_type
    model = RECORD_MODELS.get(rtype)
    if not model or not user.linked_record_id:
        return None, None
    return rtype, model.objects.filter(pk=user.linked_record_id).first()


def _record_label(record):
    return getattr(record, 'full_name', None) or getattr(record, 'name', '') or str(record)


class _OwnRecordMixin:
    permission_classes = [IsAuthenticated]

    def resolve(self, request):
        if request.user.role != User.Roles.CITIZEN:
            return None, None, Response(
                {'detail': 'Only citizen accounts have a profile to edit.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        rtype, record = _own_record(request.user)
        if record is None:
            return None, None, Response(
                {'detail': 'This account is not linked to a record.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return rtype, record, None


# ─── Step 1: picture / logo, instant ──────────────────────────────────────

class ProfileImageUploadView(_OwnRecordMixin, APIView):
    """
    POST multipart with `image`. Replaces the caller's OWN picture/logo.

    There is no id parameter by design — see the module docstring. An
    attacker cannot aim this at another record because the target is read
    from their own token.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        rtype, record, err = self.resolve(request)
        if err:
            return err

        upload = request.FILES.get('image')
        if upload is None:
            return Response({'image': ['No file was submitted.']},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_uploaded_image(upload)
        except Exception as exc:
            msgs = getattr(exc, 'messages', None) or [str(exc)]
            return Response({'image': msgs}, status=status.HTTP_400_BAD_REQUEST)

        field = IMAGE_FIELD[rtype]
        old = getattr(record, field)
        if old:
            # Replacing, not accumulating — the previous file is orphaned
            # otherwise, and these are user uploads on a dev box with no
            # storage lifecycle behind them.
            old.delete(save=False)
        setattr(record, field, upload)
        record.save(update_fields=[field])

        img = getattr(record, field)
        return Response({'image_url': img.url if img else None},
                        status=status.HTTP_200_OK)

    def delete(self, request):
        rtype, record, err = self.resolve(request)
        if err:
            return err
        field = IMAGE_FIELD[rtype]
        current = getattr(record, field)
        if current:
            current.delete(save=False)
            setattr(record, field, None)
            record.save(update_fields=[field])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Step 2: contact number, instant ──────────────────────────────────────

class ContactNumberSerializer(serializers.Serializer):
    """
    A bare Serializer, NOT a ModelSerializer.

    That is the point: a ModelSerializer with fields=['contact_number']
    would still be one edit away from exposing more, and `partial=True`
    ModelSerializer updates are the classic place a mass-assignment bug
    hides. Here `contact_number` is the only field that exists, so any
    other key in the payload is simply not read — there is nothing to
    smuggle through.
    """
    contact_number = serializers.CharField(max_length=20, allow_blank=True)

    def validate_contact_number(self, value):
        return validate_contact_number((value or '').strip())


class ContactNumberUpdateView(_OwnRecordMixin, APIView):
    def patch(self, request):
        rtype, record, err = self.resolve(request)
        if err:
            return err
        s = ContactNumberSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if rtype in ('FARMERS_ORG', 'FISHERFOLK_ORG') and not s.validated_data['contact_number']:
            # an organization must always be reachable; a farmer's or fisherfolk's number stays optional
            return Response({'contact_number': ['Contact number is required.']}, status=status.HTTP_400_BAD_REQUEST)
        record.contact_number = s.validated_data['contact_number']
        # update_fields is the second guard: even if something upstream had
        # mutated another attribute on this instance, only this column is
        # written.
        record.save(update_fields=['contact_number'])
        return Response({'contact_number': record.contact_number})


# ─── Steps 3-4: change requests, citizen side ─────────────────────────────

class ProfileChangeRequestSerializer(serializers.ModelSerializer):
    field_label = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name',
                                             read_only=True, default=None)
    requested_by_name = serializers.CharField(source='requested_by.full_name',
                                              read_only=True, default=None)
    record_label = serializers.SerializerMethodField()
    admin_approved_by_name = serializers.SerializerMethodField()
    focal_approved_by_name = serializers.SerializerMethodField()
    awaiting = serializers.SerializerMethodField()

    class Meta:
        model = ProfileChangeRequest
        fields = [
            'id', 'linked_record_type', 'linked_record_id', 'record_label',
            'field_name', 'field_label', 'old_value', 'requested_value',
            'status', 'requested_by', 'requested_by_name', 'requested_at',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'rejection_reason',
            'requires_both', 'admin_approved_by_name', 'admin_approved_at',
            'focal_approved_by_name', 'focal_approved_at', 'awaiting',
        ]
        read_only_fields = fields

    @staticmethod
    def _name(user):
        return (user.full_name or user.username) if user else None

    def get_admin_approved_by_name(self, obj):
        return self._name(obj.admin_approved_by)

    def get_focal_approved_by_name(self, obj):
        return self._name(obj.focal_approved_by)

    def get_awaiting(self, obj):
        return obj.awaiting()

    def get_field_label(self, obj):
        return FIELD_LABELS.get(obj.field_name, obj.field_name)

    def get_record_label(self, obj):
        model = RECORD_MODELS.get(obj.linked_record_type)
        if not model:
            return ''
        rec = model.objects.filter(pk=obj.linked_record_id).first()
        return _record_label(rec) if rec else ''


class ProfileChangeRequestCreateSerializer(serializers.Serializer):
    """
    One row per field. The client submits {field_name, requested_value};
    the record is taken from the caller's own token, never the payload.

    DUPLICATE HANDLING: the model's partial unique constraint is not created
    on MySQL (models.W036), so the "already pending" rule is enforced here
    instead — inside a transaction, taking select_for_update() on this
    record+field's existing rows first, so two simultaneous submits
    serialise rather than both passing the check.
    """
    field_name = serializers.CharField()
    requested_value = serializers.CharField(max_length=255)

    def validate(self, data):
        rtype = self.context['record_type']
        record = self.context['record']
        field = data['field_name']

        allowed = ProfileChangeRequest.REQUESTABLE_FIELDS.get(rtype, [])
        if field not in allowed:
            raise serializers.ValidationError({
                'field_name': f'"{field}" cannot be changed by request. '
                              f'Allowed: {", ".join(allowed)}.'
            })

        value = (data['requested_value'] or '').strip()

        if field == 'barangay' and value not in VALID_BARANGAYS:
            raise serializers.ValidationError({
                'requested_value': 'Not a recognised barangay of Aringay.'
            })
        # middle_name and street_address are legitimately blank-able; the
        # rest are identity fields and must not be emptied.
        if not value and field not in ('middle_name', 'street_address'):
            raise serializers.ValidationError({
                'requested_value': 'This field cannot be empty.'
            })

        if field == 'email_address':
            if len(value) > 254:
                raise serializers.ValidationError({
                    'requested_value': 'Ensure this value has at most 254 characters.'
                })
            try:
                validate_email(value)
            except DjangoValidationError:
                raise serializers.ValidationError({
                    'requested_value': 'Enter a valid email address.'
                })
        if field == 'contact_person' and len(value) > 150:
            raise serializers.ValidationError({
                'requested_value': 'Ensure this value has at most 150 characters.'
            })

        old_value = str(getattr(record, field, '') or '')
        # An email address is not case-sensitive for this purpose.
        same = value.lower() == old_value.lower() if field == 'email_address' else value == old_value
        if same:
            raise serializers.ValidationError({
                'requested_value': 'This is already the current value.'
            })

        data['requested_value'] = value
        data['old_value'] = old_value
        return data

    def create(self, validated):
        rtype = self.context['record_type']
        record = self.context['record']
        user = self.context['request'].user
        field = validated['field_name']

        with transaction.atomic():
            existing = list(
                ProfileChangeRequest.objects
                .select_for_update()
                .filter(linked_record_type=rtype, linked_record_id=record.pk,
                        field_name=field, status=ProfileChangeRequest.Status.PENDING)
            )
            if existing:
                raise serializers.ValidationError({
                    'detail': 'already_pending',
                    'field_name': field,
                    'message': (
                        f'A change to the {FIELD_LABELS.get(field, field)} is already '
                        f'waiting for review. Wait for it to be resolved first.'
                    ),
                })
            return ProfileChangeRequest.objects.create(
                linked_record_type=rtype,
                linked_record_id=record.pk,
                field_name=field,
                old_value=validated['old_value'],
                requested_value=validated['requested_value'],
                requested_by=user,
                requires_both=rtype in ProfileChangeRequest.ORGANIZATION_TYPES,
            )


class MyProfileChangeRequestView(_OwnRecordMixin, APIView):
    """GET: this record's own request history. POST: file a new one."""

    def get(self, request):
        rtype, record, err = self.resolve(request)
        if err:
            return err
        qs = ProfileChangeRequest.objects.filter(
            linked_record_type=rtype, linked_record_id=record.pk,
        ).select_related('reviewed_by', 'requested_by')
        return Response(ProfileChangeRequestSerializer(qs, many=True).data)

    def post(self, request):
        rtype, record, err = self.resolve(request)
        if err:
            return err
        s = ProfileChangeRequestCreateSerializer(
            data=request.data,
            context={'request': request, 'record_type': rtype, 'record': record},
        )
        s.is_valid(raise_exception=True)
        obj = s.save()

        notify_staff(
            actor=request.user,
            verb='requested a profile change',
            record_type=rtype,
            record_id=record.pk,
            record_label=_record_label(record),
            detail=(f'{FIELD_LABELS.get(obj.field_name, obj.field_name)}: '
                    f'"{obj.old_value}" → "{obj.requested_value}"'),
        )
        return Response(ProfileChangeRequestSerializer(obj).data,
                        status=status.HTTP_201_CREATED)


# ─── Step 5: staff review queue ───────────────────────────────────────────

class StaffChangeRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        qs = ProfileChangeRequest.objects.select_related('requested_by', 'reviewed_by')
        status_filter = request.query_params.get('status', 'PENDING').upper()
        if status_filter != 'ALL':
            qs = qs.filter(status=status_filter)
        rtype = request.query_params.get('record_type')
        if rtype:
            qs = qs.filter(linked_record_type=rtype)
        return Response(ProfileChangeRequestSerializer(qs, many=True).data)


def _lock_request(pk):
    """Re-read a request with its row locked, so two simultaneous decisions serialise."""
    return ProfileChangeRequest.objects.select_for_update().filter(pk=pk).first()


ROLE_TITLES = {'ADMIN': 'Admin', 'EVALUATOR': 'Focal Person'}


def _notify_role(role, actor, req, record, verb, detail):
    """Notify every active staff user of `role` except the actor."""
    recipients = User.objects.filter(is_active=True, role=role)
    if actor is not None:
        recipients = recipients.exclude(pk=actor.pk)
    for user in recipients:
        notify_user(
            recipient=user, actor=actor, verb=verb,
            record_type=req.linked_record_type, record_id=req.linked_record_id,
            record_label=fit(_record_label(record), 'record_label'), detail=fit(detail, 'detail'),
        )


class StaffChangeRequestDecisionView(APIView):
    """
    POST .../<pk>/approve/  -> writes the value onto the real record
    POST .../<pk>/reject/   -> leaves the real record untouched

    Approve is atomic: the record write and the status flip happen in one
    transaction, so a failure cannot leave a request marked APPROVED whose
    change was never applied (or the reverse).

    An organization's request (requires_both) needs one Admin AND one Focal
    Person (EVALUATOR) approval: the first records its role's approval and
    writes nothing, the second (the other role) applies the value. The request
    is re-read under a row lock inside the transaction so two simultaneous
    decisions cannot both apply it.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    @staticmethod
    def _bad(message):
        return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, pk, action):
        req = ProfileChangeRequest.objects.filter(pk=pk).first()
        if req is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if req.status != ProfileChangeRequest.Status.PENDING:
            return self._bad(f'This request is already {req.status.lower()}.')

        model = RECORD_MODELS.get(req.linked_record_type)
        record = model.objects.filter(pk=req.linked_record_id).first() if model else None
        if record is None:
            return self._bad('The record this request refers to no longer exists.')

        label = FIELD_LABELS.get(req.field_name, req.field_name)
        first_of_two = None
        with transaction.atomic():
            req = _lock_request(pk)
            if req is None:
                return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
            if req.status != ProfileChangeRequest.Status.PENDING:
                return self._bad(f'This request is already {req.status.lower()}.')
            now = timezone.now()

            if action == 'approve':
                done = True
                if req.requires_both:
                    role = request.user.role
                    if request.user.pk in (req.admin_approved_by_id, req.focal_approved_by_id):
                        return self._bad('You already approved this request.')
                    if role == User.Roles.ADMIN:
                        if req.admin_approved_at is not None:
                            return self._bad('The Admin already approved this request.')
                        req.admin_approved_by, req.admin_approved_at = request.user, now
                        saved = ['admin_approved_by', 'admin_approved_at']
                    else:
                        if req.focal_approved_at is not None:
                            return self._bad('The Focal Person already approved this request.')
                        req.focal_approved_by, req.focal_approved_at = request.user, now
                        saved = ['focal_approved_by', 'focal_approved_at']
                    if req.admin_approved_at is None or req.focal_approved_at is None:
                        done = False
                        req.save(update_fields=saved)
                        first_of_two = role
                    else:
                        req.save(update_fields=saved)
                if done:
                    if str(getattr(record, req.field_name, '') or '') != req.requested_value:
                        setattr(record, req.field_name, req.requested_value)
                        record.save(update_fields=[req.field_name])
                    req.status = ProfileChangeRequest.Status.APPROVED
                    req.reviewed_by = request.user
                    req.reviewed_at = now
                    req.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
                    verb = 'approved your profile change'
                    detail = f'{label} is now "{req.requested_value}"'
            else:
                reason = (request.data.get('rejection_reason') or '').strip()[:255]
                req.status = ProfileChangeRequest.Status.REJECTED
                req.reviewed_by = request.user
                req.reviewed_at = now
                req.rejection_reason = reason
                req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'rejection_reason'])
                verb = 'rejected your profile change'
                detail = f'{label}' + (f' — {reason}' if reason else '')

        if first_of_two:
            other = 'EVALUATOR' if first_of_two == 'ADMIN' else 'ADMIN'
            notify_user(
                recipient=req.requested_by, actor=request.user,
                verb='approved your profile change',
                record_type=req.linked_record_type, record_id=req.linked_record_id,
                record_label=fit(_record_label(record), 'record_label'),
                detail=fit(f'{label} approved by the {ROLE_TITLES[first_of_two]}; '
                           f'waiting for the {ROLE_TITLES[other]}', 'detail'),
            )
            _notify_role(
                other, request.user, req, record, 'needs your approval',
                f'{label}: "{req.old_value}" → "{req.requested_value}"',
            )
            return Response(ProfileChangeRequestSerializer(req).data)

        notify_user(
            recipient=req.requested_by,
            actor=request.user,
            verb=verb,
            record_type=req.linked_record_type,
            record_id=req.linked_record_id,
            record_label=fit(_record_label(record), 'record_label'),
            # A 255-character rejection reason plus the field label would
            # overflow the notification and silently drop it.
            detail=fit(detail, 'detail'),
        )
        return Response(ProfileChangeRequestSerializer(req).data)
