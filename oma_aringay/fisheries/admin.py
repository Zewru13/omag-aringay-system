from django.contrib import admin

from .models import (
    AquacultureRecord,
    CaptureRecord,
    DiseaseResponseGuide,
    DiseaseType,
    FeedType,
    FisheriesActivityLog,
    FisheriesDisasterReport,
    FisheriesDisasterResponseRule,
    FisheriesHarvestRecord,
    Fisherfolk,
    SpeciesActivityStage,
    SpeciesCategory,
    SpeciesOption,
    StockingRecord,
)


@admin.register(Fisherfolk)
class FisherfolkAdmin(admin.ModelAdmin):
    list_display = ['lgu_registration_number', 'full_name', 'fisherfolk_type', 'barangay', 'is_active']
    list_filter  = ['fisherfolk_type', 'barangay', 'is_active', 'gender']
    search_fields = ['first_name', 'last_name', 'lgu_registration_number', 'fishr_number']
    ordering = ['-date_registered']


@admin.register(AquacultureRecord)
class AquacultureRecordAdmin(admin.ModelAdmin):
    list_display = ['fisherfolk', 'culture_type', 'culture_type_other_specify', 'species_cultured', 'species_cultured_other_specify', 'area_hectares']


@admin.register(CaptureRecord)
class CaptureRecordAdmin(admin.ModelAdmin):
    list_display = ['fisherfolk', 'vessel_type', 'fishing_gear_type', 'fishing_ground', 'vessel_material_other_specify']


@admin.register(SpeciesCategory)
class SpeciesCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'date_created']


class SpeciesActivityStageInline(admin.TabularInline):
    model = SpeciesActivityStage
    extra = 0
    fields = ['activity_name', 'application_days', 'priority', 'window_days', 'order']


@admin.register(SpeciesOption)
class SpeciesOptionAdmin(admin.ModelAdmin):
    list_display  = ['species_name', 'category', 'culture_environment', 'culture_duration_days']
    list_filter   = ['category', 'culture_environment']
    inlines       = [SpeciesActivityStageInline]


@admin.register(SpeciesActivityStage)
class SpeciesActivityStageAdmin(admin.ModelAdmin):
    list_display = ['species_option', 'activity_name', 'day_after_stocking', 'priority']
    list_filter  = ['species_option', 'priority']


@admin.register(StockingRecord)
class StockingRecordAdmin(admin.ModelAdmin):
    list_display  = ['fisherfolk', 'species', 'date_stocked', 'season', 'year', 'status', 'expected_harvest_date']
    list_filter   = ['status', 'season', 'year', 'pond_location_barangay']
    search_fields = ['fisherfolk__first_name', 'fisherfolk__last_name', 'species__species_name']
    ordering      = ['-date_recorded']


@admin.register(FisheriesActivityLog)
class FisheriesActivityLogAdmin(admin.ModelAdmin):
    list_display = ['stocking_record', 'activity', 'date_of_activity', 'water_fish_condition', 'disease_type']
    list_filter  = ['water_fish_condition', 'severity', 'disease_type']


@admin.register(FeedType)
class FeedTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'growth_stage', 'is_active']
    list_filter  = ['growth_stage', 'is_active']
    filter_horizontal = ['species_options']


@admin.register(DiseaseType)
class DiseaseTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active']


@admin.register(DiseaseResponseGuide)
class DiseaseResponseGuideAdmin(admin.ModelAdmin):
    list_display = ['disease_type']
    list_filter  = ['disease_type']


@admin.register(FisheriesDisasterReport)
class FisheriesDisasterReportAdmin(admin.ModelAdmin):
    list_display = ['stocking_record', 'disaster_type', 'date_of_occurrence']
    list_filter  = ['disaster_type']


@admin.register(FisheriesDisasterResponseRule)
class FisheriesDisasterResponseRuleAdmin(admin.ModelAdmin):
    list_display = ['disaster_type', 'species', 'title', 'activity_name', 'priority']
    list_filter  = ['disaster_type', 'activity_name', 'priority']
    fields       = ['disaster_type', 'species', 'title', 'action', 'activity_name', 'recommendation', 'priority']


@admin.register(FisheriesHarvestRecord)
class FisheriesHarvestRecordAdmin(admin.ModelAdmin):
    list_display = ['stocking_record', 'harvest_date', 'quantity_kg', 'is_final']
    list_filter  = ['is_final']
