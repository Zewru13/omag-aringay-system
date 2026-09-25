from rest_framework import serializers

from core.validators import validate_not_future_date

from .models import FarmVisit


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

    def validate_visit_date(self, value):
        validate_not_future_date(value, 'Visit date')
        return value
    # next_visit_date deliberately NOT capped — it's a planned future visit.
