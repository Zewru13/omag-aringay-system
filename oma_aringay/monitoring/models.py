from django.conf import settings
from django.db import models

from core.constants import BARANGAY_CHOICES
from farmers.models import Farmer
from fisheries.models import Fisherfolk


class FarmVisit(models.Model):
    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.CASCADE,
        related_name='farm_visits',
    )
    visit_date = models.DateField()
    next_visit_date = models.DateField(null=True, blank=True)
    purpose = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    conducted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='conducted_farm_visits',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Visit to {self.farmer} on {self.visit_date}'


class FisherfolkDisasterReport(models.Model):
    DISASTER_TYPE_CHOICES = [
        ('Typhoon', 'Typhoon'),
        ('Flooding', 'Flooding'),
        ('Storm Surge', 'Storm Surge'),
        ('El Nino Drought', 'El Niño / Drought'),
        ('Red Tide', 'Red Tide'),
        ('Disease Outbreak', 'Disease Outbreak'),
        ('Other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('Reported', 'Reported'),
        ('Verified', 'Verified'),
        ('Closed', 'Closed'),
    ]

    fisherfolk = models.ForeignKey(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='disaster_reports',
    )
    report_date = models.DateField()
    disaster_type = models.CharField(max_length=30, choices=DISASTER_TYPE_CHOICES)
    affected_barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    description = models.TextField()
    # Dormant (Batch E): estimated peso loss is no longer collected for
    # fisherfolk-level disasters — dropped from the form, serializer and table
    # UI. Column retained (not migrated away) so existing rows keep their data.
    estimated_loss_php = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    volume_lost_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    equipment_damaged = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Reported')
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recorded_fisheries_disasters',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.disaster_type} — {self.fisherfolk} ({self.report_date})'

