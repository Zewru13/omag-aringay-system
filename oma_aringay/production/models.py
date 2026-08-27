from decimal import Decimal
from datetime import date, timedelta

from django.core.exceptions import ValidationError

from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

from core.constants import BARANGAY_CHOICES
from farmers.models import FarmParcel, Farmer


class CropCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crop_categories',
    )
    date_created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Crop Categories'

    def __str__(self):
        return self.name


class CropSubcategory(models.Model):
    name = models.CharField(max_length=100)
    category = models.ForeignKey(
        CropCategory, on_delete=models.CASCADE, related_name='subcategories',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crop_subcategories',
    )
    date_created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Crop Subcategories'
        unique_together = [['name', 'category']]

    def __str__(self):
        return f'{self.name} ({self.category.name})'


class CropType(models.Model):
    name = models.CharField(max_length=100, unique=True)
    days_to_harvest = models.IntegerField()
    yield_per_ha_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    category = models.ForeignKey(
        CropCategory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crop_types',
    )
    subcategory = models.ForeignKey(
        CropSubcategory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='crop_types',
    )
    suggested_activities = models.TextField(
        blank=True,
        help_text='Comma-separated list of suggested activities for this crop.',
    )
    allowed_units = models.JSONField(
        default=list, blank=True,
        help_text='Valid Unit of Measure options for this crop on the Record Harvest form.',
    )
    # Toggle-not-delete batch: CropMonitoringRecord.crop_type is PROTECT, so
    # a crop type with any real monitoring history was already undeletable
    # — this replaces that dead-end Delete button with the same
    # deactivate-hides-from-new-record-dropdowns pattern CropVariety/
    # SeedSource already use. Existing records keep displaying their crop
    # type name regardless of this flag.
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class SeedSource(models.Model):
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-id']

    def __str__(self):
        return self.name


class ActivityType(models.Model):
    """
    Activity Settings batch: promotes CropActivityLog.activity_type from a
    hardcoded-in-four-different-frontend-files free-text field into real
    master data, same shape and same toggle-not-delete pattern as CropType.
    activity_type itself stays a plain CharField (unchanged) — a
    deactivated type never breaks an existing log, it just stops being
    offered for new ones. 'Other' is deliberately never a row here: every
    consumer already has its own dedicated Other + free-text handling
    (activity_type_other_specify), so it stays a UI-level sentinel, not
    master data.
    """
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Activity Types'

    def __str__(self):
        return self.name


class CropVariety(models.Model):
    name = models.CharField(max_length=150)
    crop_type = models.ForeignKey(
        CropType, on_delete=models.CASCADE, null=True, blank=True,
        related_name='varieties',
        help_text='Leave blank for a general variety not tied to a specific crop.',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'Crop Varieties'
        ordering = ['-id']
        # Scoped to crop_type, not global — "Fancy" can legitimately exist as
        # a variety name under two different crops. Case-insensitive
        # duplicate detection is enforced separately in CropVarietySerializer
        # (DB collation already makes this unique_together effectively
        # case-insensitive too, but the serializer gives a clear message
        # instead of a raw IntegrityError).
        unique_together = [['crop_type', 'name']]

    def __str__(self):
        return self.name


class CropActivityStage(models.Model):
    class Priority(models.TextChoices):
        HIGH   = 'HIGH',   'High'
        MEDIUM = 'MEDIUM', 'Medium'
        LOW    = 'LOW',    'Low'

    crop_type          = models.ForeignKey(CropType, on_delete=models.CASCADE, related_name='activity_stages')
    stage_name         = models.CharField(max_length=150)
    day_after_planting = models.PositiveIntegerField()
    application_days   = models.JSONField(default=list, blank=True)
    recommendation     = models.TextField(blank=True)
    priority           = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    window_days        = models.IntegerField(default=3)
    allows_pre_planting = models.BooleanField(
        default=False,
        help_text='If set, this activity may be logged with a date earlier than date_planted '
                   '(e.g. Land Preparation). Everything else must be logged on/after date_planted.',
    )

    class Meta:
        ordering = ['crop_type', 'day_after_planting']

    def __str__(self):
        return f'{self.crop_type.name} — Day {self.day_after_planting}: {self.stage_name}'


class CropMonitoringRecord(models.Model):
    class Status(models.TextChoices):
        PLANTED = 'Planted', 'Planted'
        NEAR_HARVEST = 'Near Harvest', 'Near Harvest'
        HARVESTED = 'Harvested', 'Harvested'
        TOTAL_LOSS = 'Total Loss', 'Total Loss'

    GROWTH_STAGE_CHOICES = [
        ('Land Preparation', 'Land Preparation'),
        ('Planted', 'Planted'),
        ('Vegetative', 'Vegetative'),
        ('Flowering', 'Flowering'),
        ('Fruiting', 'Fruiting'),
        ('Maturity', 'Maturity'),
        ('Near Harvest', 'Near Harvest'),
        ('Harvested', 'Harvested'),
    ]

    farm_parcel = models.ForeignKey(
        FarmParcel,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='monitoring_records',
    )
    farmers_organization = models.ForeignKey(
        'associations.FarmersOrganization',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='monitoring_records',
    )
    crop_type = models.ForeignKey(
        CropType,
        on_delete=models.PROTECT,
        related_name='monitoring_records',
    )
    season = models.CharField(max_length=10, choices=[('Dry', 'Dry'), ('Wet', 'Wet')])
    year = models.PositiveIntegerField()
    date_planted = models.DateField()
    area_planted_ha = models.DecimalField(max_digits=10, decimal_places=2)
    expected_harvest_date = models.DateField(null=True, blank=True)
    actual_harvest_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANTED)
    estimated_yield_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    actual_yield_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    yield_variance_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    yield_variance_pct = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    current_growth_stage = models.CharField(
        max_length=20, choices=GROWTH_STAGE_CHOICES, blank=True,
    )
    notes = models.TextField(blank=True)

    # Planting detail fields
    variety_used = models.CharField(max_length=100, blank=True)
    seed_source = models.CharField(
        max_length=100, blank=True,
        help_text='Name of a SeedSource record, or free text when "Other" is selected on the form.',
    )
    seed_source_other_specify = models.CharField(max_length=150, blank=True)
    quantity_of_seeds = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    seed_quantity_unit = models.CharField(
        max_length=20, blank=True, default='kg',
        choices=[('kg', 'kg'), ('bags', 'bags'), ('pcs', 'pcs'), ('bundles', 'bundles')],
    )

    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='crop_monitoring_records',
    )
    farm_location_barangay = models.CharField(max_length=100, blank=True)
    land_status = models.CharField(
        max_length=20, blank=True,
        choices=[
            ('Owner', 'Owner'),
            ('Lessee', 'Lessee'),
            ('Tenant', 'Tenant'),
            ('Other', 'Other'),
        ],
    )
    land_status_other_specify = models.CharField(max_length=150, blank=True)

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='monitoring_records',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.date_planted and self.crop_type_id:
            try:
                ct = self.crop_type if hasattr(self, '_crop_type_cache') else CropType.objects.get(pk=self.crop_type_id)
                self.expected_harvest_date = self.date_planted + timedelta(days=ct.days_to_harvest)
                if ct.yield_per_ha_kg is not None and self.area_planted_ha is not None:
                    raw = Decimal(str(ct.yield_per_ha_kg)) * Decimal(str(self.area_planted_ha))
                    self.estimated_yield_kg = raw.quantize(Decimal('0.01'))
            except CropType.DoesNotExist:
                pass
        if self.actual_yield_kg is not None and self.estimated_yield_kg is not None:
            self.yield_variance_kg = (Decimal(str(self.actual_yield_kg)) - Decimal(str(self.estimated_yield_kg))).quantize(Decimal('0.01'))
            if self.estimated_yield_kg != 0:
                raw_pct = ((self.yield_variance_kg / Decimal(str(self.estimated_yield_kg))) * Decimal('100')).quantize(Decimal('0.01'))
                self.yield_variance_pct = max(Decimal('-99999.99'), min(Decimal('99999.99'), raw_pct))
        elif self.actual_yield_kg is None:
            # Variance is derived from actual yield, so it cannot outlive it.
            # Without this the figures survived the harvest being removed and
            # kept being reported against a yield that was no longer there.
            self.yield_variance_kg = None
            self.yield_variance_pct = None
        # Auto-transition: Planted → Near Harvest when within 7 days of expected harvest
        if self.expected_harvest_date and self.status == self.Status.PLANTED:
            days_remaining = (self.expected_harvest_date - date.today()).days
            if days_remaining <= 7:
                self.status = self.Status.NEAR_HARVEST
        super().save(*args, **kwargs)

    def __str__(self):
        loc = f'Parcel {self.farm_parcel_id}' if self.farm_parcel_id else (self.farmers_organization.name if self.farmers_organization_id else 'Unknown')
        return f'{self.crop_type} - {loc} ({self.season} {self.year})'

    def determine_status(self):
        """Pick the correct status for this record after total-loss reversal."""
        if self.harvest_records.exists():
            return self.Status.HARVESTED
        if self.expected_harvest_date:
            days_remaining = (self.expected_harvest_date - date.today()).days
            if days_remaining <= 7:
                return self.Status.NEAR_HARVEST
        return self.Status.PLANTED


class CropActivityLog(models.Model):
    PLANT_CONDITION_CHOICES = [
        ('Good', 'Good'),
        ('Fair', 'Fair'),
        ('Poor', 'Poor'),
    ]

    CROP_STAGE_CHOICES = [
        ('Vegetative', 'Vegetative'),
        ('Flowering', 'Flowering'),
        ('Fruiting', 'Fruiting'),
        ('Maturity', 'Maturity'),
        ('Problem Observed', 'Problem Observed'),
    ]

    monitoring_record = models.ForeignKey(
        CropMonitoringRecord,
        on_delete=models.CASCADE,
        related_name='activity_logs',
    )
    activity_type = models.CharField(max_length=100)
    activity_type_other_specify = models.CharField(max_length=150, blank=True)
    date_of_activity = models.DateField(help_text="When the activity was actually performed in the field")
    plant_condition = models.CharField(max_length=10, choices=PLANT_CONDITION_CHOICES, blank=True)
    status_at_log = models.CharField(max_length=20, choices=CROP_STAGE_CHOICES, blank=True)
    notes = models.TextField(blank=True)

    # Fertilizer-specific fields (filled when activity = Fertilizer Application)
    fertilizer_type = models.CharField(max_length=200, blank=True, help_text='e.g. 14-14-14 NPK, Urea, Organic')
    quantity_applied = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text='Amount of fertilizer/input applied')
    quantity_unit = models.CharField(
        max_length=20, blank=True, default='kg',
        choices=[('kg', 'kg'), ('bags', 'bags'), ('liters', 'liters'), ('sacks', 'sacks'), ('pieces', 'pieces')],
    )

    # PARAAN NG PAGLAGAY — the reference pairs every fertilizer entry with how
    # it was applied, which the model could not record; quantity alone does not
    # distinguish a broadcast from a foliar spray.
    application_method = models.CharField(
        max_length=30, blank=True,
        choices=[
            ('Broadcast',   'Broadcast'),
            ('Basal',       'Basal'),
            ('Side-dress',  'Side-dress'),
            ('Foliar Spray', 'Foliar Spray'),
            ('Fertigation', 'Fertigation'),
        ],
    )

    # Pest/Disease-specific fields (filled when activity = Pest Control or Disease Control)
    pest_disease_name = models.CharField(max_length=200, blank=True, help_text='e.g. Brown Planthopper, Bacterial Blight')
    area_affected_ha = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, help_text='Area affected in hectares')
    severity = models.CharField(
        max_length=10, blank=True,
        choices=[('Low', 'Low'), ('Medium', 'Medium'), ('High', 'High')],
    )
    # GAMOT / LUNAS NA GINAMIT (pest) and FUNGICIDE / GAMOT NA GINAMIT (disease)
    # are one field: both record the product actually used, and the reference
    # only relabels it per activity. Free text, like the fisheries side's
    # treatment_applied — brand names are local and change constantly, so a
    # choice list would go stale and force people into "Other".
    treatment_used = models.CharField(
        max_length=200, blank=True,
        help_text='Pesticide/fungicide or remedy actually applied (Pest Control / Disease Control).',
    )

    # KALIDAD NG TUBIG — Water Quality Check on the crop side. The reference
    # draws it as a select but does not reveal its options, so it mirrors
    # plant_condition's Good/Fair/Poor band rather than inventing a scale.
    water_quality = models.CharField(
        max_length=10, blank=True,
        choices=[('Good', 'Good'), ('Fair', 'Fair'), ('Poor', 'Poor')],
    )

    target_day = models.IntegerField(null=True, blank=True, help_text="Day after planting this log was targeted for")
    is_late = models.BooleanField(default=False, help_text="Logged after the target window")
    date_logged = models.DateTimeField(auto_now_add=True, null=True, blank=True, help_text="When OMAg staff encoded this log")
    disaster_report = models.ForeignKey(
        'CropDisasterReport',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        help_text='Set when this log was created from a disaster response rule card',
    )
    disaster_rule = models.ForeignKey(
        'DisasterResponseRule',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        help_text='The specific disaster response rule this log satisfies',
    )

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='crop_activity_logs',
    )

    def __str__(self):
        return f'{self.activity_type} on {self.date_of_activity}'


class CropDisasterReport(models.Model):
    DISASTER_TYPE_CHOICES = [
        ('Drought', 'Drought'),
        ('Flood', 'Flood'),
        ('Typhoon', 'Typhoon'),
        ('Strong Winds', 'Strong Winds'),
        ('Pest Outbreak', 'Pest Outbreak'),
        ('Other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Recovered', 'Recovered'),
    ]

    monitoring_record = models.ForeignKey(
        'CropMonitoringRecord',
        on_delete=models.CASCADE,
        related_name='disaster_reports',
    )
    disaster_type = models.CharField(max_length=50, choices=DISASTER_TYPE_CHOICES)
    disaster_type_other_specify = models.CharField(max_length=150, blank=True)
    date_of_occurrence = models.DateField()
    area_affected_ha = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    estimated_damage = models.TextField(blank=True, help_text='Describe the damage')
    production_loss = models.TextField(blank=True, help_text='Estimated production loss')
    photo = models.ImageField(upload_to='disaster_reports/crop/', null=True, blank=True)
    # ANTAS NG PINSALA. The existing damage fields are free text plus a
    # hectare figure — precise when staff fill them in, but unanswerable for a
    # farmer reporting from the field on a phone, which is what the citizen
    # form is for. This is the banded judgement the reference asks for, and it
    # is the value its disaster cards show at a glance. It does NOT replace
    # the numeric fields; staff keep entering those.
    severity = models.CharField(
        max_length=10, blank=True,
        choices=[('Low', 'Low'), ('Medium', 'Medium'), ('High', 'High')],
    )
    is_total_loss = models.BooleanField(default=False, help_text='Crop completely destroyed — ends the production cycle')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    recovered_date = models.DateField(null=True, blank=True)
    recovered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
    )
    recovery_note = models.TextField(
        blank=True,
        help_text='Required when marked Recovered without all recommended response rules logged — '
                   'documents why/how it recovered without them (e.g. natural recovery, farmer '
                   'used their own method).',
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    date_reported = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_of_occurrence']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_total_loss and self.monitoring_record_id:
            try:
                rec = CropMonitoringRecord.objects.get(pk=self.monitoring_record_id)
                if rec.status != CropMonitoringRecord.Status.TOTAL_LOSS:
                    rec.status = CropMonitoringRecord.Status.TOTAL_LOSS
                    rec.save(update_fields=['status'])
            except CropMonitoringRecord.DoesNotExist:
                pass

    def delete(self, *args, **kwargs):
        monitoring_record_id = self.monitoring_record_id
        was_total_loss = self.is_total_loss
        super().delete(*args, **kwargs)
        if was_total_loss and monitoring_record_id:
            try:
                rec = CropMonitoringRecord.objects.get(pk=monitoring_record_id)
                rec.status = rec.determine_status()
                rec.save(update_fields=['status'])
            except CropMonitoringRecord.DoesNotExist:
                pass

    def __str__(self):
        return f'{self.disaster_type} - {self.date_of_occurrence}'


class HarvestRecord(models.Model):
    class Season(models.TextChoices):
        DRY = 'Dry', 'Dry'
        WET = 'Wet', 'Wet'

    UNIT_OF_MEASURE_CHOICES = [
        ('kg', 'Kilograms (kg)'),
        ('bags', 'Bags (50kg/bag)'),
        ('cavan', 'Cavan (50kg/cavan)'),
        ('sacks', 'Sacks'),
        ('pieces', 'Pieces/Heads'),
        ('bundles', 'Bundles'),
        ('boxes', 'Boxes'),
        ('other', 'Other'),
    ]

    farm_parcel = models.ForeignKey(
        FarmParcel,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='harvest_records',
    )
    season = models.CharField(max_length=10, choices=Season.choices)
    year = models.PositiveIntegerField()
    crop_name = models.CharField(max_length=100)
    area_harvested_hectares = models.DecimalField(max_digits=10, decimal_places=2)
    harvest_start_date = models.DateField(null=True, blank=True, help_text="Date harvesting started")
    harvest_end_date = models.DateField(null=True, blank=True, help_text="Date harvesting ended (optional if single-day harvest)")
    volume_kg = models.DecimalField(max_digits=12, decimal_places=2)
    volume_bags = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_of_measure = models.CharField(
        max_length=20, choices=UNIT_OF_MEASURE_CHOICES, default='kg', blank=True,
    )
    yield_per_hectare_kg = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='No longer computed — retained for historical records only.',
    )
    causal_factor = models.CharField(max_length=150, blank=True)
    causal_damage_report = models.ForeignKey(
        'DamageReport',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='caused_harvests',
    )
    monitoring_record = models.ForeignKey(
        CropMonitoringRecord,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='harvest_records',
    )
    harvest_variance_days = models.IntegerField(
        null=True, blank=True,
        help_text='Days early (negative) or late (positive) vs. expected harvest date',
    )
    early_late_reason = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_harvest_records',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(blank=True)

    def clean(self):
        if self.harvest_start_date and self.harvest_end_date:
            if self.harvest_end_date < self.harvest_start_date:
                raise ValidationError({
                    'harvest_end_date': 'Harvest end date must be on or after the harvest start date.',
                })

    def save(self, *args, **kwargs):
        if self.volume_kg is not None:
            self.volume_bags = (
                Decimal(str(self.volume_kg)) / Decimal('50')
            ).quantize(Decimal('0.01'))

        mr = None
        if self.monitoring_record_id:
            try:
                mr = CropMonitoringRecord.objects.get(pk=self.monitoring_record_id)
            except CropMonitoringRecord.DoesNotExist:
                mr = None

        if self.harvest_start_date and mr and mr.expected_harvest_date:
            self.harvest_variance_days = (self.harvest_start_date - mr.expected_harvest_date).days

        super().save(*args, **kwargs)

        if mr:
            self.sync_monitoring_record(mr)

    @staticmethod
    def sync_monitoring_record(mr):
        """Re-derive the monitoring record's harvest state from its harvests.

        Deliberately recomputed from the whole set rather than from whichever
        row was just written: a record can have several harvests, and the old
        code assigned this one's volume alone, so a multi-harvest crop
        reported only its most recent pass. The yield-analysis endpoint has
        always summed them, so the stored figure and the analysed one
        disagreed for exactly those records.
        """
        harvests = list(mr.harvest_records.all())
        if harvests:
            total = sum((h.volume_kg for h in harvests if h.volume_kg is not None), Decimal('0'))
            dates = [h.date_recorded.date() for h in harvests if h.date_recorded]
            mr.actual_yield_kg = total
            mr.actual_harvest_date = max(dates) if dates else None
        else:
            mr.actual_yield_kg = None
            mr.actual_harvest_date = None
        # determine_status() already encodes the right answer here; it was
        # written for total-loss reversal and applies unchanged.
        mr.status = mr.determine_status()
        mr.save()

    def __str__(self):
        return f'{self.crop_name} - {self.season} {self.year}'


@receiver(post_delete, sender=HarvestRecord)
def _resync_monitoring_after_harvest_delete(sender, instance, **kwargs):
    """Undo what saving a harvest stamped onto the monitoring record.

    Creating a harvest sets actual yield, harvest date and Harvested status on
    the crop; deleting one has to reverse that, or the crop stays Harvested
    for good carrying a yield whose harvest no longer exists. That surfaced on
    the citizen ANI screen as a crop still in the ground reporting 0 kg actual
    and -100% variance.

    This is a post_delete receiver rather than a delete() override on purpose:
    an override is silently skipped by queryset deletes and by cascades, which
    is how most rows actually disappear.
    """
    if not instance.monitoring_record_id:
        return
    mr = CropMonitoringRecord.objects.filter(pk=instance.monitoring_record_id).first()
    if mr:
        HarvestRecord.sync_monitoring_record(mr)


class PlantingRecord(models.Model):
    class Season(models.TextChoices):
        DRY = 'Dry', 'Dry'
        WET = 'Wet', 'Wet'

    farm_parcel = models.ForeignKey(
        FarmParcel,
        on_delete=models.CASCADE,
        related_name='planting_records',
    )
    season = models.CharField(max_length=10, choices=Season.choices)
    year = models.PositiveIntegerField()
    crop_name = models.CharField(max_length=100)
    area_planted_hectares = models.DecimalField(max_digits=10, decimal_places=2)
    date_planted = models.DateField()
    seedling_type = models.CharField(max_length=100, blank=True)
    variety_used = models.CharField(max_length=100, blank=True)
    seed_source = models.CharField(max_length=100, blank=True)
    quantity_of_seeds_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_planting_records',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.crop_name} planted - {self.season} {self.year}'


class DamageReport(models.Model):
    class Season(models.TextChoices):
        DRY = 'Dry', 'Dry'
        WET = 'Wet', 'Wet'

    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    calamity_name = models.CharField(max_length=150)
    calamity_date = models.DateField()
    season = models.CharField(max_length=10, choices=Season.choices)
    year = models.PositiveIntegerField()
    damaged_crops = models.TextField(blank=True)
    crop_volume_damaged_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    damaged_livestock = models.TextField(blank=True)
    livestock_head_count_affected = models.IntegerField(null=True, blank=True)
    estimated_loss_php = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    affected_monitoring_records = models.ManyToManyField(
        CropMonitoringRecord,
        blank=True,
        related_name='damage_reports',
    )
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_damage_reports',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.calamity_name} - {self.barangay} ({self.year})'


class FarmInputLog(models.Model):
    INPUT_TYPE_CHOICES = [
        ('Fertilizer', 'Fertilizer'),
        ('Pesticide', 'Pesticide'),
        ('Herbicide', 'Herbicide'),
        ('Fungicide', 'Fungicide'),
        ('Other', 'Other'),
    ]

    monitoring_record = models.ForeignKey(
        CropMonitoringRecord,
        on_delete=models.CASCADE,
        related_name='input_logs',
    )
    input_type = models.CharField(max_length=20, choices=INPUT_TYPE_CHOICES)
    product_name = models.CharField(max_length=150)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=30)
    application_date = models.DateField()
    application_method = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recorded_farm_inputs',
    )

    def __str__(self):
        return f'{self.input_type}: {self.product_name} ({self.application_date})'


class PestDiseaseReport(models.Model):
    CATEGORY_CHOICES = [
        ('Pest', 'Pest'),
        ('Disease', 'Disease'),
    ]
    SEVERITY_CHOICES = [
        ('Low', 'Low'),
        ('Moderate', 'Moderate'),
        ('High', 'High'),
        ('Critical', 'Critical'),
    ]

    monitoring_record = models.ForeignKey(
        CropMonitoringRecord,
        on_delete=models.CASCADE,
        related_name='pest_disease_reports',
    )
    report_date = models.DateField()
    pest_disease_name = models.CharField(max_length=150)
    category = models.CharField(max_length=10, choices=CATEGORY_CHOICES)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    affected_area_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    symptoms_description = models.TextField(blank=True)
    recommended_action = models.TextField(blank=True)
    action_taken = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recorded_pest_disease_reports',
    )

    def __str__(self):
        return f'{self.category}: {self.pest_disease_name} — {self.severity} ({self.report_date})'


class LaborOperationLog(models.Model):
    ACTIVITY_CHOICES = [
        ('Land Preparation', 'Land Preparation'),
        ('Planting', 'Planting'),
        ('Weeding', 'Weeding'),
        ('Fertilizer Application', 'Fertilizer Application'),
        ('Pest Control', 'Pest Control'),
        ('Harvesting', 'Harvesting'),
        ('Other', 'Other'),
    ]

    monitoring_record = models.ForeignKey(
        CropMonitoringRecord,
        on_delete=models.CASCADE,
        related_name='labor_logs',
    )
    activity = models.CharField(max_length=50, choices=ACTIVITY_CHOICES)
    date = models.DateField()
    notes = models.CharField(max_length=200, blank=True)
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='labor_operation_logs',
    )
    date_logged = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.activity} — {self.date}'


class CropRemark(models.Model):
    crop_type = models.ForeignKey(
        CropType,
        on_delete=models.CASCADE,
        related_name='remarks',
    )
    monitoring_record = models.ForeignKey(
        'CropMonitoringRecord',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='remarks',
    )
    custom_status = models.CharField(max_length=100, blank=True)
    remark_text = models.TextField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='crop_remarks',
    )
    date_recorded = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Remark for {self.crop_type} ({self.date_recorded.date()})'


class BarangayCropSummary(models.Model):
    CROP_NAME_CHOICES = [
        ('Palay (Rice)', 'Palay (Rice)'),
        ('Corn (Mais)', 'Corn (Mais)'),
        ('Onion', 'Onion'),
        ('Garlic', 'Garlic'),
        ('Tomato', 'Tomato'),
        ('Eggplant (Talong)', 'Eggplant (Talong)'),
        ('Bitter Gourd (Ampalaya)', 'Bitter Gourd (Ampalaya)'),
        ('String Beans (Sitaw)', 'String Beans (Sitaw)'),
        ('Pechay', 'Pechay'),
        ('Cabbage', 'Cabbage'),
        ('Mango', 'Mango'),
        ('Cacao (Kakaw)', 'Cacao (Kakaw)'),
        ('Banana (Saging)', 'Banana (Saging)'),
        ('Coffee (Kape)', 'Coffee (Kape)'),
        ('Cassava', 'Cassava'),
        ('Sweet Potato (Kamote)', 'Sweet Potato (Kamote)'),
        ('Other Vegetables', 'Other Vegetables'),
        ('Other Fruits', 'Other Fruits'),
        ('Other Root Crops', 'Other Root Crops'),
        ('Cash Crops', 'Cash Crops'),
        ('Other', 'Other'),
    ]

    GROWTH_STAGE_CHOICES = [
        ('Land Preparation', 'Land Preparation'),
        ('Planted', 'Planted'),
        ('Vegetative', 'Vegetative'),
        ('Reproductive', 'Reproductive'),
        ('Maturity', 'Maturity'),
        ('Near Harvest', 'Near Harvest'),
        ('Harvested', 'Harvested'),
    ]

    ALERT_LEVEL_CHOICES = [
        ('None', 'None'),
        ('Low', 'Low — Monitor'),
        ('Medium', 'Medium — Attention Required'),
        ('High', 'High — Immediate Action'),
    ]

    CAUSAL_FACTOR_CHOICES = [
        ('None', 'None / Normal Season'),
        ('Typhoon-Flooding', 'Typhoon / Flooding'),
        ('Drought', 'Drought / Dry Spell'),
        ('Pest', 'Pest Infestation'),
        ('Disease', 'Crop Disease'),
        ('Poor Soil', 'Poor Soil Condition'),
        ('Delayed Input', 'Delayed Farm Inputs'),
        ('Other', 'Other'),
    ]

    SUBMISSION_STATUS_CHOICES = [
        ('Draft', 'Draft — In Progress'),
        ('Submitted', 'Submitted — Awaiting Verification'),
        ('Verified', 'Verified — Final'),
    ]

    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    crop_name = models.CharField(max_length=100, choices=CROP_NAME_CHOICES)
    season = models.CharField(max_length=10, choices=[('Dry', 'Dry Season'), ('Wet', 'Wet Season')])
    year = models.IntegerField()

    area_planted_ha = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    number_of_farmers = models.IntegerField(default=0)
    planting_date_start = models.DateField(null=True, blank=True)
    planting_date_end = models.DateField(null=True, blank=True)
    expected_harvest_start = models.DateField(null=True, blank=True)
    expected_harvest_end = models.DateField(null=True, blank=True)
    current_growth_stage = models.CharField(max_length=20, choices=GROWTH_STAGE_CHOICES, blank=True)
    observed_problems = models.TextField(blank=True)
    alert_level = models.CharField(max_length=10, choices=ALERT_LEVEL_CHOICES, default='None')

    estimated_yield_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    actual_yield_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    yield_variance_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    yield_variance_pct = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    causal_factor = models.CharField(max_length=20, choices=CAUSAL_FACTOR_CHOICES, blank=True)
    causal_damage_report = models.ForeignKey(
        'DamageReport',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='related_summaries',
    )

    submission_status = models.CharField(
        max_length=10, choices=SUBMISSION_STATUS_CHOICES, default='Draft',
    )

    linked_monitoring_records = models.ManyToManyField(
        CropMonitoringRecord,
        blank=True,
        related_name='barangay_summaries',
    )

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recorded_barangay_summaries',
    )
    date_created = models.DateTimeField(auto_now_add=True)
    date_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['barangay', 'crop_name', 'season', 'year']]

    def save(self, *args, **kwargs):
        if self.actual_yield_kg is not None and self.estimated_yield_kg is not None:
            self.yield_variance_kg = (
                Decimal(str(self.actual_yield_kg)) - Decimal(str(self.estimated_yield_kg))
            )
            if self.estimated_yield_kg != 0:
                self.yield_variance_pct = (
                    self.yield_variance_kg / Decimal(str(self.estimated_yield_kg))
                ) * Decimal('100')
        super().save(*args, **kwargs)

    @property
    def computed_area_from_records(self):
        if not self.pk:
            return None
        from django.db.models import Sum as _Sum
        return self.linked_monitoring_records.aggregate(total=_Sum('area_planted_ha'))['total']

    @property
    def computed_yield_from_records(self):
        if not self.pk:
            return None
        from django.db.models import Sum as _Sum
        return self.linked_monitoring_records.filter(
            status=CropMonitoringRecord.Status.HARVESTED,
        ).aggregate(total=_Sum('actual_yield_kg'))['total']

    def __str__(self):
        return f'{self.barangay} — {self.crop_name} ({self.season} {self.year})'


class DisasterResponseRule(models.Model):
    DISASTER_TYPE_CHOICES = [
        ('Drought', 'Drought'),
        ('Flood', 'Flood'),
        ('Typhoon', 'Typhoon'),
        ('Strong Winds', 'Strong Winds'),
        ('Pest Outbreak', 'Pest Outbreak'),
        ('Other', 'Other'),
    ]

    PRIORITY_CHOICES = [
        ('HIGH', 'High'),
        ('MEDIUM', 'Medium'),
        ('LOW', 'Low'),
    ]

    disaster_type = models.CharField(max_length=50, choices=DISASTER_TYPE_CHOICES)
    crop_type = models.ForeignKey(
        CropType,
        on_delete=models.CASCADE,
        related_name='disaster_response_rules',
        null=True, blank=True,
        help_text='If blank, this rule applies to all crops.',
    )
    title = models.CharField(max_length=200)
    action = models.TextField(help_text='Step-by-step response action.')
    activity_name = models.CharField(
        max_length=150, default='Other',
        help_text='Activity log value this rule fills when clicked.',
    )
    recommendation = models.TextField(blank=True, help_text='Plain text copied into the log Notes field.')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='MEDIUM')

    class Meta:
        ordering = ['disaster_type', '-priority']

    def __str__(self):
        crop = self.crop_type.name if self.crop_type else 'All Crops'
        return f'{self.disaster_type} / {crop}: {self.title}'


# CropAssistanceRecord (Batch 5) retired in Batch 6 — its data was migrated
# into interventions.BeneficiaryRecord (program=null) and the model dropped.
# See interventions/migrations/0006_migrate_assistance_records.py and
# 0007_retire_source_assistance_tables.py.
