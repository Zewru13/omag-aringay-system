from rest_framework import serializers

from .models import FarmVisit, FisherfolkDisasterReport


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
