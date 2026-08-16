from rest_framework import serializers

from core.validators import validate_not_future_date

from .models import BeneficiaryRecord, FisherfolkBeneficiaryRecord


class BeneficiaryRecordCreateSerializer(serializers.ModelSerializer):
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
            'source_agency',
            'quantity',
            'season',
            'year',
            'attributed_organization_name',
        ]
        read_only_fields = [
            'id',
            'farmer_full_name',
            'farmer_rsbsa_number',
            'farmer_barangay',
            'recorded_by',
            'recorded_by_name',
            'attributed_organization_name',
        ]

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.full_name if obj.recorded_by else None

    def validate_date_given(self, value):
        validate_not_future_date(value, 'Date received')
        return value


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


class FisherfolkBeneficiaryRecordCreateSerializer(serializers.ModelSerializer):
    fisherfolk_full_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_lgu_registration_number = serializers.CharField(
        source='fisherfolk.lgu_registration_number', read_only=True,
    )
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
            'fisherfolk_lgu_registration_number',
            'fisherfolk_barangay',
            'fisherfolk_type',
            'date_given',
            'remarks',
            'recorded_by',
            'recorded_by_name',
            'assistance_type',
            'source_agency',
            'quantity',
            'description',
            'season',
            'year',
            'attributed_fisherfolk_organization_name',
        ]
        read_only_fields = [
            'id',
            'fisherfolk_full_name',
            'fisherfolk_lgu_registration_number',
            'fisherfolk_barangay',
            'fisherfolk_type',
            'recorded_by',
            'recorded_by_name',
            'attributed_fisherfolk_organization_name',
        ]

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.full_name if obj.recorded_by else None

    def validate_date_given(self, value):
        validate_not_future_date(value, 'Date received')
        return value


class FisherfolkBeneficiaryRecordUpdateSerializer(FisherfolkBeneficiaryRecordCreateSerializer):
    """Batch 12: fisherfolk equivalent of BeneficiaryRecordUpdateSerializer — see its docstring."""
    class Meta(FisherfolkBeneficiaryRecordCreateSerializer.Meta):
        read_only_fields = FisherfolkBeneficiaryRecordCreateSerializer.Meta.read_only_fields + ['fisherfolk']


class OrganizationDistributionRequestSerializer(serializers.Serializer):
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
    source_agency = serializers.CharField(required=False, allow_blank=True, default='')
    date_given = serializers.DateField()
    quantity = serializers.CharField(required=False, allow_blank=True, default='')
    description = serializers.CharField(required=False, allow_blank=True, default='')
    season = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_assistance_type(self, value):
        valid_choices = dict(self.context['model'].AssistanceType.choices)
        if value not in valid_choices:
            raise serializers.ValidationError(
                f'Invalid assistance type. Must be one of: {", ".join(valid_choices)}.'
            )
        return value

    def validate_date_given(self, value):
        validate_not_future_date(value, 'Date given')
        return value
