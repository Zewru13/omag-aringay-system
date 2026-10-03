from collections import defaultdict
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Q, Sum, prefetch_related_objects
from rest_framework import serializers

from accounts.models import User
from accounts.utils import citizen_account_info
from associations.models import FisherfolkOrganizationMember
from core.constants import validate_prefix_gender
from core.validators import validate_not_future_date, validate_philsys, validate_rsbsa, validate_uploaded_image
from monitoring.models import AquacultureProductionUnit

from .models import (
    AquacultureRecord,
    CaptureRecord,
    DiseaseResponseGuide,
    DiseaseType,
    FeedType,
    Fisherfolk,
    FisheriesActivityLog,
    FisheriesActivityType,
    FisheriesDisasterReport,
    HARVEST_TIMING_LABELS,
    FisheriesHarvestRecord,
    FisheriesHarvestUnit,
    FishingTripLog,
    Pond,
    SpeciesActivityStage,
    SpeciesCategory,
    SpeciesOption,
    StockingRecord,
    TripSpeciesEntry,
    harvest_timing,
    production_cycle_numbers_bulk,
    stocking_harvest_status_bulk,
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
        fields = [
            'id', 'fisherfolk', 'culture_type', 'culture_type_other_specify',
            'species_cultured', 'species_cultured_other_specify',
            'area_hectares', 'fingerlings_stocked', 'production_volume_kg',
        ]
        read_only_fields = ['id']

    def validate(self, data):
        if data.get('culture_type') == 'Other' and not (data.get('culture_type_other_specify') or '').strip():
            raise serializers.ValidationError({'culture_type_other_specify': 'Please specify the culture type.'})
        if data.get('species_cultured') == 'Other' and not (data.get('species_cultured_other_specify') or '').strip():
            raise serializers.ValidationError({'species_cultured_other_specify': 'Please specify the species cultured.'})
        return data


class CaptureSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CaptureRecord
        fields = [
            'id', 'fisherfolk', 'vessel_type', 'vessel_material', 'vessel_material_other_specify',
            'vessel_registration_number', 'fishing_gear_type', 'fishing_ground', 'average_catch_per_trip_kg',
        ]
        read_only_fields = ['id']

    def validate(self, data):
        vessel_type = data.get('vessel_type')
        if vessel_type == 'Motorized' and not data.get('vessel_material'):
            raise serializers.ValidationError({'vessel_material': 'Vessel material is required for motorized vessels.'})
        if vessel_type == 'Motorized' and data.get('vessel_material') == 'Other' and not (data.get('vessel_material_other_specify') or '').strip():
            raise serializers.ValidationError({'vessel_material_other_specify': 'Please specify the vessel material.'})
        if vessel_type != 'Motorized':
            data['vessel_material'] = None
            data['vessel_material_other_specify'] = ''
        return data


# ─── Fisherfolk ───────────────────────────────────────────────────────────────

def _is_fisherfolk_affected_by_disaster(fisherfolk):
    # Computed, not stored — checks FisheriesDisasterReport directly (both
    # the stocking-cycle path and the fisherfolk-direct path from the
    # disaster-report consolidation) so it never drifts from the source
    # of truth.
    return FisheriesDisasterReport.objects.filter(
        Q(stocking_record__fisherfolk=fisherfolk) | Q(fisherfolk=fisherfolk),
        status='Active',
    ).exists()


class FisherfolkListSerializer(serializers.ModelSerializer):
    full_name         = serializers.CharField(read_only=True)
    is_senior_citizen = serializers.SerializerMethodField()

    class Meta:
        model  = Fisherfolk
        fields = [
            'id', 'lgu_registration_number', 'fishr_number', 'prefix', 'full_name',
            'gender', 'birthdate', 'barangay', 'fisherfolk_type',
            'is_active', 'is_senior_citizen', 'date_registered',
            'rsbsa_number',
            'is_aquaculture', 'is_capture_fishery', 'is_mariculture', 'is_inland_fishery',
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
    is_senior_citizen = serializers.SerializerMethodField()
    citizen_account   = serializers.SerializerMethodField()
    is_affected_by_disaster = serializers.SerializerMethodField()
    # Batch: organization_names resolves REAL current membership from
    # FisherfolkOrganizationMember (is_active=True rows), not the
    # fisherfolk_organization FK below -- that field is write-only/legacy,
    # set once at registration and never kept in sync with actual
    # membership (see interventions/models.py's resolution-order comment).
    # A list, not a single value, because unlike Farmer a fisherfolk may
    # belong to more than one organization at once.
    organization_names = serializers.SerializerMethodField()

    class Meta:
        model  = Fisherfolk
        fields = [
            'id', 'lgu_registration_number', 'fishr_number',
            'prefix', 'first_name', 'last_name', 'middle_name', 'full_name',
            'gender', 'birthdate', 'contact_number', 'barangay', 'municipality',
            'civil_status', 'highest_education', 'philsys_number',
            'fisherfolk_type',
            'is_pwd', 'is_4ps_beneficiary', 'is_icc_ip_member', 'icc_ip_name', 'is_senior_citizen',
            'fisherfolk_organization', 'organization_position', 'organization_names',
            'is_active', 'date_registered', 'registered_by',
            'aquaculture_record', 'capture_record',
            'facility_location', 'pond_area_ha', 'number_of_ponds', 'water_source',
            'number_of_cages', 'cage_dimensions', 'fish_registration_number',
            'boat_registration_number', 'has_vessel',
            'rsbsa_number',
            'is_aquaculture', 'is_capture_fishery', 'is_mariculture', 'is_inland_fishery',
            'is_affected_by_disaster',
            'citizen_account',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by', 'aquaculture_record', 'capture_record', 'citizen_account', 'is_affected_by_disaster', 'organization_names']

    def get_citizen_account(self, obj):
        return citizen_account_info(User.LinkedRecordType.FISHERFOLK, obj.id)

    def get_organization_names(self, obj):
        return list(
            obj.fisherfolk_organizations.filter(is_active=True)
            .values_list('organization__name', flat=True)
        )

    def get_is_affected_by_disaster(self, obj):
        return _is_fisherfolk_affected_by_disaster(obj)

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
        # Required, and cannot be cleared on an edit: only people with an RSBSA
        # number belong in the registry.
        if not (value or '').strip():
            raise serializers.ValidationError('RSBSA number is required and cannot be removed.')
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

        return data


class FisherfolkCreateSerializer(serializers.ModelSerializer):
    # Aquaculture fields
    culture_type         = serializers.CharField(required=False, allow_blank=True, write_only=True)
    culture_type_other_specify = serializers.CharField(required=False, allow_blank=True, write_only=True)
    species_cultured     = serializers.CharField(required=False, allow_blank=True, write_only=True)
    species_cultured_other_specify = serializers.CharField(required=False, allow_blank=True, write_only=True)
    area_hectares        = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    fingerlings_stocked  = serializers.IntegerField(required=False, write_only=True)
    production_volume_kg = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, write_only=True)

    # Capture fields
    vessel_type                = serializers.CharField(required=False, allow_blank=True, write_only=True)
    vessel_material            = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    vessel_material_other_specify = serializers.CharField(required=False, allow_blank=True, write_only=True)
    vessel_registration_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    fishing_gear_type          = serializers.CharField(required=False, allow_blank=True, write_only=True)
    fishing_ground             = serializers.CharField(required=False, allow_blank=True, write_only=True)
    average_catch_per_trip_kg  = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)

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
    is_aquaculture     = serializers.BooleanField(required=False, default=True)
    is_capture_fishery = serializers.BooleanField(required=False, default=False)
    is_mariculture     = serializers.BooleanField(required=False, default=False)
    is_inland_fishery  = serializers.BooleanField(required=False, default=False)

    class Meta:
        model  = Fisherfolk
        fields = [
            'id', 'fishr_number',
            'prefix', 'first_name', 'last_name', 'middle_name',
            'gender', 'birthdate', 'contact_number', 'email', 'barangay', 'municipality',
            'civil_status', 'highest_education', 'philsys_number',
            'fisherfolk_type',
            'is_pwd', 'is_4ps_beneficiary', 'is_icc_ip_member', 'icc_ip_name', 'is_senior_citizen',
            'fisherfolk_organization', 'organization_position',
            'is_active', 'date_registered', 'registered_by',
            'culture_type', 'culture_type_other_specify',
            'species_cultured', 'species_cultured_other_specify',
            'area_hectares', 'fingerlings_stocked', 'production_volume_kg',
            'vessel_type', 'vessel_material', 'vessel_material_other_specify', 'vessel_registration_number',
            'fishing_gear_type', 'fishing_ground', 'average_catch_per_trip_kg',
            'facility_location', 'pond_area_ha', 'number_of_ponds', 'water_source',
            'number_of_cages', 'cage_dimensions',
            'boat_registration_number', 'has_vessel',
            'rsbsa_number',
            'is_aquaculture', 'is_capture_fishery', 'is_mariculture', 'is_inland_fishery',
        ]
        read_only_fields = ['id', 'date_registered', 'registered_by']
        # Drop DRF's auto UniqueValidator on rsbsa_number so the friendlier,
        # case-insensitive check in validate_rsbsa_number below is the one
        # that answers (as FarmerCreateSerializer's does); the model's format
        # validator is kept explicitly since overriding `validators` replaces it.
        extra_kwargs = {'rsbsa_number': {'validators': [validate_rsbsa]}}

    def validate_birthdate(self, value):
        if value:
            today = date.today()
            age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
            if age < 10:
                raise serializers.ValidationError('Registrant must be at least 10 years old.')
        return value

    def validate_contact_number(self, value):
        return validate_contact_format(value)

    def validate_philsys_number(self, value):
        # Same format rule the Farmer model enforces on its own field.
        validate_philsys(value)
        return value

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

        # RSBSA number is required to register, as for a farmer: it is the
        # citizen login identifier and what the RSBSA import matches on.
        if not (data.get('rsbsa_number') or '').strip():
            raise serializers.ValidationError({'rsbsa_number': 'RSBSA number is required.'})

        fisherfolk_type = data.get('fisherfolk_type', '')
        if not data.get('has_vessel', True):
            data['boat_registration_number'] = ''
        if fisherfolk_type in ('Aquaculture', 'Mariculture'):
            if data.get('culture_type') == 'Other' and not (data.get('culture_type_other_specify') or '').strip():
                raise serializers.ValidationError({'culture_type_other_specify': 'Please specify the culture type.'})
            if data.get('species_cultured') == 'Other' and not (data.get('species_cultured_other_specify') or '').strip():
                raise serializers.ValidationError({'species_cultured_other_specify': 'Please specify the species cultured.'})
        if fisherfolk_type in ('Capture', 'Inland'):
            if data.get('vessel_type') == 'Motorized' and not (data.get('vessel_material') or '').strip():
                raise serializers.ValidationError({'vessel_material': 'Vessel material is required for motorized vessels.'})
            if data.get('vessel_type') == 'Motorized' and data.get('vessel_material') == 'Other' and not (data.get('vessel_material_other_specify') or '').strip():
                raise serializers.ValidationError({'vessel_material_other_specify': 'Please specify the vessel material.'})
            if data.get('vessel_type') != 'Motorized':
                data['vessel_material'] = None
                data['vessel_material_other_specify'] = ''

        return data

    def validate_rsbsa_number(self, value):
        if value is not None and not value.strip():
            return None
        if value:
            taken = Fisherfolk.objects.filter(rsbsa_number__iexact=value)
            if self.instance is not None:
                taken = taken.exclude(pk=self.instance.pk)
            if taken.exists():
                raise serializers.ValidationError(
                    'A fisherfolk with this RSBSA number is already registered in the system.'
                )
        return value

    def create(self, validated_data):
        aquaculture_data = {
            'culture_type':         validated_data.pop('culture_type', ''),
            'culture_type_other_specify': validated_data.pop('culture_type_other_specify', ''),
            'species_cultured':     validated_data.pop('species_cultured', ''),
            'species_cultured_other_specify': validated_data.pop('species_cultured_other_specify', ''),
            'area_hectares':        validated_data.pop('area_hectares', 0),
            'fingerlings_stocked':  validated_data.pop('fingerlings_stocked', 0),
            'production_volume_kg': validated_data.pop('production_volume_kg', None),
        }
        capture_data = {
            'vessel_type':                validated_data.pop('vessel_type', ''),
            'vessel_material':            validated_data.pop('vessel_material', None),
            'vessel_material_other_specify': validated_data.pop('vessel_material_other_specify', ''),
            'vessel_registration_number': validated_data.pop('vessel_registration_number', ''),
            'fishing_gear_type':          validated_data.pop('fishing_gear_type', ''),
            'fishing_ground':             validated_data.pop('fishing_ground', ''),
            'average_catch_per_trip_kg':  validated_data.pop('average_catch_per_trip_kg', 0),
        }
        fisherfolk = Fisherfolk.objects.create(**validated_data)
        # Registering into an organization must create the REAL membership
        # row, as Farmer registration does: organization member lists,
        # assistance attribution and the detail page all read
        # FisherfolkOrganizationMember, not the legacy direct FK above.
        organization = validated_data.get('fisherfolk_organization')
        if organization is not None:
            FisherfolkOrganizationMember.objects.create(
                organization=organization,
                fisherfolk=fisherfolk,
                position=validated_data.get('organization_position') or FisherfolkOrganizationMember.Position.MEMBER,
                date_joined=fisherfolk.date_registered.date(),
                is_main=True,
            )
        if fisherfolk.fisherfolk_type in ('Aquaculture', 'Mariculture'):
            AquacultureRecord.objects.create(fisherfolk=fisherfolk, **aquaculture_data)
        elif fisherfolk.fisherfolk_type in ('Capture', 'Inland'):
            CaptureRecord.objects.create(fisherfolk=fisherfolk, **capture_data)
        return fisherfolk


# ─── Species ──────────────────────────────────────────────────────────────────

class SpeciesCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = SpeciesCategory
        fields = ['id', 'name', 'date_created']
        read_only_fields = ['id', 'date_created']


class FisheriesActivityTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FisheriesActivityType
        fields = ['id', 'name', 'is_active']
        read_only_fields = ['id']


class SpeciesActivityStageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SpeciesActivityStage
        fields = [
            'id', 'species_option', 'activity_name', 'day_after_stocking',
            'application_days', 'recommendation', 'priority', 'window_days', 'order',
            'allows_pre_planting',
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
            'fingerling_start_day', 'juvenile_start_day', 'adult_start_day',
            'stages',
        ]
        read_only_fields = ['id', 'category_name', 'stages']
        # DRF auto-adds a UniqueValidator to `species_name` from the model's
        # unique=True — it fires before validate_species_name() below ever
        # runs, masking our friendlier message behind DRF's generic one.
        # Disabling it and doing the check ourselves is what actually
        # surfaces our message.
        extra_kwargs = {'species_name': {'validators': []}}

    def validate_species_name(self, value):
        name = value.strip()
        qs = SpeciesOption.objects.filter(species_name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"A species named '{name}' already exists.")
        return name

    def validate(self, data):
        # All-or-nothing: a partial set of growth-stage days can't be
        # ordered meaningfully, so either all three are set (in increasing
        # order) or all three stay blank — same rule the frontend enforces,
        # checked again here since this serializer is the actual boundary.
        fing = data.get('fingerling_start_day', getattr(self.instance, 'fingerling_start_day', None))
        juv  = data.get('juvenile_start_day', getattr(self.instance, 'juvenile_start_day', None))
        adult = data.get('adult_start_day', getattr(self.instance, 'adult_start_day', None))
        values = [fing, juv, adult]
        set_count = sum(1 for v in values if v is not None)
        if 0 < set_count < 3:
            raise serializers.ValidationError({
                'fingerling_start_day': 'Set all three growth-stage days, or leave all three blank.',
            })
        if set_count == 3 and not (fing < juv < adult):
            raise serializers.ValidationError({
                'fingerling_start_day': 'Growth-stage days must increase: Fingerling < Juvenile < Adult.',
            })
        return data


# ─── Stocking Record ──────────────────────────────────────────────────────────

class FisheriesActivityLogSerializer(serializers.ModelSerializer):
    logged_by_name = serializers.SerializerMethodField()
    disease_type_name = serializers.CharField(source='disease_type.name', read_only=True, default=None)

    class Meta:
        model  = FisheriesActivityLog
        fields = [
            'id', 'stocking_record', 'activity', 'activity_other_specify', 'date_of_activity',
            'water_fish_condition', 'ph_level', 'dissolved_oxygen', 'water_clarity',
            'feed_type', 'feed_quantity_kg', 'feed_brand',
            'observed_issue', 'severity', 'mortality_count',
            'possible_cause', 'possible_cause_other_specify',
            'disposal_method', 'disposal_method_other_specify',
            'area_affected_ha',
            'affected_portion',
            'disease_type', 'disease_type_name', 'disease_type_other_specify', 'vet_consulted',
            'treatment_applied', 'outcome',
            'recommendations', 'notes',
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
            elif self.instance is not None:
                # PATCH via StockingActivityLogDetailView has no stocking_id
                # URL kwarg (keyed by the log entry's own id) and
                # stocking_record is read-only, so fall back to the existing
                # instance's own record — otherwise these guards would
                # silently no-op on every edit.
                stocking_record = self.instance.stocking_record

        disaster_report = data.get('disaster_report')
        if disaster_report and stocking_record and disaster_report.stocking_record_id != stocking_record.id:
            raise serializers.ValidationError({
                'disaster_report': 'This disaster report does not belong to the same stocking record.'
            })

        activity = data.get('activity', '')
        if date_of_activity and stocking_record and stocking_record.date_stocked:
            if date_of_activity < stocking_record.date_stocked:
                allows_pre_planting = SpeciesActivityStage.objects.filter(
                    species_option_id=stocking_record.species_id,
                    activity_name=activity,
                    allows_pre_planting=True,
                ).exists()
                if not allows_pre_planting:
                    raise serializers.ValidationError({
                        'date_of_activity': 'Activity date cannot be before the stocking date '
                                            f'({stocking_record.date_stocked}).'
                    })

        if activity == 'Other' and not (data.get('activity_other_specify') or '').strip():
            raise serializers.ValidationError({
                'activity_other_specify': 'Please specify the activity.'
            })

        if data.get('possible_cause') == 'Other' and not (data.get('possible_cause_other_specify') or '').strip():
            raise serializers.ValidationError({
                'possible_cause_other_specify': 'Please specify the possible cause.'
            })
        if data.get('disposal_method') == 'Other' and not (data.get('disposal_method_other_specify') or '').strip():
            raise serializers.ValidationError({
                'disposal_method_other_specify': 'Please specify the disposal method.'
            })

        area_affected_ha = data.get('area_affected_ha')
        # Disease Control must say HOW MUCH of the pond is affected, but there
        # are now two ways to answer. Staff enter hectares; the citizen health
        # log asks for a proportion band instead, because someone standing at
        # a sick pond can judge "about half" but not "0.32 ha". Either one
        # satisfies the requirement — demanding hectares of a citizen was what
        # made the reference's own form unsubmittable.
        if activity == 'Disease Control' and area_affected_ha is None and not data.get('affected_portion'):
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


class DisasterReportSubmissionFieldsMixin(serializers.Serializer):
    """Read-only fields shared by both disaster-report serializers: the report's reference number, its
    "Submit Report to Admin" state, and its Photo Documentation of Damage (FisheriesDisasterReportPhoto
    rows, 0-10). Photos arrive as the multipart `photos` files of the create request (see the views)."""
    report_number = serializers.CharField(read_only=True)
    submission_status = serializers.CharField(read_only=True)
    submitted_at = serializers.DateTimeField(read_only=True)
    photos = serializers.SerializerMethodField()

    SUBMISSION_FIELDS = ['report_number', 'submission_status', 'submitted_at', 'photos']

    def get_photos(self, obj):
        request = self.context.get('request')
        return [
            {'id': p.id, 'url': request.build_absolute_uri(p.image.url) if request else p.image.url}
            for p in obj.photos.all()
        ]


class FisheriesDisasterReportSerializer(DisasterReportSubmissionFieldsMixin, serializers.ModelSerializer):
    reported_by_name = serializers.SerializerMethodField()
    recovered_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = FisheriesDisasterReport
        fields = [
            'id', 'stocking_record', 'disaster_type', 'disaster_type_other_specify', 'date_of_occurrence',
            'area_affected_ha', 'estimated_damage', 'production_loss', 'photo',
            # Optional here (the Admin stock form never sends them); the fisherfolk stock form does.
            'volume_lost_kg', 'equipment_damaged',
            'severity',
            'is_total_loss',
            'status', 'recovered_date', 'recovered_by', 'recovered_by_name', 'recovery_note',
            'reported_by', 'reported_by_name', 'date_reported',
        ] + DisasterReportSubmissionFieldsMixin.SUBMISSION_FIELDS
        read_only_fields = [
            'id', 'stocking_record', 'status', 'recovered_date',
            'recovered_by', 'recovered_by_name', 'recovery_note',
            'reported_by', 'reported_by_name', 'date_reported',
        ]

    def validate_volume_lost_kg(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Volume lost cannot be negative.')
        return value

    def validate_photo(self, value):
        validate_uploaded_image(value)
        return value

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return getattr(obj.reported_by, 'full_name', str(obj.reported_by))
        return None

    def get_recovered_by_name(self, obj):
        if obj.recovered_by:
            return getattr(obj.recovered_by, 'full_name', str(obj.recovered_by))
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
        if self.instance is not None:
            # Editing an existing report (the fisherfolk's own draft): unchanged values come from the report.
            stocking_record = stocking_record or self.instance.stocking_record
            if area_affected_ha is None and 'area_affected_ha' not in data:
                area_affected_ha = self.instance.area_affected_ha
        if area_affected_ha is None:
            raise serializers.ValidationError({'area_affected_ha': 'Area affected is required.'})
        if area_affected_ha <= 0:
            raise serializers.ValidationError({'area_affected_ha': 'Area affected must be greater than 0.'})
        if stocking_record and stocking_record.area_hectares and area_affected_ha > stocking_record.area_hectares:
            raise serializers.ValidationError({
                'area_affected_ha': f'Area affected cannot exceed the {stocking_record.area_hectares} ha stocked.'
            })
        return data


class GeneralDisasterReportSerializer(DisasterReportSubmissionFieldsMixin, serializers.ModelSerializer):
    """
    Consolidated batch: for a disaster reported directly against a
    fisherfolk with no stocking cycle to attach to (Capture-type fisherfolk
    have no StockingRecord — see FisheriesDisasterReportSerializer above
    for the cycle-attached path). No response-rule engine exists without a
    cycle's species/activity logs, so — unlike that serializer — status and
    recovery_note are writable here directly rather than through a
    dedicated resolve action; GeneralDisasterReportDetailView enforces that
    a recovery_note is always required to reach Recovered this way.
    area_affected_ha is optional here (unlike the pond-hectares case above,
    "area affected" doesn't apply to every kind of general fisherfolk
    disaster, e.g. equipment/vessel damage).
    """
    # Explicit (not auto-generated) so it's required even though the model
    # field itself is nullable — required=False would otherwise be inferred
    # from the model's null=True, which exists only for the stocking-linked
    # rows this endpoint never touches (see GeneralDisasterReportListCreateView).
    fisherfolk = serializers.PrimaryKeyRelatedField(queryset=Fisherfolk.objects.all())
    fisherfolk_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_barangay = serializers.CharField(source='fisherfolk.barangay', read_only=True)
    reported_by_name = serializers.SerializerMethodField()
    recovered_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = FisheriesDisasterReport
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name', 'fisherfolk_barangay', 'disaster_type', 'disaster_type_other_specify',
            'date_of_occurrence', 'area_affected_ha', 'estimated_damage', 'production_loss', 'photo',
            'volume_lost_kg', 'equipment_damaged',
            'status', 'recovered_date', 'recovered_by', 'recovered_by_name', 'recovery_note',
            'reported_by', 'reported_by_name', 'date_reported',
        ] + DisasterReportSubmissionFieldsMixin.SUBMISSION_FIELDS
        read_only_fields = [
            'id', 'fisherfolk_name', 'fisherfolk_barangay', 'recovered_date',
            'recovered_by', 'recovered_by_name',
            'reported_by', 'reported_by_name', 'date_reported',
        ]

    def validate_photo(self, value):
        validate_uploaded_image(value)
        return value

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return getattr(obj.reported_by, 'full_name', str(obj.reported_by))
        return None

    def get_recovered_by_name(self, obj):
        if obj.recovered_by:
            return getattr(obj.recovered_by, 'full_name', str(obj.recovered_by))
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
        if area_affected_ha is not None and area_affected_ha <= 0:
            raise serializers.ValidationError({'area_affected_ha': 'Area affected must be greater than 0.'})
        return data


class HarvestUnitQuantityInputSerializer(serializers.Serializer):
    """One pond/cage and its own actual harvested kg, for a per-unit harvest."""
    production_unit = serializers.PrimaryKeyRelatedField(queryset=AquacultureProductionUnit.objects.all())
    quantity_kg = serializers.DecimalField(max_digits=12, decimal_places=2)

    def validate_quantity_kg(self, value):
        if value <= 0:
            raise serializers.ValidationError('Actual harvest must be greater than 0.')
        return value


class FisheriesHarvestRecordSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()
    # The ponds/cages this one harvest covers.
    production_units = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=AquacultureProductionUnit.objects.all(),
    )
    production_unit_labels = serializers.SerializerMethodField()
    # Read-only detail of the ponds/cages actually linked to this harvest (its production_units
    # relation): [{id, label, unit_type_label, force_harvest, reasons}]. Nothing is inferred.
    production_unit_details = serializers.SerializerMethodField()
    # Per-unit actual kg (write): [{production_unit, quantity_kg}]. The listed units become
    # production_units and quantity_kg becomes their sum. Required for a Force Harvest of 2+ units.
    unit_quantities = HarvestUnitQuantityInputSerializer(many=True, required=False, write_only=True)
    # Per-unit actual kg (read), from FisheriesHarvestUnit: [{production_unit, label, quantity_kg}].
    # Empty for a combined multi-unit harvest or an older record (quantity_kg is then the only value).
    unit_harvests = serializers.SerializerMethodField()
    # Harvest timing, derived from harvest_date vs the stocking record's expected (estimated) harvest date:
    # 'early' | 'on_time' | 'late' (None when there is no estimate). early_late_reason holds the reason.
    estimated_harvest_date = serializers.SerializerMethodField()
    harvest_timing = serializers.SerializerMethodField()
    harvest_timing_label = serializers.SerializerMethodField()
    harvest_timing_days = serializers.SerializerMethodField()

    class Meta:
        model  = FisheriesHarvestRecord
        fields = [
            'id', 'stocking_record', 'harvest_date', 'quantity_kg',
            'avg_body_weight_kg', 'area_or_units_harvested', 'is_final',
            'production_units', 'production_unit_labels', 'production_unit_details', 'is_force_harvest',
            'unit_quantities', 'unit_harvests',
            'estimated_harvest_date', 'harvest_timing', 'harvest_timing_label', 'harvest_timing_days',
            'harvest_variance_days', 'early_late_reason', 'notes',
            'recorded_by', 'recorded_by_name', 'date_recorded',
        ]
        # is_force_harvest is decided in validate() from the units' own state; a submitted value is ignored.
        read_only_fields = ['id', 'stocking_record', 'production_unit_details', 'is_force_harvest', 'harvest_variance_days', 'recorded_by', 'recorded_by_name', 'date_recorded']
        # Derived from unit_quantities when those are sent; otherwise still required (checked in validate).
        extra_kwargs = {'quantity_kg': {'required': False}}

    def _timing(self, obj):
        sr = obj.stocking_record
        return harvest_timing(obj.harvest_date, sr.expected_harvest_date if sr else None)

    def get_estimated_harvest_date(self, obj):
        sr = obj.stocking_record
        return str(sr.expected_harvest_date) if sr and sr.expected_harvest_date else None

    def get_harvest_timing(self, obj):
        return self._timing(obj)[0]

    def get_harvest_timing_label(self, obj):
        return HARVEST_TIMING_LABELS.get(self._timing(obj)[0])

    def get_harvest_timing_days(self, obj):
        # Signed: negative = days earlier than expected, positive = days later.
        return self._timing(obj)[1]

    def get_unit_harvests(self, obj):
        return [
            {
                'production_unit': row.production_unit_id,
                'label': f'{row.production_unit.get_unit_type_display()} {row.production_unit.unit_number}',
                'quantity_kg': str(row.quantity_kg),
            }
            for row in obj.unit_harvests.all()
        ]

    @transaction.atomic
    def create(self, validated_data):
        unit_quantities = validated_data.pop('unit_quantities', None)
        harvest = super().create(validated_data)
        if unit_quantities:
            rows = [(row['production_unit'], row['quantity_kg']) for row in unit_quantities]
        else:
            # A single named unit is unambiguous: the whole quantity is that unit's own harvest.
            # Several units with one combined quantity get no per-unit rows (no split is invented).
            units = list(harvest.production_units.all())
            rows = [(units[0], harvest.quantity_kg)] if len(units) == 1 else []
        FisheriesHarvestUnit.objects.bulk_create([
            FisheriesHarvestUnit(harvest=harvest, production_unit=unit, quantity_kg=kg) for unit, kg in rows
        ])
        return harvest

    def get_production_unit_labels(self, obj):
        return [f'{u.get_unit_type_display()} {u.unit_number}' for u in obj.production_units.all()]

    def get_production_unit_details(self, obj):
        units = sorted(obj.production_units.all(), key=lambda u: u.unit_number)
        if not units:
            return []
        from monitoring.models import cycle_force_status
        force, _ = cycle_force_status(units[0].production_cycle_id)
        return [
            {
                'id': u.id,
                'label': f'{u.get_unit_type_display()} {u.unit_number}',
                'unit_type_label': u.get_unit_type_display(),
                'force_harvest': u.id in force,
                'reasons': force.get(u.id, []),
            }
            for u in units
        ]

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return getattr(obj.recorded_by, 'full_name', str(obj.recorded_by))
        return None

    def validate(self, data):
        harvest_date = data.get('harvest_date', getattr(self.instance, 'harvest_date', None))
        is_final = data.get('is_final', getattr(self.instance, 'is_final', False))
        stocking_record = data.get('stocking_record', getattr(self.instance, 'stocking_record', None))
        if not stocking_record:
            # The create view passes the stocking record it already loaded; otherwise read it from the URL.
            stocking_record = self.context.get('stocking_record')
        if not stocking_record:
            stocking_id = self.context.get('view').kwargs.get('stocking_id') if self.context.get('view') else None
            if stocking_id:
                stocking_record = StockingRecord.objects.filter(pk=stocking_id).first()

        # Per-unit actual kg: each listed pond/cage keeps its own weight; the record total is their sum.
        unit_quantities = data.get('unit_quantities')
        if unit_quantities is not None:
            if self.instance is not None:
                raise serializers.ValidationError({'unit_quantities': 'The per-unit harvest cannot be changed after recording.'})
            if not unit_quantities:
                raise serializers.ValidationError({'unit_quantities': 'Enter the actual harvest (kg) for at least one pond/cage.'})
            q_units = [row['production_unit'] for row in unit_quantities]
            if len({u.id for u in q_units}) != len(q_units):
                raise serializers.ValidationError({'unit_quantities': 'Each pond/cage can be listed only once.'})
            given = data.get('production_units')
            if given and {u.id for u in given} != {u.id for u in q_units}:
                raise serializers.ValidationError({'unit_quantities': 'The per-unit harvest must list the same ponds/cages as production_units.'})
            data['production_units'] = q_units
            data['quantity_kg'] = sum((row['quantity_kg'] for row in unit_quantities), 0)
        elif self.instance is None and data.get('quantity_kg') is None:
            raise serializers.ValidationError({'quantity_kg': 'This field is required.'})
        # The total of a per-unit harvest is the sum of its units; it cannot be edited on its own.
        if (self.instance is not None and 'quantity_kg' in data and data['quantity_kg'] != self.instance.quantity_kg
                and self.instance.unit_harvests.exists()):
            raise serializers.ValidationError({'quantity_kg': 'This harvest is recorded per pond/cage; its total cannot be edited on its own.'})

        # Harvest of specific ponds/cages: ONE harvest record for the selected units together, quantity_kg
        # being their combined total. Every unit must be of THIS record's own cycle and not yet harvested.
        #  - Force Harvest: every selected unit is awaiting Force Harvest (its own Health Log).
        #  - Normal harvest: no selected unit is awaiting Force Harvest (those go through Force Harvest).
        # A mix of the two is refused. is_force_harvest is set here, never taken from the client.
        units = data.get('production_units') or []
        if units:
            if self.instance is not None:
                raise serializers.ValidationError({'production_units': 'The harvested ponds/cages cannot be changed after recording.'})
            if not stocking_record or not stocking_record.production_cycle_id:
                raise serializers.ValidationError({'production_units': 'This stocking record has no production cycle, so ponds/cages cannot be selected.'})
            # The create view's own harvest_units() of this same record when it already computed it.
            known = self.context.get('harvest_units') if self.context.get('stocking_record') is stocking_record else None
            status_by_id = {u['id']: u for u in (known if known is not None else stocking_record.harvest_units())}
            chosen = []
            for unit in units:
                if unit.production_cycle_id != stocking_record.production_cycle_id:
                    raise serializers.ValidationError({'production_units': 'Every pond/cage must belong to this production cycle.'})
                info = status_by_id[unit.id]
                if info['harvested']:
                    raise serializers.ValidationError({'production_units': f"{info['label']} has already been harvested."})
                if info not in chosen:
                    chosen.append(info)
            is_force = all(info['force_harvest'] for info in chosen)
            if not is_force and any(info['force_harvest'] for info in chosen):
                pending = ', '.join(info['label'] for info in chosen if info['force_harvest'])
                raise serializers.ValidationError({'production_units': (
                    f'{pending} is awaiting Force Harvest and must be harvested through Force Harvest, '
                    'not together with unaffected ponds/cages.'
                )})
            data['is_force_harvest'] = is_force
            # A harvest of several ponds/cages - Force or normal - records each unit's own actual kg, never
            # one combined total for the user to divide.
            if unit_quantities is None and len(chosen) > 1:
                raise serializers.ValidationError({'unit_quantities': (
                    'Enter the actual harvest (kg) for each affected pond/cage separately.' if is_force
                    else 'Enter the actual harvest (kg) for each selected pond/cage separately.'
                )})
            # Force Harvest: the Health Log conditions are the reason for the early harvest - never re-typed.
            if is_force and not (data.get('early_late_reason') or '').strip():
                reasons = []
                for info in chosen:
                    reasons += [r for r in info['reasons'] if r not in reasons]
                data['early_late_reason'] = '; '.join(reasons)[:255]
            # Ponds/cages left unharvested keep growing: the cycle only closes once every unit is harvested.
            chosen_ids = {info['id'] for info in chosen}
            data['is_final'] = all(u['harvested'] or u['id'] in chosen_ids for u in status_by_id.values())
            is_final = data['is_final']

        if harvest_date:
            if harvest_date > date.today():
                raise serializers.ValidationError({'harvest_date': 'Harvest date cannot be in the future.'})
            if stocking_record and stocking_record.date_stocked and harvest_date < stocking_record.date_stocked:
                raise serializers.ValidationError({
                    'harvest_date': f'Harvest date cannot be before the date stocked ({stocking_record.date_stocked}).'
                })
            # Early (before the estimated harvest date) or late (after it) needs a reason - any number of
            # days, partial or final harvest. On time needs none. A Force Harvest already carries its
            # Health Log reason (filled in above). Only re-checked on update when the date or reason changes,
            # so an older record without a reason keeps working.
            timing, _days = harvest_timing(harvest_date, stocking_record.expected_harvest_date if stocking_record else None)
            checking = self.instance is None or 'harvest_date' in data or 'early_late_reason' in data
            if checking and timing in ('early', 'late'):
                reason = (data.get('early_late_reason', getattr(self.instance, 'early_late_reason', '')) or '').strip()
                kind = 'early' if timing == 'early' else 'late'
                if not reason:
                    raise serializers.ValidationError({'early_late_reason': f'A reason is required for a {kind} harvest.'})
                if reason.lower() == 'other':
                    raise serializers.ValidationError({'early_late_reason': f'Please specify the reason for the {kind} harvest.'})
                data['early_late_reason'] = reason
        return data


class PondSerializer(serializers.ModelSerializer):
    stocking_record_count = serializers.SerializerMethodField()

    class Meta:
        model = Pond
        fields = [
            'id', 'fisherfolk', 'name', 'barangay', 'area_hectares', 'water_source',
            'is_active', 'date_created', 'stocking_record_count',
        ]
        read_only_fields = ['id', 'date_created', 'fisherfolk']

    def get_stocking_record_count(self, obj):
        return obj.stocking_records.count()


class FeedTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeedType
        fields = ['id', 'name', 'description', 'is_active', 'species_options', 'growth_stage']
        read_only_fields = ['id']


class DiseaseTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiseaseType
        fields = ['id', 'name', 'description', 'is_active', 'species_options']
        read_only_fields = ['id']


class DiseaseResponseGuideSerializer(serializers.ModelSerializer):
    disease_type_name = serializers.CharField(source='disease_type.name', read_only=True)

    class Meta:
        model = DiseaseResponseGuide
        fields = ['id', 'disease_type', 'disease_type_name', 'recommended_treatment', 'notes']
        read_only_fields = ['id', 'disease_type_name']


def _prefetched(obj, name):
    """The prefetched rows of relation `name` on obj, or None when it was not prefetched."""
    cache = getattr(obj, '_prefetched_objects_cache', None) or {}
    return list(cache[name]) if name in cache else None


def _stocking_list_context(records):
    """Everything StockingRecordSerializer needs for a LIST of records, loaded once for the whole list
    (a handful of queries) instead of per row. Each value is exactly what the per-record code computes."""
    # Related rows the row fields read; already-prefetched / select_related relations are skipped.
    prefetch_related_objects(records, 'logs', 'disaster_reports', 'harvests', 'species__category',
                             'fisherfolk', 'pond', 'production_cycle__organization')
    status = stocking_harvest_status_bulk(records)
    cycle_no = production_cycle_numbers_bulk(records)   # compute_production_cycle_no() for every row, one query

    # compute_recommended_feed_type(): the species' active feed types, in FeedType's own order (name).
    species_ids = {r.species_id for r in records if r.species_id}
    feeds_by_species = defaultdict(list)
    if species_ids:
        links = FeedType.species_options.through.objects.filter(
            speciesoption_id__in=species_ids, feedtype__is_active=True,
        ).select_related('feedtype')
        for link in links:
            feeds_by_species[link.speciesoption_id].append(link.feedtype)
        for feeds in feeds_by_species.values():
            feeds.sort(key=lambda f: (f.name, f.id))
    return {'status': status, 'cycle_no': cycle_no, 'feeds_by_species': feeds_by_species}


class StockingRecordListSerializer(serializers.ListSerializer):
    """List form of StockingRecordSerializer: loads the per-row data for the whole list once (see
    _stocking_list_context) so serializing a page does not query the database row by row."""

    def to_representation(self, data):
        records = list(data.all() if hasattr(data, 'all') else data)
        self.child._list_context = _stocking_list_context(records) if records else None
        try:
            return super().to_representation(records)
        finally:
            self.child._list_context = None


class StockingRecordSerializer(serializers.ModelSerializer):
    fisherfolk_name  = serializers.SerializerMethodField()
    pond_name        = serializers.CharField(source='pond.name', read_only=True, default=None)
    species_name     = serializers.CharField(source='species.species_name', read_only=True)
    category_name    = serializers.CharField(source='species.category.name', read_only=True)
    is_near_harvest  = serializers.SerializerMethodField()
    log_count        = serializers.SerializerMethodField()
    disaster_count   = serializers.SerializerMethodField()
    disaster_report_count = serializers.SerializerMethodField()
    has_recovered_disaster = serializers.SerializerMethodField()
    # True when the linked production cycle's Health Log records fish mortality or a disease.
    force_harvest = serializers.SerializerMethodField()
    # Per pond/cage of the cycle: {id, label, force_harvest, reasons, harvested} - drives Record Harvest.
    harvest_units = serializers.SerializerMethodField()
    harvest_variance_days = serializers.SerializerMethodField()
    final_harvest_date = serializers.SerializerMethodField()
    # Latest harvest_date among ALL of this record's harvest records (normal or Force, partial or final);
    # None while nothing has been harvested. Never derived from the expected date or the stocking date.
    actual_harvest_date = serializers.SerializerMethodField()
    # Timing of that same latest harvest vs expected_harvest_date, via fisheries.models.harvest_timing():
    # 'early' | 'on_time' | 'late' (None without a harvest or an estimate); days is signed.
    actual_harvest_timing = serializers.SerializerMethodField()
    actual_harvest_timing_label = serializers.SerializerMethodField()
    actual_harvest_timing_days = serializers.SerializerMethodField()
    total_harvested_kg = serializers.SerializerMethodField()
    harvest_count    = serializers.SerializerMethodField()
    stocking_density = serializers.SerializerMethodField()
    production_cycle_no = serializers.SerializerMethodField()
    production_cycle_name = serializers.CharField(source='production_cycle.cycle_name', read_only=True, default=None)
    # Organization of the linked Production Cycle (None for records without one).
    organization_name = serializers.CharField(source='production_cycle.organization.name', read_only=True, default=None)
    next_feeding_date = serializers.SerializerMethodField()
    growth_stage = serializers.SerializerMethodField()
    recommended_feed_type_id = serializers.SerializerMethodField()
    recommended_feed_type_name = serializers.SerializerMethodField()
    pond_location_barangay = serializers.CharField(required=False, allow_blank=True, default='')
    area_hectares          = serializers.DecimalField(max_digits=10, decimal_places=4, required=False, allow_null=True)
    survival_rate_pct      = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    avg_body_weight_kg     = serializers.DecimalField(max_digits=8, decimal_places=3, required=False, allow_null=True)

    class Meta:
        model  = StockingRecord
        list_serializer_class = StockingRecordListSerializer
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name',
            'pond', 'pond_name', 'production_cycle', 'production_cycle_name', 'organization_name',
            'pond_location_barangay', 'land_status', 'land_status_other_specify', 'culture_type',
            'species', 'species_name', 'category_name',
            'date_stocked', 'date_stocked_is_estimated', 'area_hectares', 'number_of_fingerlings',
            'survival_rate_pct', 'avg_body_weight_kg',
            'water_source', 'water_source_other_specify', 'number_of_units', 'unit_dimensions',
            'fingerling_source', 'fingerling_source_other_specify', 'avg_fingerling_size',
            'culture_phase', 'culture_phase_other_specify', 'seed_cost_php',
            'season', 'year', 'status',
            'expected_harvest_date', 'estimated_harvest_kg',
            'notes', 'recorded_by', 'date_recorded',
            'is_near_harvest', 'log_count', 'disaster_count', 'disaster_report_count',
            'has_recovered_disaster', 'force_harvest', 'harvest_units',
            'total_harvested_kg', 'harvest_count', 'harvest_variance_days',
            'final_harvest_date', 'actual_harvest_date',
            'actual_harvest_timing', 'actual_harvest_timing_label', 'actual_harvest_timing_days',
            'stocking_density', 'production_cycle_no', 'next_feeding_date',
            'growth_stage', 'recommended_feed_type_id', 'recommended_feed_type_name',
        ]
        read_only_fields = [
            'id', 'fisherfolk_name', 'pond_name', 'production_cycle_name', 'organization_name', 'species_name', 'category_name',
            'expected_harvest_date', 'estimated_harvest_kg',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'log_count', 'disaster_count', 'disaster_report_count',
            'has_recovered_disaster', 'force_harvest', 'harvest_units',
            'total_harvested_kg', 'harvest_count', 'harvest_variance_days', 'actual_harvest_date',
            'actual_harvest_timing', 'actual_harvest_timing_label', 'actual_harvest_timing_days',
            'stocking_density', 'production_cycle_no', 'next_feeding_date',
            'growth_stage', 'recommended_feed_type_id', 'recommended_feed_type_name',
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

    # Row values come from already-loaded data when available: the list context (StockingRecordListSerializer)
    # or prefetched relations. Otherwise each falls back to its original per-record query - same values.
    def _list(self):
        return getattr(self, '_list_context', None)

    def get_disaster_count(self, obj):
        reports = _prefetched(obj, 'disaster_reports')
        if reports is not None:
            return sum(1 for d in reports if d.status == 'Active')
        return obj.disaster_reports.filter(status='Active').count()

    def get_disaster_report_count(self, obj):
        return obj.disaster_reports.count()

    def _final_harvest(self, obj):
        harvests = _prefetched(obj, 'harvests')   # same order as the query: FisheriesHarvestRecord's -harvest_date
        if harvests is not None:
            return next((h for h in harvests if h.is_final), None)
        return obj.harvests.filter(is_final=True).first()

    def get_harvest_variance_days(self, obj):
        final = self._final_harvest(obj)
        return final.harvest_variance_days if final else None

    def get_final_harvest_date(self, obj):
        final = self._final_harvest(obj)
        return str(final.harvest_date) if final else None

    def _latest_harvest_date(self, obj):
        # Uses the prefetched `harvests` (list/history/detail views prefetch them) - no extra query per row.
        return max((h.harvest_date for h in obj.harvests.all() if h.harvest_date), default=None)

    def get_actual_harvest_date(self, obj):
        latest = self._latest_harvest_date(obj)
        return str(latest) if latest else None

    def _actual_timing(self, obj):
        return harvest_timing(self._latest_harvest_date(obj), obj.expected_harvest_date)

    def get_actual_harvest_timing(self, obj):
        return self._actual_timing(obj)[0]

    def get_actual_harvest_timing_label(self, obj):
        return HARVEST_TIMING_LABELS.get(self._actual_timing(obj)[0])

    def get_actual_harvest_timing_days(self, obj):
        return self._actual_timing(obj)[1]

    def get_has_recovered_disaster(self, obj):
        reports = _prefetched(obj, 'disaster_reports')
        if reports is not None:
            return any(d.status == 'Recovered' for d in reports)
        return obj.disaster_reports.filter(status='Recovered').exists()

    def get_force_harvest(self, obj):
        # Still awaiting harvest: an affected pond/cage not yet harvested (or a legacy log tied to no unit).
        ctx = self._list()
        if ctx is not None:
            return ctx['status'][obj.id][1]
        return obj.has_pending_force_harvest()

    def get_harvest_units(self, obj):
        ctx = self._list()
        if ctx is not None:
            return ctx['status'][obj.id][0]
        return obj.harvest_units()

    def get_total_harvested_kg(self, obj):
        harvests = _prefetched(obj, 'harvests')
        if harvests is not None:
            return float(sum(h.quantity_kg for h in harvests)) if harvests else 0.0
        result = obj.harvests.aggregate(total=Sum('quantity_kg'))['total']
        return float(result) if result is not None else 0.0

    def get_harvest_count(self, obj):
        return obj.harvests.count()

    def get_stocking_density(self, obj):
        if obj.area_hectares and obj.area_hectares > 0 and obj.number_of_fingerlings is not None:
            return round(float(obj.number_of_fingerlings) / float(obj.area_hectares), 2)
        return None

    def get_production_cycle_no(self, obj):
        ctx = self._list()
        if ctx is not None:
            return ctx['cycle_no'][obj.id]
        return obj.compute_production_cycle_no()

    def get_next_feeding_date(self, obj):
        logs = _prefetched(obj, 'logs')
        if logs is not None and obj.species_id and obj.date_stocked:
            # compute_next_feeding_date(): latest 'Feed Monitoring' log date (or the stocking date) + interval.
            interval = obj.species.default_feeding_interval_days or 1
            feed_dates = [l.date_of_activity for l in logs if l.activity == 'Feed Monitoring']
            return (max(feed_dates) if feed_dates else obj.date_stocked) + timedelta(days=interval)
        return obj.compute_next_feeding_date()

    def get_growth_stage(self, obj):
        return obj.compute_growth_stage()

    def _recommended_feed_type(self, obj):
        ctx = self._list()
        if ctx is None:
            return obj.compute_recommended_feed_type()
        # compute_recommended_feed_type(): stage-specific active feed type first, else a stage-agnostic one.
        stage = obj.compute_growth_stage()
        if not stage or not obj.species_id:
            return None
        feeds = ctx['feeds_by_species'].get(obj.species_id, [])
        return next((f for f in feeds if f.growth_stage == stage), None) or next((f for f in feeds if f.growth_stage == ''), None)

    def get_recommended_feed_type_id(self, obj):
        feed_type = self._recommended_feed_type(obj)
        return feed_type.id if feed_type else None

    def get_recommended_feed_type_name(self, obj):
        feed_type = self._recommended_feed_type(obj)
        return feed_type.name if feed_type else None

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
        cycle = data.get('production_cycle')
        if cycle is not None:
            fisherfolk = data.get('fisherfolk', getattr(self.instance, 'fisherfolk', None))
            if fisherfolk is None or cycle.fisherfolk_id != fisherfolk.id:
                raise serializers.ValidationError({'production_cycle': 'This production cycle belongs to a different fisherfolk.'})
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
            'total_catch_kg', 'hours_at_sea',
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

    def validate(self, data):
        # Mirrors FishingTripLog.clean()'s rule so a bad match is reported as
        # a normal 400 here, before it ever reaches model.save() - which
        # raises a bare django.core.exceptions.ValidationError that DRF's
        # exception handler doesn't translate, and that becomes an unhandled
        # 500. Re-checked on every save (not just fisherfolk selection)
        # because the linked fisherfolk's type can drift after this trip log
        # was created - falls back to the existing instance's fisherfolk on a
        # partial update that doesn't touch that field.
        fisherfolk = data.get('fisherfolk') or getattr(self.instance, 'fisherfolk', None)
        if fisherfolk and fisherfolk.fisherfolk_type not in (
            Fisherfolk.FisherfolkType.CAPTURE,
            Fisherfolk.FisherfolkType.INLAND,
        ):
            raise serializers.ValidationError({
                'fisherfolk': 'Fishing trip logs can only be created for Capture or Inland Fishery fisherfolk.'
            })
        return data
