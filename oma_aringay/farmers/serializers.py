from datetime import date
from core.idnumbers import by_id_key, id_key
from core.validators import validate_contact_number

from rest_framework import serializers

from accounts.models import User
from accounts.utils import citizen_account_info
from core.constants import validate_prefix_gender

from associations.models import FarmersOrganization as AssocFarmersOrganization, FarmersOrganizationMember

from .models import Farmer, FarmCrop, FarmMachinery, FarmParcel, ParcelClassification


# Batch (Phase B — multi-org membership): shared accessors for the farmer's
# real FarmersOrganizationMember rows (farmer_organizations related_name),
# used by the serializers below instead of the removed
# Farmer.farmers_organization field. "Main" here is the real, stored
# is_main flag (see associations.models.FarmersOrganizationMember) — not a
# live guess.
def _active_memberships(farmer):
    """The farmer's active organization memberships, oldest first. When the list view has prefetched them (see
    FarmerListView) this reads them from memory; otherwise it is one query. Either way a page of farmers costs a fixed
    number of queries: each query is a network round trip to the database, so one per row made the list (and the name
    search that uses it) take seconds."""
    cached = getattr(farmer, '_prefetched_objects_cache', {}).get('farmer_organizations')
    if cached is not None:
        members = [m for m in cached if m.is_active]
    else:
        members = list(farmer.farmer_organizations.filter(is_active=True).select_related('organization'))
    return sorted(members, key=lambda m: m.pk)


def _farmer_main_membership(farmer):
    return next((m for m in _active_memberships(farmer) if m.is_main), None)


def validate_contact_format(value, instance=None):
    return validate_contact_number(value, instance)


class FarmCropSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmCrop
        fields = [
            'id', 'farm_parcel', 'crop_name', 'crop_name_other', 'area_hectares', 'is_main_crop',
            'number_of_trees', 'variety_used', 'seed_source', 'quantity_of_seeds_used', 'seeds_unit',
            'has_pcic_insurance', 'pcic_form_photo',
        ]
        read_only_fields = ['id', 'pcic_form_photo']
        extra_kwargs = {
            'farm_parcel': {'required': False},
        }

    def validate_area_hectares(self, value):
        if value <= 0:
            raise serializers.ValidationError('The crop area must be more than 0.')
        return value


class FarmMachinerySerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmMachinery
        fields = [
            'id',
            'farm_parcel',
            'machinery_type',
            'machinery_type_other',
            'quantity',
            'ownership',
        ]
        read_only_fields = ['id']
        extra_kwargs = {
            'farm_parcel': {'required': False},
        }

    def validate_quantity(self, value):
        if value is not None and value < 1:
            raise serializers.ValidationError('The quantity must be at least 1.')
        return value


class FarmParcelDirectorySerializer(serializers.ModelSerializer):
    """One line of the Crop Records page: a parcel, whose it is, and how many crop records sit on it."""
    farmer_name = serializers.SerializerMethodField()
    rsbsa_number = serializers.CharField(source='farmer.rsbsa_number', read_only=True)
    crop_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = FarmParcel
        fields = ['id', 'farmer', 'farmer_name', 'rsbsa_number', 'parcel_number', 'barangay', 'area_hectares',
                  'land_ownership', 'commodity_name', 'crop_count']
        read_only_fields = fields

    def get_farmer_name(self, obj):
        f = obj.farmer
        return ' '.join(part for part in (f.first_name, f.last_name) if part)


class ParcelClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParcelClassification
        fields = ['id', 'name']
        read_only_fields = ['id']

    def validate_name(self, value):
        name = ' '.join((value or '').split())
        if not name:
            raise serializers.ValidationError('Enter the classification name.')
        clash = ParcelClassification.objects.filter(name__iexact=name)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('That classification is already in the list.')
        return name


class FarmParcelSerializer(serializers.ModelSerializer):
    crops = FarmCropSerializer(many=True, read_only=True)
    machinery = FarmMachinerySerializer(many=True, read_only=True)

    class Meta:
        model = FarmParcel
        fields = [
            'id',
            'farmer',
            'parcel_number',
            'area_hectares',
            'land_ownership',
            'land_owner_name',
            'land_owner_rsbsa_number',
            'tax_declaration_number',
            'commodity_type',
            'commodity_name',
            'barangay',
            'farm_type',
            'classifications',
            'cropping_schedule',
            'crops',
            'machinery',
        ]
        read_only_fields = ['id', 'commodity_type', 'commodity_name', 'crops', 'machinery']
        extra_kwargs = {
            'farmer': {'required': False},
        }

    def validate_area_hectares(self, value):
        if value <= 0:
            raise serializers.ValidationError('The parcel area must be more than 0.')
        return value

    def validate_classifications(self, value):
        """The ticked classification names, each as spelled in Classification Settings. A name has to be in that list, unless
        this parcel already carries it (so editing a parcel never loses an old one)."""
        if not isinstance(value, list):
            raise serializers.ValidationError('Send the classifications as a list of names.')
        offered = {c.name.lower(): c.name for c in ParcelClassification.objects.all()}
        kept = {str(n).lower(): str(n) for n in (getattr(self.instance, 'classifications', None) or [])}
        names = []
        for raw in value:
            name = ' '.join(str(raw or '').split())
            if not name:
                continue
            canonical = offered.get(name.lower()) or kept.get(name.lower())
            if canonical is None:
                raise serializers.ValidationError(f'"{name}" is not one of the parcel classifications. Ask an Admin to add it in Classification Settings.')
            if canonical not in names:
                names.append(canonical)
        return names

    def validate(self, data):
        # Cross-field rule: Parcel Number becomes required only once a Tax
        # Declaration Number is provided (not every parcel has a Tax Dec yet,
        # but if one is on file, the parcel it belongs to should be
        # identifiable). No reverse rule — Tax Dec stays optional regardless
        # of Parcel Number. Falls back to the existing instance for fields
        # not present in the payload, so a partial update is checked against
        # the resulting combined state, not just the patched fields.
        parcel_number = data.get('parcel_number', getattr(self.instance, 'parcel_number', ''))
        tax_declaration_number = data.get('tax_declaration_number', getattr(self.instance, 'tax_declaration_number', ''))
        if (tax_declaration_number or '').strip() and not (parcel_number or '').strip():
            raise serializers.ValidationError({
                'parcel_number': 'Parcel Number is required when a Tax Declaration Number is provided.'
            })
        return data


class FarmerListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    commodity = serializers.SerializerMethodField()
    # Batch (Phase B): a farmer can now belong to several organizations —
    # these three describe the MAIN one only (real, stored is_main flag,
    # not a guess), matching what a table column has room to show.
    # organizations_count tells the UI when there's more than one to see
    # on the detail page. Field names deliberately kept from the old
    # single-org shape (farmers_organization_name, is_org_membership_active)
    # where the meaning carries over unchanged, so existing frontend reads
    # of "the org" keep working for a single-membership farmer.
    farmers_organization = serializers.SerializerMethodField()
    farmers_organization_name = serializers.SerializerMethodField()
    is_org_membership_active = serializers.SerializerMethodField()
    organizations_count = serializers.SerializerMethodField()

    class Meta:
        model = Farmer
        fields = [
            'id',
            'rsbsa_number',
            'prefix',
            'full_name',
            'gender',
            'birthdate',
            'barangay',
            'commodity',
            'is_senior_citizen',
            'is_farm_laborer',
            'date_registered',
            'farmers_organization',
            'farmers_organization_name',
            'is_org_membership_active',
            'organizations_count',
        ]

    def get_commodity(self, obj):
        parcels = sorted(obj.farm_parcels.all(), key=lambda p: p.pk)     # prefetched by the list view: no query per row
        return parcels[0].commodity_name if parcels else ''

    def get_farmers_organization(self, obj):
        main = _farmer_main_membership(obj)
        return main.organization_id if main else None

    def get_farmers_organization_name(self, obj):
        main = _farmer_main_membership(obj)
        return main.organization.name if main else None

    def get_is_org_membership_active(self, obj):
        return _farmer_main_membership(obj) is not None

    def get_organizations_count(self, obj):
        return len(_active_memberships(obj))


class FarmerDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    farm_parcels = FarmParcelSerializer(many=True, read_only=True)
    # Batch (Phase B): farmers_organization/is_org_membership_active/
    # org_membership_deactivation_reason describe the MAIN membership only
    # (real, stored is_main — see _farmer_main_membership), kept for any
    # remaining single-org-shaped reader; `organizations` is the real,
    # complete list (every membership, active or not) for the detail page.
    farmers_organization = serializers.SerializerMethodField()
    farmers_organization_name = serializers.SerializerMethodField()
    is_org_membership_active = serializers.SerializerMethodField()
    org_membership_deactivation_reason = serializers.SerializerMethodField()
    organizations = serializers.SerializerMethodField()
    citizen_account = serializers.SerializerMethodField()

    class Meta:
        model = Farmer
        fields = [
            'id',
            'rsbsa_number',
            'prefix',
            'first_name',
            'last_name',
            'middle_name',
            'full_name',
            'gender',
            'birthdate',
            'contact_number',
            'barangay',
            'municipality',
            'province',
            'civil_status',
            'highest_education',
            'philsys_number',
            'is_pwd',
            'is_4ps_beneficiary',
            'is_icc_ip_member',
            'icc_ip_name',
            'is_senior_citizen',
            'is_farm_laborer',
            'date_registered',
            'registered_by',
            'farm_parcels',
            'farmers_organization',
            'farmers_organization_name',
            'is_org_membership_active',
            'org_membership_deactivation_reason',
            'organizations',
            'citizen_account',
        ]
        read_only_fields = [
            'id', 'date_registered', 'registered_by', 'farm_parcels',
            'farmers_organization', 'farmers_organization_name', 'is_org_membership_active',
            'org_membership_deactivation_reason', 'organizations', 'citizen_account',
        ]

    def get_citizen_account(self, obj):
        return citizen_account_info(User.LinkedRecordType.FARMER, obj.id)

    def get_farmers_organization(self, obj):
        main = _farmer_main_membership(obj)
        return main.organization_id if main else None

    def get_farmers_organization_name(self, obj):
        main = _farmer_main_membership(obj)
        return main.organization.name if main else None

    def get_is_org_membership_active(self, obj):
        return _farmer_main_membership(obj) is not None

    def get_org_membership_deactivation_reason(self, obj):
        main = _farmer_main_membership(obj)
        return main.deactivation_reason if main else ''

    def get_organizations(self, obj):
        return [
            {
                'membership_id': m.id,
                'organization_id': m.organization_id,
                'organization_name': m.organization.name,
                'position': m.position,
                'is_main': m.is_main,
                'is_active': m.is_active,
                'deactivation_reason': m.deactivation_reason,
            }
            for m in obj.farmer_organizations.select_related('organization').order_by('-is_active', '-is_main', 'organization__name')
        ]

    def validate_birthdate(self, value):
        if value:
            today = date.today()
            age = today.year - value.year - (
                (today.month, today.day) < (value.month, value.day)
            )
            if age < 10:
                raise serializers.ValidationError(
                    'Registrant must be at least 10 years old.'
                )
        return value

    def validate_rsbsa_number(self, value):
        queryset = by_id_key(Farmer.objects.all(), 'rsbsa_number', value)

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
            if value and id_key(value) != id_key(self.instance.rsbsa_number):
                from fisheries.models import Fisherfolk
                if by_id_key(Fisherfolk.objects.all(), 'rsbsa_number', value).exists():
                    raise serializers.ValidationError(
                        'This RSBSA number already belongs to a registered fisherfolk. A person who is both a farmer '
                        'and a fisherfolk needs a different RSBSA number for each.'
                    )

        if queryset.exists():
            raise serializers.ValidationError(
                'A farmer with this RSBSA number is already registered in the system.'
            )

        return value

    def validate_contact_number(self, value):
        return validate_contact_format(value, self.instance)

    def validate(self, data):
        prefix = data.get('prefix', getattr(self.instance, 'prefix', ''))
        gender = data.get('gender', getattr(self.instance, 'gender', ''))
        error = validate_prefix_gender(prefix, gender)
        if error:
            raise serializers.ValidationError({'prefix': error})
        return data


class FarmerCreateSerializer(serializers.ModelSerializer):
    # Batch (Phase B): farmers_organization is no longer a real field on
    # Farmer — kept here as a write-only convenience so AddFarmerModal.jsx's
    # "pick an initial organization" step needs no frontend change. create()
    # below turns it into a real FarmersOrganizationMember row (is_main=True
    # — it's necessarily this farmer's first and only membership at the
    # moment of registration) instead of a field write.
    farmers_organization = serializers.PrimaryKeyRelatedField(
        queryset=AssocFarmersOrganization.objects.all(),
        write_only=True, required=False, allow_null=True,
    )
    farmers_organization_name = serializers.SerializerMethodField()

    class Meta:
        model = Farmer
        fields = [
            'id',
            'rsbsa_number',
            'prefix',
            'first_name',
            'last_name',
            'middle_name',
            'gender',
            'birthdate',
            'contact_number',
            'email',
            'barangay',
            'municipality',
            'province',
            'civil_status',
            'highest_education',
            'philsys_number',
            'is_pwd',
            'is_4ps_beneficiary',
            'is_icc_ip_member',
            'icc_ip_name',
            'is_senior_citizen',
            'date_registered',
            'registered_by',
            'farmers_organization',
            'farmers_organization_name',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by', 'farmers_organization_name']

    def get_farmers_organization_name(self, obj):
        main = _farmer_main_membership(obj)
        return main.organization.name if main else None

    def create(self, validated_data):
        organization = validated_data.pop('farmers_organization', None)
        farmer = super().create(validated_data)
        if organization is not None:
            FarmersOrganizationMember.objects.create(
                organization=organization,
                farmer=farmer,
                date_joined=farmer.date_registered.date(),
                is_main=True,
            )
        return farmer

    def validate_birthdate(self, value):
        if value:
            today = date.today()
            age = today.year - value.year - (
                (today.month, today.day) < (value.month, value.day)
            )
            if age < 10:
                raise serializers.ValidationError(
                    'Registrant must be at least 10 years old.'
                )
        return value

    def validate_rsbsa_number(self, value):
        if by_id_key(Farmer.objects.all(), 'rsbsa_number', value).exists():
            raise serializers.ValidationError(
                'A farmer with this RSBSA number is already registered in the system.'
            )
        from fisheries.models import Fisherfolk
        if by_id_key(Fisherfolk.objects.all(), 'rsbsa_number', value).exists():
            raise serializers.ValidationError(
                'This RSBSA number already belongs to a registered fisherfolk. A person who is both a farmer and a '
                'fisherfolk needs a different RSBSA number for each.'
            )
        return value

    def validate_contact_number(self, value):
        return validate_contact_format(value, self.instance)

    def validate(self, data):
        prefix = data.get('prefix', '')
        gender = data.get('gender', '')
        error = validate_prefix_gender(prefix, gender)
        if error:
            raise serializers.ValidationError({'prefix': error})
        return data
