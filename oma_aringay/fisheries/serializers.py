from datetime import date

from django.db.models import Q, Sum
from rest_framework import serializers

from accounts.models import User
from accounts.utils import citizen_account_info
from core.constants import validate_prefix_gender
from core.validators import validate_not_future_date, validate_uploaded_image

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
    FisheriesHarvestRecord,
    FishingTripLog,
    Pond,
    SpeciesActivityStage,
    SpeciesCategory,
    SpeciesOption,
    StockingRecord,
    TripSpeciesEntry,
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


class FisheriesDisasterReportSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.SerializerMethodField()
    recovered_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = FisheriesDisasterReport
        fields = [
            'id', 'stocking_record', 'disaster_type', 'disaster_type_other_specify', 'date_of_occurrence',
            'area_affected_ha', 'estimated_damage', 'production_loss', 'photo',
            'severity',
            'is_total_loss',
            'status', 'recovered_date', 'recovered_by', 'recovered_by_name', 'recovery_note',
            'reported_by', 'reported_by_name', 'date_reported',
        ]
        read_only_fields = [
            'id', 'stocking_record', 'status', 'recovered_date',
            'recovered_by', 'recovered_by_name', 'recovery_note',
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


class GeneralDisasterReportSerializer(serializers.ModelSerializer):
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
        ]
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
    harvest_variance_days = serializers.SerializerMethodField()
    final_harvest_date = serializers.SerializerMethodField()
    total_harvested_kg = serializers.SerializerMethodField()
    harvest_count    = serializers.SerializerMethodField()
    stocking_density = serializers.SerializerMethodField()
    production_cycle_no = serializers.SerializerMethodField()
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
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name',
            'pond', 'pond_name',
            'pond_location_barangay', 'land_status', 'land_status_other_specify', 'culture_type',
            'species', 'species_name', 'category_name',
            'date_stocked', 'area_hectares', 'number_of_fingerlings',
            'survival_rate_pct', 'avg_body_weight_kg',
            'water_source', 'water_source_other_specify', 'number_of_units', 'unit_dimensions',
            'fingerling_source', 'fingerling_source_other_specify', 'avg_fingerling_size',
            'culture_phase', 'culture_phase_other_specify', 'seed_cost_php',
            'season', 'year', 'status',
            'expected_harvest_date', 'estimated_harvest_kg',
            'notes', 'recorded_by', 'date_recorded',
            'is_near_harvest', 'log_count', 'disaster_count', 'disaster_report_count',
            'has_recovered_disaster',
            'total_harvested_kg', 'harvest_count', 'harvest_variance_days',
            'final_harvest_date',
            'stocking_density', 'production_cycle_no', 'next_feeding_date',
            'growth_stage', 'recommended_feed_type_id', 'recommended_feed_type_name',
        ]
        read_only_fields = [
            'id', 'fisherfolk_name', 'pond_name', 'species_name', 'category_name',
            'expected_harvest_date', 'estimated_harvest_kg',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'log_count', 'disaster_count', 'disaster_report_count',
            'has_recovered_disaster',
            'total_harvested_kg', 'harvest_count', 'harvest_variance_days',
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

    def get_disaster_count(self, obj):
        return obj.disaster_reports.filter(status='Active').count()

    def get_disaster_report_count(self, obj):
        return obj.disaster_reports.count()

    def get_harvest_variance_days(self, obj):
        final = obj.harvests.filter(is_final=True).first()
        return final.harvest_variance_days if final else None

    def get_final_harvest_date(self, obj):
        final = obj.harvests.filter(is_final=True).first()
        return str(final.harvest_date) if final else None

    def get_has_recovered_disaster(self, obj):
        return obj.disaster_reports.filter(status='Recovered').exists()

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
        return obj.compute_production_cycle_no()

    def get_next_feeding_date(self, obj):
        return obj.compute_next_feeding_date()

    def get_growth_stage(self, obj):
        return obj.compute_growth_stage()

    def get_recommended_feed_type_id(self, obj):
        feed_type = obj.compute_recommended_feed_type()
        return feed_type.id if feed_type else None

    def get_recommended_feed_type_name(self, obj):
        feed_type = obj.compute_recommended_feed_type()
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
        return data


class StockingRecordDetailSerializer(StockingRecordSerializer):
    logs             = FisheriesActivityLogSerializer(many=True, read_only=True)
    disaster_reports = FisheriesDisasterReportSerializer(many=True, read_only=True)
    harvests         = FisheriesHarvestRecordSerializer(many=True, read_only=True)

    class Meta(StockingRecordSerializer.Meta):
        fields = StockingRecordSerializer.Meta.fields + ['logs', 'disaster_reports', 'harvests']
        read_only_fields = StockingRecordSerializer.Meta.read_only_fields + ['logs', 'disaster_reports', 'harvests']


# ─── Health & Feeding Monitoring (Batch 4) ─────────────────────────────────────
# Read-only view over StockingRecord + FisheriesActivityLog — no new storage,
# just two extra computed fields specific to this module's table view. Full
# history reuses the existing FisheriesActivityLogSerializer via the
# stocking/<id>/logs/ endpoint (ViewStockingLogsModal's own data source).

class HealthMonitoringSerializer(StockingRecordSerializer):
    latest_water_fish_condition = serializers.SerializerMethodField()
    latest_mortality_count = serializers.SerializerMethodField()

    class Meta(StockingRecordSerializer.Meta):
        fields = StockingRecordSerializer.Meta.fields + [
            'latest_water_fish_condition', 'latest_mortality_count',
        ]
        read_only_fields = StockingRecordSerializer.Meta.read_only_fields + [
            'latest_water_fish_condition', 'latest_mortality_count',
        ]

    def get_latest_water_fish_condition(self, obj):
        log = obj.logs.exclude(water_fish_condition='').order_by('-date_of_activity').first()
        return log.water_fish_condition if log else None

    def get_latest_mortality_count(self, obj):
        log = obj.logs.exclude(mortality_count=None).order_by('-date_of_activity').first()
        return log.mortality_count if log else None


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
