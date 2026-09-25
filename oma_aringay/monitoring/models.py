from django.conf import settings
from django.db import models

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


# ─── Aquaculture Production Cycle (RESTORED from commit 4da000a0) ────────────
# Retired in 18d070ec (migration 0014) and restored verbatim; see migration 0017.

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
    # Optional. Must be an organization the fisherfolk is registered with (checked in the serializer).
    organization = models.ForeignKey(
        'associations.FisherfolkOrganization',
        on_delete=models.SET_NULL,
        null=True, blank=True,
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

class AquacultureProductionUnit(models.Model):
    """One pond or cage inside a production cycle (Fishpond / Fishcage systems only).
    Cycles created before this model existed, and other culture systems, have none."""
    UNIT_TYPE_CHOICES = [
        ('pond', 'Pond'),
        ('cage', 'Cage'),
    ]

    production_cycle = models.ForeignKey(
        AquacultureProductionCycle,
        on_delete=models.CASCADE,
        related_name='units',
    )
    unit_type = models.CharField(max_length=4, choices=UNIT_TYPE_CHOICES)
    unit_number = models.PositiveIntegerField()
    # Physical dimensions. NULL on units created before dimensions existed (only size_sqm is known there).
    length_m = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    width_m = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    # Derived from length_m x width_m server-side for new units; legacy units keep their original value.
    size_sqm = models.DecimalField(max_digits=10, decimal_places=2)
    # ACTUAL number stocked (user-editable). Feeds the cycle's total and the linked StockingRecord.
    fingerling_count = models.PositiveIntegerField()
    # DEPRECATED / UNUSED: the Recommended Fingerlings feature was removed from the application. The
    # nullable column is intentionally left in the schema (no data, no migration) and is never read or written.
    recommended_fingerlings = models.PositiveIntegerField(null=True, blank=True)
    class Meta:
        ordering = ['unit_number']
        constraints = [
            models.UniqueConstraint(
                fields=['production_cycle', 'unit_type', 'unit_number'],
                name='unique_unit_number_per_cycle',
            ),
            models.CheckConstraint(check=models.Q(size_sqm__gt=0), name='production_unit_size_positive'),
            models.CheckConstraint(check=models.Q(fingerling_count__gt=0), name='production_unit_fingerlings_positive'),
            models.CheckConstraint(check=models.Q(length_m__isnull=True) | models.Q(length_m__gt=0), name='production_unit_length_positive'),
            models.CheckConstraint(check=models.Q(width_m__isnull=True) | models.Q(width_m__gt=0), name='production_unit_width_positive'),
        ]

    def __str__(self):
        return f'{self.get_unit_type_display()} {self.unit_number} ({self.size_sqm} sqm, {self.fingerling_count} fingerlings)'



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


class AquacultureFeedingLogUnit(models.Model):
    """How much of one feeding (AquacultureFeedingLog.quantity_kg, the total) went to one
    pond/cage of the cycle. Feedings logged before this existed, and cycles without units, have none."""
    feeding_log = models.ForeignKey(
        AquacultureFeedingLog,
        on_delete=models.CASCADE,
        related_name='unit_quantities',
    )
    production_unit = models.ForeignKey(
        AquacultureProductionUnit,
        on_delete=models.CASCADE,
        related_name='feeding_quantities',
    )
    quantity_kg = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        ordering = ['production_unit__unit_number']
        constraints = [
            models.UniqueConstraint(fields=['feeding_log', 'production_unit'], name='unique_unit_per_feeding_log'),
            models.CheckConstraint(check=models.Q(quantity_kg__gte=0), name='feeding_unit_quantity_non_negative'),
        ]

    def __str__(self):
        return f'{self.production_unit} - {self.quantity_kg}kg'


# Health Log observations that are diseases (the disease entries of the Health Log's own observation
# list). Fish Mortality is handled separately. A free-text "Other" observation is not classified.
HEALTH_DISEASE_OBSERVATIONS = {
    'bacterial infection', 'fungal infection', 'fin rot', 'gill disease', 'white spot (ich)', 'parasites',
}


def health_requires_force_harvest(observation, mortality_count=0):
    """Force Harvest defaults to YES for fish mortality or any disease. It is a status/recommendation
    only - recording it never creates a harvest (Record Harvest stays a separate workflow)."""
    obs = (observation or '').strip().lower()
    return obs == 'fish mortality' or (mortality_count or 0) > 0 or obs in HEALTH_DISEASE_OBSERVATIONS


class AquacultureHealthLog(models.Model):
    production_cycle = models.ForeignKey(
        AquacultureProductionCycle,
        on_delete=models.CASCADE,
        related_name='health_logs',
    )
    # The pond/cage this health event refers to (one of the cycle's own production units; checked in the
    # serializer). NULL on logs saved before this existed and on cycles without production units.
    production_unit = models.ForeignKey(
        AquacultureProductionUnit,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='health_logs',
    )
    log_date = models.DateField()
    observation = models.CharField(max_length=200)
    mortality_count = models.PositiveIntegerField(default=0)
    treatment_applied = models.CharField(max_length=200, blank=True)
    vet_consulted = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    # Set by the backend from the observation (see health_requires_force_harvest); never client-writable.
    force_harvest = models.BooleanField(default=False)

    def __str__(self):
        return f'Health log {self.log_date} — {self.observation}'


def cycle_force_status(cycle_id):
    """Force Harvest conditions in a production cycle's Health Log, per pond/cage.

    Returns ({unit_id: [observation, ...]}, unassigned):
      - the first is every unit that has its OWN mortality/disease log, with the distinct reasons;
      - `unassigned` is True when such a log is not tied to any unit (logs saved before affected
        units existed, and cycles without units) - those are never attributed to a guessed unit.
    Same classification as AquacultureHealthLog.force_harvest, so pre-flag logs are covered too."""
    units, unassigned = {}, False
    if not cycle_id:
        return units, unassigned
    logs = AquacultureHealthLog.objects.filter(production_cycle_id=cycle_id).order_by('log_date', 'id')
    for unit_id, observation, mortality_count in logs.values_list('production_unit_id', 'observation', 'mortality_count'):
        if not health_requires_force_harvest(observation, mortality_count):
            continue
        if unit_id is None:
            unassigned = True
            continue
        reasons = units.setdefault(unit_id, [])
        if observation.strip() not in reasons:
            reasons.append(observation.strip())
    return units, unassigned


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
