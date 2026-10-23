from decimal import Decimal
from rest_framework import serializers
from datetime import date

from core.validators import validate_not_future_date, validate_uploaded_image
from farmers.models import FarmParcel
from farmers.serializers import _farmer_main_membership
from .duplicates import ACTIVE_STATUSES, duplicate_message, find_active_duplicates
from .naming import normalize_name
from .parcel_link import infer_farm_parcel

from .models import (
    ActivityType, BarangayCropSummary, CropActivityLog, CropActivityStage,
    CropCategory, CropDisasterReport, CropInputType, CropMonitoringRecord, CropRemark, CropSubcategory,
    CropType, CropVariety, DamageReport, FarmInputLog, HarvestRecord, LaborOperationLog,
    PestDiseaseReport, PlantingRecord, SeedSource,
)


class SeedSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeedSource
        fields = ['id', 'name', 'is_active']
        read_only_fields = ['id']


class ActivityTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityType
        fields = ['id', 'name']
        read_only_fields = ['id']


class CropVarietySerializer(serializers.ModelSerializer):
    crop_type_name = serializers.CharField(source='crop_type.name', read_only=True)

    class Meta:
        model = CropVariety
        fields = [
            'id', 'name', 'crop_type', 'crop_type_name', 'is_active', 'days_to_harvest',
            'vegetative_start_day', 'flowering_start_day', 'fruiting_start_day', 'maturity_start_day',
        ]
        read_only_fields = ['id', 'crop_type_name']
        # DRF auto-adds a UniqueTogetherValidator from the model's
        # unique_together=[['crop_type', 'name']] — it runs before our own
        # validate() below and raises its own generic non-field_errors
        # message first, so the case-insensitive check here would never be
        # reached. Disabling it and doing the whole check ourselves in
        # validate() is what actually gives the friendly, field-level message.
        validators = []

    def validate(self, data):
        name = (data.get('name', self.instance.name if self.instance else '') or '').strip()
        crop_type = data['crop_type'] if 'crop_type' in data else (self.instance.crop_type if self.instance else None)
        if name:
            key = normalize_name(name)
            if not key:
                raise serializers.ValidationError({'name': 'Enter a real name (letters or numbers).'})
            # An existing duplicate can still be edited: the check runs only for a new variety, or when the
            # name or the crop type is being changed.
            unchanged = bool(
                self.instance
                and normalize_name(self.instance.name) == key
                and crop_type == self.instance.crop_type
            )
            others = CropVariety.objects.filter(crop_type=crop_type)
            if self.instance:
                others = others.exclude(pk=self.instance.pk)
            # Compared ignoring case, spaces and punctuation: 'RC 222' is the same variety as 'Rc-222'.
            for existing in ([] if unchanged else others.values_list('name', flat=True)):
                if normalize_name(existing) == key:
                    crop_label = crop_type.name if crop_type else 'crops with no crop type set'
                    raise serializers.ValidationError({
                        'name': f"A variety named '{existing}' already exists for {crop_label}.",
                    })
            data['name'] = name

        # Same all-or-nothing growth-stage-day rule as CropTypeSerializer.
        veg = data.get('vegetative_start_day', getattr(self.instance, 'vegetative_start_day', None))
        flo = data.get('flowering_start_day', getattr(self.instance, 'flowering_start_day', None))
        fru = data.get('fruiting_start_day', getattr(self.instance, 'fruiting_start_day', None))
        mat = data.get('maturity_start_day', getattr(self.instance, 'maturity_start_day', None))
        values = [veg, flo, fru, mat]
        set_count = sum(1 for v in values if v is not None)
        if 0 < set_count < 4:
            raise serializers.ValidationError({
                'vegetative_start_day': 'Set all four growth-stage days, or leave all four blank.',
            })
        if set_count == 4 and not (veg < flo < fru < mat):
            raise serializers.ValidationError({
                'vegetative_start_day': 'Growth-stage days must increase: Vegetative < Flowering < Fruiting < Maturity.',
            })
        return data


class CropCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = CropCategory
        fields = ['id', 'name', 'date_created']
        read_only_fields = ['id', 'date_created']


class CropSubcategorySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = CropSubcategory
        fields = ['id', 'name', 'category', 'category_name', 'date_created']
        read_only_fields = ['id', 'category_name', 'date_created']


class CropTypeSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    subcategory_name = serializers.CharField(source='subcategory.name', read_only=True)
    remarks = serializers.SerializerMethodField()

    class Meta:
        model = CropType
        fields = [
            'id', 'name', 'days_to_harvest', 'yield_per_ha_kg',
            'category', 'category_name', 'subcategory', 'subcategory_name',
            'suggested_activities', 'allowed_units', 'remarks', 'is_active',
            'vegetative_start_day', 'flowering_start_day', 'fruiting_start_day', 'maturity_start_day',
        ]
        # DRF auto-adds a UniqueValidator to `name` from the model's
        # unique=True — it's case-sensitive-looking but MySQL's default
        # collation makes the underlying query case-insensitive anyway, so
        # it fires before validate_name() below ever runs, masking our
        # friendlier message behind DRF's generic one. Disabling it here and
        # doing the check ourselves is what actually surfaces our message.
        extra_kwargs = {'name': {'validators': []}}

    def validate_name(self, value):
        name = value.strip()
        key = normalize_name(name)
        if not key:
            raise serializers.ValidationError('Enter a real name (letters or numbers).')
        if self.instance and normalize_name(self.instance.name) == key:
            return name   # unchanged spelling: an existing duplicate can still be edited
        others = CropType.objects.all()
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        # Compared ignoring case, spaces and punctuation: 'Rice  (Palay)' is the same crop as 'Rice (Palay)'.
        for existing in others.values_list('name', flat=True):
            if normalize_name(existing) == key:
                raise serializers.ValidationError(f"A crop type named '{existing}' already exists.")
        return name

    def validate(self, data):
        # All-or-nothing, same rule and same reasoning as
        # SpeciesOptionSerializer.validate() on the fisheries side: a partial
        # set of growth-stage days can't be ordered meaningfully.
        veg = data.get('vegetative_start_day', getattr(self.instance, 'vegetative_start_day', None))
        flo = data.get('flowering_start_day', getattr(self.instance, 'flowering_start_day', None))
        fru = data.get('fruiting_start_day', getattr(self.instance, 'fruiting_start_day', None))
        mat = data.get('maturity_start_day', getattr(self.instance, 'maturity_start_day', None))
        values = [veg, flo, fru, mat]
        set_count = sum(1 for v in values if v is not None)
        if 0 < set_count < 4:
            raise serializers.ValidationError({
                'vegetative_start_day': 'Set all four growth-stage days, or leave all four blank.',
            })
        if set_count == 4 and not (veg < flo < fru < mat):
            raise serializers.ValidationError({
                'vegetative_start_day': 'Growth-stage days must increase: Vegetative < Flowering < Fruiting < Maturity.',
            })
        return data

    def get_remarks(self, obj):
        return CropRemarkSerializer(obj.remarks.order_by('-date_recorded'), many=True).data


class CropRemarkSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CropRemark
        fields = ['id', 'crop_type', 'custom_status', 'remark_text', 'recorded_by', 'recorded_by_name', 'date_recorded']
        read_only_fields = ['id', 'recorded_by', 'recorded_by_name', 'date_recorded']

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return getattr(obj.recorded_by, 'full_name', str(obj.recorded_by))
        return None


class CropActivityStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = CropActivityStage
        fields = ['id', 'crop_type', 'stage_name', 'day_after_planting', 'application_days', 'recommendation', 'priority', 'window_days', 'allows_pre_planting']
        read_only_fields = ['id', 'crop_type', 'day_after_planting']

    def validate_application_days(self, value):
        if not isinstance(value, list) or len(value) == 0:
            raise serializers.ValidationError('At least one day is required.')
        for d in value:
            if not isinstance(d, int) or d < 1:
                raise serializers.ValidationError('Each day must be a positive integer.')
        return sorted(set(value))

    def create(self, validated_data):
        # day_after_planting is read-only (staff pick it implicitly via
        # application_days, not as its own field) but the model column is
        # NOT NULL with no default — nothing was ever setting it on create,
        # so every real POST to this endpoint 500'd with an IntegrityError.
        # Derived as the earliest day, same value CropMonitoringSubSection's
        # own day-based expansion already treats as "when this stage starts".
        validated_data['day_after_planting'] = min(validated_data['application_days'])
        return super().create(validated_data)


class CropInputTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CropInputType
        fields = ['id', 'name', 'description', 'is_active', 'crop_types', 'input_type', 'growth_stage']
        read_only_fields = ['id']

    def create(self, validated_data):
        days = validated_data.get('application_days', [])
        if days:
            validated_data['day_after_planting'] = min(days)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        days = validated_data.get('application_days', instance.application_days)
        if days:
            validated_data['day_after_planting'] = min(days)
        return super().update(instance, validated_data)


class MonitoringRemarkSerializer(serializers.ModelSerializer):
    content = serializers.CharField(source='remark_text')
    created_by_name = serializers.SerializerMethodField()
    date_created = serializers.DateTimeField(source='date_recorded', read_only=True)

    class Meta:
        model = CropRemark
        fields = ['id', 'custom_status', 'content', 'created_by_name', 'date_created']
        read_only_fields = ['id', 'created_by_name', 'date_created']

    def get_created_by_name(self, obj):
        if obj.recorded_by:
            return getattr(obj.recorded_by, 'full_name', str(obj.recorded_by))
        return 'Unknown'


class LaborOperationLogSerializer(serializers.ModelSerializer):
    logged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LaborOperationLog
        fields = ['id', 'monitoring_record', 'activity', 'date', 'notes', 'logged_by', 'logged_by_name', 'date_logged']
        read_only_fields = ['id', 'monitoring_record', 'logged_by', 'logged_by_name', 'date_logged']

    def get_logged_by_name(self, obj):
        if obj.logged_by:
            return obj.logged_by.full_name
        return None


class CropActivityLogSerializer(serializers.ModelSerializer):
    logged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CropActivityLog
        fields = [
            'id', 'monitoring_record', 'activity_type', 'activity_type_other_specify', 'date_of_activity',
            'plant_condition', 'status_at_log', 'notes', 'water_quality',
            'fertilizer_type', 'quantity_applied', 'quantity_unit', 'application_method',
            'pest_disease_name', 'area_affected_ha', 'severity', 'treatment_used',
            'recorded_by', 'logged_by_name', 'target_day', 'is_late',
            'date_logged', 'disaster_report', 'disaster_rule',
        ]
        read_only_fields = ['id', 'monitoring_record', 'recorded_by', 'is_late', 'date_logged']

    def get_logged_by_name(self, obj):
        if obj.recorded_by:
            return getattr(obj.recorded_by, 'full_name', str(obj.recorded_by))
        return None

    def validate_date_of_activity(self, value):
        if value > date.today():
            raise serializers.ValidationError('Date of activity cannot be in the future.')
        return value

    def validate(self, data):
        date_of_activity = data.get('date_of_activity')
        monitoring_record = data.get('monitoring_record')
        if not monitoring_record:
            monitoring_id = self.context.get('view').kwargs.get('monitoring_id') if self.context.get('view') else None
            if monitoring_id:
                from .models import CropMonitoringRecord
                monitoring_record = CropMonitoringRecord.objects.filter(pk=monitoring_id).first()
            elif self.instance is not None:
                # PATCH via CropActivityLogDetailView has no monitoring_id URL
                # kwarg (it's keyed by the log entry's own id) and
                # monitoring_record is read-only, so fall back to the
                # existing instance's own record — otherwise these guards
                # would silently no-op on every edit.
                monitoring_record = self.instance.monitoring_record

        disaster_report = data.get('disaster_report')
        if disaster_report and monitoring_record and disaster_report.monitoring_record_id != monitoring_record.id:
            raise serializers.ValidationError({
                'disaster_report': 'This disaster report does not belong to the same monitoring record.'
            })

        activity_type = data.get('activity_type', '')
        if date_of_activity and monitoring_record and monitoring_record.date_planted:
            if date_of_activity < monitoring_record.date_planted:
                allows_pre_planting = CropActivityStage.objects.filter(
                    crop_type_id=monitoring_record.crop_type_id,
                    stage_name=activity_type,
                    allows_pre_planting=True,
                ).exists()
                if not allows_pre_planting:
                    raise serializers.ValidationError({
                        'date_of_activity': 'Activity date cannot be before the planting date '
                                            f'({monitoring_record.date_planted}).'
                    })

        if activity_type == 'Other' and not (data.get('activity_type_other_specify') or '').strip():
            raise serializers.ValidationError({
                'activity_type_other_specify': 'Please specify the activity.'
            })

        area_affected_ha = data.get('area_affected_ha')
        # A pest or disease log must record HOW BAD it is, but there are two
        # ways to say so. Staff measure the affected area in hectares; the
        # citizen form (frames 23-24) asks for ANTAS NG PINSALA instead,
        # because a farmer walking a field can judge low/medium/high but not
        # a hectare figure. Either answer satisfies the requirement — the
        # severity column already existed and was simply never offered here.
        if (activity_type in ('Pest Control', 'Disease Control')
                and area_affected_ha is None and not data.get('severity')):
            raise serializers.ValidationError({
                'area_affected_ha': 'Area affected or severity is required for Pest Control / Disease Control activities.'
            })
        if area_affected_ha is not None:
            if area_affected_ha <= 0:
                raise serializers.ValidationError({
                    'area_affected_ha': 'Area affected must be greater than 0.'
                })
            if monitoring_record and monitoring_record.area_planted_ha and area_affected_ha > monitoring_record.area_planted_ha:
                raise serializers.ValidationError({
                    'area_affected_ha': f'Area affected cannot exceed the {monitoring_record.area_planted_ha} ha planted.'
                })
        return data


class CropDisasterReportSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.SerializerMethodField()
    recovered_by_name = serializers.SerializerMethodField()
    # The damage photos (CropDisasterReportPhoto rows, 0-10); they arrive as the multipart `photos` files of the
    # create request (see CropDisasterReportListCreateView). `photo` below is the older single photo, kept as is.
    photos = serializers.SerializerMethodField()
    # Whether the Recovered action is offered: not for a harvested or total-loss crop (it stays in the history only).
    can_recover = serializers.BooleanField(read_only=True)
    recovery_block_reason = serializers.SerializerMethodField()

    class Meta:
        model = CropDisasterReport
        fields = [
            'id', 'monitoring_record', 'disaster_type', 'disaster_type_other_specify', 'date_of_occurrence',
            'area_affected_ha', 'estimated_damage', 'production_loss', 'photo', 'photos',
            'severity',
            'is_total_loss',
            'status', 'can_recover', 'recovery_block_reason', 'recovered_date', 'recovered_by', 'recovered_by_name', 'recovery_note',
            'reported_by', 'reported_by_name', 'date_reported',
        ]
        read_only_fields = [
            'id', 'monitoring_record', 'status', 'recovered_date',
            'recovered_by', 'recovered_by_name', 'recovery_note',
            'reported_by', 'reported_by_name', 'date_reported',
        ]

    def validate_photo(self, value):
        validate_uploaded_image(value)
        return value

    def get_photos(self, obj):
        request = self.context.get('request')
        return [
            {'id': p.id, 'url': request.build_absolute_uri(p.image.url) if request else p.image.url}
            for p in obj.photos.all()
        ]

    def get_recovery_block_reason(self, obj):
        return obj.recovery_block_reason if obj.status == 'Active' else None

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
        # The crop comes from the request body, from the multi-crop endpoint (which validates one crop at a time and
        # passes it in the context), or from the single-crop endpoint's URL below.
        monitoring_record = data.get('monitoring_record') or self.context.get('monitoring_record')
        if not monitoring_record:
            monitoring_id = self.context.get('view').kwargs.get('monitoring_id') if self.context.get('view') else None
            if monitoring_id:
                monitoring_record = CropMonitoringRecord.objects.filter(pk=monitoring_id).first()
        if area_affected_ha is None:
            raise serializers.ValidationError({'area_affected_ha': 'Area affected is required.'})
        if area_affected_ha <= 0:
            raise serializers.ValidationError({'area_affected_ha': 'Area affected must be greater than 0.'})
        if monitoring_record and monitoring_record.area_planted_ha and area_affected_ha > monitoring_record.area_planted_ha:
            raise serializers.ValidationError({
                'area_affected_ha': f'Area affected cannot exceed the {monitoring_record.area_planted_ha} ha planted.'
            })
        # A Total Loss means the whole planted area is affected (compared as decimals, so 2 equals 2.00).
        if (data.get('is_total_loss') and monitoring_record and monitoring_record.area_planted_ha
                and area_affected_ha != monitoring_record.area_planted_ha):
            raise serializers.ValidationError({
                'is_total_loss': f'Total Loss is only allowed when the whole area is affected ({monitoring_record.area_planted_ha} ha).'
            })
        return data


class FarmInputLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmInputLog
        fields = [
            'id', 'monitoring_record', 'input_type', 'product_name', 'quantity', 'unit',
            'application_date', 'application_method', 'notes', 'recorded_by',
        ]
        read_only_fields = ['id', 'recorded_by']


class PestDiseaseReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = PestDiseaseReport
        fields = [
            'id', 'monitoring_record', 'report_date', 'pest_disease_name', 'category',
            'severity', 'affected_area_pct', 'symptoms_description',
            'recommended_action', 'action_taken', 'recorded_by',
        ]
        read_only_fields = ['id', 'recorded_by']


class CropMonitoringRecordSerializer(serializers.ModelSerializer):
    farmer_name            = serializers.SerializerMethodField()
    farmer_barangay        = serializers.SerializerMethodField()
    farmer_full_name       = serializers.SerializerMethodField()
    farmer_organization_name= serializers.SerializerMethodField()
    parcel_number          = serializers.SerializerMethodField()
    organization_name       = serializers.SerializerMethodField()
    crop_type_name         = serializers.CharField(source='crop_type.name', read_only=True)
    crop_suggested_activities = serializers.CharField(source='crop_type.suggested_activities', read_only=True)
    crop_allowed_units     = serializers.SerializerMethodField()
    is_near_harvest        = serializers.SerializerMethodField()
    latest_condition       = serializers.SerializerMethodField()
    log_count              = serializers.SerializerMethodField()
    labor_log_count        = serializers.SerializerMethodField()
    has_disaster           = serializers.BooleanField(read_only=True, default=False)
    disasters_count        = serializers.SerializerMethodField()
    has_recovered_disaster = serializers.SerializerMethodField()
    has_harvest            = serializers.SerializerMethodField()
    harvest_record_id      = serializers.SerializerMethodField()
    harvest_count          = serializers.SerializerMethodField()
    disaster_report_count  = serializers.SerializerMethodField()
    harvest_variance_days  = serializers.SerializerMethodField()
    growth_stage           = serializers.SerializerMethodField()
    recommended_input_type_id   = serializers.SerializerMethodField()
    recommended_input_type_name = serializers.SerializerMethodField()

    class Meta:
        model = CropMonitoringRecord
        fields = [
            'id', 'farm_parcel', 'farmers_organization',
            'farmer', 'farmer_full_name', 'farmer_organization_name',
            'farm_location_barangay', 'land_status', 'land_status_other_specify',
            'farmer_name', 'farmer_barangay', 'parcel_number', 'organization_name',
            'crop_type', 'crop_type_name', 'crop_suggested_activities', 'crop_allowed_units', 'season', 'year',
            'date_planted', 'date_planted_is_estimated', 'area_planted_ha',
            'expected_harvest_date', 'actual_harvest_date',
            'status', 'current_growth_stage',
            'estimated_yield_kg', 'actual_yield_kg',
            'yield_variance_kg', 'yield_variance_pct',
            'notes', 'variety_used', 'seed_source', 'seed_source_other_specify',
            'quantity_of_seeds', 'seed_quantity_unit',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'latest_condition', 'log_count', 'labor_log_count',
            'has_disaster', 'disasters_count', 'has_recovered_disaster',
            'has_harvest', 'harvest_record_id', 'harvest_count', 'disaster_report_count',
            'harvest_variance_days',
            'growth_stage', 'recommended_input_type_id', 'recommended_input_type_name',
            'has_pcic_insurance', 'pcic_form_photo',
        ]
        read_only_fields = [
            'id', 'pcic_form_photo', 'farmer_name', 'farmer_barangay', 'farmer_full_name', 'farmer_organization_name',
            'parcel_number', 'organization_name',
            'crop_type_name', 'crop_suggested_activities', 'crop_allowed_units',
            'expected_harvest_date', 'estimated_yield_kg',
            'yield_variance_kg', 'yield_variance_pct',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'latest_condition', 'log_count', 'labor_log_count',
            'has_disaster', 'disasters_count', 'has_recovered_disaster',
            'has_harvest', 'harvest_record_id', 'harvest_count', 'disaster_report_count',
            'harvest_variance_days',
            'growth_stage', 'recommended_input_type_id', 'recommended_input_type_name',
        ]
        extra_kwargs = {
            'farm_location_barangay': {'required': True, 'allow_blank': False},
            'land_status': {'required': True, 'allow_blank': False},
        }

    def get_crop_allowed_units(self, obj):
        if obj.crop_type and obj.crop_type.allowed_units:
            return obj.crop_type.allowed_units
        return ['kg']

    def get_farmer_name(self, obj):
        if obj.farmer:
            return obj.farmer.full_name
        if obj.farm_parcel and obj.farm_parcel.farmer:
            return obj.farm_parcel.farmer.full_name
        return None

    def get_farmer_full_name(self, obj):
        if obj.farmer:
            return obj.farmer.full_name
        return None

    def get_farmer_organization_name(self, obj):
        # Batch (Phase B): Farmer.farmers_organization no longer exists —
        # resolves the farmer's real, stored MAIN organization membership
        # instead (associations.models.FarmersOrganizationMember.is_main).
        if not obj.farmer_id:
            return None
        main = _farmer_main_membership(obj.farmer)
        return main.organization.name if main else None

    def get_farmer_barangay(self, obj):
        if obj.farm_location_barangay:
            return obj.farm_location_barangay
        if obj.farm_parcel:
            return obj.farm_parcel.barangay
        if obj.farmers_organization:
            return obj.farmers_organization.barangay
        return None

    def get_parcel_number(self, obj):
        if obj.farm_parcel:
            return obj.farm_parcel.parcel_number
        return None

    def get_organization_name(self, obj):
        if obj.farmers_organization:
            return obj.farmers_organization.name
        return None

    def get_is_near_harvest(self, obj):
        if obj.expected_harvest_date and obj.status == CropMonitoringRecord.Status.PLANTED:
            delta = (obj.expected_harvest_date - date.today()).days
            return 0 <= delta <= 7
        return False

    # The list view prefetches activity logs, labor logs, harvest records and disaster reports for the whole page, so
    # these read them from memory (obj.<relation>.all() is the prefetched list). Calling .filter()/.count()/.first()
    # instead would run a query per row, and over the network to the database that made this list take many seconds.
    def get_latest_condition(self, obj):
        logs = sorted(obj.activity_logs.all(), key=lambda l: (l.date_of_activity, l.pk), reverse=True)
        if logs and logs[0].plant_condition:
            return logs[0].plant_condition
        return None

    def get_log_count(self, obj):
        return len(obj.activity_logs.all())

    def get_labor_log_count(self, obj):
        return len(obj.labor_logs.all())

    def get_disasters_count(self, obj):
        return sum(1 for d in obj.disaster_reports.all() if d.status == 'Active')

    def get_has_recovered_disaster(self, obj):
        return any(d.status == 'Recovered' for d in obj.disaster_reports.all())

    def _first_harvest(self, obj):
        harvests = sorted(obj.harvest_records.all(), key=lambda h: h.pk)
        return harvests[0] if harvests else None

    def get_has_harvest(self, obj):
        return obj.status == CropMonitoringRecord.Status.HARVESTED

    def get_harvest_record_id(self, obj):
        hr = self._first_harvest(obj)
        return hr.id if hr else None

    def get_harvest_count(self, obj):
        return len(obj.harvest_records.all())

    def get_disaster_report_count(self, obj):
        return len(obj.disaster_reports.all())

    def get_harvest_variance_days(self, obj):
        hr = self._first_harvest(obj)
        return hr.harvest_variance_days if hr else None

    def get_growth_stage(self, obj):
        return obj.compute_growth_stage()

    def get_recommended_input_type_id(self, obj):
        input_type = obj.compute_recommended_input()
        return input_type.id if input_type else None

    def get_recommended_input_type_name(self, obj):
        input_type = obj.compute_recommended_input()
        return input_type.name if input_type else None

    def validate_date_planted(self, value):
        validate_not_future_date(value, 'Date planted')
        return value
    # expected_harvest_date deliberately NOT capped — it's server-computed
    # (date_planted + crop_type.days_to_harvest) and always forward-looking.

    def validate(self, data):
        seed_source = data.get('seed_source', getattr(self.instance, 'seed_source', ''))
        seed_source_other = data.get('seed_source_other_specify', getattr(self.instance, 'seed_source_other_specify', ''))
        if seed_source == 'Other' and not (seed_source_other or '').strip():
            raise serializers.ValidationError({'seed_source_other_specify': 'Please specify the seed source.'})

        land_status = data.get('land_status', getattr(self.instance, 'land_status', ''))
        land_status_other = data.get('land_status_other_specify', getattr(self.instance, 'land_status_other_specify', ''))
        if land_status == 'Other' and not (land_status_other or '').strip():
            raise serializers.ValidationError({'land_status_other_specify': 'Please specify the land status.'})

        # A record may only sit on one of ITS OWN farmer's parcels.
        farmer = data.get('farmer', getattr(self.instance, 'farmer', None))
        parcel = data.get('farm_parcel', getattr(self.instance, 'farm_parcel', None))
        if farmer and parcel and parcel.farmer_id != farmer.id:
            raise serializers.ValidationError({'farm_parcel': 'That parcel belongs to a different farmer.'})

        # No parcel chosen on a NEW record: link it when exactly one of the
        # farmer's parcels declares this crop (see production/parcel_link.py).
        # Anything ambiguous stays unlinked for a person to choose.
        if self.instance is None and farmer and not parcel:
            crop_type = data.get('crop_type')
            inferred = infer_farm_parcel(farmer.id, crop_type.name if crop_type else '', data.get('farm_location_barangay', ''))
            if inferred:
                data['farm_parcel'] = inferred

        # A new farmer crop record belongs to one of the farmer's parcels: the only parcel is used as it is, and
        # with none or several to choose from the person must pick (or add) one. Records made before this rule,
        # and ones that are edited, are left as they are.
        if self.instance is None and farmer and not data.get('farm_parcel'):
            parcels = list(FarmParcel.objects.filter(farmer_id=farmer.id).order_by('id')[:2])
            if len(parcels) == 1:
                data['farm_parcel'] = parcels[0]
            elif not parcels:
                raise serializers.ValidationError({'farm_parcel': 'This farmer has no farm parcel yet. Add a farm parcel first, then add the crop.'})
            else:
                raise serializers.ValidationError({'farm_parcel': 'Choose the farm parcel this crop is grown on.'})

        # One farmer cannot have two active records of the same crop and variety in the same place. A new record
        # is always checked. An existing one is checked only while it is still active and only when something
        # that decides the rule really changes (the edit form re-sends every field, changed or not), so a
        # record that is already part of a duplicate pair, or a lost/harvested one, can still be corrected.
        def stored(field):
            return getattr(self.instance, field, None) if self.instance else None

        record_farmer = data['farmer'] if 'farmer' in data else stored('farmer')
        record_crop = data['crop_type'] if 'crop_type' in data else stored('crop_type')
        record_variety = data['variety_used'] if 'variety_used' in data else (stored('variety_used') or '')
        record_parcel = data['farm_parcel'] if 'farm_parcel' in data else stored('farm_parcel')
        record_barangay = (data['farm_location_barangay'] if 'farm_location_barangay' in data
                           else (stored('farm_location_barangay') or ''))

        def decisive_change():
            if self.instance is None:
                return True
            if self.instance.status not in ACTIVE_STATUSES:
                return False
            same = (
                getattr(record_farmer, 'id', None) == self.instance.farmer_id
                and getattr(record_crop, 'id', None) == self.instance.crop_type_id
                and normalize_name(record_variety) == normalize_name(self.instance.variety_used)
                and getattr(record_parcel, 'id', None) == self.instance.farm_parcel_id
            )
            # the barangay only decides the rule when there is no parcel
            if same and not record_parcel:
                same = (record_barangay or '').strip().lower() == (self.instance.farm_location_barangay or '').strip().lower()
            return not same

        if record_farmer and record_crop and decisive_change():
            found = find_active_duplicates(
                farmer_id=record_farmer.id, crop_type_id=record_crop.id, variety=record_variety,
                farm_parcel_id=record_parcel.id if record_parcel else None, barangay=record_barangay,
                exclude_id=self.instance.pk if self.instance else None,
            )
            if found:
                raise serializers.ValidationError({
                    'crop_type': duplicate_message(found[0], record_crop, record_barangay, bool(record_parcel)),
                })
        return data


class CropMonitoringDetailSerializer(CropMonitoringRecordSerializer):
    activity_logs = CropActivityLogSerializer(many=True, read_only=True)
    input_logs = FarmInputLogSerializer(many=True, read_only=True)
    pest_disease_reports = PestDiseaseReportSerializer(many=True, read_only=True)
    labor_logs = LaborOperationLogSerializer(many=True, read_only=True)

    class Meta(CropMonitoringRecordSerializer.Meta):
        fields = CropMonitoringRecordSerializer.Meta.fields + [
            'activity_logs', 'input_logs', 'pest_disease_reports', 'labor_logs',
        ]
        read_only_fields = CropMonitoringRecordSerializer.Meta.read_only_fields + [
            'activity_logs', 'input_logs', 'pest_disease_reports', 'labor_logs',
        ]


# The unit a harvest is measured in: one of the standard codes (kg, bags, cavan, ...) or one of the units the harvested
# crop allows in Crop Options ("Cavan (50kg)", "Sack", "Metric Ton", ...). Checked in _validate_harvest_record().
def _harvest_unit_field():
    return serializers.CharField(max_length=20, required=False, allow_blank=True)


class HarvestRecordSerializer(serializers.ModelSerializer):
    unit_of_measure = _harvest_unit_field()
    farmer_name = serializers.SerializerMethodField()
    rsbsa_number = serializers.SerializerMethodField()
    barangay = serializers.SerializerMethodField()

    class Meta:
        model = HarvestRecord
        fields = [
            'id',
            'farm_parcel',
            'monitoring_record',
            'farmer_name',
            'rsbsa_number',
            'barangay',
            'season',
            'year',
            'crop_name',
            'harvest_start_date',
            'harvest_end_date',
            'area_harvested_hectares',
            'volume_kg',
            'volume_bags',
            'unit_of_measure',
            'yield_per_hectare_kg',
            'harvest_variance_days',
            'early_late_reason',
            'recorded_by',
            'date_recorded',
            'remarks',
        ]
        read_only_fields = [
            'id',
            'farm_parcel',
            'monitoring_record',
            'farmer_name',
            'rsbsa_number',
            'barangay',
            'volume_bags',
            'yield_per_hectare_kg',
            'harvest_variance_days',
            'recorded_by',
            'date_recorded',
        ]

    def get_farmer_name(self, obj):
        if obj.farm_parcel and obj.farm_parcel.farmer:
            return obj.farm_parcel.farmer.full_name
        return None

    def get_rsbsa_number(self, obj):
        if obj.farm_parcel and obj.farm_parcel.farmer:
            return obj.farm_parcel.farmer.rsbsa_number
        return None

    def get_barangay(self, obj):
        if obj.farm_parcel:
            return obj.farm_parcel.barangay
        return None

    def validate(self, data):
        return _validate_harvest_record(data, self.instance)


def _validate_harvest_record(data, instance):
    start = data.get('harvest_start_date', getattr(instance, 'harvest_start_date', None))
    end = data.get('harvest_end_date', getattr(instance, 'harvest_end_date', None))
    if start and end and end < start:
        raise serializers.ValidationError({
            'harvest_end_date': 'Harvest end date must be on or after the harvest start date.',
        })

    monitoring_record = data.get('monitoring_record', getattr(instance, 'monitoring_record', None))

    unit = data.get('unit_of_measure')
    if unit:
        standard = {code for code, _label in HarvestRecord.UNIT_OF_MEASURE_CHOICES}
        crop_units = (monitoring_record.crop_type.allowed_units or []) if monitoring_record and monitoring_record.crop_type_id else []
        if unit not in standard and unit not in crop_units:
            raise serializers.ValidationError({'unit_of_measure': f'"{unit}" is not a unit this crop is harvested in.'})

    # The parcel must be one of the crop's own farmer: otherwise a harvest could carry someone else's parcel, and
    # the harvest detail would show that parcel owner's name and RSBSA number to whoever can read the harvest.
    parcel = data.get('farm_parcel', getattr(instance, 'farm_parcel', None))
    if parcel and monitoring_record and monitoring_record.farmer_id and parcel.farmer_id != monitoring_record.farmer_id:
        raise serializers.ValidationError({'farm_parcel': 'This parcel does not belong to the farmer of this crop.'})

    if start:
        if start > date.today():
            raise serializers.ValidationError({'harvest_start_date': 'Harvest date cannot be in the future.'})
        if monitoring_record and monitoring_record.date_planted and start < monitoring_record.date_planted:
            raise serializers.ValidationError({
                'harvest_start_date': f'Harvest date cannot be before the date planted ({monitoring_record.date_planted}).'
            })
        if monitoring_record and monitoring_record.expected_harvest_date:
            variance = (start - monitoring_record.expected_harvest_date).days
            reason = data.get('early_late_reason', getattr(instance, 'early_late_reason', '')) or ''
            if abs(variance) > 7 and not reason.strip():
                raise serializers.ValidationError({
                    'early_late_reason': 'A reason is required when the harvest date is more than 7 days early or late.'
                })

    return data


class HarvestRecordCreateSerializer(serializers.ModelSerializer):
    unit_of_measure = _harvest_unit_field()
    farm_parcel = serializers.PrimaryKeyRelatedField(
        queryset=FarmParcel.objects.all(),
        required=False, allow_null=True,
    )

    class Meta:
        model = HarvestRecord
        fields = [
            'id',
            'farm_parcel',
            'monitoring_record',
            'season',
            'year',
            'crop_name',
            'harvest_start_date',
            'harvest_end_date',
            'area_harvested_hectares',
            'volume_kg',
            'unit_of_measure',
            'yield_per_hectare_kg',
            'harvest_variance_days',
            'early_late_reason',
            'remarks',
        ]
        read_only_fields = ['id', 'yield_per_hectare_kg', 'harvest_variance_days']

    def validate(self, data):
        return _validate_harvest_record(data, self.instance)


class PlantingRecordSerializer(serializers.ModelSerializer):
    farmer_name = serializers.CharField(source='farm_parcel.farmer.full_name', read_only=True)
    farmer_rsbsa_number = serializers.CharField(source='farm_parcel.farmer.rsbsa_number', read_only=True)
    farmer_barangay = serializers.CharField(source='farm_parcel.barangay', read_only=True)

    class Meta:
        model = PlantingRecord
        fields = [
            'id',
            'farm_parcel',
            'farmer_name',
            'farmer_rsbsa_number',
            'farmer_barangay',
            'season',
            'year',
            'crop_name',
            'area_planted_hectares',
            'date_planted',
            'seedling_type',
            'variety_used',
            'seed_source',
            'quantity_of_seeds_kg',
            'remarks',
            'recorded_by',
            'date_recorded',
        ]
        read_only_fields = ['id', 'farmer_name', 'farmer_rsbsa_number', 'farmer_barangay', 'recorded_by', 'date_recorded']

    def validate_date_planted(self, value):
        validate_not_future_date(value, 'Date planted')
        return value


class PlantingRecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlantingRecord
        fields = [
            'id',
            'farm_parcel',
            'season',
            'year',
            'crop_name',
            'area_planted_hectares',
            'date_planted',
            'seedling_type',
            'variety_used',
            'seed_source',
            'quantity_of_seeds_kg',
            'remarks',
        ]
        read_only_fields = ['id']

    def validate_date_planted(self, value):
        validate_not_future_date(value, 'Date planted')
        return value


class BarangayCropSummarySerializer(serializers.ModelSerializer):
    computed_area_from_records = serializers.SerializerMethodField()
    computed_yield_from_records = serializers.SerializerMethodField()
    data_source = serializers.SerializerMethodField()
    coverage_pct = serializers.SerializerMethodField()

    class Meta:
        model = BarangayCropSummary
        fields = [
            'id', 'barangay', 'crop_name', 'season', 'year',
            'area_planted_ha', 'number_of_farmers',
            'planting_date_start', 'planting_date_end',
            'expected_harvest_start', 'expected_harvest_end',
            'current_growth_stage', 'observed_problems', 'alert_level',
            'estimated_yield_kg', 'actual_yield_kg',
            'yield_variance_kg', 'yield_variance_pct',
            'causal_factor', 'causal_damage_report',
            'submission_status', 'linked_monitoring_records',
            'recorded_by', 'date_created', 'date_updated',
            'computed_area_from_records', 'computed_yield_from_records',
            'data_source', 'coverage_pct',
        ]
        read_only_fields = [
            'id', 'recorded_by', 'date_created', 'date_updated',
            'yield_variance_kg', 'yield_variance_pct',
        ]

    def get_computed_area_from_records(self, obj):
        val = obj.computed_area_from_records
        return float(val) if val is not None else None

    def get_computed_yield_from_records(self, obj):
        val = obj.computed_yield_from_records
        return float(val) if val is not None else None

    def get_data_source(self, obj):
        if obj.pk and obj.linked_monitoring_records.exists():
            return 'Individual Records'
        return 'Barangay Report'

    def get_coverage_pct(self, obj):
        if not obj.area_planted_ha or obj.area_planted_ha == 0:
            return None
        computed = obj.computed_area_from_records
        if computed is None:
            return None
        return float(
            (Decimal(str(computed)) / Decimal(str(obj.area_planted_ha))) * 100
        )


class DamageReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = DamageReport
        fields = [
            'id',
            'barangay',
            'calamity_name',
            'calamity_date',
            'season',
            'year',
            'damaged_crops',
            'crop_volume_damaged_kg',
            'damaged_livestock',
            'livestock_head_count_affected',
            'estimated_loss_php',
            'affected_monitoring_records',
            'remarks',
            'recorded_by',
            'date_recorded',
        ]
        read_only_fields = ['id', 'recorded_by', 'date_recorded']

    def validate_calamity_date(self, value):
        validate_not_future_date(value, 'Calamity date')
        return value
