from rest_framework import serializers

from .models import (
    AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle,
    FarmVisit, FisherfolkDisasterReport, FisheryInputLog,
)


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
