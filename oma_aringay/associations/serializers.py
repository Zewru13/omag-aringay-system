from rest_framework import serializers

from accounts.models import User
from accounts.utils import citizen_account_info
from core.validators import validate_not_future_date
from farmers.models import Farmer
from fisheries.models import Fisherfolk

from .models import (
    FarmersOrganization,
    FarmersOrganizationEquipment,
    FarmersOrganizationMember,
    FisherfolkOrganization,
    FisherfolkOrganizationEquipment,
    FisherfolkOrganizationMember,
    FisherfolkOrganizationOfficer,
    OrganizationOfficer,
)


class FarmerOrganizationMemberSearchSerializer(serializers.ModelSerializer):
    """Read-only shape for the officer-assignment search-select AND the
    Members list display: this organization's own Farmer members only (see
    FarmersOrganizationMember's docstring — membership here is
    Farmer.farmers_organization, not a join table). is_org_membership_active
    is included (toggle-not-delete batch) so the Members screen can show
    deactivated members muted rather than hiding them outright."""
    class Meta:
        model = Farmer
        fields = ['id', 'full_name', 'barangay', 'rsbsa_number', 'is_org_membership_active']


# ─── Batch 1: add-member candidate search (citizen-reachable) ──────────────
# These two are deliberately NOT the serializers above. The ones above
# describe people who are ALREADY this organization's members; these
# describe people who are not, so an organization officer can find someone
# to add. That is a wider audience, so the field list is cut to the minimum
# the add-member decision actually needs:
#
#   full_name + barangay  — to identify the right person
#   current membership    — so the caller can be warned BEFORE attempting a
#                           reassignment (farmers) or see existing
#                           memberships (fisherfolk)
#
# Government identifiers (RSBSA / FishR / LGU registration numbers) and all
# contact details are deliberately EXCLUDED. They are not needed to pick a
# person out of a search you already typed a name into, and they are the
# fields with real disclosure consequences. See the views for the matching
# minimum-query-length and result-cap limits that stop this being usable to
# enumerate the whole registry.

class FarmerAddCandidateSerializer(serializers.ModelSerializer):
    current_organization_id = serializers.IntegerField(
        source='farmers_organization_id', read_only=True,
    )
    current_organization_name = serializers.CharField(
        source='farmers_organization.name', read_only=True, default=None,
    )

    class Meta:
        model = Farmer
        fields = ['id', 'full_name', 'barangay',
                  'current_organization_id', 'current_organization_name']


class FisherfolkAddCandidateSerializer(serializers.ModelSerializer):
    current_organizations = serializers.SerializerMethodField()

    class Meta:
        model = Fisherfolk
        fields = ['id', 'full_name', 'barangay', 'current_organizations']

    def get_current_organizations(self, obj):
        # A list, not a single value: fisherfolk membership is a real join
        # table and belonging to several organizations is legitimate.
        return [
            {'id': m.organization_id, 'name': m.organization.name}
            for m in obj.fisherfolk_organizations.select_related('organization')
        ]


class OrganizationOfficerSerializer(serializers.ModelSerializer):
    farmer = serializers.PrimaryKeyRelatedField(
        queryset=Farmer.objects.all(), write_only=True, required=True,
    )
    farmer_id = serializers.IntegerField(source='farmer.id', read_only=True)
    farmer_barangay = serializers.CharField(source='farmer.barangay', read_only=True)

    class Meta:
        model  = OrganizationOfficer
        fields = [
            'id', 'position', 'full_name', 'farmer', 'farmer_id', 'farmer_barangay',
            'term_start_date', 'term_end_date', 'early_exit_reason', 'is_active',
        ]
        read_only_fields = [
            'id', 'full_name', 'farmer_id', 'farmer_barangay',
            'term_start_date', 'term_end_date', 'early_exit_reason', 'is_active',
        ]

    def validate_farmer(self, value):
        organization_id = self.context['view'].kwargs.get('pk')
        if str(value.farmers_organization_id) != str(organization_id):
            raise serializers.ValidationError(
                'This farmer is not a member of this organization.'
            )
        # Toggle-not-delete batch: an inactive membership can't hold an
        # officer position — deactivating already clears any existing one,
        # this is the mirror-image guard on assignment.
        if not value.is_org_membership_active:
            raise serializers.ValidationError(
                "This farmer's membership in this organization is inactive."
            )
        return value

    def create(self, validated_data):
        validated_data['full_name'] = validated_data['farmer'].full_name
        return super().create(validated_data)

    def update(self, instance, validated_data):
        farmer = validated_data.get('farmer', instance.farmer)
        if farmer:
            validated_data['full_name'] = farmer.full_name
        return super().update(instance, validated_data)


def _validate_contact(value):
    if value and value.strip():
        digits = ''.join(filter(str.isdigit, value.strip()))
        if len(digits) != 11 or not digits.startswith('09'):
            raise serializers.ValidationError(
                'Contact number must be exactly 11 digits and start with 09.'
            )
    return value


class FarmersOrganizationMemberSerializer(serializers.ModelSerializer):
    farmer_full_name = serializers.CharField(source='farmer.full_name', read_only=True)
    farmer_rsbsa_number = serializers.CharField(source='farmer.rsbsa_number', read_only=True)
    farmer_barangay = serializers.CharField(source='farmer.barangay', read_only=True)

    class Meta:
        model = FarmersOrganizationMember
        fields = [
            'id', 'organization', 'farmer', 'farmer_full_name',
            'farmer_rsbsa_number', 'farmer_barangay', 'position', 'date_joined',
        ]
        read_only_fields = ['organization']

    def validate_date_joined(self, value):
        validate_not_future_date(value, 'Date joined')
        return value


class FarmersOrganizationEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmersOrganizationEquipment
        fields = [
            'id', 'organization', 'equipment_name', 'equipment_name_other',
            'quantity', 'condition', 'acquisition_date', 'remarks',
        ]
        read_only_fields = ['organization']

    def validate_acquisition_date(self, value):
        validate_not_future_date(value, 'Acquisition date')
        return value


class FarmersOrganizationListSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    equipment_count = serializers.SerializerMethodField()

    class Meta:
        model = FarmersOrganization
        fields = [
            'id', 'name', 'barangay', 'street_address', 'contact_person', 'contact_number',
            'registration_number', 'registration_agency', 'date_organized', 'date_registered',
            'email_address', 'is_active', 'member_count', 'equipment_count',
        ]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_equipment_count(self, obj):
        return obj.equipment.count()


class FarmersOrganizationDetailSerializer(serializers.ModelSerializer):
    members   = FarmersOrganizationMemberSerializer(many=True, read_only=True)
    equipment = FarmersOrganizationEquipmentSerializer(many=True, read_only=True)
    # Current officers only (one per filled position) — officer_history
    # below carries every past holder too. Both read from the same
    # `officers` related_name; the lazy expiry check runs before this
    # serializer is ever built (see the detail view's get_object()).
    officers  = serializers.SerializerMethodField()
    officer_history = serializers.SerializerMethodField()
    citizen_account = serializers.SerializerMethodField()

    class Meta:
        model  = FarmersOrganization
        fields = '__all__'

    def get_officers(self, obj):
        qs = obj.officers.filter(is_active=True)
        return OrganizationOfficerSerializer(qs, many=True).data

    def get_officer_history(self, obj):
        qs = obj.officers.order_by('position', '-term_start_date')
        return OrganizationOfficerSerializer(qs, many=True).data

    def get_citizen_account(self, obj):
        return citizen_account_info(User.LinkedRecordType.FARMERS_ORG, obj.id)

    def validate_contact_number(self, value):
        return _validate_contact(value)

    def validate_date_organized(self, value):
        validate_not_future_date(value, 'Date organized')
        return value

    def validate_date_registered(self, value):
        validate_not_future_date(value, 'Date registered')
        return value


# ─── Fisherfolk ──────────────────────────────────────────────────────────────

class FisherfolkOrganizationMemberSerializer(serializers.ModelSerializer):
    fisherfolk_full_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_lgu_number = serializers.CharField(source='fisherfolk.lgu_registration_number', read_only=True)
    fisherfolk_barangay = serializers.CharField(source='fisherfolk.barangay', read_only=True)

    class Meta:
        model = FisherfolkOrganizationMember
        fields = [
            'id', 'organization', 'fisherfolk', 'fisherfolk_full_name',
            'fisherfolk_lgu_number', 'fisherfolk_barangay', 'position', 'date_joined',
            'is_active',
        ]
        # is_active is never written through the generic create/list path
        # (toggle-not-delete batch) — only the dedicated set-active views
        # below change it, same discipline as everywhere else in this app.
        read_only_fields = ['organization', 'is_active']

    def validate_date_joined(self, value):
        validate_not_future_date(value, 'Date joined')
        return value


class FisherfolkOrganizationEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FisherfolkOrganizationEquipment
        fields = [
            'id', 'organization', 'equipment_name', 'equipment_name_other',
            'quantity', 'condition', 'acquisition_date', 'remarks',
        ]
        read_only_fields = ['organization']

    def validate_acquisition_date(self, value):
        validate_not_future_date(value, 'Acquisition date')
        return value


class FisherfolkOrganizationOfficerSerializer(serializers.ModelSerializer):
    fisherfolk = serializers.PrimaryKeyRelatedField(
        queryset=Fisherfolk.objects.all(), write_only=True, required=True,
    )
    fisherfolk_id = serializers.SerializerMethodField()
    fisherfolk_barangay = serializers.SerializerMethodField()

    class Meta:
        model  = FisherfolkOrganizationOfficer
        fields = [
            'id', 'position', 'full_name', 'fisherfolk', 'fisherfolk_id', 'fisherfolk_barangay',
            'term_start_date', 'term_end_date', 'early_exit_reason', 'is_active',
        ]
        read_only_fields = [
            'id', 'full_name', 'fisherfolk_id', 'fisherfolk_barangay',
            'term_start_date', 'term_end_date', 'early_exit_reason', 'is_active',
        ]

    def get_fisherfolk_id(self, obj):
        return obj.member.fisherfolk_id if obj.member else None

    def get_fisherfolk_barangay(self, obj):
        return obj.member.fisherfolk.barangay if obj.member else None

    def validate(self, data):
        fisherfolk = data.pop('fisherfolk', None)
        if fisherfolk is not None:
            organization_id = self.context['view'].kwargs.get('pk')
            member = FisherfolkOrganizationMember.objects.filter(
                organization_id=organization_id, fisherfolk=fisherfolk,
            ).first()
            if not member:
                raise serializers.ValidationError(
                    {'fisherfolk': 'This fisherfolk is not a member of this organization.'}
                )
            # Toggle-not-delete batch: same mirror-image guard as the
            # farmers side — an inactive membership can't hold an officer
            # position.
            if not member.is_active:
                raise serializers.ValidationError(
                    {'fisherfolk': "This fisherfolk's membership in this organization is inactive."}
                )
            data['member'] = member
            data['full_name'] = fisherfolk.full_name
        return data


class FisherfolkOrganizationListSerializer(serializers.ModelSerializer):
    member_count  = serializers.SerializerMethodField()
    equipment_count = serializers.SerializerMethodField()

    class Meta:
        model  = FisherfolkOrganization
        fields = [
            'id', 'name', 'barangay', 'street_address', 'contact_person', 'contact_number',
            'registration_number', 'registration_agency', 'date_organized', 'date_registered',
            'email_address', 'is_active', 'member_count', 'equipment_count',
        ]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_equipment_count(self, obj):
        return obj.equipment.count()


class FisherfolkOrganizationDetailSerializer(serializers.ModelSerializer):
    members   = FisherfolkOrganizationMemberSerializer(many=True, read_only=True)
    equipment = FisherfolkOrganizationEquipmentSerializer(many=True, read_only=True)
    officers  = serializers.SerializerMethodField()
    officer_history = serializers.SerializerMethodField()
    citizen_account = serializers.SerializerMethodField()

    class Meta:
        model  = FisherfolkOrganization
        fields = '__all__'

    def get_officers(self, obj):
        qs = obj.officers.filter(is_active=True)
        return FisherfolkOrganizationOfficerSerializer(qs, many=True).data

    def get_officer_history(self, obj):
        qs = obj.officers.order_by('position', '-term_start_date')
        return FisherfolkOrganizationOfficerSerializer(qs, many=True).data

    def get_citizen_account(self, obj):
        return citizen_account_info(User.LinkedRecordType.FISHERFOLK_ORG, obj.id)

    def validate_contact_number(self, value):
        return _validate_contact(value)

    def validate_date_organized(self, value):
        validate_not_future_date(value, 'Date organized')
        return value

    def validate_date_registered(self, value):
        validate_not_future_date(value, 'Date registered')
        return value
