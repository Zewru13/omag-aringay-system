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


class AquacultureProductionCycle(models.Model):
    CULTURE_SYSTEM_CHOICES = [
        ('Fishpond', 'Fishpond'),
        ('Fishcage', 'Fishcage'),
        ('Fishpen', 'Fishpen'),
        ('Oyster', 'Oyster Culture'),
        ('Mussel', 'Mussel Culture'),
        ('Seaweed', 'Seaweed Farming'),
        ('Other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Harvested', 'Harvested'),
        ('Failed', 'Failed'),
        ('Abandoned', 'Abandoned'),
    ]

    fisherfolk = models.ForeignKey(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='production_cycles',
    )
    cycle_name = models.CharField(max_length=150)
    species_farmed = models.CharField(max_length=100)
    culture_system = models.CharField(max_length=20, choices=CULTURE_SYSTEM_CHOICES)
    stocking_date = models.DateField()
    stocking_count = models.PositiveIntegerField(null=True, blank=True)
    stocking_density = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    area_sqm = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_harvest_date = models.DateField(null=True, blank=True)
    actual_harvest_date = models.DateField(null=True, blank=True)
    harvest_volume_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='Active')
    area_cage_harvested = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recorded_production_cycles',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.cycle_name} — {self.species_farmed} ({self.stocking_date})'


class AquacultureFeedingLog(models.Model):
    production_cycle = models.ForeignKey(
        AquacultureProductionCycle,
        on_delete=models.CASCADE,
        related_name='feeding_logs',
    )
    feeding_date = models.DateField()
    feed_type = models.CharField(max_length=100)
    quantity_kg = models.DecimalField(max_digits=8, decimal_places=2)
    notes = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f'Feeding {self.feed_type} {self.quantity_kg}kg ({self.feeding_date})'


class AquacultureHealthLog(models.Model):
    production_cycle = models.ForeignKey(
        AquacultureProductionCycle,
        on_delete=models.CASCADE,
        related_name='health_logs',
    )
    log_date = models.DateField()
    observation = models.CharField(max_length=200)
    mortality_count = models.PositiveIntegerField(default=0)
    treatment_applied = models.CharField(max_length=200, blank=True)
    vet_consulted = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f'Health log {self.log_date} — {self.observation}'


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


class FisheryInputLog(models.Model):
    INPUT_TYPE_CHOICES = [
        ('Feed', 'Feed'),
        ('Fingerlings/Seeds', 'Fingerlings/Seeds'),
        ('Fertilizer', 'Fertilizer'),
        ('Chemicals', 'Chemicals'),
        ('Equipment', 'Equipment'),
        ('Labor', 'Labor'),
        ('Other', 'Other'),
    ]
    UNIT_CHOICES = [
        ('kg', 'kg'),
        ('g', 'g'),
        ('L', 'L'),
        ('mL', 'mL'),
        ('pcs', 'pieces'),
        ('bags', 'bags'),
        ('boxes', 'boxes'),
        ('other', 'other'),
    ]

    production_cycle = models.ForeignKey(
        AquacultureProductionCycle,
        on_delete=models.CASCADE,
        related_name='input_logs',
    )
    input_type = models.CharField(max_length=30, choices=INPUT_TYPE_CHOICES)
    item_name = models.CharField(max_length=150)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES)
    date_acquired = models.DateField()
    source = models.CharField(max_length=150, blank=True)
    notes = models.CharField(max_length=200, blank=True)
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='fishery_input_logs',
    )
    date_logged = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.input_type}: {self.item_name} ({self.date_acquired})'


