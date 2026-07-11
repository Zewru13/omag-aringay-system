from decimal import Decimal
from rest_framework import serializers
from datetime import date

from farmers.models import FarmParcel

from .models import (
    BarangayCropSummary, CropActivityLog, CropActivityStage, CropCategory,
    CropDisasterReport, CropMonitoringRecord, CropRemark, CropSubcategory, CropType,
    CropVariety, DamageReport, FarmInputLog, HarvestRecord, LaborOperationLog,
    PestDiseaseReport, PlantingRecord, SeedSource,
)


class SeedSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeedSource
        fields = ['id', 'name', 'is_active']
        read_only_fields = ['id']


class CropVarietySerializer(serializers.ModelSerializer):
    crop_type_name = serializers.CharField(source='crop_type.name', read_only=True)

    class Meta:
        model = CropVariety
        fields = ['id', 'name', 'crop_type', 'crop_type_name', 'is_active']
        read_only_fields = ['id', 'crop_type_name']


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
            'suggested_activities', 'allowed_units', 'remarks',
        ]

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
        fields = ['id', 'crop_type', 'stage_name', 'day_after_planting', 'application_days', 'recommendation', 'priority', 'window_days']
        read_only_fields = ['id', 'crop_type', 'day_after_planting']

    def validate_application_days(self, value):
        if not isinstance(value, list) or len(value) == 0:
            raise serializers.ValidationError('At least one day is required.')
        for d in value:
            if not isinstance(d, int) or d < 1:
                raise serializers.ValidationError('Each day must be a positive integer.')
        return sorted(set(value))

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
            'plant_condition', 'status_at_log', 'notes',
            'fertilizer_type', 'quantity_applied', 'quantity_unit',
            'pest_disease_name', 'area_affected_ha', 'severity',
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
        if date_of_activity and monitoring_record and monitoring_record.date_planted:
            if date_of_activity < monitoring_record.date_planted:
                raise serializers.ValidationError({
                    'date_of_activity': 'Date of activity cannot be before the date planted '
                                        f'({monitoring_record.date_planted}).'
                })

        activity_type = data.get('activity_type', '')
        if activity_type == 'Other' and not (data.get('activity_type_other_specify') or '').strip():
            raise serializers.ValidationError({
                'activity_type_other_specify': 'Please specify the activity.'
            })

        area_affected_ha = data.get('area_affected_ha')
        if activity_type in ('Pest Control', 'Disease Control') and area_affected_ha is None:
            raise serializers.ValidationError({
                'area_affected_ha': 'Area affected is required for Pest Control / Disease Control activities.'
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
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CropDisasterReport
        fields = [
            'id', 'monitoring_record', 'disaster_type', 'disaster_type_other_specify', 'date_of_occurrence',
            'area_affected_ha', 'estimated_damage', 'production_loss',
            'is_total_loss',
            'status', 'resolved_date', 'resolved_by', 'resolved_by_name',
            'reported_by', 'reported_by_name', 'date_reported',
        ]
        read_only_fields = [
            'id', 'monitoring_record', 'status', 'resolved_date',
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

    def validate(self, data):
        disaster_type = data.get('disaster_type', '')
        if disaster_type == 'Other' and not (data.get('disaster_type_other_specify') or '').strip():
            raise serializers.ValidationError({
                'disaster_type_other_specify': 'Please specify the disaster type.'
            })

        area_affected_ha = data.get('area_affected_ha')
        monitoring_record = data.get('monitoring_record')
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
    farmer_association_name= serializers.SerializerMethodField()
    parcel_number          = serializers.SerializerMethodField()
    association_name       = serializers.SerializerMethodField()
    crop_type_name         = serializers.CharField(source='crop_type.name', read_only=True)
    crop_suggested_activities = serializers.CharField(source='crop_type.suggested_activities', read_only=True)
    crop_allowed_units     = serializers.SerializerMethodField()
    is_near_harvest        = serializers.SerializerMethodField()
    latest_condition       = serializers.SerializerMethodField()
    log_count              = serializers.SerializerMethodField()
    labor_log_count        = serializers.SerializerMethodField()
    has_disaster           = serializers.BooleanField(read_only=True, default=False)
    disasters_count        = serializers.SerializerMethodField()
    has_resolved_disaster  = serializers.SerializerMethodField()
    has_harvest            = serializers.SerializerMethodField()
    harvest_record_id      = serializers.SerializerMethodField()
    harvest_count          = serializers.SerializerMethodField()
    disaster_report_count  = serializers.SerializerMethodField()
    harvest_variance_days  = serializers.SerializerMethodField()

    class Meta:
        model = CropMonitoringRecord
        fields = [
            'id', 'farm_parcel', 'farmers_association',
            'farmer', 'farmer_full_name', 'farmer_association_name',
            'farm_location_barangay', 'land_status', 'land_status_other_specify',
            'farmer_name', 'farmer_barangay', 'parcel_number', 'association_name',
            'crop_type', 'crop_type_name', 'crop_suggested_activities', 'crop_allowed_units', 'season', 'year',
            'date_planted', 'area_planted_ha',
            'expected_harvest_date', 'actual_harvest_date',
            'status', 'current_growth_stage',
            'estimated_yield_kg', 'actual_yield_kg',
            'yield_variance_kg', 'yield_variance_pct',
            'notes', 'variety_used', 'seed_source', 'seed_source_other_specify',
            'quantity_of_seeds', 'seed_quantity_unit',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'latest_condition', 'log_count', 'labor_log_count',
            'has_disaster', 'disasters_count', 'has_resolved_disaster',
            'has_harvest', 'harvest_record_id', 'harvest_count', 'disaster_report_count',
            'harvest_variance_days',
        ]
        read_only_fields = [
            'id', 'farmer_name', 'farmer_barangay', 'farmer_full_name', 'farmer_association_name',
            'parcel_number', 'association_name',
            'crop_type_name', 'crop_suggested_activities', 'crop_allowed_units',
            'expected_harvest_date', 'estimated_yield_kg',
            'yield_variance_kg', 'yield_variance_pct',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'latest_condition', 'log_count', 'labor_log_count',
            'has_disaster', 'disasters_count', 'has_resolved_disaster',
            'has_harvest', 'harvest_record_id', 'harvest_count', 'disaster_report_count',
            'harvest_variance_days',
        ]

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

    def get_farmer_association_name(self, obj):
        if obj.farmer and hasattr(obj.farmer, 'farmers_association') and obj.farmer.farmers_association:
            return obj.farmer.farmers_association.name
        return None

    def get_farmer_barangay(self, obj):
        if obj.farm_location_barangay:
            return obj.farm_location_barangay
        if obj.farm_parcel:
            return obj.farm_parcel.barangay
        if obj.farmers_association:
            return obj.farmers_association.barangay
        return None

    def get_parcel_number(self, obj):
        if obj.farm_parcel:
            return obj.farm_parcel.parcel_number
        return None

    def get_association_name(self, obj):
        if obj.farmers_association:
            return obj.farmers_association.name
        return None

    def get_is_near_harvest(self, obj):
        if obj.expected_harvest_date and obj.status == CropMonitoringRecord.Status.PLANTED:
            delta = (obj.expected_harvest_date - date.today()).days
            return 0 <= delta <= 7
        return False

    def get_latest_condition(self, obj):
        log = obj.activity_logs.order_by('-date_of_activity').first()
        if log and log.plant_condition:
            return log.plant_condition
        return None

    def get_log_count(self, obj):
        return obj.activity_logs.count()

    def get_labor_log_count(self, obj):
        return obj.labor_logs.count()

    def get_disasters_count(self, obj):
        return obj.disaster_reports.filter(status='Active').count()

    def get_has_resolved_disaster(self, obj):
        return obj.disaster_reports.filter(status='Resolved').exists()

    def get_has_harvest(self, obj):
        return obj.status == CropMonitoringRecord.Status.HARVESTED

    def get_harvest_record_id(self, obj):
        hr = obj.harvest_records.first()
        return hr.id if hr else None

    def get_harvest_count(self, obj):
        return obj.harvest_records.count()

    def get_disaster_report_count(self, obj):
        return obj.disaster_reports.count()

    def get_harvest_variance_days(self, obj):
        hr = obj.harvest_records.first()
        return hr.harvest_variance_days if hr else None

    def validate(self, data):
        seed_source = data.get('seed_source', getattr(self.instance, 'seed_source', ''))
        seed_source_other = data.get('seed_source_other_specify', getattr(self.instance, 'seed_source_other_specify', ''))
        if seed_source == 'Other' and not (seed_source_other or '').strip():
            raise serializers.ValidationError({'seed_source_other_specify': 'Please specify the seed source.'})

        land_status = data.get('land_status', getattr(self.instance, 'land_status', ''))
        land_status_other = data.get('land_status_other_specify', getattr(self.instance, 'land_status_other_specify', ''))
        if land_status == 'Other' and not (land_status_other or '').strip():
            raise serializers.ValidationError({'land_status_other_specify': 'Please specify the land status.'})
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


class HarvestRecordSerializer(serializers.ModelSerializer):
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
