from django.utils import timezone
from rest_framework import serializers

from .models import (
    AssistanceAgency,
    BeneficiaryConfirmationRequest,
    BeneficiaryRecord,
    FisherfolkBeneficiaryConfirmationRequest,
    FisherfolkBeneficiaryRecord,
)


class AssistanceAgencySerializer(serializers.ModelSerializer):
    class Meta:
        model = AssistanceAgency
        fields = ['id', 'name']
        read_only_fields = ['id']

    def validate_name(self, value):
        name = ' '.join((value or '').split())
        if not name:
            raise serializers.ValidationError('Enter the agency name.')
        clash = AssistanceAgency.objects.filter(name__iexact=name)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('That agency is already in the list.')
        return name


def _photo_list(obj, request):
    """[{id, url}] of a parent's photo rows (absolute URLs when a request is in context)."""
    return [
        {'id': p.id, 'url': request.build_absolute_uri(p.image.url) if request else p.image.url}
        for p in obj.photos.all()
    ]


class NotInThePastMixin:
    """Assistance is recorded for today or a future date. A new record needs such a date; an existing one keeps the date it has
    (so a typo in its notes can still be fixed) and can only be moved to today or later."""
    def validate_date_given(self, value):
        if self.context.get('allow_past_dates'):
            return value
        unchanged = self.instance is not None and getattr(self.instance, 'date_given', None) == value
        if not unchanged and value < timezone.localdate():
            raise serializers.ValidationError('Assistance can only be recorded for today or a future date.')
        return value


class BeneficiaryRecordCreateSerializer(NotInThePastMixin, serializers.ModelSerializer):
    confirmation_photos = serializers.SerializerMethodField()
    farmer_full_name = serializers.CharField(source='farmer.full_name', read_only=True)
    farmer_rsbsa_number = serializers.CharField(source='farmer.rsbsa_number', read_only=True)
    farmer_barangay = serializers.CharField(source='farmer.barangay', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    # Batch 7: computed by BeneficiaryRecord.save() — read-only, never accepted on write.
    attributed_organization_name = serializers.CharField(source='attributed_organization.name', read_only=True, default=None)

    class Meta:
        model = BeneficiaryRecord
        fields = [
            'id',
            'farmer',
            'farmer_full_name',
            'farmer_rsbsa_number',
            'farmer_barangay',
            'date_given',
            'remarks',
            'recorded_by',
            'recorded_by_name',
            'assistance_type',
            'source_agencies',
            'quantity',
            'season',
            'year',
            'training_duration_days',
            'equipment_type',
            'seed_type',
            'fertilizer_type',
            'attributed_organization_name',
            # Scheduled distribution + confirmation lifecycle — read-only
            # here. status is server-computed on create (see
            # BeneficiaryRecord.save()); all four are otherwise only ever
            # written by the dedicated lifecycle-action endpoints
            # (interventions.lifecycle_views), never by a generic PATCH.
            'status',
            'confirmed_at',
            'non_receipt_reason',
            'follow_up_notes',
            'confirmation_photo',
            'confirmation_photos',
            'confirmation_note',
        ]
        read_only_fields = [
            'id',
            'farmer_full_name',
            'farmer_rsbsa_number',
            'farmer_barangay',
            'recorded_by',
            'recorded_by_name',
            'attributed_organization_name',
            'status',
            'confirmed_at',
            'non_receipt_reason',
            'follow_up_notes',
            'confirmation_photo',
            'confirmation_note',
        ]

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.full_name if obj.recorded_by else None

    def get_confirmation_photos(self, obj):
        return _photo_list(obj, self.context.get('request'))

    # date_given no longer rejects future dates here — a future date is now
    # the deliberate trigger for the PENDING scheduling path
    # (BeneficiaryRecord.save()). validate_not_future_date (core.validators)
    # is untouched and still used by ~20 unrelated date fields elsewhere;
    # this removal is scoped to exactly this field on this serializer.


class BeneficiaryRecordUpdateSerializer(BeneficiaryRecordCreateSerializer):
    """
    Batch 12: used only by BeneficiaryRecordDetailView (GET/PATCH). Adds
    `farmer` to read_only_fields on top of the create serializer's own —
    otherwise an ORGANIZATION citizen editing their own record (which
    passes IsOrgMemberRecordCitizen's object-level check against the
    record's CURRENT farmer) could PATCH `farmer` to someone else's id in
    the same request and have it silently take, exactly the
    monitoring_record/farm_parcel hole Batch 11 found and closed in
    HarvestRecordSerializer.
    """
    class Meta(BeneficiaryRecordCreateSerializer.Meta):
        read_only_fields = BeneficiaryRecordCreateSerializer.Meta.read_only_fields + ['farmer']


class FisherfolkBeneficiaryRecordCreateSerializer(NotInThePastMixin, serializers.ModelSerializer):
    fisherfolk_full_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_barangay = serializers.CharField(source='fisherfolk.barangay', read_only=True)
    fisherfolk_type = serializers.CharField(source='fisherfolk.fisherfolk_type', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    # Batch 7: computed by FisherfolkBeneficiaryRecord.save() — read-only, never accepted on write.
    attributed_fisherfolk_organization_name = serializers.CharField(
        source='attributed_fisherfolk_organization.name', read_only=True, default=None,
    )

    class Meta:
        model = FisherfolkBeneficiaryRecord
        fields = [
            'id',
            'fisherfolk',
            'fisherfolk_full_name',
            'fisherfolk_barangay',
            'fisherfolk_type',
            'date_given',
            'remarks',
            'recorded_by',
            'recorded_by_name',
            'assistance_type',
            'source_agencies',
            'quantity',
            'description',
            'season',
            'year',
            'training_duration_days',
            'equipment_type',
            'attributed_fisherfolk_organization_name',
            'status',
            'confirmed_at',
            'non_receipt_reason',
            'follow_up_notes',
        ]
        read_only_fields = [
            'id',
            'fisherfolk_full_name',
            'fisherfolk_barangay',
            'fisherfolk_type',
            'recorded_by',
            'recorded_by_name',
            'attributed_fisherfolk_organization_name',
            'status',
            'confirmed_at',
            'non_receipt_reason',
            'follow_up_notes',
        ]

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.full_name if obj.recorded_by else None

    # See BeneficiaryRecordCreateSerializer's comment above — same removal,
    # same reasoning, fisherfolk side.


class FisherfolkBeneficiaryRecordUpdateSerializer(FisherfolkBeneficiaryRecordCreateSerializer):
    """Batch 12: fisherfolk equivalent of BeneficiaryRecordUpdateSerializer — see its docstring."""
    class Meta(FisherfolkBeneficiaryRecordCreateSerializer.Meta):
        read_only_fields = FisherfolkBeneficiaryRecordCreateSerializer.Meta.read_only_fields + ['fisherfolk']


class OrganizationDistributionRequestSerializer(NotInThePastMixin, serializers.Serializer):
    """
    Per-organization bulk assistance distribution (associations app's
    Farmers/FisherfolkOrganizationDistributeAssistanceView). Validates only
    the assistance details applied identically to every current member of
    the target organization — member resolution and the per-member
    30-day-cross-org-flag logic are the view's job, not this serializer's.

    `description` is the generic free-text field named in the batch brief;
    the view maps it to `remarks` for BeneficiaryRecord (no description
    field exists on that model) and `description` for
    FisherfolkBeneficiaryRecord (which has both remarks and description).
    """
    assistance_type = serializers.CharField()
    # Was a single CharField — see BeneficiaryRecord.source_agencies' own
    # model-level comment for why this is a plain list, not a new join
    # table. Empty list, not '', is the "nothing entered" default here.
    source_agencies = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False, default=list,
    )
    date_given = serializers.DateField()
    quantity = serializers.CharField(required=False, allow_blank=True, default='')
    description = serializers.CharField(required=False, allow_blank=True, default='')
    season = serializers.CharField(required=False, allow_blank=True, default='')
    # Type-conditional fields (frontend shows/requires only the one
    # matching the selected assistance_type) — all optional here; the view
    # only ever writes seed_type/fertilizer_type for BeneficiaryRecord
    # (see _run_organization_distribution), since neither exists on
    # FisherfolkBeneficiaryRecord.
    training_duration_days = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=1, max_value=3,
    )
    equipment_type = serializers.CharField(required=False, allow_blank=True, default='')
    seed_type = serializers.CharField(required=False, allow_blank=True, default='')
    fertilizer_type = serializers.CharField(required=False, allow_blank=True, default='')
    # Which members receive it. Absent = every active member; the view checks the ids against the roster.
    member_ids = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=True)

    def validate_assistance_type(self, value):
        valid_choices = dict(self.context['model'].AssistanceType.choices)
        if value not in valid_choices:
            raise serializers.ValidationError(
                f'Invalid assistance type. Must be one of: {", ".join(valid_choices)}.'
            )
        return value

    # date_given no longer rejects future dates — see
    # BeneficiaryRecordCreateSerializer's comment. A future-dated bulk
    # distribution schedules every member's record as PENDING, same as the
    # individual-report path; _run_organization_distribution's raw
    # record_model.objects.create() calls go through the model's save(),
    # so this needs no separate handling here.


# ─── Accountless-beneficiary confirmation ──────────────────────────────────

class AccountlessConfirmableSerializer(serializers.ModelSerializer):
    """
    Read-only shape for MyOrgAccountlessConfirmablesView's list — a
    BeneficiaryRecord that is AWAITING_CONFIRMATION for a farmer the caller's
    organization can act for, annotated with whether a confirmation request
    already exists for it (has_pending_request/latest_request_status), so
    the frontend can show "Pending Review" instead of a submit button for a
    row already in flight, without a second request.
    """
    farmer_full_name = serializers.CharField(source='farmer.full_name', read_only=True)
    farmer_barangay = serializers.CharField(source='farmer.barangay', read_only=True)
    latest_request_status = serializers.SerializerMethodField()
    latest_request_reason = serializers.SerializerMethodField()

    class Meta:
        model = BeneficiaryRecord
        fields = [
            'id', 'farmer', 'farmer_full_name', 'farmer_barangay',
            'assistance_type', 'source_agencies', 'quantity', 'season', 'year',
            'date_given', 'latest_request_status', 'latest_request_reason',
        ]
        read_only_fields = fields

    def _latest(self, obj):
        return obj.confirmation_requests.order_by('-submitted_at').first()

    def get_latest_request_status(self, obj):
        latest = self._latest(obj)
        return latest.status if latest else None

    def get_latest_request_reason(self, obj):
        latest = self._latest(obj)
        return latest.rejection_reason if latest and latest.status == 'REJECTED' else ''


class FisherfolkAccountlessConfirmableSerializer(serializers.ModelSerializer):
    """Fisherfolk equivalent of AccountlessConfirmableSerializer above."""
    fisherfolk_full_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_barangay = serializers.CharField(source='fisherfolk.barangay', read_only=True)
    latest_request_status = serializers.SerializerMethodField()
    latest_request_reason = serializers.SerializerMethodField()

    class Meta:
        model = FisherfolkBeneficiaryRecord
        fields = [
            'id', 'fisherfolk', 'fisherfolk_full_name', 'fisherfolk_barangay',
            'assistance_type', 'source_agencies', 'quantity', 'season', 'year',
            'date_given', 'latest_request_status', 'latest_request_reason',
        ]
        read_only_fields = fields

    def _latest(self, obj):
        return obj.confirmation_requests.order_by('-submitted_at').first()

    def get_latest_request_status(self, obj):
        latest = self._latest(obj)
        return latest.status if latest else None

    def get_latest_request_reason(self, obj):
        latest = self._latest(obj)
        return latest.rejection_reason if latest and latest.status == 'REJECTED' else ''


class BeneficiaryConfirmationRequestSerializer(serializers.ModelSerializer):
    farmer_full_name = serializers.CharField(source='beneficiary_record.farmer.full_name', read_only=True)
    member_rsbsa = serializers.CharField(source='beneficiary_record.farmer.rsbsa_number', read_only=True)
    assistance_type = serializers.CharField(source='beneficiary_record.assistance_type', read_only=True)
    quantity = serializers.CharField(source='beneficiary_record.quantity', read_only=True)
    source_agencies = serializers.ListField(source='beneficiary_record.source_agencies', read_only=True)
    date_given = serializers.DateField(source='beneficiary_record.date_given', read_only=True)
    submitted_by_organization_name = serializers.CharField(source='submitted_by_organization.name', read_only=True)
    submitted_by_name = serializers.CharField(source='submitted_by.full_name', read_only=True, default=None)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True, default=None)
    photo_url = serializers.SerializerMethodField()
    photo_urls = serializers.SerializerMethodField()

    class Meta:
        model = BeneficiaryConfirmationRequest
        fields = [
            'id', 'beneficiary_record', 'farmer_full_name', 'member_rsbsa', 'assistance_type', 'quantity',
            'source_agencies', 'date_given',
            'submitted_by_organization', 'submitted_by_organization_name',
            'submitted_by', 'submitted_by_name', 'photo_url', 'photo_urls',
            'status', 'submitted_at', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason',
        ]
        read_only_fields = fields

    def get_photo_url(self, obj):
        return obj.photo.url if obj.photo else None

    def get_photo_urls(self, obj):
        request = self.context.get('request')
        return [request.build_absolute_uri(p.image.url) if request else p.image.url for p in obj.photos.all()]


class FisherfolkBeneficiaryConfirmationRequestSerializer(serializers.ModelSerializer):
    fisherfolk_full_name = serializers.CharField(source='beneficiary_record.fisherfolk.full_name', read_only=True)
    member_rsbsa = serializers.CharField(source='beneficiary_record.fisherfolk.rsbsa_number', read_only=True)
    assistance_type = serializers.CharField(source='beneficiary_record.assistance_type', read_only=True)
    quantity = serializers.CharField(source='beneficiary_record.quantity', read_only=True)
    source_agencies = serializers.ListField(source='beneficiary_record.source_agencies', read_only=True)
    date_given = serializers.DateField(source='beneficiary_record.date_given', read_only=True)
    submitted_by_organization_name = serializers.CharField(source='submitted_by_organization.name', read_only=True)
    submitted_by_name = serializers.CharField(source='submitted_by.full_name', read_only=True, default=None)
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True, default=None)
    photo_url = serializers.SerializerMethodField()
    photo_urls = serializers.SerializerMethodField()

    class Meta:
        model = FisherfolkBeneficiaryConfirmationRequest
        fields = [
            'id', 'beneficiary_record', 'fisherfolk_full_name', 'member_rsbsa', 'assistance_type', 'quantity',
            'source_agencies', 'date_given',
            'submitted_by_organization', 'submitted_by_organization_name',
            'submitted_by', 'submitted_by_name', 'photo_url', 'photo_urls',
            'status', 'submitted_at', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason',
        ]
        read_only_fields = fields

    def get_photo_url(self, obj):
        return obj.photo.url if obj.photo else None

    def get_photo_urls(self, obj):
        request = self.context.get('request')
        return [request.build_absolute_uri(p.image.url) if request else p.image.url for p in obj.photos.all()]
