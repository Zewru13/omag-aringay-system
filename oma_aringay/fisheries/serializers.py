import re
from datetime import date

from rest_framework import serializers

from .models import AquacultureRecord, CaptureRecord, Fisherfolk, VendorRecord


def validate_contact_format(value):
    if value and value.strip():
        digits = ''.join(filter(str.isdigit, value.strip()))
        if len(digits) != 11 or not digits.startswith('09'):
            raise serializers.ValidationError(
                'Contact number must be exactly 11 digits and start with 09.'
            )
    return value


class AquacultureSerializer(serializers.ModelSerializer):
    class Meta:
        model = AquacultureRecord
        fields = [
            'id',
            'fisherfolk',
            'culture_type',
            'species_cultured',
            'area_hectares',
            'fingerlings_stocked',
            'production_volume_kg',
        ]
        read_only_fields = ['id']


class CaptureSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaptureRecord
        fields = [
            'id',
            'fisherfolk',
            'vessel_type',
            'vessel_material',
            'vessel_registration_number',
            'fishing_gear_type',
            'fishing_ground',
            'average_catch_per_trip_kg',
        ]
        read_only_fields = ['id']

    def validate(self, data):
        vessel_type = data.get('vessel_type')
        vessel_material = data.get('vessel_material')

        if vessel_type == 'Motorized':
            if not vessel_material:
                raise serializers.ValidationError({
                    'vessel_material': 'Vessel material is required for motorized vessels.',
                })
        else:
            data['vessel_material'] = None

        return data


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorRecord
        fields = [
            'id',
            'fisherfolk',
            'location_type',
            'stall_location',
            'type_of_products_sold',
            'source_of_fish',
        ]
        read_only_fields = ['id']

    def validate(self, data):
        location_type = data.get('location_type', 'Fixed Stall')
        stall_location = data.get('stall_location') or ''

        if location_type != 'Ambulant / No Fixed Location' and not stall_location.strip():
            raise serializers.ValidationError({
                'stall_location': 'Stall location is required for this location type.',
            })

        return data


class FisherfolkListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    is_senior_citizen = serializers.SerializerMethodField()

    class Meta:
        model = Fisherfolk
        fields = [
            'id',
            'lgu_registration_number',
            'prefix',
            'full_name',
            'gender',
            'birthdate',
            'barangay',
            'fisherfolk_type',
            'is_active',
            'is_senior_citizen',
            'date_registered',
        ]

    def get_is_senior_citizen(self, obj):
        from django.utils.timezone import now
        if not obj.birthdate:
            return False
        today = now().date()
        senior_cutoff = today.replace(year=today.year - 60)
        return obj.birthdate <= senior_cutoff


class FisherfolkDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    aquaculture_record = AquacultureSerializer(read_only=True)
    capture_record = CaptureSerializer(read_only=True)
    vendor_record = VendorSerializer(read_only=True)
    is_senior_citizen = serializers.SerializerMethodField()

    class Meta:
        model = Fisherfolk
        fields = [
            'id',
            'lgu_registration_number',
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
            'fisherfolk_type',
            'is_active',
            'is_senior_citizen',
            'date_registered',
            'registered_by',
            'aquaculture_record',
            'capture_record',
            'vendor_record',
            'facility_location',
            'pond_area_ha',
            'number_of_ponds',
            'water_source',
            'number_of_cages',
            'cage_dimensions',
            'fish_registration_number',
            'boat_registration_number',
            'has_vessel',
        ]
        read_only_fields = [
            'id',
            'date_registered',
            'registered_by',
            'aquaculture_record',
            'capture_record',
            'vendor_record',
        ]

    def get_is_senior_citizen(self, obj):
        from django.utils.timezone import now
        if not obj.birthdate:
            return False
        today = now().date()
        senior_cutoff = today.replace(year=today.year - 60)
        return obj.birthdate <= senior_cutoff

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

    def validate_contact_number(self, value):
        return validate_contact_format(value)


class FisherfolkCreateSerializer(serializers.ModelSerializer):
    lgu_registration_number = serializers.CharField(max_length=50)

    # Aquaculture fields
    culture_type = serializers.CharField(required=False, allow_blank=True, write_only=True)
    species_cultured = serializers.CharField(required=False, allow_blank=True, write_only=True)
    area_hectares = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    fingerlings_stocked = serializers.IntegerField(required=False, write_only=True)
    production_volume_kg = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True)

    # Capture fields
    vessel_type = serializers.CharField(required=False, allow_blank=True, write_only=True)
    vessel_material = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    vessel_registration_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    fishing_gear_type = serializers.CharField(required=False, allow_blank=True, write_only=True)
    fishing_ground = serializers.CharField(required=False, allow_blank=True, write_only=True)
    average_catch_per_trip_kg = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)

    # Vendor fields
    location_type = serializers.CharField(required=False, allow_blank=True, write_only=True)
    stall_location = serializers.CharField(required=False, allow_blank=True, write_only=True)
    type_of_products_sold = serializers.CharField(required=False, allow_blank=True, write_only=True)
    source_of_fish = serializers.CharField(required=False, allow_blank=True, write_only=True)

    # Facility profile fields (Aquaculture / Mariculture)
    facility_location = serializers.CharField(required=False, allow_blank=True)
    pond_area_ha = serializers.DecimalField(max_digits=8, decimal_places=4, required=False, allow_null=True)
    number_of_ponds = serializers.IntegerField(required=False, allow_null=True)
    water_source = serializers.CharField(required=False, allow_blank=True)
    number_of_cages = serializers.IntegerField(required=False, allow_null=True)
    cage_dimensions = serializers.CharField(required=False, allow_blank=True)

    # Registration numbers
    fish_registration_number = serializers.CharField(required=False, allow_blank=True)
    boat_registration_number = serializers.CharField(required=False, allow_blank=True)
    has_vessel = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Fisherfolk
        fields = [
            'id',
            'lgu_registration_number',
            'prefix',
            'first_name',
            'last_name',
            'middle_name',
            'gender',
            'birthdate',
            'contact_number',
            'barangay',
            'municipality',
            'fisherfolk_type',
            'is_active',
            'date_registered',
            'registered_by',
            'culture_type',
            'species_cultured',
            'area_hectares',
            'fingerlings_stocked',
            'production_volume_kg',
            'vessel_type',
            'vessel_material',
            'vessel_registration_number',
            'fishing_gear_type',
            'fishing_ground',
            'average_catch_per_trip_kg',
            'location_type',
            'stall_location',
            'type_of_products_sold',
            'source_of_fish',
            'facility_location',
            'pond_area_ha',
            'number_of_ponds',
            'water_source',
            'number_of_cages',
            'cage_dimensions',
            'fish_registration_number',
            'boat_registration_number',
            'has_vessel',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by']

    def validate_lgu_registration_number(self, value):
        if Fisherfolk.objects.filter(lgu_registration_number=value).exists():
            raise serializers.ValidationError(
                'This LGU registration number is already registered in the system.'
            )
        return value

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

    def validate_contact_number(self, value):
        return validate_contact_format(value)

    def validate_fish_registration_number(self, value):
        if value and value.strip():
            digits = value.strip()
            if not digits.isdigit() or not (14 <= len(digits) <= 16):
                raise serializers.ValidationError(
                    'Fish Registration Number must be 14 to 16 digits.'
                )
        return value

    def validate_boat_registration_number(self, value):
        if value and value.strip():
            digits = value.strip()
            if not digits.isdigit() or len(digits) != 7:
                raise serializers.ValidationError(
                    'Boat Registration Number must be exactly 7 digits.'
                )
        return value

    def validate(self, data):
        fisherfolk_type = data.get('fisherfolk_type', '')

        fish_reg = (data.get('fish_registration_number') or '').strip()

        if fisherfolk_type != 'Vendor' and not fish_reg:
            raise serializers.ValidationError({
                'fish_registration_number': 'Fish Registration Number is required.'
            })

        has_vessel = data.get('has_vessel', True)
        if not has_vessel:
            data['boat_registration_number'] = ''

        if fisherfolk_type in ('Capture', 'Inland'):
            vessel_type = data.get('vessel_type', '')
            vessel_material = data.get('vessel_material') or ''
            if vessel_type == 'Motorized' and not vessel_material.strip():
                raise serializers.ValidationError({
                    'vessel_material': 'Vessel material is required for motorized vessels.',
                })
            if vessel_type != 'Motorized':
                data['vessel_material'] = None

        if fisherfolk_type == 'Vendor':
            location_type = data.get('location_type', 'Fixed Stall')
            stall_location = data.get('stall_location') or ''
            if location_type != 'Ambulant / No Fixed Location' and not stall_location.strip():
                raise serializers.ValidationError({
                    'stall_location': 'Stall location is required for this location type.',
                })

        return data

    def create(self, validated_data):
        aquaculture_data = {
            'culture_type': validated_data.pop('culture_type', ''),
            'species_cultured': validated_data.pop('species_cultured', ''),
            'area_hectares': validated_data.pop('area_hectares', 0),
            'fingerlings_stocked': validated_data.pop('fingerlings_stocked', 0),
            'production_volume_kg': validated_data.pop('production_volume_kg', None),
        }
        capture_data = {
            'vessel_type': validated_data.pop('vessel_type', ''),
            'vessel_material': validated_data.pop('vessel_material', None),
            'vessel_registration_number': validated_data.pop('vessel_registration_number', ''),
            'fishing_gear_type': validated_data.pop('fishing_gear_type', ''),
            'fishing_ground': validated_data.pop('fishing_ground', ''),
            'average_catch_per_trip_kg': validated_data.pop('average_catch_per_trip_kg', 0),
        }
        vendor_data = {
            'location_type': validated_data.pop('location_type', 'Fixed Stall'),
            'stall_location': validated_data.pop('stall_location', ''),
            'type_of_products_sold': validated_data.pop('type_of_products_sold', ''),
            'source_of_fish': validated_data.pop('source_of_fish', ''),
        }
        fisherfolk = Fisherfolk.objects.create(**validated_data)

        if fisherfolk.fisherfolk_type in ('Aquaculture', 'Mariculture'):
            AquacultureRecord.objects.create(fisherfolk=fisherfolk, **aquaculture_data)
        elif fisherfolk.fisherfolk_type in ('Capture', 'Inland'):
            CaptureRecord.objects.create(fisherfolk=fisherfolk, **capture_data)
        elif fisherfolk.fisherfolk_type == 'Vendor':
            VendorRecord.objects.create(fisherfolk=fisherfolk, **vendor_data)

        return fisherfolk
