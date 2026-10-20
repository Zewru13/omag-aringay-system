from decimal import Decimal
from datetime import timedelta, date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.db.models import Q
from django.utils import timezone

from core.constants import BARANGAY_CHOICES
from core.models import PcicInsurance
from core.validators import validate_fishr, validate_rsbsa


def calculate_estimated_harvest_kg(number_of_fingerlings, survival_rate_pct, avg_body_weight_kg):
    """The single estimated-harvest formula (StockingRecord.estimated_harvest_kg and the
    Production Cycle's Estimated Harvest Biomass both use it):
    fingerlings x (survival rate % / 100) x average body weight (kg), rounded to 0.01.
    Returns None when any input is missing - nothing is guessed."""
    if number_of_fingerlings is None or survival_rate_pct is None or avg_body_weight_kg is None:
        return None
    return (
        Decimal(str(number_of_fingerlings))
        * (Decimal(str(survival_rate_pct)) / Decimal('100'))
        * Decimal(str(avg_body_weight_kg))
    ).quantize(Decimal('0.01'))


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
    # Required, like a farmer's: only people with an RSBSA number are accepted
    # into the registry. (Rows without one — all deleted 2026-10-02 — used to be
    # allowed; the column was null=True.)
    rsbsa_number       = models.CharField(
        max_length=50, unique=True,
        validators=[validate_rsbsa],
    )
    is_aquaculture     = models.BooleanField(default=True)
    is_capture_fishery = models.BooleanField(default=False)
    is_mariculture     = models.BooleanField(default=False)
    is_inland_fishery  = models.BooleanField(default=False)

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

    class Meta:
        # Backstop matching FisherfolkListView's own explicit
        # -date_registered, -id ordering — see
        # production.models.CropMonitoringRecord.Meta for why -id tie-breaks.
        ordering = ['-date_registered', '-id']
        constraints = [
            # NOT NULL alone still lets an empty string through; this makes the
            # database itself refuse a fisherfolk without a real RSBSA number.
            models.CheckConstraint(check=Q(rsbsa_number__regex=r'\S'), name='fisherfolk_rsbsa_not_blank'),
        ]

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
        return f'{self.rsbsa_number} - {self.full_name}'


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
    culture_type_other_specify = models.CharField(max_length=150, blank=True)
    species_cultured    = models.CharField(max_length=100)
    species_cultured_other_specify = models.CharField(max_length=150, blank=True)
    area_hectares       = models.DecimalField(max_digits=10, decimal_places=2)
    fingerlings_stocked = models.PositiveIntegerField()
    production_volume_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f'Aquaculture - {self.fisherfolk.rsbsa_number}'


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
    vessel_material_other_specify = models.CharField(max_length=150, blank=True)
    vessel_registration_number  = models.CharField(max_length=100, blank=True)
    fishing_gear_type           = models.CharField(max_length=100)
    fishing_ground              = models.CharField(max_length=100)
    average_catch_per_trip_kg   = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f'Capture - {self.fisherfolk.rsbsa_number}'


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
    # DEPRECATED / UNUSED: Recommended Stocking Density was removed from the application (not in any
    # serializer or form). The nullable column stays in the schema so no migration is needed.
    recommended_stocking_density = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        help_text='Recommended fingerlings per square meter for this species. NULL until configured '
                  '- production-cycle forms show no recommendation for a species without one.',
    )
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

    def estimate_harvest_kg(self, fingerlings):
        """Estimate for a NEW stocking of `fingerlings` of this species: the species' configured
        default survival rate and average body weight - exactly what StockingRecord.save()
        copies onto a new record. Same shared formula."""
        return calculate_estimated_harvest_kg(
            fingerlings, self.default_survival_rate_pct, self.default_avg_body_weight_kg,
        )

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


class Pond(PcicInsurance):
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
        # -id tie-breaks -date_created: real ponds created in the same
        # request/batch share one identical second-precision timestamp
        # (confirmed against live data).
        ordering = ['-date_created', '-id']

    def save(self, *args, **kwargs):
        if not self.name and self.fisherfolk_id:
            existing_count = Pond.objects.filter(fisherfolk_id=self.fisherfolk_id).count()
            self.name = f'Pond {existing_count + 1}'
        super().save(*args, **kwargs)

    def __str__(self):
        who = self.fisherfolk.full_name if self.fisherfolk_id else 'Unknown'
        return f'{self.name} — {who}'


# ─── Stocking Record ──────────────────────────────────────────────────────────

class StockingRecord(PcicInsurance):
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
    # NEW (not part of the restored 4da000a0 code): optional link to the restored
    # monitoring.AquacultureProductionCycle. Nullable so every existing record is
    # untouched; SET_NULL so deleting a cycle never deletes stocking data.
    production_cycle        = models.ForeignKey(
        'monitoring.AquacultureProductionCycle', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='stocking_records',
    )
    pond_location_barangay  = models.CharField(max_length=100, blank=True, default='')
    land_status             = models.CharField(max_length=20, choices=LAND_STATUS_CHOICES, blank=True)
    land_status_other_specify = models.CharField(max_length=150, blank=True)
    culture_type            = models.CharField(max_length=10, choices=CULTURE_TYPE_CHOICES)
    species                 = models.ForeignKey(SpeciesOption, on_delete=models.PROTECT, related_name='stocking_records')
    date_stocked            = models.DateField()
    # Mirrors CropMonitoringRecord.date_planted_is_estimated exactly (see that
    # field's own comment) — False by default so every hand-entered/pre-existing
    # record is unaffected. Wherever a day-based computation treats date_stocked
    # as a real event date (the Activity Suggestion Engine, dashboard aggregation,
    # the Record Harvest gate) this flag must be checked — see save()'s
    # Near-Harvest auto-transition guard below, dashboard_activity.py's
    # fisheries_activity_status() exclude(), FisheriesActivitySuggestionsView, and
    # StockingHarvestListCreateView.create() for the enforcement points.
    date_stocked_is_estimated = models.BooleanField(
        default=False,
        help_text='True when date_stocked is an approximation, not a confirmed real stocking date.',
    )
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
        # Backstop matching StockingListView's own explicit
        # -date_recorded, -id ordering — see CropMonitoringRecord.Meta for why.
        ordering = ['-date_recorded', '-id']
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
        estimate = calculate_estimated_harvest_kg(
            self.number_of_fingerlings, self.survival_rate_pct, self.avg_body_weight_kg,
        )
        if estimate is not None:
            self.estimated_harvest_kg = estimate

        # Auto-transition: Stocked → Near Harvest when within 7 days of expected harvest.
        # Skipped when date_stocked is only an estimate — see date_stocked_is_estimated's
        # own comment, and CropMonitoringRecord.save()'s identical guard.
        if self.expected_harvest_date and self.status == self.Status.STOCKED and not self.date_stocked_is_estimated:
            days_remaining = (self.expected_harvest_date - date.today()).days
            if days_remaining <= 7:
                self.status = self.Status.NEAR_HARVEST

        super().save(*args, **kwargs)

    def __str__(self):
        fisherfolk_str = self.fisherfolk.full_name if self.fisherfolk else 'Unknown'
        return f'{self.species.species_name} — {fisherfolk_str} ({self.season} {self.year})'

    def compute_production_cycle_no(self):
        """This record's production cycle number in its fisherfolk's own sequence (see
        production_cycle_numbers_bulk). Shared by StockingRecordSerializer, yield analysis, reports and the
        cycle notifications so every screen and role shows the same number."""
        return production_cycle_numbers_bulk([self])[self.id]

    def _harvested_unit_ids(self):
        from monitoring.models import AquacultureProductionUnit
        return set(AquacultureProductionUnit.objects.filter(harvest_records__stocking_record=self).values_list('id', flat=True))

    def _force_harvested_unit_ids(self):
        from monitoring.models import AquacultureProductionUnit
        return set(AquacultureProductionUnit.objects.filter(
            harvest_records__stocking_record=self, harvest_records__is_force_harvest=True,
        ).values_list('id', flat=True))

    def harvest_units(self):
        """For the linked production cycle's ponds/cages: is each under Force Harvest (from ITS OWN
        Health Log), why, has it already been harvested (listed on any harvest record), and was that
        harvest a Force Harvest (listed on a harvest record with is_force_harvest=True)."""
        if not self.production_cycle_id:
            return []
        from monitoring.models import AquacultureProductionUnit, cycle_force_status
        force, _ = cycle_force_status(self.production_cycle_id)
        # Harvested and force-harvested units in ONE query (same rows as _harvested_unit_ids /
        # _force_harvested_unit_ids): every (unit, harvest) link of this record's harvests.
        harvested, force_harvested = set(), set()
        links = FisheriesHarvestRecord.production_units.through.objects.filter(fisheriesharvestrecord__stocking_record=self)
        for unit_id, is_force in links.values_list('aquacultureproductionunit_id', 'fisheriesharvestrecord__is_force_harvest'):
            harvested.add(unit_id)
            if is_force:
                force_harvested.add(unit_id)
        units = AquacultureProductionUnit.objects.filter(production_cycle_id=self.production_cycle_id).order_by('unit_number')
        return _harvest_unit_rows(units, force, harvested, force_harvested)

    def is_force_harvest_selection(self, unit_ids, units_status=None):
        """True when `unit_ids` is an actual Force Harvest of this record: a non-empty list in which
        EVERY unit belongs to this cycle, is awaiting Force Harvest (its own Health Log) and is not yet
        harvested. Merely naming units is never enough - this is what may lift the 50% waiting rule.
        `units_status`: this record's harvest_units() when the caller already has it (not re-queried)."""
        if not isinstance(unit_ids, (list, tuple)) or not unit_ids:
            return False
        try:
            wanted = {int(i) for i in unit_ids}
        except (TypeError, ValueError):
            return False
        status_by_id = {u['id']: u for u in (self.harvest_units() if units_status is None else units_status)}
        return all(
            uid in status_by_id and status_by_id[uid]['force_harvest'] and not status_by_id[uid]['harvested']
            for uid in wanted
        )

    def has_pending_force_harvest(self):
        """True while a mortality/disease condition still awaits harvest: an affected unit not yet
        harvested, or a legacy log not tied to any unit (cycle-level behaviour, as before)."""
        if not self.production_cycle_id:
            return False
        from monitoring.models import cycle_force_status
        force, unassigned = cycle_force_status(self.production_cycle_id)
        return unassigned or any(uid not in self._harvested_unit_ids() for uid in force)

    def determine_status(self):
        """Pick the correct status for this record after total-loss reversal."""
        # Only a FINAL harvest closes the record - a partial (e.g. force-harvest of some ponds) does not.
        if self.harvests.filter(is_final=True).exists():
            return self.Status.HARVESTED
        if self.expected_harvest_date and not self.date_stocked_is_estimated:
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


# ─── Displayed status (completion + harvest timing) ───────────────────────────
# StockingRecord.status is STORED and only re-evaluated when the record is saved, so on its own it goes stale:
# a record past its expected harvest date kept reading "Near Harvest" (save()'s "<= 7 days" check also matches
# past dates) and a Stocked record never moved into the window by itself. The DISPLAYED status of an active
# record is therefore derived from the dates at read time (Asia/Manila "today"):
#   expected date passed            -> Late          (still not harvested; timing, not completion)
#   expected date within 0..7 days  -> Near Harvest  (today included)
#   otherwise                       -> Stocked
# Harvested and Total Loss are terminal and shown as stored (a completed harvest's own Early / On-Time / Late is
# harvest_timing() of its harvest records). A record whose stocking date is only an estimate keeps its stored
# status, the same guard save() applies. The stored column itself is unchanged.
NEAR_HARVEST_WINDOW_DAYS = 7
DISPLAY_LATE = 'Late'
ACTIVE_STATUSES = ('Stocked', 'Near Harvest')


def stocking_display_status(rec, today=None):
    if rec.status not in ACTIVE_STATUSES or not rec.expected_harvest_date or rec.date_stocked_is_estimated:
        return rec.status
    days = (rec.expected_harvest_date - (today or timezone.localdate())).days
    if days < 0:
        return DISPLAY_LATE
    return 'Near Harvest' if days <= NEAR_HARVEST_WINDOW_DAYS else 'Stocked'


def stocking_display_status_q(labels, today=None):
    """Q matching the records whose stocking_display_status() is one of `labels` (the Status filter values).
    Requesting both Stocked and Near Harvest (the "All Status" / Forecast scopes) also matches Late, so a
    late, not-yet-harvested cycle is never dropped from those lists."""
    today = today or timezone.localdate()
    labels = set(labels)
    if {'Stocked', 'Near Harvest'} <= labels:
        labels.add(DISPLAY_LATE)
    window_end = today + timedelta(days=NEAR_HARVEST_WINDOW_DAYS)
    active = Q(status__in=ACTIVE_STATUSES)
    dated = active & Q(expected_harvest_date__isnull=False, date_stocked_is_estimated=False)
    undated = active & ~Q(expected_harvest_date__isnull=False, date_stocked_is_estimated=False)
    by_label = {
        DISPLAY_LATE: dated & Q(expected_harvest_date__lt=today),
        'Near Harvest': (dated & Q(expected_harvest_date__gte=today, expected_harvest_date__lte=window_end))
                        | (undated & Q(status='Near Harvest')),
        'Stocked': (dated & Q(expected_harvest_date__gt=window_end)) | (undated & Q(status='Stocked')),
    }
    q = Q(pk__in=[])
    for label in labels:
        q |= by_label.get(label, Q(status=label))   # Harvested / Total Loss: the stored status
    return q


def _harvest_unit_rows(units, force, harvested, force_harvested):
    """The rows of StockingRecord.harvest_units() from already-loaded data: `units` (the cycle's ponds/cages,
    unit_number order), `force` ({unit_id: [reasons]} from cycle_force_status) and the harvested /
    force-harvested unit-id sets of the stocking record's own harvests."""
    return [
        {
            'id': u.id, 'label': f'{u.get_unit_type_display()} {u.unit_number}',
            'force_harvest': u.id in force, 'reasons': force.get(u.id, []), 'harvested': u.id in harvested,
            'force_harvested': u.id in force_harvested,
        }
        for u in units
    ]


def production_cycle_numbers_bulk(records):
    """{record_id: production cycle number} for many stocking records with 3 queries in total.

    Each fisherfolk has its OWN sequence (Cycle 1, 2, 3 ...) in logging order - date_recorded, then id -
    over every status. Its entries are:
      - every AquacultureProductionCycle the fisherfolk owns (counted ONCE however many stocking records,
        ponds/cages, logs or harvests it has); a linked stocking record shows its cycle's number;
      - every stocking record of the fisherfolk with NO production cycle (imports, older records): each is
        one production run logged on its own.
    Computed, not stored: nothing to backfill, and two cycles created at the same time still get distinct
    numbers (distinct ids). Deleting an earlier entry moves the later ones up by one.
    None for a record with no owning fisherfolk (nothing to number it against)."""
    from collections import defaultdict
    from monitoring.models import AquacultureProductionCycle
    # Owner of each record: its production cycle's fisherfolk when linked (the cycle is the unit numbered),
    # else its own fisherfolk.
    linked_cycle_ids = {r.production_cycle_id for r in records if r.production_cycle_id}
    cycle_owner = dict(AquacultureProductionCycle.objects.filter(id__in=linked_cycle_ids)
                       .values_list('id', 'fisherfolk_id')) if linked_cycle_ids else {}
    owner = {r.id: cycle_owner.get(r.production_cycle_id) if r.production_cycle_id else r.fisherfolk_id for r in records}
    owners = {o for o in owner.values() if o}

    entries = defaultdict(list)   # fisherfolk_id -> [(date_recorded, kind, id)]; kind 0 = cycle, 1 = stocking record
    if owners:
        for cid, ff_id, recorded in AquacultureProductionCycle.objects.filter(fisherfolk_id__in=owners) \
                .values_list('id', 'fisherfolk_id', 'date_recorded'):
            entries[ff_id].append((recorded, 0, cid))
        for sid, ff_id, recorded in StockingRecord.objects.filter(fisherfolk_id__in=owners, production_cycle__isnull=True) \
                .values_list('id', 'fisherfolk_id', 'date_recorded'):
            entries[ff_id].append((recorded, 1, sid))
    number = {}
    for ff_entries in entries.values():
        for n, (_, kind, pk) in enumerate(sorted(ff_entries), start=1):
            number[(kind, pk)] = n
    return {
        r.id: number.get((0, r.production_cycle_id) if r.production_cycle_id else (1, r.id)) if owner[r.id] else None
        for r in records
    }


def stocking_harvest_status_bulk(records):
    """For many stocking records at once (a list page): {record_id: (harvest_units, pending_force_harvest)}, the
    exact values of record.harvest_units() and record.has_pending_force_harvest(), with 3 queries in total
    instead of several per record."""
    from collections import defaultdict
    from monitoring.models import AquacultureProductionUnit, cycle_force_status_bulk
    with_cycle = [r for r in records if r.production_cycle_id]
    cycle_ids = {r.production_cycle_id for r in with_cycle}
    force_by_cycle = cycle_force_status_bulk(cycle_ids)
    units_by_cycle = defaultdict(list)
    for u in AquacultureProductionUnit.objects.filter(production_cycle_id__in=cycle_ids).order_by('unit_number'):
        units_by_cycle[u.production_cycle_id].append(u)
    harvested, force_harvested = defaultdict(set), defaultdict(set)
    if with_cycle:
        links = FisheriesHarvestRecord.production_units.through.objects.filter(
            fisheriesharvestrecord__stocking_record_id__in=[r.id for r in with_cycle])
        for sid, unit_id, is_force in links.values_list(
                'fisheriesharvestrecord__stocking_record_id', 'aquacultureproductionunit_id', 'fisheriesharvestrecord__is_force_harvest'):
            harvested[sid].add(unit_id)
            if is_force:
                force_harvested[sid].add(unit_id)
    out = {}
    for r in records:
        if not r.production_cycle_id:
            out[r.id] = ([], False)
            continue
        force, unassigned = force_by_cycle[r.production_cycle_id]
        rows = _harvest_unit_rows(units_by_cycle[r.production_cycle_id], force, harvested[r.id], force_harvested[r.id])
        # has_pending_force_harvest(): a legacy unassigned log, or an affected unit not yet harvested.
        out[r.id] = (rows, unassigned or any(uid not in harvested[r.id] for uid in force))
    return out


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
        # -id tie-breaks -date_of_activity (a plain DateField — day
        # precision): logging several activities for the same real day is
        # routine, not an edge case.
        ordering = ['-date_of_activity', '-id']

    def __str__(self):
        return f'{self.activity} on {self.date_of_activity}'


# ─── Fisheries Disaster Report ────────────────────────────────────────────────

class FisheriesDisasterReport(models.Model):
    # Batch: consolidated from monitoring.FisherfolkDisasterReport, whose rows
    # had no stocking cycle to attach to (Capture-type fisherfolk have none).
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

    class SubmissionStatus(models.TextChoices):
        # A fisherfolk's own report is a DRAFT until they submit it to Admin; '' (blank) is every report
        # recorded before this workflow existed and every report recorded by office staff.
        DRAFT     = 'DRAFT',     'Not yet submitted'
        SUBMITTED = 'SUBMITTED', 'Submitted to Admin'

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
    # Fisherfolk "Submit Report to Admin": set once, by the owning fisherfolk, on the existing report
    # (never a second row). Separate from `status`, which is the disaster's Active/Recovered lifecycle.
    submission_status   = models.CharField(max_length=10, choices=SubmissionStatus.choices, blank=True, default='')
    submitted_at        = models.DateTimeField(null=True, blank=True)
    submitted_by        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+',
    )

    class Meta:
        # -id tie-breaks -date_of_occurrence (a plain DateField — day
        # precision) since two disasters reported the same day are common.
        ordering = ['-date_of_occurrence', '-id']

    @property
    def report_number(self):
        """Reference number derived from the row itself (no stored counter): FDR-<year reported>-<id>."""
        if not self.pk:
            return ''
        year = self.date_reported.year if self.date_reported else ''
        return f'FDR-{year}-{self.pk:05d}'

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
        # Stocks a multi-stock report closed as Total Loss (see FisheriesDisasterStockLoss) reopen the same way.
        closed_by_rows = set(self.stock_losses.filter(is_total_loss=True).values_list('stocking_record_id', flat=True)) \
            if self.pk else set()
        super().delete(*args, **kwargs)
        reopen = closed_by_rows | ({stocking_record_id} if was_total_loss and stocking_record_id else set())
        for rec in StockingRecord.objects.filter(pk__in=reopen, status=StockingRecord.Status.TOTAL_LOSS):
            rec.status = rec.determine_status()
            rec.save(update_fields=['status'])

    def __str__(self):
        return f'{self.disaster_type} - {self.date_of_occurrence}'


class FisheriesDisasterReportPhoto(models.Model):
    """One "Photo Documentation of Damage" image of a FisheriesDisasterReport. Optional: 0 to
    MAX_PER_REPORT per report (enforced by the API). Each photo is its own row and file, so one upload
    never replaces another. The report's older single `photo` field is untouched and still served."""
    MAX_PER_REPORT = 10

    disaster_report = models.ForeignKey(FisheriesDisasterReport, on_delete=models.CASCADE, related_name='photos')
    image           = models.ImageField(upload_to='disaster_reports/fisheries/photos/')
    uploaded_by     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    date_uploaded   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'Photo {self.pk} of disaster report {self.disaster_report_id}'


class FisheriesDisasterStockLoss(models.Model):
    """One affected stock - and, when the stock has ponds/cages, one of its production units - of a
    multi-stock FisheriesDisasterReport, with the fingerlings lost there and whether that stock/unit was
    completely destroyed. The rows of a report define which stocks it covers; report.stocking_record is the
    first of them (so every single-stock reader keeps working). Reports logged before this model existed
    have no rows and are shown exactly as before."""
    disaster_report  = models.ForeignKey(FisheriesDisasterReport, on_delete=models.CASCADE, related_name='stock_losses')
    stocking_record  = models.ForeignKey(StockingRecord, on_delete=models.CASCADE, related_name='disaster_losses')
    # NULL only for a stock with no pond/cage breakdown (one row for the whole stock).
    production_unit  = models.ForeignKey(
        'monitoring.AquacultureProductionUnit', on_delete=models.CASCADE, null=True, blank=True,
        related_name='disaster_losses',
    )
    # NULL = not recorded (the stock/unit is affected but no count was entered); never guessed.
    fingerlings_lost = models.PositiveIntegerField(null=True, blank=True)
    is_total_loss    = models.BooleanField(default=False, help_text='This stock/unit was completely destroyed')

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(fields=['disaster_report', 'stocking_record', 'production_unit'],
                                    name='unique_disaster_loss_per_stock_unit'),
            # NULLs are distinct in a unique constraint, so the whole-stock row needs its own guard.
            models.UniqueConstraint(fields=['disaster_report', 'stocking_record'],
                                    condition=Q(production_unit__isnull=True),
                                    name='unique_disaster_loss_per_stock_without_unit'),
        ]

    def __str__(self):
        return f'Report {self.disaster_report_id} · stock {self.stocking_record_id} · unit {self.production_unit_id}: {self.fingerlings_lost}'


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


HARVEST_TIMING_LABELS = {'early': 'Early Harvest', 'on_time': 'On-Time Harvest', 'late': 'Late Harvest'}


def harvest_timing(harvest_date, estimated_harvest_date):
    """Actual harvest date vs the estimated (expected) harvest date: ('early' | 'on_time' | 'late', days),
    where days is harvest_date - estimated (negative = earlier). (None, None) when either date is missing.
    The single rule used by harvest validation and by anything that reports harvest timing."""
    if not harvest_date or not estimated_harvest_date:
        return None, None
    days = (harvest_date - estimated_harvest_date).days
    return ('early' if days < 0 else 'late' if days > 0 else 'on_time'), days


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
    # Force Harvest: the affected ponds/cages this ONE harvest covers (quantity_kg is their combined
    # total). Empty for a normal harvest, which keeps working exactly as before.
    production_units        = models.ManyToManyField(
        'monitoring.AquacultureProductionUnit', blank=True, related_name='harvest_records',
    )
    # True only for a Force Harvest (every listed unit was awaiting Force Harvest per its own Health Log).
    # Set by the serializer, never by the client. A normal harvest - with or without units - is False.
    is_force_harvest        = models.BooleanField(default=False)
    notes                  = models.TextField(blank=True)
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


class FisheriesHarvestUnit(models.Model):
    """Actual harvested kg of ONE pond/cage within a harvest record (e.g. a Force Harvest of Pond 1
    and Pond 2 records each pond's own weight). When a record has these rows, its quantity_kg is their
    sum (set by the serializer), so the cycle's actual harvest stays SUM(FisheriesHarvestRecord.quantity_kg)
    and nothing is counted twice. Records without rows (a combined multi-unit normal harvest, older
    records) keep a single combined quantity_kg - no per-unit split is ever invented."""
    harvest         = models.ForeignKey(FisheriesHarvestRecord, on_delete=models.CASCADE, related_name='unit_harvests')
    production_unit = models.ForeignKey(
        'monitoring.AquacultureProductionUnit', on_delete=models.CASCADE, related_name='harvest_quantities',
    )
    quantity_kg     = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ['production_unit__unit_number']
        constraints = [
            models.UniqueConstraint(fields=['harvest', 'production_unit'], name='unique_unit_per_fisheries_harvest'),
            models.CheckConstraint(check=Q(quantity_kg__gt=0), name='fisheries_harvest_unit_kg_positive'),
        ]

    def __str__(self):
        return f'{self.production_unit} - {self.quantity_kg}kg'


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
