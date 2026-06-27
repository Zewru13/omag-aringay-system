from decimal import Decimal
from rest_framework import serializers
from datetime import date

from farmers.models import FarmParcel

from .models import (
    BarangayCropSummary, CropActivityLog, CropActivityStage, CropCategory,
    CropDisasterReport, CropMonitoringRecord, CropRemark, CropSubcategory, CropType,
    DamageReport, FarmInputLog, HarvestRecord, LaborOperationLog, PestDiseaseReport, PlantingRecord,
)


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
            'suggested_activities', 'remarks',
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
        fields = ['id', 'crop_type', 'stage_name', 'day_after_planting', 'recommendation', 'priority']
        read_only_fields = ['id', 'crop_type']


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
            'id', 'monitoring_record', 'activity_type', 'activity_date',
            'plant_condition', 'status_at_log', 'notes',
            'fertilizer_type', 'quantity_applied', 'quantity_unit',
            'pest_disease_name', 'area_affected_ha', 'severity',
            'recorded_by', 'logged_by_name',
        ]
        read_only_fields = ['id', 'monitoring_record', 'recorded_by']

    def get_logged_by_name(self, obj):
        if obj.recorded_by:
            return getattr(obj.recorded_by, 'full_name', str(obj.recorded_by))
        return None


class CropDisasterReportSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CropDisasterReport
        fields = [
            'id', 'monitoring_record', 'disaster_type', 'date_of_occurrence',
            'area_affected_ha', 'estimated_damage', 'production_loss',
            'reported_by', 'reported_by_name', 'date_reported',
        ]
        read_only_fields = ['id', 'monitoring_record', 'reported_by', 'reported_by_name', 'date_reported']

    def get_reported_by_name(self, obj):
        if obj.reported_by:
            return getattr(obj.reported_by, 'full_name', str(obj.reported_by))
        return None


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
    farmer_name      = serializers.SerializerMethodField()
    farmer_barangay  = serializers.SerializerMethodField()
    parcel_number    = serializers.SerializerMethodField()
    association_name = serializers.SerializerMethodField()
    crop_type_name   = serializers.CharField(source='crop_type.name', read_only=True)
    crop_suggested_activities = serializers.CharField(source='crop_type.suggested_activities', read_only=True)
    is_near_harvest  = serializers.SerializerMethodField()
    latest_condition = serializers.SerializerMethodField()
    log_count        = serializers.SerializerMethodField()
    labor_log_count  = serializers.SerializerMethodField()

    class Meta:
        model = CropMonitoringRecord
        fields = [
            'id', 'farm_parcel', 'farmers_association',
            'farmer_name', 'farmer_barangay', 'parcel_number', 'association_name',
            'crop_type', 'crop_type_name', 'crop_suggested_activities', 'season', 'year',
            'date_planted', 'area_planted_ha',
            'expected_harvest_date', 'actual_harvest_date',
            'status', 'current_growth_stage',
            'estimated_yield_kg', 'actual_yield_kg',
            'yield_variance_kg', 'yield_variance_pct',
            'notes', 'variety_used', 'seed_source', 'quantity_of_seeds', 'seed_quantity_unit',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'latest_condition', 'log_count', 'labor_log_count',
        ]
        read_only_fields = [
            'id', 'farmer_name', 'farmer_barangay', 'parcel_number', 'association_name',
            'crop_type_name', 'crop_suggested_activities',
            'expected_harvest_date', 'estimated_yield_kg',
            'yield_variance_kg', 'yield_variance_pct',
            'recorded_by', 'date_recorded',
            'is_near_harvest', 'latest_condition', 'log_count', 'labor_log_count',
        ]

    def get_farmer_name(self, obj):
        if obj.farm_parcel and obj.farm_parcel.farmer:
            return obj.farm_parcel.farmer.full_name
        return None

    def get_farmer_barangay(self, obj):
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
        if obj.expected_harvest_date and obj.status == CropMonitoringRecord.Status.ACTIVE:
            delta = (obj.expected_harvest_date - date.today()).days
            return 0 <= delta <= 14
        return False

    def get_latest_condition(self, obj):
        log = obj.activity_logs.order_by('-activity_date').first()
        if log and log.plant_condition:
            return log.plant_condition
        return None

    def get_log_count(self, obj):
        return obj.activity_logs.count()

    def get_labor_log_count(self, obj):
        return obj.labor_logs.count()


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
        start = data.get('harvest_start_date')
        end = data.get('harvest_end_date')
        if start and end and end < start:
            raise serializers.ValidationError({
                'harvest_end_date': 'Harvest end date must be on or after the harvest start date.',
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
            'remarks',
        ]
        read_only_fields = ['id', 'yield_per_hectare_kg']

    def validate(self, data):
        start = data.get('harvest_start_date')
        end = data.get('harvest_end_date')
        if start and end and end < start:
            raise serializers.ValidationError({
                'harvest_end_date': 'Harvest end date must be on or after the harvest start date.',
            })
        return data


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
