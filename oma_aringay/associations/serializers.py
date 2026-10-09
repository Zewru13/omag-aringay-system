from rest_framework import serializers

from accounts.models import User
from accounts.utils import citizen_account_info
from core.validators import validate_not_future_date, validate_contact_number
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
# Government identifiers and all contact details are NOT returned. An
# identifier can now be TYPED to find someone (see _name_or_number_q in the
# views — minimum length, digits only, result-capped), but the response only
# carries `id_hint`, the last four characters, which is enough to tell two
# people with the same name apart without disclosing the number itself.
# See the views for the minimum-query-length and result-cap limits that stop
# this being usable to enumerate the whole registry.


def _id_hint(value):
    value = (value or '').strip()
    return f'…{value[-4:]}' if value else ''

class FarmerAddCandidateSerializer(serializers.ModelSerializer):
    # Batch (Phase B): mirrors FisherfolkAddCandidateSerializer exactly now
    # that Farmer membership is also a real, multi-capable join table — no
    # more single current_organization_id/name, no more reassignment concept.
    current_organizations = serializers.SerializerMethodField()
    id_hint = serializers.SerializerMethodField()

    class Meta:
        model = Farmer
        fields = ['id', 'full_name', 'barangay', 'id_hint', 'current_organizations']

    def get_id_hint(self, obj):
        return _id_hint(obj.rsbsa_number)

    def get_current_organizations(self, obj):
        return [
            {'id': m.organization_id, 'name': m.organization.name}
            for m in obj.farmer_organizations.filter(is_active=True).select_related('organization')
        ]


class FisherfolkAddCandidateSerializer(serializers.ModelSerializer):
    current_organizations = serializers.SerializerMethodField()
    id_hint = serializers.SerializerMethodField()

    class Meta:
        model = Fisherfolk
        fields = ['id', 'full_name', 'barangay', 'id_hint', 'current_organizations']

    def get_id_hint(self, obj):
        return _id_hint(obj.lgu_registration_number or obj.fishr_number or obj.rsbsa_number)

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
        # Batch (Phase B): membership is now FarmersOrganizationMember, not
        # a direct field on Farmer — same check shape as
        # FisherfolkOrganizationOfficerSerializer.validate below.
        is_member = FarmersOrganizationMember.objects.filter(
            organization_id=organization_id, farmer=value, is_active=True,
        ).exists()
        if not is_member:
            raise serializers.ValidationError(
                'This farmer is not a member of this organization, or their membership is inactive.'
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


def _check_registered_not_before_organized(data, instance):
    """An organization cannot be registered before it was organized (the same day is fine). Each date is the
    submitted value, else the stored one, so a PATCH of only one date is checked against the other; a missing
    date is never compared, and a PATCH that sends neither is never blocked by an old bad pair."""
    if 'date_organized' not in data and 'date_registered' not in data:
        return
    organized = data['date_organized'] if 'date_organized' in data else getattr(instance, 'date_organized', None)
    registered = data['date_registered'] if 'date_registered' in data else getattr(instance, 'date_registered', None)
    if organized and registered and registered < organized:
        raise serializers.ValidationError({'date_registered': 'Date registered cannot be before the date organized.'})


def _validate_contact(value, instance=None):
    return validate_contact_number(value, instance)


class FarmersOrganizationMemberSerializer(serializers.ModelSerializer):
    farmer_full_name = serializers.CharField(source='farmer.full_name', read_only=True)
    farmer_rsbsa_number = serializers.CharField(source='farmer.rsbsa_number', read_only=True)
    farmer_barangay = serializers.CharField(source='farmer.barangay', read_only=True)

    class Meta:
        model = FarmersOrganizationMember
        fields = [
            'id', 'organization', 'farmer', 'farmer_full_name',
            'farmer_rsbsa_number', 'farmer_barangay', 'position', 'date_joined',
            'is_active', 'deactivation_reason', 'is_main',
        ]
        # is_active/deactivation_reason are never written through the
        # generic create/list path (toggle-not-delete batch) — only the
        # dedicated set-active view changes them, same discipline as
        # FisherfolkOrganizationMemberSerializer. is_main is likewise never
        # written directly here — only through the dedicated set-main view
        # (or the create-time auto-resolution) — see
        # associations/views.py's _resolve_and_assign_main.
        read_only_fields = ['organization', 'is_active', 'deactivation_reason', 'is_main']

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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request is not None and request.user.role not in ('ADMIN', 'EVALUATOR'):
            data.pop('citizen_account', None)   # the staff-facing Activate Account block, not for the organization
        return data

    def validate_contact_number(self, value):
        return _validate_contact(value, self.instance)

    def validate_date_organized(self, value):
        validate_not_future_date(value, 'Date organized')
        return value

    def validate_date_registered(self, value):
        validate_not_future_date(value, 'Date registered')
        return value

    def validate(self, data):
        _check_registered_not_before_organized(data, self.instance)
        return data


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
            'is_active', 'deactivation_reason', 'is_main',
        ]
        # is_active is never written through the generic create/list path
        # (toggle-not-delete batch) — only the dedicated set-active views
        # below change it, same discipline as everywhere else in this app.
        # deactivation_reason follows the same discipline. is_main is only
        # ever written through the dedicated set-main view (or create-time
        # auto-resolution) — see associations/views.py's
        # _resolve_and_assign_main.
        read_only_fields = ['organization', 'is_active', 'deactivation_reason', 'is_main']

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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request is not None and request.user.role not in ('ADMIN', 'EVALUATOR'):
            data.pop('citizen_account', None)   # the staff-facing Activate Account block, not for the organization
        return data

    def validate_contact_number(self, value):
        return _validate_contact(value, self.instance)

    def validate_date_organized(self, value):
        validate_not_future_date(value, 'Date organized')
        return value

    def validate_date_registered(self, value):
        validate_not_future_date(value, 'Date registered')
        return value

    def validate(self, data):
        _check_registered_not_before_organized(data, self.instance)
        return data
