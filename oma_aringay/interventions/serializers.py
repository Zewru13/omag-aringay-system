from rest_framework import serializers

from core.validators import validate_not_future_date

from .models import BeneficiaryRecord, FisherfolkBeneficiaryRecord, InterventionProgram


class InterventionProgramSerializer(serializers.ModelSerializer):
    actual_beneficiaries = serializers.SerializerMethodField()

    class Meta:
        model = InterventionProgram
        fields = [
            'id',
            'program_name',
            'program_type',
            'source_of_program',
            'source_other_specify',
            'season',
            'year',
            'description',
            'target_beneficiaries',
            'actual_beneficiaries',
            'is_active',
            'created_by',
            'date_created',
        ]
        read_only_fields = ['id', 'created_by', 'date_created', 'actual_beneficiaries']

    def get_actual_beneficiaries(self, obj):
        farmer_count = obj.beneficiary_records.count()
        fisherfolk_count = obj.fisherfolk_beneficiary_records.count()
        return farmer_count + fisherfolk_count

    def validate(self, attrs):
        source = attrs.get('source_of_program', '')
        specify = attrs.get('source_other_specify', '').strip()
        if source == 'Other' and not specify:
            raise serializers.ValidationError(
                {'source_other_specify': 'Please specify the source of the program.'}
            )
        return attrs


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
            'program',
            'farmer',
            'farmer_full_name',
            'farmer_rsbsa_number',
            'farmer_barangay',
            'quantity_given',
            'unit',
            'date_given',
            'remarks',
            'recorded_by',
            'recorded_by_name',
            # Ad-hoc-only fields (Batch 6) — blank on program-based records.
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
        extra_kwargs = {
            'program': {'required': False},
        }
        validators = []

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.full_name if obj.recorded_by else None

    def validate_date_given(self, value):
        validate_not_future_date(value, 'Date received')
        return value

    def validate(self, attrs):
        program = attrs.get('program')
        farmer = attrs.get('farmer') or getattr(self.instance, 'farmer', None)

        if program is None:
            program = self.context.get('program')

        if (
            program
            and farmer
            and BeneficiaryRecord.objects.filter(
                program=program,
                farmer=farmer,
            ).exclude(pk=getattr(self.instance, 'pk', None)).exists()
        ):
            raise serializers.ValidationError(
                'This farmer has already received assistance under this program. '
                'Duplicate distributions are not allowed.'
            )

        return attrs


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
            'program',
            'fisherfolk',
            'fisherfolk_full_name',
            'fisherfolk_lgu_registration_number',
            'fisherfolk_barangay',
            'fisherfolk_type',
            'quantity_given',
            'unit',
            'date_given',
            'remarks',
            'recorded_by',
            'recorded_by_name',
            # Ad-hoc-only fields (Batch 6) — blank on program-based records.
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
        extra_kwargs = {
            'program': {'required': False},
        }
        validators = []

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.full_name if obj.recorded_by else None

    def validate_date_given(self, value):
        validate_not_future_date(value, 'Date received')
        return value

    def validate(self, attrs):
        program = attrs.get('program')
        fisherfolk = attrs.get('fisherfolk') or getattr(self.instance, 'fisherfolk', None)

        if program is None:
            program = self.context.get('program')

        if (
            program
            and fisherfolk
            and FisherfolkBeneficiaryRecord.objects.filter(
                program=program,
                fisherfolk=fisherfolk,
            ).exclude(pk=getattr(self.instance, 'pk', None)).exists()
        ):
            raise serializers.ValidationError(
                'This fisherfolk has already received assistance under this program. '
                'Duplicate distributions are not allowed.'
            )

        return attrs
