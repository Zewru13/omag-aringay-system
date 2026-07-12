from rest_framework import serializers

from core.validators import validate_not_future_date

from .models import (
    AssociationOfficer,
    FarmersAssociation,
    FarmersAssociationEquipment,
    FarmersAssociationMember,
    FisherfolkAssociation,
    FisherfolkAssociationEquipment,
    FisherfolkAssociationMember,
    FisherfolkAssociationOfficer,
)


class AssociationOfficerSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AssociationOfficer
        fields = ['id', 'position', 'full_name']


def _validate_contact(value):
    if value and value.strip():
        digits = ''.join(filter(str.isdigit, value.strip()))
        if len(digits) != 11 or not digits.startswith('09'):
            raise serializers.ValidationError(
                'Contact number must be exactly 11 digits and start with 09.'
            )
    return value


class FarmersAssociationMemberSerializer(serializers.ModelSerializer):
    farmer_full_name = serializers.CharField(source='farmer.full_name', read_only=True)
    farmer_rsbsa_number = serializers.CharField(source='farmer.rsbsa_number', read_only=True)

    class Meta:
        model = FarmersAssociationMember
        fields = [
            'id', 'association', 'farmer', 'farmer_full_name',
            'farmer_rsbsa_number', 'position', 'date_joined',
        ]
        read_only_fields = ['association']

    def validate_date_joined(self, value):
        validate_not_future_date(value, 'Date joined')
        return value


class FarmersAssociationEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmersAssociationEquipment
        fields = [
            'id', 'association', 'equipment_name', 'equipment_name_other',
            'quantity', 'condition', 'acquisition_date', 'remarks',
        ]
        read_only_fields = ['association']

    def validate_acquisition_date(self, value):
        validate_not_future_date(value, 'Acquisition date')
        return value


class FarmersAssociationListSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    equipment_count = serializers.SerializerMethodField()

    class Meta:
        model = FarmersAssociation
        fields = [
            'id', 'name', 'barangay', 'street_address', 'contact_person', 'contact_number',
            'registration_number', 'registration_agency', 'date_organized', 'date_registered',
            'email_address', 'is_active', 'member_count', 'equipment_count',
        ]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_equipment_count(self, obj):
        return obj.equipment.count()


class FarmersAssociationDetailSerializer(serializers.ModelSerializer):
    members   = FarmersAssociationMemberSerializer(many=True, read_only=True)
    equipment = FarmersAssociationEquipmentSerializer(many=True, read_only=True)
    officers  = AssociationOfficerSerializer(many=True, read_only=True)

    class Meta:
        model  = FarmersAssociation
        fields = '__all__'

    def validate_contact_number(self, value):
        return _validate_contact(value)

    def validate_date_organized(self, value):
        validate_not_future_date(value, 'Date organized')
        return value

    def validate_date_registered(self, value):
        validate_not_future_date(value, 'Date registered')
        return value


# ─── Fisherfolk ──────────────────────────────────────────────────────────────

class FisherfolkAssociationMemberSerializer(serializers.ModelSerializer):
    fisherfolk_full_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_lgu_number = serializers.CharField(source='fisherfolk.lgu_registration_number', read_only=True)

    class Meta:
        model = FisherfolkAssociationMember
        fields = [
            'id', 'association', 'fisherfolk', 'fisherfolk_full_name',
            'fisherfolk_lgu_number', 'position', 'date_joined',
        ]
        read_only_fields = ['association']

    def validate_date_joined(self, value):
        validate_not_future_date(value, 'Date joined')
        return value


class FisherfolkAssociationEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FisherfolkAssociationEquipment
        fields = [
            'id', 'association', 'equipment_name', 'equipment_name_other',
            'quantity', 'condition', 'acquisition_date', 'remarks',
        ]
        read_only_fields = ['association']

    def validate_acquisition_date(self, value):
        validate_not_future_date(value, 'Acquisition date')
        return value


class FisherfolkAssociationOfficerSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FisherfolkAssociationOfficer
        fields = ['id', 'position', 'full_name']


class FisherfolkAssociationListSerializer(serializers.ModelSerializer):
    member_count  = serializers.SerializerMethodField()
    equipment_count = serializers.SerializerMethodField()

    class Meta:
        model  = FisherfolkAssociation
        fields = [
            'id', 'name', 'barangay', 'street_address', 'contact_person', 'contact_number',
            'registration_number', 'registration_agency', 'date_organized', 'date_registered',
            'email_address', 'is_active', 'member_count', 'equipment_count',
        ]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_equipment_count(self, obj):
        return obj.equipment.count()


class FisherfolkAssociationDetailSerializer(serializers.ModelSerializer):
    members   = FisherfolkAssociationMemberSerializer(many=True, read_only=True)
    equipment = FisherfolkAssociationEquipmentSerializer(many=True, read_only=True)
    officers  = FisherfolkAssociationOfficerSerializer(many=True, read_only=True)

    class Meta:
        model  = FisherfolkAssociation
        fields = '__all__'

    def validate_contact_number(self, value):
        return _validate_contact(value)

    def validate_date_organized(self, value):
        validate_not_future_date(value, 'Date organized')
        return value

    def validate_date_registered(self, value):
        validate_not_future_date(value, 'Date registered')
        return value
