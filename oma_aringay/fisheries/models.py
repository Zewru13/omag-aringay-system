from decimal import Decimal
from datetime import timedelta, date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.db.models import Q

from core.constants import BARANGAY_CHOICES
from core.validators import validate_fishr, validate_lgu_reg, validate_rsbsa


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
        # Batch 8: fisherfolk_type is required but the RSBSA/BFAR import
        # source has no equivalent column — explicit "not determined from
        # source" marker rather than a guessed type. Deliberately excluded
        # from FishingTripLog.clean()'s (CAPTURE, INLAND) allow-list above,
        # so imported records can't log trips until staff assign a real type.
        UNSPECIFIED = 'Unspecified', 'Not Yet Classified'

    class CivilStatus(models.TextChoices):
        SINGLE    = 'Single',    'Single'
        MARRIED   = 'Married',   'Married'
        WIDOWED   = 'Widowed',   'Widowed'
        SEPARATED = 'Separated', 'Separated'

    class Prefix(models.TextChoices):
        MR   = 'Mr.',   'Mr.'
        MRS  = 'Mrs.',  'Mrs.'
        MS   = 'Ms.',   'Ms.'
        MISS = 'Miss',  'Miss'
        ENGR = 'Engr.', 'Engr.'
        DR   = 'Dr.',   'Dr.'
        ATTY = 'Atty.', 'Atty.'
        HON  = 'Hon.',  'Hon.'

    ORGANIZATION_POSITION_CHOICES = [
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
    lgu_registration_number = models.CharField(
        max_length=50, unique=True, null=True, blank=True,
        validators=[validate_lgu_reg],
        help_text='Manually entered — format YYYY-03302-NNNN',
    )
    fishr_number = models.CharField(
        max_length=50, unique=True, null=True, blank=True,
        validators=[validate_fishr],
        help_text='National FishR registry number (BFAR)',
    )
    first_name    = models.CharField(max_length=100)
    last_name     = models.CharField(max_length=100)
    middle_name   = models.CharField(max_length=100, blank=True)
    gender        = models.CharField(max_length=10, choices=Gender.choices)
    birthdate     = models.DateField()
    contact_number = models.CharField(max_length=20, blank=True)
    # Batch: citizen-uploaded, applies instantly (no staff review).
    profile_picture = models.ImageField(upload_to='profile_pictures/fisherfolk/', null=True, blank=True)
    # Batch: optional citizen-registration email — see farmers.Farmer.email's
    # comment (same rationale, not a login identifier at this level).
    email         = models.EmailField(blank=True, null=True)
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

    # OMAg fisheries field-form identifiers and activity profile flags
    rsbsa_number       = models.CharField(
        max_length=50, unique=True, null=True, blank=True,
        validators=[validate_rsbsa],
    )
    is_aquaculture     = models.BooleanField(default=True)
    is_capture_fishery = models.BooleanField(default=False)
    is_mariculture     = models.BooleanField(default=False)
    is_inland_fishery  = models.BooleanField(default=False)
    is_fish_vendor     = models.BooleanField(default=False)

    date_registered    = models.DateTimeField(auto_now_add=True)
    # Auto-updates on every save() — the only reliable "last touched" signal
    # on this model (no per-field change history exists; see
    # farmers.rsbsa_import_views's module docstring — same rationale applies
    # to Fisherfolk). null=True so existing rows backfill to whenever they
    # were last actually saved, not a fabricated value.
    updated_at = models.DateTimeField(auto_now=True, null=True)
    fisherfolk_organization = models.ForeignKey(
        'associations.FisherfolkOrganization',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='direct_members',
        help_text='Organization this fisherfolk belongs to (optional)',
    )
    organization_position = models.CharField(
        max_length=20,
        choices=ORGANIZATION_POSITION_CHOICES,
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


class FisheriesActivityType(models.Model):
    """
    Activity Settings batch: fisheries-domain counterpart of
    production.models.ActivityType — same shape, same toggle-not-delete
    pattern. Promotes FisheriesActivityLog.activity from a
    hardcoded-in-frontend free-text field into real master data;
    FisheriesActivityLog.activity itself stays a plain CharField
    (unchanged). 'Other' is deliberately never a row here — every consumer
    already has its own dedicated Other + free-text handling
    (activity_other_specify).
    """
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Fisheries Activity Types'

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
    # Batch 4 — PROVISIONAL generic default (every species defaults to daily
    # feeding) pending OMAg/BFAR species-specific feeding-frequency guidance.
    # Not sourced data — just a starting point so "next feeding date" has
    # something to compute from before real intervals are configured.
    default_feeding_interval_days = models.IntegerField(default=1)

    # Growth-stage day thresholds for feed recommendation — NULL until
    # OMAg/BFAR staff configure them via Species settings. Left unconfigured
    # (any of the three blank) means growth-stage feed recommendation isn't
    # available yet for this species; nothing is fabricated as a default,
    # same discipline as DiseaseResponseGuide being seeded empty of content.
    fingerling_start_day = models.PositiveIntegerField(null=True, blank=True, help_text='Day after stocking the Fingerling stage begins')
    juvenile_start_day   = models.PositiveIntegerField(null=True, blank=True, help_text='Day after stocking the Juvenile stage begins')
    adult_start_day      = models.PositiveIntegerField(null=True, blank=True, help_text='Day after stocking the Adult stage begins')

    GROWTH_STAGES = ['Fry', 'Fingerling', 'Juvenile', 'Adult']

    class Meta:
        ordering = ['species_name']

    def __str__(self):
        return self.species_name

    def growth_stage_for_day(self, days_since_stocking):
        """None if days_since_stocking is unknown or the three thresholds
        aren't all configured — a partial configuration can't be trusted to
        order correctly, so it's treated the same as unconfigured."""
        if days_since_stocking is None:
            return None
        if None in (self.fingerling_start_day, self.juvenile_start_day, self.adult_start_day):
            return None
        if days_since_stocking >= self.adult_start_day:
            return 'Adult'
        if days_since_stocking >= self.juvenile_start_day:
            return 'Juvenile'
        if days_since_stocking >= self.fingerling_start_day:
            return 'Fingerling'
        return 'Fry'


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
    allows_pre_planting = models.BooleanField(
        default=False,
        help_text='If set, this activity may be logged with a date earlier than date_stocked '
                   '(e.g. Pond Preparation). Everything else must be logged on/after date_stocked.',
    )

    class Meta:
        ordering = ['species_option', 'order', 'day_after_stocking']

    def __str__(self):
        return f'{self.species_option.species_name} — Day {self.day_after_stocking}: {self.activity_name}'


# ─── Feed Type (Batch 4) ────────────────────────────────────────────────────
# Reference data for the Feed Type field on FisheriesActivityLog. Seeded
# with exactly 2 PROVISIONAL starter categories (generic, not per-species
# formulations) pending OMAg/BFAR refinement — same convention as the
# frontend's PERENNIAL_CROPS-style provisional lists.

class FeedType(models.Model):
    GROWTH_STAGE_CHOICES = [
        ('Fry',        'Fry'),
        ('Fingerling', 'Fingerling'),
        ('Juvenile',   'Juvenile'),
        ('Adult',      'Adult'),
    ]

    name        = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True)
    species_options = models.ManyToManyField(
        SpeciesOption, blank=True, related_name='feed_types',
        help_text='Species this feed type applies to. Seeded by linking every '
                   'existing species to every seeded feed type as a placeholder '
                   'starting point — not a real per-species differentiation.',
    )
    # Batch — growth-stage-based feed recommendation. Blank means "suitable
    # for any stage" (matches every existing seeded feed type, which predates
    # stage differentiation); staff narrow this per feed type as needed.
    growth_stage = models.CharField(
        max_length=15, choices=GROWTH_STAGE_CHOICES, blank=True,
        help_text='Growth stage this feed is recommended for. Blank = suitable for any stage.',
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


# ─── Disease reference data (Batch 4) ───────────────────────────────────────
# Mirrors FisheriesDisasterResponseRule's disease_type -> recommendation
# pattern, but seeded EMPTY of any cure — mechanism only. No disease names
# or treatments are invented here; OMAg/BFAR staff populate these via admin.

class DiseaseType(models.Model):
    name        = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True)
    # Batch C — mirrors FeedType.species_options exactly: which species this
    # disease category applies to, so the activity-log form can scope its
    # Disease Type dropdown to the stocking record's own species.
    species_options = models.ManyToManyField(
        SpeciesOption, blank=True, related_name='disease_types',
        help_text='Species this disease category applies to.',
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class DiseaseResponseGuide(models.Model):
    disease_type          = models.ForeignKey(DiseaseType, on_delete=models.CASCADE, related_name='response_guides')
    recommended_treatment = models.TextField(blank=True)
    notes                 = models.TextField(blank=True)

    def __str__(self):
        return f'{self.disease_type.name} — response guide'


# ─── Pond ───────────────────────────────────────────────────────────────────
# A persistent physical pond belonging to a fisherfolk, tracked separately
# from StockingRecord so stocking history can be followed per pond over
# time (Batch 3). WATER_SOURCE_CHOICES is hoisted to module level so both
# Pond and StockingRecord share the exact same choice set (StockingRecord
# still declares its own field using this constant — see below).

WATER_SOURCE_CHOICES = [
    ('River',     'River'),
    ('Spring',    'Spring'),
    ('Rain-fed',  'Rain-fed'),
    ('Deep Well', 'Deep Well'),
    ('Other',     'Other'),
]


class Pond(models.Model):
    fisherfolk = models.ForeignKey(Fisherfolk, on_delete=models.CASCADE, related_name='ponds')
    name = models.CharField(
        max_length=100, blank=True,
        help_text='Optional — auto-numbered ("Pond 1", "Pond 2", ...) per fisherfolk if left blank.',
    )
    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES, blank=True)
    area_hectares = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    water_source = models.CharField(max_length=20, choices=WATER_SOURCE_CHOICES, blank=True)
    is_active = models.BooleanField(default=True)
    date_created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['fisherfolk_id', 'date_created']

    def save(self, *args, **kwargs):
        if not self.name and self.fisherfolk_id:
            existing_count = Pond.objects.filter(fisherfolk_id=self.fisherfolk_id).count()
            self.name = f'Pond {existing_count + 1}'
        super().save(*args, **kwargs)

    def __str__(self):
        who = self.fisherfolk.full_name if self.fisherfolk_id else 'Unknown'
        return f'{self.name} — {who}'


# ─── Stocking Record ──────────────────────────────────────────────────────────

class StockingRecord(models.Model):
    class Status(models.TextChoices):
        STOCKED      = 'Stocked',      'Stocked'
        NEAR_HARVEST = 'Near Harvest', 'Near Harvest'
        HARVESTED    = 'Harvested',    'Harvested'
        TOTAL_LOSS   = 'Total Loss',   'Total Loss'

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
    FINGERLING_SOURCE_CHOICES = [
        ('BFAR',             'BFAR'),
        ('Private Hatchery', 'Private Hatchery'),
        ('Own Production',   'Own Production'),
        ('Other',            'Other'),
    ]
    CULTURE_PHASE_CHOICES = [
        ('Nursery Phase',      'Nursery Phase'),
        ('Stocking Phase',     'Stocking Phase'),
        ('Grow-out Phase',     'Grow-out Phase'),
        ('Harvest Phase',      'Harvest Phase'),
        ('Post-Harvest Phase', 'Post-Harvest Phase'),
        ('Other',              'Other'),
    ]

    fisherfolk              = models.ForeignKey(Fisherfolk, on_delete=models.SET_NULL, null=True, blank=True, related_name='stocking_records')
    pond                    = models.ForeignKey(
        'Pond', on_delete=models.SET_NULL, null=True, blank=True, related_name='stocking_records',
        help_text='Nullable — not every stocking record has a linked Pond yet (pre-Batch-3 history, or '
                   'a record entered without selecting one). pond_location_barangay/area_hectares/'
                   'water_source below stay the source of truth for reads; when pond is set, save() '
                   'overwrites them from the Pond so they never drift out of sync.',
    )
    pond_location_barangay  = models.CharField(max_length=100, blank=True, default='')
    land_status             = models.CharField(max_length=20, choices=LAND_STATUS_CHOICES, blank=True)
    land_status_other_specify = models.CharField(max_length=150, blank=True)
    culture_type            = models.CharField(max_length=10, choices=CULTURE_TYPE_CHOICES)
    species                 = models.ForeignKey(SpeciesOption, on_delete=models.PROTECT, related_name='stocking_records')
    date_stocked            = models.DateField()
    area_hectares           = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    number_of_fingerlings   = models.IntegerField()
    survival_rate_pct       = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    avg_body_weight_kg      = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)

    # OMAg aquaculture production fields
    water_source          = models.CharField(max_length=20, choices=WATER_SOURCE_CHOICES, blank=True)
    water_source_other_specify = models.CharField(max_length=150, blank=True)
    number_of_units       = models.IntegerField(null=True, blank=True, help_text='Number of ponds or cages')
    unit_dimensions       = models.CharField(max_length=100, blank=True, help_text='e.g. 10m x 10m x 2m')
    fingerling_source     = models.CharField(max_length=20, choices=FINGERLING_SOURCE_CHOICES, blank=True)
    fingerling_source_other_specify = models.CharField(max_length=150, blank=True)
    avg_fingerling_size   = models.CharField(max_length=50, blank=True, help_text='e.g. 2-3 cm')
    culture_phase          = models.CharField(max_length=20, choices=CULTURE_PHASE_CHOICES, blank=True)
    culture_phase_other_specify = models.CharField(max_length=150, blank=True)
    seed_cost_php          = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text='Cost of seed/fingerlings/spat in PHP')

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
        # Batch 3: when a Pond is linked, it's the source of truth for these
        # three fields — every existing reader of pond_location_barangay/
        # area_hectares/water_source (yield analysis, dashboard, PDF/Excel
        # exports) keeps working unchanged because the inline fields are
        # always kept in sync here rather than removed.
        if self.pond_id:
            pond = self.pond
            self.pond_location_barangay = pond.barangay
            self.area_hectares = pond.area_hectares
            self.water_source = pond.water_source

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

        # Auto-transition: Stocked → Near Harvest when within 7 days of expected harvest
        if self.expected_harvest_date and self.status == self.Status.STOCKED:
            days_remaining = (self.expected_harvest_date - date.today()).days
            if days_remaining <= 7:
                self.status = self.Status.NEAR_HARVEST

        super().save(*args, **kwargs)

    def __str__(self):
        fisherfolk_str = self.fisherfolk.full_name if self.fisherfolk else 'Unknown'
        return f'{self.species.species_name} — {fisherfolk_str} ({self.season} {self.year})'

    def compute_production_cycle_no(self):
        """
        Which repeat cycle this is for this fisherfolk+species (1 = first
        ever, 2 = second, ...), counting by stocking date then id as a
        tiebreaker. Shared by StockingRecordSerializer and the yield-analysis
        module so both agree on cycle numbering.
        """
        if not self.fisherfolk_id or not self.species_id or not self.date_stocked:
            return 1
        prior = StockingRecord.objects.filter(
            fisherfolk_id=self.fisherfolk_id,
            species_id=self.species_id,
        ).filter(
            Q(date_stocked__lt=self.date_stocked)
            | Q(date_stocked=self.date_stocked, id__lt=self.id)
        ).count()
        return prior + 1

    def determine_status(self):
        """Pick the correct status for this record after total-loss reversal."""
        if self.harvests.exists():
            return self.Status.HARVESTED
        if self.expected_harvest_date:
            days_remaining = (self.expected_harvest_date - date.today()).days
            if days_remaining <= 7:
                return self.Status.NEAR_HARVEST
        return self.Status.STOCKED

    def compute_next_feeding_date(self):
        """
        Batch 4 — suggested next feeding date = most recent logged 'Feed
        Monitoring' activity's date + the species' default_feeding_interval_days,
        or date_stocked + interval if nothing has been logged yet.

        Deliberately separate from the Activity Suggestion Engine
        (SpeciesActivityStage/application_days): that mechanism expands a
        finite list of specific milestone days (e.g. Feeding checkpoints at
        [7, 30, 60, 90]), not an open-ended daily/interval recurrence — it
        isn't built for "every N days indefinitely," so this is simple date
        arithmetic instead, not a reuse of the ASE's occurrence expansion.
        Shared by StockingRecordSerializer, same pattern as
        compute_production_cycle_no().
        """
        if not self.species_id or not self.date_stocked:
            return None
        interval = self.species.default_feeding_interval_days or 1
        last_feeding = self.logs.filter(activity='Feed Monitoring').order_by('-date_of_activity').first()
        base_date = last_feeding.date_of_activity if last_feeding else self.date_stocked
        return base_date + timedelta(days=interval)

    @property
    def days_since_stocking(self):
        if not self.date_stocked:
            return None
        return (date.today() - self.date_stocked).days

    def compute_growth_stage(self):
        """Fry/Fingerling/Juvenile/Adult, or None if the species has no
        stage thresholds configured yet. See SpeciesOption.growth_stage_for_day."""
        if not self.species_id:
            return None
        return self.species.growth_stage_for_day(self.days_since_stocking)

    def compute_recommended_feed_type(self):
        """The active FeedType tagged for this record's current growth
        stage and linked to its species; falls back to a stage-agnostic
        (blank growth_stage) feed type for the species if no stage-specific
        one is configured. None if the stage itself is unknown (see
        compute_growth_stage) or nothing matches."""
        stage = self.compute_growth_stage()
        if not stage or not self.species_id:
            return None
        candidates = self.species.feed_types.filter(is_active=True)
        return candidates.filter(growth_stage=stage).first() or candidates.filter(growth_stage='').first()


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
    # Stored English like every other choice set here; the citizen screens do
    # the Tagalog display, same convention as SEVERITY_CHOICES above.
    DISSOLVED_OXYGEN_CHOICES = [
        ('Low',    'Low'),
        ('Normal', 'Normal'),
        ('High',   'High'),
    ]
    WATER_CLARITY_CHOICES = [
        ('Clear',  'Clear'),
        ('Slightly Turbid', 'Slightly Turbid'),
        ('Turbid', 'Turbid'),
    ]

    stocking_record     = models.ForeignKey(StockingRecord, on_delete=models.CASCADE, related_name='logs')
    activity            = models.CharField(max_length=150)
    activity_other_specify = models.CharField(max_length=150, blank=True)
    date_of_activity    = models.DateField()
    water_fish_condition = models.CharField(max_length=10, choices=WATER_CONDITION_CHOICES, blank=True)

    # Water Quality Check readings. The new fisheries reference asks for these
    # three explicitly; before this, a water-quality log could only record the
    # single free-text `water_fish_condition` above, which is what all 130
    # existing water-quality logs use. All three are nullable/blank so those
    # records stay valid and simply carry no readings.
    #
    # DO and clarity are CATEGORICAL rather than numeric on purpose: the
    # reference draws them as dropdowns, and a fisherfolk judging a pond by
    # eye can answer a category but usually not a mg/L figure. pH is numeric
    # because the reference shows a typed example ("hal. 7.2"), which implies
    # a test strip or meter.
    ph_level         = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    dissolved_oxygen = models.CharField(max_length=20, choices=DISSOLVED_OXYGEN_CHOICES, blank=True)
    water_clarity    = models.CharField(max_length=20, choices=WATER_CLARITY_CHOICES, blank=True)
    feed_type           = models.CharField(max_length=200, blank=True)
    feed_quantity_kg    = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    feed_brand          = models.CharField(max_length=200, blank=True)
    observed_issue      = models.CharField(max_length=200, blank=True)
    severity            = models.CharField(max_length=10, choices=SEVERITY_CHOICES, blank=True)
    mortality_count     = models.IntegerField(null=True, blank=True)
    # Mortality sub-section (count/cause/disposal) — cause and disposal only
    # mean anything when mortality_count is actually set, so both stay blank
    # otherwise; enforced in the serializer, not the model, same as every
    # other conditionally-required field in this log.
    POSSIBLE_CAUSE_CHOICES = [
        ('Disease',             'Disease'),
        ('Poor Water Quality',  'Poor Water Quality'),
        ('Predator Attack',     'Predator Attack'),
        ('Handling Stress',     'Handling Stress'),
        ('Overcrowding',        'Overcrowding'),
        ('Unknown',             'Unknown'),
        ('Other',               'Other'),
    ]
    DISPOSAL_METHOD_CHOICES = [
        ('Buried',                     'Buried'),
        ('Composted',                  'Composted'),
        ('Incinerated',                'Incinerated'),
        ('Municipal Waste Collection', 'Municipal Waste Collection'),
        ('Other',                      'Other'),
    ]
    possible_cause                = models.CharField(max_length=30, choices=POSSIBLE_CAUSE_CHOICES, blank=True)
    possible_cause_other_specify  = models.CharField(max_length=150, blank=True)
    disposal_method               = models.CharField(max_length=30, choices=DISPOSAL_METHOD_CHOICES, blank=True)
    disposal_method_other_specify = models.CharField(max_length=150, blank=True)

    # TINATAYANG BAHAGI NG POND NA APEKTADO. area_affected_ha below already
    # exists but is in hectares, which a fisherfolk looking at a sick pond
    # cannot estimate; the reference asks the same question as a proportion
    # band instead. Both are kept: staff keep entering hectares, citizens
    # answer the band, and neither overwrites the other.
    AFFECTED_PORTION_CHOICES = [
        ('Few fish',    'Few fish (under 10%)'),
        ('Part',        'Part of pond (10-30%)'),
        ('Half',        'Half of pond (30-60%)'),
        ('Most',        'Most of pond (over 60%)'),
        ('All',         'All fish'),
    ]
    affected_portion    = models.CharField(max_length=20, choices=AFFECTED_PORTION_CHOICES, blank=True)
    area_affected_ha    = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, help_text='Area affected in hectares (Disease Control activity)')
    treatment_applied   = models.CharField(max_length=200, blank=True)
    # Batch 4 — disease_type links a log to DiseaseResponseGuide's recommended
    # treatment (a suggestion only; treatment_applied above always stays the
    # actual editable record of what was really done).
    disease_type        = models.ForeignKey(
        'DiseaseType', on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs',
    )
    # Batch C — companion free-text field for ComboboxWithOther's "Other"
    # branch on the Disease Type dropdown (disease_type is an FK, so unlike
    # every other _other_specify field in this app it can't itself hold
    # typed text). Same convention otherwise: blank unless disease_type is
    # unset because the user picked something not in DiseaseType.
    disease_type_other_specify = models.CharField(max_length=200, blank=True)
    vet_consulted        = models.CharField(max_length=150, blank=True, help_text='Vet name, or "N/A".')
    outcome             = models.CharField(max_length=50, blank=True, choices=[
        ('Recovered',        'Recovered'),
        ('Ongoing',          'Ongoing'),
        ('Losses Incurred',  'Losses Incurred'),
    ])
    recommendations     = models.TextField(blank=True)
    # KARAGDAGANG TALA — the citizen's own free observation. Deliberately not
    # folded into `recommendations` above, which is what OMAg staff advise;
    # merging the two would make it impossible to tell afterwards whether a
    # line came from the office or from the fisherfolk.
    notes               = models.TextField(blank=True)
    target_day          = models.IntegerField(null=True, blank=True, help_text='Day after stocking this log targets')
    is_late             = models.BooleanField(default=False, help_text='Logged after the target window')
    date_logged         = models.DateTimeField(auto_now_add=True, null=True, blank=True, help_text='When OMAg staff encoded this log')
    disaster_report     = models.ForeignKey(
        'FisheriesDisasterReport',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        help_text='Set when this log was created from a disaster response rule card',
    )
    disaster_rule       = models.ForeignKey(
        'FisheriesDisasterResponseRule',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        help_text='The specific disaster response rule this log satisfies',
    )
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
    # Batch: consolidated from monitoring.FisherfolkDisasterReport, whose rows
    # had no stocking cycle to attach to (Capture/Vendor fisherfolk have none).
    # Flooding/Storm Surge/El Nino Drought/Red Tide came from that model —
    # kept as distinct choices rather than collapsed into the closest existing
    # one so historical data keeps its original specificity.
    DISASTER_TYPE_CHOICES = [
        ('Fish Kill',           'Fish Kill'),
        ('Disease Outbreak',    'Disease Outbreak'),
        ('Flood',               'Flood'),
        ('Flooding',            'Flooding'),
        ('Storm Surge',         'Storm Surge'),
        ('Typhoon',             'Typhoon'),
        ('Drought',             'Drought'),
        ('El Nino Drought',     'El Niño / Drought'),
        ('Red Tide',            'Red Tide'),
        ('Predator Attack',     'Predator Attack'),
        ('Pollution Incident',  'Pollution Incident'),
        ('Other',               'Other'),
    ]
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Recovered', 'Recovered'),
    ]

    # Exactly one of stocking_record / fisherfolk is set (enforced in the
    # serializer): stocking_record for an aquaculture production cycle
    # (unlocks the response-rule/recovery-activity engine below), fisherfolk
    # directly for a general disaster with no cycle to attach to.
    stocking_record      = models.ForeignKey(StockingRecord, on_delete=models.CASCADE, related_name='disaster_reports', null=True, blank=True)
    fisherfolk           = models.ForeignKey(Fisherfolk, on_delete=models.CASCADE, related_name='general_disaster_reports', null=True, blank=True)
    disaster_type       = models.CharField(max_length=50, choices=DISASTER_TYPE_CHOICES)
    disaster_type_other_specify = models.CharField(max_length=150, blank=True)
    date_of_occurrence  = models.DateField()
    area_affected_ha    = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    estimated_damage    = models.TextField(blank=True)
    production_loss     = models.TextField(blank=True)
    volume_lost_kg       = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    equipment_damaged    = models.TextField(blank=True)
    photo                = models.ImageField(upload_to='disaster_reports/fisheries/', null=True, blank=True)
    # ANTAS NG PINSALA — mirrors CropDisasterReport.severity for the same
    # reason: the numeric damage fields are unanswerable for a fisherfolk
    # reporting from the pond side, and the reference's cards show this band.
    severity            = models.CharField(
        max_length=10, blank=True,
        choices=[('Low', 'Low'), ('Medium', 'Medium'), ('High', 'High')],
    )
    is_total_loss       = models.BooleanField(default=False, help_text='Stock completely destroyed — ends the production cycle')
    status              = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    recovered_date      = models.DateField(null=True, blank=True)
    recovered_by        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+',
    )
    recovery_note       = models.TextField(
        blank=True,
        help_text='Required when marked Recovered without all recommended response rules logged — '
                   'documents why/how it recovered without them (e.g. natural recovery, fisherfolk '
                   'used their own method).',
    )
    reported_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fisheries_disaster_reports',
    )
    date_reported       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_of_occurrence']

    @property
    def owner_fisherfolk(self):
        return self.stocking_record.fisherfolk if self.stocking_record_id else self.fisherfolk

    @property
    def owner_fisherfolk_id(self):
        return self.stocking_record.fisherfolk_id if self.stocking_record_id else self.fisherfolk_id

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_total_loss and self.stocking_record_id:
            try:
                rec = StockingRecord.objects.get(pk=self.stocking_record_id)
                if rec.status != StockingRecord.Status.TOTAL_LOSS:
                    rec.status = StockingRecord.Status.TOTAL_LOSS
                    rec.save(update_fields=['status'])
            except StockingRecord.DoesNotExist:
                pass

    def delete(self, *args, **kwargs):
        stocking_record_id = self.stocking_record_id
        was_total_loss = self.is_total_loss
        super().delete(*args, **kwargs)
        if was_total_loss and stocking_record_id:
            try:
                rec = StockingRecord.objects.get(pk=stocking_record_id)
                rec.status = rec.determine_status()
                rec.save(update_fields=['status'])
            except StockingRecord.DoesNotExist:
                pass

    def __str__(self):
        return f'{self.disaster_type} - {self.date_of_occurrence}'


# ─── Fisheries Disaster Response Rules ────────────────────────────────────────

class FisheriesDisasterResponseRule(models.Model):
    DISASTER_TYPE_CHOICES = [
        ('Fish Kill',           'Fish Kill'),
        ('Disease Outbreak',    'Disease Outbreak'),
        ('Flood',               'Flood'),
        ('Typhoon',             'Typhoon'),
        ('Drought',             'Drought'),
        ('Predator Attack',     'Predator Attack'),
        ('Pollution Incident',  'Pollution Incident'),
        ('Other',               'Other'),
    ]
    PRIORITY_CHOICES = [
        ('HIGH',   'High'),
        ('MEDIUM', 'Medium'),
        ('LOW',    'Low'),
    ]
    ACTIVITY_CHOICES = [
        ('Pond Preparation',      'Pond Preparation'),
        ('Stocking',              'Stocking'),
        ('Feed Monitoring',       'Feed Monitoring'),
        ('Water Quality Check',   'Water Quality Check'),
        ('Sampling',              'Sampling'),
        ('Disease Control',       'Disease Control'),
        ('Pre-Harvest Inspection','Pre-Harvest Inspection'),
        ('Harvesting',            'Harvesting'),
        ('Other',                 'Other'),
    ]

    disaster_type  = models.CharField(max_length=50, choices=DISASTER_TYPE_CHOICES)
    species        = models.ForeignKey(
        SpeciesOption,
        on_delete=models.CASCADE,
        related_name='disaster_response_rules',
        null=True, blank=True,
        help_text='If blank, this rule applies to all species.',
    )
    title          = models.CharField(max_length=200)
    action         = models.TextField(help_text='Step-by-step response action.')
    activity_name  = models.CharField(max_length=150, choices=ACTIVITY_CHOICES, default='Other',
                                      help_text='Activity log value this rule fills when clicked.')
    recommendation = models.TextField(blank=True, help_text='Plain text copied into the log Recommendations field.')
    priority       = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='MEDIUM')

    class Meta:
        ordering = ['disaster_type', '-priority']

    def __str__(self):
        species_str = self.species.species_name if self.species else 'All Species'
        return f'{self.disaster_type} / {species_str}: {self.title}'


# ─── Fisheries Harvest Record (partial harvests) ──────────────────────────────

class FisheriesHarvestRecord(models.Model):
    stocking_record         = models.ForeignKey(StockingRecord, on_delete=models.CASCADE, related_name='harvests')
    harvest_date            = models.DateField()
    quantity_kg             = models.DecimalField(max_digits=12, decimal_places=2)
    avg_body_weight_kg      = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    area_or_units_harvested = models.CharField(max_length=100, blank=True, help_text='e.g. Pond 2, 3 cages')
    is_final                = models.BooleanField(default=False, help_text='Final harvest — close this cycle')
    harvest_variance_days   = models.IntegerField(
        null=True, blank=True,
        help_text='Days early (negative) or late (positive) vs. expected harvest date — final harvest only',
    )
    early_late_reason       = models.CharField(max_length=255, blank=True)
    notes                   = models.TextField(blank=True)
    recorded_by             = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fisheries_harvest_records',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-harvest_date']

    def save(self, *args, **kwargs):
        sr = None
        if self.stocking_record_id:
            try:
                sr = StockingRecord.objects.get(pk=self.stocking_record_id)
            except StockingRecord.DoesNotExist:
                sr = None

        if self.is_final and sr and sr.expected_harvest_date and self.harvest_date:
            self.harvest_variance_days = (self.harvest_date - sr.expected_harvest_date).days

        super().save(*args, **kwargs)

        if self.is_final and sr and sr.status != StockingRecord.Status.HARVESTED:
            sr.status = StockingRecord.Status.HARVESTED
            sr.save(update_fields=['status'])

    def __str__(self):
        return f'Harvest {self.quantity_kg}kg on {self.harvest_date}'


@receiver(post_delete, sender=FisheriesHarvestRecord)
def _resync_stocking_after_harvest_delete(sender, instance, **kwargs):
    """Mirrors the crop side: a final harvest closes the cycle, so removing
    it has to let the stocking record fall back rather than stay Harvested
    with no harvest behind it. determine_status() checks `harvests`, so it
    returns Harvested only while one genuinely remains."""
    if not instance.stocking_record_id:
        return
    sr = StockingRecord.objects.filter(pk=instance.stocking_record_id).first()
    if sr:
        sr.status = sr.determine_status()
        sr.save(update_fields=['status'])


# ─── Legacy Capture Fishing / Vessel / Assistance records ─────────────────────
# Relocated from monitoring app (Phase 3 of the fisheries merge) — these
# already FK'd to Fisherfolk, they just lived in the wrong app.

class FishingTripLog(models.Model):
    fisherfolk = models.ForeignKey(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='fishing_trips',
    )
    trip_date = models.DateField()
    return_date = models.DateField(null=True, blank=True)
    fishing_ground = models.CharField(max_length=150)
    gear_used = models.CharField(max_length=150)
    total_catch_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    hours_at_sea = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    fuel_consumption_liters = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recorded_fishing_trips',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def clean(self):
        if self.fisherfolk_id:
            try:
                ff = Fisherfolk.objects.get(pk=self.fisherfolk_id)
                if ff.fisherfolk_type not in (
                    Fisherfolk.FisherfolkType.CAPTURE,
                    Fisherfolk.FisherfolkType.INLAND,
                ):
                    raise ValidationError(
                        'Fishing trip logs can only be created for Capture or Inland Fishery fisherfolk.'
                    )
            except Fisherfolk.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def total_species_count(self):
        return self.species_entries.values('species_name').distinct().count()

    def __str__(self):
        return f'Trip by {self.fisherfolk} on {self.trip_date}'


class TripSpeciesEntry(models.Model):
    fishing_trip = models.ForeignKey(
        FishingTripLog,
        on_delete=models.CASCADE,
        related_name='species_entries',
    )
    species_name = models.CharField(max_length=100)
    volume_kg = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.CharField(max_length=200, blank=True)

    def _recompute_parent(self):
        from django.db.models import Sum
        entries = TripSpeciesEntry.objects.filter(fishing_trip_id=self.fishing_trip_id)
        total_kg = entries.aggregate(Sum('volume_kg'))['volume_kg__sum'] or Decimal('0')
        FishingTripLog.objects.filter(pk=self.fishing_trip_id).update(total_catch_kg=total_kg)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._recompute_parent()

    def delete(self, *args, **kwargs):
        trip_id = self.fishing_trip_id
        super().delete(*args, **kwargs)
        from django.db.models import Sum
        entries = TripSpeciesEntry.objects.filter(fishing_trip_id=trip_id)
        total_kg = entries.aggregate(Sum('volume_kg'))['volume_kg__sum']
        FishingTripLog.objects.filter(pk=trip_id).update(total_catch_kg=total_kg)

    def __str__(self):
        return f'{self.species_name} — {self.volume_kg} kg (Trip {self.fishing_trip_id})'


# FisheriesAssistanceRecord retired in Batch 6 — its data was migrated into
# interventions.FisherfolkBeneficiaryRecord (program=null) and the model
# dropped. See interventions/migrations/0006_migrate_assistance_records.py
# and 0007_retire_source_assistance_tables.py.
