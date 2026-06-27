from rest_framework import serializers

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
        ]
        read_only_fields = [
            'id',
            'farmer_full_name',
            'farmer_rsbsa_number',
            'farmer_barangay',
            'recorded_by',
        ]
        extra_kwargs = {
            'program': {'required': False},
        }
        validators = []

    def validate(self, attrs):
        program = attrs.get('program')
        farmer = attrs.get('farmer')

        if program is None:
            program = self.context.get('program')

        if (
            program
            and farmer
            and BeneficiaryRecord.objects.filter(
                program=program,
                farmer=farmer,
            ).exists()
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

    class Meta:
        model = FisherfolkBeneficiaryRecord
        fields = [
            'id',
            'program',
            'fisherfolk',
            'fisherfolk_full_name',
            'fisherfolk_lgu_registration_number',
            'fisherfolk_barangay',
            'quantity_given',
            'unit',
            'date_given',
            'remarks',
            'recorded_by',
        ]
        read_only_fields = [
            'id',
            'fisherfolk_full_name',
            'fisherfolk_lgu_registration_number',
            'fisherfolk_barangay',
            'recorded_by',
        ]
        extra_kwargs = {
            'program': {'required': False},
        }
        validators = []

    def validate(self, attrs):
        program = attrs.get('program')
        fisherfolk = attrs.get('fisherfolk')

        if program is None:
            program = self.context.get('program')

        if (
            program
            and fisherfolk
            and FisherfolkBeneficiaryRecord.objects.filter(
                program=program,
                fisherfolk=fisherfolk,
            ).exists()
        ):
            raise serializers.ValidationError(
                'This fisherfolk has already received assistance under this program. '
                'Duplicate distributions are not allowed.'
            )

        return attrs
