from datetime import date

from rest_framework import serializers

from .models import (
    AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle,
    FarmVisit, FisheriesAssistanceRecord, FisherfolkDisasterReport,
    FisheryInputLog, FishingTripLog, TripSpeciesEntry, VesselInspection,
)


class TripSpeciesEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = TripSpeciesEntry
        fields = ['id', 'fishing_trip', 'species_name', 'volume_kg', 'notes']
        read_only_fields = ['id', 'fishing_trip']


class FarmVisitSerializer(serializers.ModelSerializer):
    farmer_name = serializers.CharField(source='farmer.full_name', read_only=True)
    farmer_barangay = serializers.CharField(source='farmer.barangay', read_only=True)

    class Meta:
        model = FarmVisit
        fields = [
            'id', 'farmer', 'farmer_name', 'farmer_barangay',
            'visit_date', 'next_visit_date', 'purpose', 'notes',
            'conducted_by', 'date_recorded',
        ]
        read_only_fields = ['id', 'farmer_name', 'farmer_barangay', 'conducted_by', 'date_recorded']


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


class FisheryInputLogSerializer(serializers.ModelSerializer):
    logged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FisheryInputLog
        fields = [
            'id', 'production_cycle', 'input_type', 'item_name', 'quantity', 'unit',
            'date_acquired', 'source', 'notes',
            'logged_by', 'logged_by_name', 'date_logged',
        ]
        read_only_fields = ['id', 'production_cycle', 'logged_by', 'logged_by_name', 'date_logged']

    def get_logged_by_name(self, obj):
        return obj.logged_by.full_name if obj.logged_by else None


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


class AquacultureFeedingLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AquacultureFeedingLog
        fields = ['id', 'production_cycle', 'feeding_date', 'feed_type', 'quantity_kg', 'notes']
        read_only_fields = ['id', 'production_cycle']


class AquacultureHealthLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AquacultureHealthLog
        fields = [
            'id', 'production_cycle', 'log_date', 'observation',
            'mortality_count', 'treatment_applied', 'vet_consulted', 'notes',
        ]
        read_only_fields = ['id', 'production_cycle']


class AquacultureProductionCycleSerializer(serializers.ModelSerializer):
    fisherfolk_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)
    fisherfolk_barangay = serializers.CharField(source='fisherfolk.barangay', read_only=True)
    feeding_logs = AquacultureFeedingLogSerializer(many=True, read_only=True)
    health_logs = AquacultureHealthLogSerializer(many=True, read_only=True)
    input_logs = FisheryInputLogSerializer(many=True, read_only=True)

    class Meta:
        model = AquacultureProductionCycle
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name', 'fisherfolk_barangay', 'cycle_name', 'species_farmed',
            'culture_system', 'stocking_date', 'stocking_count', 'stocking_density',
            'area_sqm', 'target_harvest_date', 'actual_harvest_date',
            'harvest_volume_kg',
            'status', 'area_cage_harvested', 'notes', 'recorded_by', 'date_recorded',
            'feeding_logs', 'health_logs', 'input_logs',
        ]
        read_only_fields = [
            'id', 'fisherfolk_name', 'fisherfolk_barangay',
            'recorded_by', 'date_recorded', 'feeding_logs', 'health_logs', 'input_logs',
        ]


class FisherfolkDisasterReportSerializer(serializers.ModelSerializer):
    fisherfolk_name = serializers.CharField(source='fisherfolk.full_name', read_only=True)

    class Meta:
        model = FisherfolkDisasterReport
        fields = [
            'id', 'fisherfolk', 'fisherfolk_name', 'report_date', 'disaster_type',
            'affected_barangay', 'description', 'estimated_loss_php', 'volume_lost_kg',
            'equipment_damaged', 'status', 'recorded_by', 'date_recorded',
        ]
        read_only_fields = ['id', 'fisherfolk_name', 'recorded_by', 'date_recorded']
