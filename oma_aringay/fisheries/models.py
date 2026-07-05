from decimal import Decimal
from datetime import timedelta, date

from django.conf import settings
from django.db import models

from core.constants import BARANGAY_CHOICES


# ─── Fisherfolk ───────────────────────────────────────────────────────────────

class Fisherfolk(models.Model):
    class Gender(models.TextChoices):
        MALE   = 'Male',   'Male'
        FEMALE = 'Female', 'Female'

    class FisherfolkType(models.TextChoices):
        AQUACULTURE = 'Aquaculture', 'Aquaculture'
        CAPTURE     = 'Capture',     'Capture Fishery'
        MARICULTURE = 'Mariculture', 'Mariculture'
        INLAND      = 'Inland',      'Inland Fishery'
        VENDOR      = 'Vendor',      'Fish Vendor'

    class CivilStatus(models.TextChoices):
        SINGLE    = 'Single',    'Single'
        MARRIED   = 'Married',   'Married'
        WIDOWED   = 'Widowed',   'Widowed'
        SEPARATED = 'Separated', 'Separated'

    class Prefix(models.TextChoices):
        MR   = 'Mr.',   'Mr.'
        MRS  = 'Mrs.',  'Mrs.'
        MS   = 'Ms.',   'Ms.'
        ENGR = 'Engr.', 'Engr.'
        DR   = 'Dr.',   'Dr.'
        HON  = 'Hon.',  'Hon.'

    ASSOCIATION_POSITION_CHOICES = [
        ('President',        'President'),
        ('Chairperson',      'Chairperson'),
        ('Vice President',   'Vice President'),
        ('Vice Chairperson', 'Vice Chairperson'),
        ('Secretary',        'Secretary'),
        ('Treasurer',        'Treasurer'),
        ('Auditor',          'Auditor'),
        ('Board Member',     'Board Member'),
        ('Manager',          'Manager'),
        ('Member',           'Member'),
    ]

    prefix = models.CharField(max_length=10, choices=Prefix.choices, blank=True, default='')
    lgu_registration_number = models.CharField(max_length=50, unique=True, blank=True, default='')
    fishr_number = models.CharField(
        max_length=50, unique=True, null=True, blank=True,
        help_text='National FishR registry number (BFAR)',
    )
    first_name    = models.CharField(max_length=100)
    last_name     = models.CharField(max_length=100)
    middle_name   = models.CharField(max_length=100, blank=True)
    gender        = models.CharField(max_length=10, choices=Gender.choices)
    birthdate     = models.DateField()
    contact_number = models.CharField(max_length=20, blank=True)
    barangay      = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    municipality  = models.CharField(max_length=100, default='Aringay')
    civil_status  = models.CharField(max_length=20, choices=CivilStatus.choices, blank=True, default='')
    highest_education = models.CharField(max_length=150, blank=True)
    philsys_number    = models.CharField(max_length=50, blank=True)
    fisherfolk_type = models.CharField(max_length=20, choices=FisherfolkType.choices)
    is_pwd             = models.BooleanField(default=False)
    is_4ps_beneficiary = models.BooleanField(default=False)
    is_icc_ip_member   = models.BooleanField(default=False)
    icc_ip_name        = models.CharField(max_length=150, blank=True)
    is_senior_citizen  = models.BooleanField(default=False)
    is_active          = models.BooleanField(default=True)
    date_registered    = models.DateTimeField(auto_now_add=True)
    fisherfolk_association = models.ForeignKey(
        'associations.FisherfolkAssociation',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='direct_members',
        help_text='Association this fisherfolk belongs to (optional)',
    )
    association_position = models.CharField(
        max_length=20,
        choices=ASSOCIATION_POSITION_CHOICES,
        blank=True, default='',
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='registered_fisherfolk',
    )

    # Aquaculture / Mariculture facility profile fields (retained from prior model)
    facility_location   = models.CharField(max_length=200, blank=True)
    pond_area_ha        = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    number_of_ponds     = models.PositiveIntegerField(null=True, blank=True)
    water_source        = models.CharField(max_length=100, blank=True)
    number_of_cages     = models.PositiveIntegerField(null=True, blank=True)
    cage_dimensions     = models.CharField(max_length=100, blank=True)
    fish_registration_number = models.CharField(max_length=20, blank=True)
    boat_registration_number = models.CharField(max_length=20, blank=True)
    has_vessel          = models.BooleanField(default=True)

    @property
    def full_name(self):
        return ' '.join(n for n in [self.first_name, self.middle_name, self.last_name] if n).strip()

    @property
    def age(self):
        if not self.birthdate:
            return None
        today = date.today()
        return today.year - self.birthdate.year - (
            (today.month, today.day) < (self.birthdate.month, self.birthdate.day)
        )

    def save(self, *args, **kwargs):
        self.is_senior_citizen = bool(self.birthdate and self.age is not None and self.age >= 60)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.lgu_registration_number} - {self.full_name}'


# ─── Legacy per-type sub-records (unchanged) ──────────────────────────────────

class AquacultureRecord(models.Model):
    class CultureType(models.TextChoices):
        FISH_CAGE  = 'Fish Cage',  'Fish Cage'
        FISH_POND  = 'Fish Pond',  'Fish Pond'
        FISH_PEN   = 'Fish Pen',   'Fish Pen'
        POND_CAGE  = 'Pond Cage',  'Pond Cage'
        PEN_TANK   = 'Pen Tank',   'Pen Tank'
        OTHER      = 'Other',      'Other'

    fisherfolk          = models.OneToOneField(Fisherfolk, on_delete=models.CASCADE, related_name='aquaculture_record')
    culture_type        = models.CharField(max_length=30, choices=CultureType.choices)
    species_cultured    = models.CharField(max_length=100)
    area_hectares       = models.DecimalField(max_digits=10, decimal_places=2)
    fingerlings_stocked = models.PositiveIntegerField()
    production_volume_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f'Aquaculture - {self.fisherfolk.lgu_registration_number}'


class CaptureRecord(models.Model):
    class VesselType(models.TextChoices):
        MOTORIZED     = 'Motorized',     'Motorized'
        NON_MOTORIZED = 'Non-Motorized', 'Non-Motorized'
        NO_VESSEL     = 'No Vessel',     'No Vessel'

    class VesselMaterial(models.TextChoices):
        WOODEN    = 'Wooden',    'Wooden'
        COMPOSITE = 'Composite', 'Composite'
        FIBERGLASS = 'Fiberglass', 'Fiberglass'
        STEEL     = 'Steel',     'Steel'
        OTHER     = 'Other',     'Other'

    fisherfolk                  = models.OneToOneField(Fisherfolk, on_delete=models.CASCADE, related_name='capture_record')
    vessel_type                 = models.CharField(max_length=20, choices=VesselType.choices)
    vessel_material             = models.CharField(max_length=20, choices=VesselMaterial.choices, blank=True, null=True)
    vessel_registration_number  = models.CharField(max_length=100, blank=True)
    fishing_gear_type           = models.CharField(max_length=100)
    fishing_ground              = models.CharField(max_length=100)
    average_catch_per_trip_kg   = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f'Capture - {self.fisherfolk.lgu_registration_number}'


class VendorRecord(models.Model):
    class LocationType(models.TextChoices):
        FIXED_STALL  = 'Fixed Stall',                  'Fixed Stall'
        MARKET_STALL = 'Market Stall',                 'Market Stall'
        AMBULANT     = 'Ambulant / No Fixed Location', 'Ambulant / No Fixed Location'
        OTHER        = 'Other',                        'Other'

    fisherfolk             = models.OneToOneField(Fisherfolk, on_delete=models.CASCADE, related_name='vendor_record')
    location_type          = models.CharField(max_length=30, choices=LocationType.choices, default=LocationType.FIXED_STALL)
    stall_location         = models.CharField(max_length=150, blank=True, null=True)
    type_of_products_sold  = models.CharField(max_length=150, verbose_name='Commodity')
    source_of_fish         = models.CharField(max_length=150)

    def __str__(self):
        return f'Vendor - {self.fisherfolk.lgu_registration_number}'


# ─── Species reference data ────────────────────────────────────────────────────

class SpeciesCategory(models.Model):
    name         = models.CharField(max_length=100, unique=True)
    date_created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Species Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class SpeciesOption(models.Model):
    class CultureEnvironment(models.TextChoices):
        FRESHWATER    = 'Freshwater',    'Freshwater'
        BRACKISHWATER = 'Brackishwater', 'Brackishwater'
        MARINE        = 'Marine',        'Marine'

    species_name              = models.CharField(max_length=150, unique=True)
    category                  = models.ForeignKey(SpeciesCategory, on_delete=models.CASCADE, related_name='species')
    culture_environment       = models.CharField(max_length=20, choices=CultureEnvironment.choices)
    culture_duration_days     = models.IntegerField()
    default_survival_rate_pct = models.DecimalField(max_digits=5, decimal_places=2)
    default_avg_body_weight_kg = models.DecimalField(max_digits=8, decimal_places=3)

    class Meta:
        ordering = ['species_name']

    def __str__(self):
        return self.species_name


class SpeciesActivityStage(models.Model):
    class Priority(models.TextChoices):
        HIGH   = 'HIGH',   'High'
        MEDIUM = 'MEDIUM', 'Medium'
        LOW    = 'LOW',    'Low'

    species_option   = models.ForeignKey(SpeciesOption, on_delete=models.CASCADE, related_name='stages')
    activity_name    = models.CharField(max_length=150)
    day_after_stocking = models.PositiveIntegerField(default=0)
    application_days = models.JSONField(default=list, blank=True)
    recommendation   = models.TextField(blank=True)
    priority         = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    window_days      = models.IntegerField(default=3)
    order            = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['species_option', 'order', 'day_after_stocking']

    def __str__(self):
        return f'{self.species_option.species_name} — Day {self.day_after_stocking}: {self.activity_name}'


# ─── Stocking Record ──────────────────────────────────────────────────────────

class StockingRecord(models.Model):
    class Status(models.TextChoices):
        STOCKED     = 'Stocked',     'Stocked'
        FOR_HARVEST = 'For Harvest', 'For Harvest'
        HARVESTED   = 'Harvested',   'Harvested'

    CULTURE_TYPE_CHOICES = [
        ('Pond', 'Pond'),
        ('Cage', 'Cage'),
        ('Pen',  'Pen'),
    ]
    LAND_STATUS_CHOICES = [
        ('Owner',  'Owner'),
        ('Lessee', 'Lessee'),
        ('Tenant', 'Tenant'),
        ('Other',  'Other'),
    ]

    fisherfolk              = models.ForeignKey(Fisherfolk, on_delete=models.SET_NULL, null=True, blank=True, related_name='stocking_records')
    pond_location_barangay  = models.CharField(max_length=100, blank=True, default='')
    land_status             = models.CharField(max_length=20, choices=LAND_STATUS_CHOICES, blank=True)
    culture_type            = models.CharField(max_length=10, choices=CULTURE_TYPE_CHOICES)
    species                 = models.ForeignKey(SpeciesOption, on_delete=models.PROTECT, related_name='stocking_records')
    date_stocked            = models.DateField()
    area_hectares           = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    number_of_fingerlings   = models.IntegerField()
    survival_rate_pct       = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    avg_body_weight_kg      = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    season                  = models.CharField(max_length=10, choices=[('Wet', 'Wet'), ('Dry', 'Dry')])
    year                    = models.IntegerField()
    status                  = models.CharField(max_length=20, choices=Status.choices, default=Status.STOCKED)
    expected_harvest_date   = models.DateField(null=True, blank=True)
    estimated_harvest_kg    = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    notes                   = models.TextField(blank=True)
    recorded_by             = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='stocking_records',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['expected_harvest_date']),
            models.Index(fields=['pond_location_barangay']),
            models.Index(fields=['status', 'expected_harvest_date']),
        ]

    def save(self, *args, **kwargs):
        if self.date_stocked and self.species_id:
            try:
                sp = SpeciesOption.objects.get(pk=self.species_id)
                self.expected_harvest_date = self.date_stocked + timedelta(days=sp.culture_duration_days)
                # Set defaults from species only on first create
                if not self.pk:
                    if not self.survival_rate_pct:
                        self.survival_rate_pct = sp.default_survival_rate_pct
                    if not self.avg_body_weight_kg:
                        self.avg_body_weight_kg = sp.default_avg_body_weight_kg
            except SpeciesOption.DoesNotExist:
                pass

        # Compute estimated_harvest_kg
        if (self.number_of_fingerlings is not None
                and self.survival_rate_pct is not None
                and self.avg_body_weight_kg is not None):
            self.estimated_harvest_kg = (
                Decimal(str(self.number_of_fingerlings))
                * (Decimal(str(self.survival_rate_pct)) / Decimal('100'))
                * Decimal(str(self.avg_body_weight_kg))
            ).quantize(Decimal('0.01'))

        # Auto-transition: Stocked → For Harvest when within 14 days of expected harvest
        if self.expected_harvest_date and self.status == self.Status.STOCKED:
            days_remaining = (self.expected_harvest_date - date.today()).days
            if days_remaining <= 14:
                self.status = self.Status.FOR_HARVEST

        super().save(*args, **kwargs)

    def __str__(self):
        fisherfolk_str = self.fisherfolk.full_name if self.fisherfolk else 'Unknown'
        return f'{self.species.species_name} — {fisherfolk_str} ({self.season} {self.year})'


# ─── Fisheries Activity Log ────────────────────────────────────────────────────

class FisheriesActivityLog(models.Model):
    WATER_CONDITION_CHOICES = [
        ('Good', 'Good'),
        ('Fair', 'Fair'),
        ('Poor', 'Poor'),
    ]
    SEVERITY_CHOICES = [
        ('Low',    'Low'),
        ('Medium', 'Medium'),
        ('High',   'High'),
    ]

    stocking_record     = models.ForeignKey(StockingRecord, on_delete=models.CASCADE, related_name='logs')
    activity            = models.CharField(max_length=150)
    date_of_activity    = models.DateField()
    water_fish_condition = models.CharField(max_length=10, choices=WATER_CONDITION_CHOICES, blank=True)
    feed_type           = models.CharField(max_length=200, blank=True)
    feed_quantity_kg    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    observed_issue      = models.CharField(max_length=200, blank=True)
    severity            = models.CharField(max_length=10, choices=SEVERITY_CHOICES, blank=True)
    recommendations     = models.TextField(blank=True)
    target_day          = models.IntegerField(null=True, blank=True, help_text='Day after stocking this log targets')
    is_late             = models.BooleanField(default=False, help_text='Logged after the target window')
    logged_by           = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fisheries_activity_logs',
    )

    class Meta:
        ordering = ['-date_of_activity']

    def __str__(self):
        return f'{self.activity} on {self.date_of_activity}'


# ─── Fisheries Disaster Report ────────────────────────────────────────────────

class FisheriesDisasterReport(models.Model):
    DISASTER_TYPE_CHOICES = [
        ('Fish Kill',        'Fish Kill'),
        ('Disease Outbreak', 'Disease Outbreak'),
        ('Flood',            'Flood'),
        ('Typhoon',          'Typhoon'),
        ('Drought',          'Drought'),
        ('Predator Attack',  'Predator Attack'),
        ('Other',            'Other'),
    ]

    stocking_record     = models.ForeignKey(StockingRecord, on_delete=models.CASCADE, related_name='disaster_reports')
    disaster_type       = models.CharField(max_length=50, choices=DISASTER_TYPE_CHOICES)
    date_of_occurrence  = models.DateField()
    area_affected_ha    = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    estimated_damage    = models.TextField(blank=True)
    production_loss     = models.TextField(blank=True)
    reported_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fisheries_disaster_reports',
    )
    date_reported       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_of_occurrence']

    def __str__(self):
        return f'{self.disaster_type} - {self.date_of_occurrence}'


# ─── Fisheries Disaster Response Rules ────────────────────────────────────────

class FisheriesDisasterResponseRule(models.Model):
    DISASTER_TYPE_CHOICES = [
        ('Fish Kill',        'Fish Kill'),
        ('Disease Outbreak', 'Disease Outbreak'),
        ('Flood',            'Flood'),
        ('Typhoon',          'Typhoon'),
        ('Drought',          'Drought'),
        ('Predator Attack',  'Predator Attack'),
        ('Other',            'Other'),
    ]
    PRIORITY_CHOICES = [
        ('HIGH',   'High'),
        ('MEDIUM', 'Medium'),
        ('LOW',    'Low'),
    ]

    disaster_type = models.CharField(max_length=50, choices=DISASTER_TYPE_CHOICES)
    species       = models.ForeignKey(
        SpeciesOption,
        on_delete=models.CASCADE,
        related_name='disaster_response_rules',
        null=True, blank=True,
        help_text='If blank, this rule applies to all species.',
    )
    title         = models.CharField(max_length=200)
    action        = models.TextField(help_text='Step-by-step response action.')
    priority      = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='MEDIUM')

    class Meta:
        ordering = ['disaster_type', '-priority']

    def __str__(self):
        species_str = self.species.species_name if self.species else 'All Species'
        return f'{self.disaster_type} / {species_str}: {self.title}'


# ─── Fisheries Harvest Record (partial harvests) ──────────────────────────────

class FisheriesHarvestRecord(models.Model):
    stocking_record    = models.ForeignKey(StockingRecord, on_delete=models.CASCADE, related_name='harvests')
    harvest_date       = models.DateField()
    quantity_kg        = models.DecimalField(max_digits=12, decimal_places=2)
    avg_body_weight_kg = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    is_final           = models.BooleanField(default=False, help_text='Final harvest — close this cycle')
    notes              = models.TextField(blank=True)
    recorded_by        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fisheries_harvest_records',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-harvest_date']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_final and self.stocking_record_id:
            try:
                sr = StockingRecord.objects.get(pk=self.stocking_record_id)
                if sr.status != StockingRecord.Status.HARVESTED:
                    sr.status = StockingRecord.Status.HARVESTED
                    sr.save(update_fields=['status'])
            except StockingRecord.DoesNotExist:
                pass

    def __str__(self):
        return f'Harvest {self.quantity_kg}kg on {self.harvest_date}'
