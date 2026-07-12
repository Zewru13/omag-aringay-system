from datetime import date

from django.db.models import Q, Sum
from rest_framework import serializers

from core.constants import validate_prefix_gender
from core.validators import validate_not_future_date

from .models import (
    AquacultureRecord,
    CaptureRecord,
    Fisherfolk,
    FisheriesActivityLog,
    FisheriesAssistanceRecord,
    FisheriesDisasterReport,
    FisheriesHarvestRecord,
    FishingTripLog,
    SpeciesActivityStage,
    SpeciesCategory,
    SpeciesOption,
    StockingRecord,
    TripSpeciesEntry,
    VendorRecord,
    VesselInspection,
)


def validate_contact_format(value):
    if value and value.strip():
        digits = ''.join(filter(str.isdigit, value.strip()))
        if len(digits) != 11 or not digits.startswith('09'):
            raise serializers.ValidationError(
                'Contact number must be exactly 11 digits and start with 09.'
            )
    return value


# ─── Fisherfolk sub-record serializers ────────────────────────────────────────

class AquacultureSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AquacultureRecord
        fields = ['id', 'fisherfolk', 'culture_type', 'species_cultured', 'area_hectares', 'fingerlings_stocked', 'production_volume_kg']
        read_only_fields = ['id']


class CaptureSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CaptureRecord
        fields = ['id', 'fisherfolk', 'vessel_type', 'vessel_material', 'vessel_registration_number', 'fishing_gear_type', 'fishing_ground', 'average_catch_per_trip_kg']
        read_only_fields = ['id']

    def validate(self, data):
        vessel_type = data.get('vessel_type')
        if vessel_type == 'Motorized' and not data.get('vessel_material'):
            raise serializers.ValidationError({'vessel_material': 'Vessel material is required for motorized vessels.'})
        if vessel_type != 'Motorized':
            data['vessel_material'] = None
        return data


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model  = VendorRecord
        fields = ['id', 'fisherfolk', 'location_type', 'stall_location', 'type_of_products_sold', 'source_of_fish']
        read_only_fields = ['id']

    def validate(self, data):
        if data.get('location_type') != 'Ambulant / No Fixed Location':
            if not (data.get('stall_location') or '').strip():
                raise serializers.ValidationError({'stall_location': 'Stall location is required for this location type.'})
        return data


# ─── Fisherfolk ───────────────────────────────────────────────────────────────

class FisherfolkListSerializer(serializers.ModelSerializer):
    full_name         = serializers.CharField(read_only=True)
    is_senior_citizen = serializers.SerializerMethodField()

    class Meta:
        model  = Fisherfolk
        fields = [
            'id', 'lgu_registration_number', 'fishr_number', 'prefix', 'full_name',
            'gender', 'birthdate', 'barangay', 'fisherfolk_type',
            'is_active', 'is_senior_citizen', 'date_registered',
            'rsbsa_number', 'boatr_number',
            'is_aquaculture', 'is_capture_fishery', 'is_mariculture', 'is_inland_fishery', 'is_fish_vendor',
        ]

    def get_is_senior_citizen(self, obj):
        if not obj.birthdate:
            return False
        today = date.today()
        return (today.year - obj.birthdate.year - (
            (today.month, today.day) < (obj.birthdate.month, obj.birthdate.day)
        )) >= 60


class FisherfolkDetailSerializer(serializers.ModelSerializer):
    full_name         = serializers.CharField(read_only=True)
    aquaculture_record = AquacultureSerializer(read_only=True)
    capture_record    = CaptureSerializer(read_only=True)
    vendor_record     = VendorSerializer(read_only=True)
    is_senior_citizen = serializers.SerializerMethodField()

    class Meta:
        model  = Fisherfolk
        fields = [
            'id', 'lgu_registration_number', 'fishr_number',
            'prefix', 'first_name', 'last_name', 'middle_name', 'full_name',
            'gender', 'birthdate', 'contact_number', 'barangay', 'municipality',
            'civil_status', 'highest_education', 'philsys_number',
            'fisherfolk_type',
            'is_pwd', 'is_4ps_beneficiary', 'is_icc_ip_member', 'icc_ip_name', 'is_senior_citizen',
            'fisherfolk_association', 'association_position',
            'is_active', 'date_registered', 'registered_by',
            'aquaculture_record', 'capture_record', 'vendor_record',
            'facility_location', 'pond_area_ha', 'number_of_ponds', 'water_source',
            'number_of_cages', 'cage_dimensions', 'fish_registration_number',
            'boat_registration_number', 'has_vessel',
            'rsbsa_number', 'boatr_number',
            'is_aquaculture', 'is_capture_fishery', 'is_mariculture', 'is_inland_fishery', 'is_fish_vendor',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by', 'aquaculture_record', 'capture_record', 'vendor_record']

    def get_is_senior_citizen(self, obj):
        if not obj.birthdate:
            return False
        today = date.today()
        return (today.year - obj.birthdate.year - (
            (today.month, today.day) < (obj.birthdate.month, obj.birthdate.day)
        )) >= 60

    def validate_birthdate(self, value):
        if value:
            today = date.today()
            age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
            if age < 10:
                raise serializers.ValidationError('Registrant must be at least 10 years old.')
        return value

    def validate_contact_number(self, value):
        return validate_contact_format(value)

    def validate_fishr_number(self, value):
        if value is not None and not value.strip():
            return None
        return value

    def validate_rsbsa_number(self, value):
        if value is not None and not value.strip():
            return None
        return value

    def validate_lgu_registration_number(self, value):
        if value is not None and not value.strip():
            return None
        return value

    def validate(self, data):
        prefix = data.get('prefix', getattr(self.instance, 'prefix', ''))
        gender = data.get('gender', getattr(self.instance, 'gender', ''))
        error = validate_prefix_gender(prefix, gender)
        if error:
            raise serializers.ValidationError({'prefix': error})

        is_capture_fishery = data.get('is_capture_fishery', getattr(self.instance, 'is_capture_fishery', False))
        if not is_capture_fishery:
            data['boatr_number'] = ''
        return data


class FisherfolkCreateSerializer(serializers.ModelSerializer):
    # Aquaculture fields
    culture_type         = serializers.CharField(required=False, allow_blank=True, write_only=True)
    species_cultured     = serializers.CharField(required=False, allow_blank=True, write_only=True)
    area_hectares        = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    fingerlings_stocked  = serializers.IntegerField(required=False, write_only=True)
    production_volume_kg = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True)

    # Capture fields
    vessel_type                = serializers.CharField(required=False, allow_blank=True, write_only=True)
    vessel_material            = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    vessel_registration_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    fishing_gear_type          = serializers.CharField(required=False, allow_blank=True, write_only=True)
    fishing_ground             = serializers.CharField(required=False, allow_blank=True, write_only=True)
    average_catch_per_trip_kg  = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)

    # Vendor fields
    location_type         = serializers.CharField(required=False, allow_blank=True, write_only=True)
    stall_location        = serializers.CharField(required=False, allow_blank=True, write_only=True)
    type_of_products_sold = serializers.CharField(required=False, allow_blank=True, write_only=True)
    source_of_fish        = serializers.CharField(required=False, allow_blank=True, write_only=True)

    # Facility profile
    facility_location = serializers.CharField(required=False, allow_blank=True)
    pond_area_ha      = serializers.DecimalField(max_digits=8, decimal_places=4, required=False, allow_null=True)
    number_of_ponds   = serializers.IntegerField(required=False, allow_null=True)
    water_source      = serializers.CharField(required=False, allow_blank=True)
    number_of_cages   = serializers.IntegerField(required=False, allow_null=True)
    cage_dimensions   = serializers.CharField(required=False, allow_blank=True)
    boat_registration_number = serializers.CharField(required=False, allow_blank=True)
    has_vessel        = serializers.BooleanField(required=False, default=True)

    # OMAg identifiers and activity profile flags
    boatr_number       = serializers.CharField(required=False, allow_blank=True)
    is_aquaculture     = serializers.BooleanField(required=False, default=True)
    is_capture_fishery = serializers.BooleanField(required=False, default=False)
    is_mariculture     = serializers.BooleanField(required=False, default=False)
    is_inland_fishery  = serializers.BooleanField(required=False, default=False)
    is_fish_vendor     = serializers.BooleanField(required=False, default=False)

    class Meta:
        model  = Fisherfolk
        fields = [
            'id', 'fishr_number',
            'prefix', 'first_name', 'last_name', 'middle_name',
            'gender', 'birthdate', 'contact_number', 'barangay', 'municipality',
            'civil_status', 'highest_education', 'philsys_number',
            'fisherfolk_type',
            'is_pwd', 'is_4ps_beneficiary', 'is_icc_ip_member', 'icc_ip_name', 'is_senior_citizen',
            'fisherfolk_association', 'association_position',
            'is_active', 'date_registered', 'registered_by',
            'culture_type', 'species_cultured', 'area_hectares', 'fingerlings_stocked', 'production_volume_kg',
            'vessel_type', 'vessel_material', 'vessel_registration_number',
            'fishing_gear_type', 'fishing_ground', 'average_catch_per_trip_kg',
            'location_type', 'stall_location', 'type_of_products_sold', 'source_of_fish',
            'facility_location', 'pond_area_ha', 'number_of_ponds', 'water_source',
            'number_of_cages', 'cage_dimensions',
            'boat_registration_number', 'has_vessel',
            'rsbsa_number', 'boatr_number',
            'is_aquaculture', 'is_capture_fishery', 'is_mariculture', 'is_inland_fishery', 'is_fish_vendor',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by']

    def validate_birthdate(self, value):
        if value:
            today = date.today()
            age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
            if age < 10:
                raise serializers.ValidationError('Registrant must be at least 10 years old.')
        return value

    def validate_contact_number(self, value):
        return validate_contact_format(value)

    def validate_fishr_number(self, value):
        if value is not None and not value.strip():
            return None
        return value

    def validate_boat_registration_number(self, value):
        if value and value.strip():
            digits = value.strip()
            if not digits.isdigit() or len(digits) != 7:
                raise serializers.ValidationError('Boat Registration Number must be exactly 7 digits.')
        return value

    def validate(self, data):
        prefix = data.get('prefix', '')
        gender = data.get('gender', '')
        error = validate_prefix_gender(prefix, gender)
        if error:
            raise serializers.ValidationError({'prefix': error})

        if not data.get('is_capture_fishery', False):
            data['boatr_number'] = ''

        fisherfolk_type = data.get('fisherfolk_type', '')
        if not data.get('has_vessel', True):
            data['boat_registration_number'] = ''
        if fisherfolk_type in ('Capture', 'Inland'):
            if data.get('vessel_type') == 'Motorized' and not (data.get('vessel_material') or '').strip():
                raise serializers.ValidationError({'vessel_material': 'Vessel material is required for motorized vessels.'})
            if data.get('vessel_type') != 'Motorized':
                data['vessel_material'] = None
        if fisherfolk_type == 'Vendor':
            if data.get('location_type') != 'Ambulant / No Fixed Location':
                if not (data.get('stall_location') or '').strip():
                    raise serializers.ValidationError({'stall_location': 'Stall location is required for this location type.'})
        return data

    def validate_rsbsa_number(self, value):
        if value is not None and not value.strip():
            return None
        return value

    def create(self, validated_data):
        aquaculture_data = {
            'culture_type':         validated_data.pop('culture_type', ''),
            'species_cultured':     validated_data.pop('species_cultured', ''),
            'area_hectares':        validated_data.pop('area_hectares', 0),
            'fingerlings_stocked':  validated_data.pop('fingerlings_stocked', 0),
            'production_volume_kg': validated_data.pop('production_volume_kg', None),
        }
        capture_data = {
            'vessel_type':                validated_data.pop('vessel_type', ''),
            'vessel_material':            validated_data.pop('vessel_material', None),
            'vessel_registration_number': validated_data.pop('vessel_registration_number', ''),
            'fishing_gear_type':          validated_data.pop('fishing_gear_type', ''),
            'fishing_ground':             validated_data.pop('fishing_ground', ''),
            'average_catch_per_trip_kg':  validated_data.pop('average_catch_per_trip_kg', 0),
        }
        vendor_data = {
            'location_type':         validated_data.pop('location_type', 'Fixed Stall'),
            'stall_location':        validated_data.pop('stall_location', ''),
            'type_of_products_sold': validated_data.pop('type_of_products_sold', ''),
            'source_of_fish':        validated_data.pop('source_of_fish', ''),
        }

        fisherfolk = Fisherfolk.objects.create(**validated_data)
        if fisherfolk.fisherfolk_type in ('Aquaculture', 'Mariculture'):
            AquacultureRecord.objects.create(fisherfolk=fisherfolk, **aquaculture_data)
        elif fisherfolk.fisherfolk_type in ('Capture', 'Inland'):
            CaptureRecord.objects.create(fisherfolk=fisherfolk, **capture_data)
        elif fisherfolk.fisherfolk_type == 'Vendor':
            VendorRecord.objects.create(fisherfolk=fisherfolk, **vendor_data)
        return fisherfolk


# ─── Species ──────────────────────────────────────────────────────────────────

class SpeciesCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = SpeciesCategory
        fields = ['id', 'name', 'date_created']
        read_only_fields = ['id', 'date_created']


class SpeciesActivityStageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SpeciesActivityStage
        fields = [
            'id', 'species_option', 'activity_name', 'day_after_stocking',
            'application_days', 'recommendation', 'priority', 'window_days', 'order',
        ]
        read_only_fields = ['id', 'species_option', 'day_after_stocking']

    def validate_application_days(self, value):
        if not isinstance(value, list) or len(value) == 0:
            raise serializers.ValidationError('At least one day is required.')
        for d in value:
            if not isinstance(d, int) or d < 0:
                raise serializers.ValidationError('Each day must be a non-negative integer.')
        return sorted(set(value))

    def create(self, validated_data):
        days = validated_data.get('application_days', [])
        if days:
            validated_data['day_after_stocking'] = min(days)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        days = validated_data.get('application_days', instance.application_days)
        if days:
            validated_data['day_after_stocking'] = min(days)
        return super().update(instance, validated_data)


class SpeciesOptionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    stages        = SpeciesActivityStageSerializer(many=True, read_only=True)

    class Meta:
        model  = SpeciesOption
        fields = [
            'id', 'species_name', 'category', 'category_name',
            'culture_environment', 'culture_duration_days',
            'default_survival_rate_pct', 'default_avg_body_weight_kg',
            'stages',
        ]
        read_only_fields = ['id', 'category_name', 'stages']


# ─── Stocking Record ──────────────────────────────────────────────────────────

class FisheriesActivityLogSerializer(serializers.ModelSerializer):
    logged_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = FisheriesActivityLog
        fields = [
            'id', 'stocking_record', 'activity', 'activity_other_specify', 'date_of_activity',
            'water_fish_condition', 'feed_type', 'feed_quantity_kg', 'feed_brand',
            'observed_issue', 'severity', 'mortality_count', 'area_affected_ha',
            'treatment_applied', 'outcome',
            'recommendations',
            'target_day', 'is_late', 'logged_by', 'logged_by_name',
            'date_logged', 'disaster_report', 'disaster_rule',
        ]
        read_only_fields = ['id', 'stocking_record', 'logged_by', 'logged_by_name', 'is_late', 'date_logged']

    def get_logged_by_name(self, obj):
        if obj.logged_by:
            return getattr(obj.logged_by, 'full_name', str(obj.logged_by))
        return None

    def validate_date_of_activity(self, value):
        if value > date.today():
            raise serializers.ValidationError('Date of activity cannot be in the future.')
        return value

    def validate(self, data):
        date_of_activity = data.get('date_of_activity')
        stocking_record = data.get('stocking_record')
        if not stocking_record:
            stocking_id = self.context.get('view').kwargs.get('stocking_id') if self.context.get('view') else None
            if stocking_id:
                stocking_record = StockingRecord.objects.filter(pk=stocking_id).first()
        if date_of_activity and stocking_record and stocking_record.date_stocked:
            if date_of_activity < stocking_record.date_stocked:
                raise serializers.ValidationError({
                    'date_of_activity': 'Date of activity cannot be before the date stocked '
                                        f'({stocking_record.date_stocked}).'
                })

        activity = data.get('activity', '')
        if activity == 'Other' and not (data.get('activity_other_specify') or '').strip():
            raise serializers.ValidationError({
                'activity_other_specify': 'Please specify the activity.'
            })

        area_affected_ha = data.get('area_affected_ha')
        if activity == 'Disease Control' and area_affected_ha is None:
            raise serializers.ValidationError({
                'area_affected_ha': 'Area affected is required for Disease Control activities.'
            })
        if area_affected_ha is not None:
            if area_affected_ha <= 0:
                raise serializers.ValidationError({
                    'area_affected_ha': 'Area affected must be greater than 0.'
                })
            if stocking_record and stocking_record.area_hectares and area_affected_ha > stocking_record.area_hectares:
                raise serializers.ValidationError({
                    'area_affected_ha': f'Area affected cannot exceed the {stocking_record.area_hectares} ha stocked.'
                })
        return data


class FisheriesDisasterReportSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = FisheriesDisasterReport
        fields = [
            'id', 'stocking_record', 'disaster_type', 'disaster_type_other_specify', 'date_of_occurrence',
            'area_affected_ha', 'estimated_damage', 'production_loss',
            'is_total_loss',
            'status', 'resolved_date', 'resolved_by', 'resolved_by_name',
            'reported_by', 'reported_by_name', 'date_reported',
        ]
        read_only_fields = [
            'id', 'stocking_record', 'status', 'resolved_date',
            'resolved_by', 'resolved_by_name',
            'reported_by', 'reported_by_name', 'date_reported',
        ]

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return getattr(obj.reported_by, 'full_name', str(obj.reported_by))
        return None

    def get_resolved_by_name(self, obj):
        if obj.resolved_by:
            return getattr(obj.resolved_by, 'full_name', str(obj.resolved_by))
        return None

    def validate_date_of_occurrence(self, value):
        validate_not_future_date(value, 'Date of occurrence')
        return value

    def validate(self, data):
        disaster_type = data.get('disaster_type', '')
        if disaster_type == 'Other' and not (data.get('disaster_type_other_specify') or '').strip():
            raise serializers.ValidationError({
                'disaster_type_other_specify': 'Please specify the disaster type.'
            })

        area_affected_ha = data.get('area_affected_ha')
        stocking_record = data.get('stocking_record')
        if not stocking_record:
            stocking_id = self.context.get('view').kwargs.get('stocking_id') if self.context.get('view') else None
            if stocking_id:
                stocking_record = StockingRecord.objects.filter(pk=stocking_id).first()
        if area_affected_ha is None:
            raise serializers.ValidationError({'area_affected_ha': 'Area affected is required.'})
        if area_affected_ha <= 0:
            raise serializers.ValidationError({'area_affected_ha': 'Area affected must be greater than 0.'})
        if stocking_record and stocking_record.area_hectares and area_affected_ha > stocking_record.area_hectares:
            raise serializers.ValidationError({
                'area_affected_ha': f'Area affected cannot exceed the {stocking_record.area_hectares} ha stocked.'
            })
        return data


class FisheriesHarvestRecordSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = FisheriesHarvestRecord
        fields = [
            'id', 'stocking_record', 'harvest_date', 'quantity_kg',
            'avg_body_weight_kg', 'area_or_units_harvested', 'is_final',
            'harvest_variance_days', 'early_late_reason', 'notes',
            'recorded_by', 'recorded_by_name', 'date_recorded',
        ]
        read_only_fields = ['id', 'stocking_record', 'harvest_variance_days', 'recorded_by', 'recorded_by_name', 'date_recorded']

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return getattr(obj.recorded_by, 'full_name', str(obj.recorded_by))
        return None

    def validate(self, data):
        harvest_date = data.get('harvest_date', getattr(self.instance, 'harvest_date', None))
        is_final = data.get('is_final', getattr(self.instance, 'is_final', False))
        stocking_record = data.get('stocking_record', getattr(self.instance, 'stocking_record', None))
        if not stocking_record:
            stocking_id = self.context.get('view').kwargs.get('stocking_id') if self.context.get('view') else None
            if stocking_id:
                stocking_record = StockingRecord.objects.filter(pk=stocking_id).first()

        if harvest_date:
            if harvest_date > date.today():
                raise serializers.ValidationError({'harvest_date': 'Harvest date cannot be in the future.'})
            if stocking_record and stocking_record.date_stocked and harvest_date < stocking_record.date_stocked:
                raise serializers.ValidationError({
                    'harvest_date': f'Harvest date cannot be before the date stocked ({stocking_record.date_stocked}).'
                })
            if is_final and stocking_record and stocking_record.expected_harvest_date:
                variance = (harvest_date - stocking_record.expected_harvest_date).days
                reason = data.get('early_late_reason', getattr(self.instance, 'early_late_reason', '')) or ''
                if abs(variance) > 7 and not reason.strip():
                    raise serializers.ValidationError({
                        'early_late_reason': 'A reason is required when the harvest date is more than 7 days early or late.'
                    })
        return data


class StockingRecordSerializer(serializers.ModelSerializer):
    fisherfolk_name  = serializers.SerializerMethodField()
    species_name     = serializers.CharField(source='species.species_name', read_only=True)
    category_name    = serializers.CharField(source='species.category.name', read_only=True)
    is_near_harvest  = serializers.SerializerMethodField()
    log_count        = serializers.SerializerMethodField()
    disaster_count   = serializers.SerializerMethodField()
    disaster_report_count = serializers.SerializerMethodField()
    has_resolved_disaster = serializers.SerializerMethodField()
    harvest_variance_days = serializers.SerializerMethodField()
    total_harvested_kg = serializers.SerializerMethodField()
    harvest_count    = serializers.SerializerMethodField()
    stocking_density = serializers.SerializerMethodField()
    production_cycle_no = serializers.SerializerMethodField()
    pond_location_barangay = serializers.CharField(required=False, allow_blank=True, default='')
    area_hectares          = serializers.DecimalField(max_digits=10, decimal_places=4, required=False, allow_null=True)
    survival_rate_pct      = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    avg_body_weight_kg     = serializers.DecimalField(max_digits=8, decimal_places=3, required=False, allow_null=True)

    class Meta:
        model  = StockingRecord
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name',
            'pond_location_barangay', 'land_status', 'land_status_other_specify', 'culture_type',
            'species', 'species_name', 'category_name',
            'date_stocked', 'area_hectares', 'number_of_fingerlings',
            'survival_rate_pct', 'avg_body_weight_kg',
            'water_source', 'water_source_other_specify', 'number_of_units', 'unit_dimensions',
            'fingerling_source', 'fingerling_source_other_specify', 'avg_fingerling_size',
            'season', 'year', 'status',
            'expected_harvest_date', 'estimated_harvest_kg',
            'notes', 'recorded_by', 'date_recorded',
            'is_near_harvest', 'log_count', 'disaster_count', 'disaster_report_count',
            'has_resolved_disaster',
            'total_harvested_kg', 'harvest_count', 'harvest_variance_days',
            'stocking_density', 'production_cycle_no',
        ]
        read_only_fields = [
            'id', 'fisherfolk_name', 'species_name', 'category_name',
            'expected_harvest_date', 'estimated_harvest_kg',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'log_count', 'disaster_count', 'disaster_report_count',
            'has_resolved_disaster',
            'total_harvested_kg', 'harvest_count', 'harvest_variance_days',
            'stocking_density', 'production_cycle_no',
        ]

    def get_fisherfolk_name(self, obj):
        return obj.fisherfolk.full_name if obj.fisherfolk else None

    def get_is_near_harvest(self, obj):
        if obj.expected_harvest_date and obj.status in (StockingRecord.Status.STOCKED, StockingRecord.Status.NEAR_HARVEST):
            delta = (obj.expected_harvest_date - date.today()).days
            return 0 <= delta <= 7
        return False

    def get_log_count(self, obj):
        return obj.logs.count()

    def get_disaster_count(self, obj):
        return obj.disaster_reports.filter(status='Active').count()

    def get_disaster_report_count(self, obj):
        return obj.disaster_reports.count()

    def get_harvest_variance_days(self, obj):
        final = obj.harvests.filter(is_final=True).first()
        return final.harvest_variance_days if final else None

    def get_has_resolved_disaster(self, obj):
        return obj.disaster_reports.filter(status='Resolved').exists()

    def get_total_harvested_kg(self, obj):
        result = obj.harvests.aggregate(total=Sum('quantity_kg'))['total']
        return float(result) if result is not None else 0.0

    def get_harvest_count(self, obj):
        return obj.harvests.count()

    def get_stocking_density(self, obj):
        if obj.area_hectares and obj.area_hectares > 0 and obj.number_of_fingerlings is not None:
            return round(float(obj.number_of_fingerlings) / float(obj.area_hectares), 2)
        return None

    def get_production_cycle_no(self, obj):
        if not obj.fisherfolk_id or not obj.species_id or not obj.date_stocked:
            return 1
        prior = StockingRecord.objects.filter(
            fisherfolk_id=obj.fisherfolk_id,
            species_id=obj.species_id,
        ).filter(
            Q(date_stocked__lt=obj.date_stocked)
            | Q(date_stocked=obj.date_stocked, id__lt=obj.id)
        ).count()
        return prior + 1

    def validate_date_stocked(self, value):
        validate_not_future_date(value, 'Date stocked')
        return value

    def validate(self, data):
        for field_name, specify_name, label in [
            ('land_status', 'land_status_other_specify', 'land status'),
            ('water_source', 'water_source_other_specify', 'water source'),
            ('fingerling_source', 'fingerling_source_other_specify', 'fingerling source'),
        ]:
            value = data.get(field_name, getattr(self.instance, field_name, ''))
            specify = data.get(specify_name, getattr(self.instance, specify_name, ''))
            if value == 'Other' and not (specify or '').strip():
                raise serializers.ValidationError({specify_name: f'Please specify the {label}.'})
        return data


class StockingRecordDetailSerializer(StockingRecordSerializer):
    logs             = FisheriesActivityLogSerializer(many=True, read_only=True)
    disaster_reports = FisheriesDisasterReportSerializer(many=True, read_only=True)
    harvests         = FisheriesHarvestRecordSerializer(many=True, read_only=True)

    class Meta(StockingRecordSerializer.Meta):
        fields = StockingRecordSerializer.Meta.fields + ['logs', 'disaster_reports', 'harvests']
        read_only_fields = StockingRecordSerializer.Meta.read_only_fields + ['logs', 'disaster_reports', 'harvests']


# ─── Legacy Capture Fishing / Vessel / Assistance serializers ─────────────────
# Relocated from monitoring app (Phase 3 of the fisheries merge).

class TripSpeciesEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = TripSpeciesEntry
        fields = ['id', 'fishing_trip', 'species_name', 'volume_kg', 'notes']
        read_only_fields = ['id', 'fishing_trip']


class FishingTripLogSerializer(serializers.ModelSerializer):
    fisherfolk_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_type = serializers.CharField(source='fisherfolk.fisherfolk_type', read_only=True)
    fisherfolk_barangay = serializers.CharField(source='fisherfolk.barangay', read_only=True)
    species_entries = TripSpeciesEntrySerializer(many=True, read_only=True)
    top_species = serializers.SerializerMethodField()
    species_count = serializers.SerializerMethodField()

    class Meta:
        model = FishingTripLog
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name', 'fisherfolk_type', 'fisherfolk_barangay',
            'trip_date', 'return_date', 'fishing_ground', 'gear_used',
            'total_catch_kg', 'hours_at_sea', 'fuel_consumption_liters',
            'remarks', 'recorded_by', 'date_recorded',
            'species_entries', 'top_species', 'species_count',
        ]
        read_only_fields = [
            'id', 'fisherfolk_name', 'fisherfolk_type', 'fisherfolk_barangay',
            'recorded_by', 'date_recorded',
            'species_entries', 'top_species', 'species_count',
        ]

    def get_top_species(self, obj):
        top = obj.species_entries.order_by('-volume_kg').first()
        return top.species_name if top else None

    def get_species_count(self, obj):
        return obj.species_entries.values('species_name').distinct().count()

    def validate_trip_date(self, value):
        validate_not_future_date(value, 'Trip date')
        return value

    def validate_return_date(self, value):
        validate_not_future_date(value, 'Return date')
        return value


class VesselInspectionSerializer(serializers.ModelSerializer):
    fisherfolk_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    days_until_expiry = serializers.SerializerMethodField()
    license_status = serializers.SerializerMethodField()

    class Meta:
        model = VesselInspection
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name',
            'inspection_date', 'license_number', 'license_expiry_date',
            'vessel_condition', 'remarks', 'inspected_by', 'date_recorded',
            'days_until_expiry', 'license_status',
        ]
        read_only_fields = [
            'id', 'fisherfolk_name', 'inspected_by', 'date_recorded',
            'days_until_expiry', 'license_status',
        ]

    def get_days_until_expiry(self, obj):
        return (obj.license_expiry_date - date.today()).days

    def get_license_status(self, obj):
        days = (obj.license_expiry_date - date.today()).days
        if days < 0:
            return 'Expired'
        if days <= 30:
            return 'Expiring Soon'
        return 'Valid'

    def validate_inspection_date(self, value):
        validate_not_future_date(value, 'Inspection date')
        return value
    # license_expiry_date deliberately NOT capped — it's forward-looking by definition.


class FisheriesAssistanceSerializer(serializers.ModelSerializer):
    fisherfolk_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_type = serializers.CharField(source='fisherfolk.fisherfolk_type', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FisheriesAssistanceRecord
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name', 'fisherfolk_type',
            'assistance_type', 'description', 'quantity', 'date_received',
            'source_agency', 'season', 'year', 'remarks',
            'recorded_by', 'recorded_by_name', 'date_recorded',
        ]
        read_only_fields = ['id', 'fisherfolk_name', 'fisherfolk_type', 'recorded_by', 'recorded_by_name', 'date_recorded']

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.full_name if obj.recorded_by else None

    def validate_date_received(self, value):
        validate_not_future_date(value, 'Date received')
        return value
