from datetime import date

from rest_framework import serializers

from core.constants import validate_prefix_gender

from .models import Farmer, FarmCrop, FarmMachinery, FarmParcel


def validate_contact_format(value):
    if value and value.strip():
        digits = ''.join(filter(str.isdigit, value.strip()))
        if len(digits) != 11 or not digits.startswith('09'):
            raise serializers.ValidationError(
                'Contact number must be exactly 11 digits and start with 09.'
            )
    return value


class FarmCropSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmCrop
        fields = [
            'id', 'farm_parcel', 'crop_name', 'crop_name_other', 'area_hectares', 'is_main_crop',
            'number_of_trees', 'variety_used', 'seed_source', 'quantity_of_seeds_used', 'seeds_unit',
        ]
        read_only_fields = ['id']
        extra_kwargs = {
            'farm_parcel': {'required': False},
        }


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
            'tax_declaration_number',
            'commodity_type',
            'commodity_name',
            'farm_status',
            'barangay',
            'farm_type',
            'is_organic',
            'within_ancestral_domain',
            'is_agrarian_reform_beneficiary',
            'cropping_schedule',
            'crops',
            'machinery',
        ]
        read_only_fields = ['id', 'commodity_type', 'commodity_name', 'crops', 'machinery']
        extra_kwargs = {
            'farmer': {'required': False},
        }

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
    farmers_organization_name = serializers.SerializerMethodField()

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
            'is_active',
            'is_senior_citizen',
            'is_farm_laborer',
            'date_registered',
            'farmers_organization',
            'farmers_organization_name',
        ]

    def get_commodity(self, obj):
        parcel = obj.farm_parcels.first()
        return parcel.commodity_name if parcel else ''

    def get_farmers_organization_name(self, obj):
        if obj.farmers_organization:
            return obj.farmers_organization.name
        return None


class FarmerDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    farm_parcels = FarmParcelSerializer(many=True, read_only=True)
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
            'is_active',
            'date_registered',
            'registered_by',
            'farm_parcels',
            'farmers_organization',
            'farmers_organization_name',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by', 'farm_parcels', 'farmers_organization_name']

    def get_farmers_organization_name(self, obj):
        if obj.farmers_organization:
            return obj.farmers_organization.name
        return None

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
        queryset = Farmer.objects.filter(rsbsa_number=value)

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                'A farmer with this RSBSA number is already registered in the system.'
            )

        return value

    def validate_contact_number(self, value):
        return validate_contact_format(value)

    def validate(self, data):
        prefix = data.get('prefix', getattr(self.instance, 'prefix', ''))
        gender = data.get('gender', getattr(self.instance, 'gender', ''))
        error = validate_prefix_gender(prefix, gender)
        if error:
            raise serializers.ValidationError({'prefix': error})
        return data


class FarmerCreateSerializer(serializers.ModelSerializer):
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
            'is_active',
            'date_registered',
            'registered_by',
            'farmers_organization',
            'farmers_organization_name',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by', 'farmers_organization_name']

    def get_farmers_organization_name(self, obj):
        if obj.farmers_organization:
            return obj.farmers_organization.name
        return None

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
        if Farmer.objects.filter(rsbsa_number=value).exists():
            raise serializers.ValidationError(
                'A farmer with this RSBSA number is already registered in the system.'
            )
        return value

    def validate_contact_number(self, value):
        return validate_contact_format(value)

    def validate(self, data):
        prefix = data.get('prefix', '')
        gender = data.get('gender', '')
        error = validate_prefix_gender(prefix, gender)
        if error:
            raise serializers.ValidationError({'prefix': error})
        return data
