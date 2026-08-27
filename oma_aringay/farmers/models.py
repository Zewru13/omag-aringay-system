from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.constants import BARANGAY_CHOICES
from core.validators import (
    validate_parcel_number,
    validate_philsys,
    validate_rsbsa,
    validate_tax_declaration_number,
)


class Farmer(models.Model):
    class Gender(models.TextChoices):
        MALE = 'Male', 'Male'
        FEMALE = 'Female', 'Female'

    class CivilStatus(models.TextChoices):
        SINGLE = 'Single', 'Single'
        MARRIED = 'Married', 'Married'
        WIDOWED = 'Widowed', 'Widowed'
        SEPARATED = 'Separated', 'Separated'
        # Batch 8: civil_status is a required field but the RSBSA/BFAR
        # import source has no equivalent column — this is an explicit
        # "not determined from source" marker, not a guess at marital status.
        UNSPECIFIED = 'Unspecified', 'Unspecified'

    class Prefix(models.TextChoices):
        MR = 'Mr.', 'Mr.'
        MRS = 'Mrs.', 'Mrs.'
        MS = 'Ms.', 'Ms.'
        MISS = 'Miss', 'Miss'
        ENGR = 'Engr.', 'Engr.'
        DR = 'Dr.', 'Dr.'
        ATTY = 'Atty.', 'Atty.'
        HON = 'Hon.', 'Hon.'

    prefix = models.CharField(
        max_length=10,
        choices=Prefix.choices,
        blank=True,
        default='',
    )
    rsbsa_number = models.CharField(max_length=50, unique=True, validators=[validate_rsbsa])
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    birthdate = models.DateField()
    contact_number = models.CharField(max_length=20, blank=True)
    # Batch: citizen-uploaded, applies instantly (no staff review). Blank
    # for every existing record — this is opt-in, not backfilled.
    profile_picture = models.ImageField(upload_to='profile_pictures/farmers/', null=True, blank=True)
    # Batch: optional citizen-registration email. Not unique at this level —
    # this is a contact detail on the person's own record, not a login
    # identifier (that's User.email, set separately if/when a linked CITIZEN
    # account is created for them).
    email = models.EmailField(blank=True, null=True)
    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    municipality = models.CharField(max_length=100, default='Aringay')
    province = models.CharField(max_length=100, default='La Union')
    civil_status = models.CharField(max_length=20, choices=CivilStatus.choices)
    highest_education = models.CharField(max_length=150, blank=True)
    philsys_number = models.CharField(max_length=50, blank=True, validators=[validate_philsys])
    is_pwd = models.BooleanField(default=False)
    is_4ps_beneficiary = models.BooleanField(default=False)
    is_icc_ip_member = models.BooleanField(default=False)
    icc_ip_name = models.CharField(max_length=150, blank=True)
    is_senior_citizen = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # Batch 8: visibility/reporting flag only, distinguishing farm laborers
    # (farmworker=YES, farmer!=YES in the RSBSA/BFAR import) from farm
    # operators. No UI restrictions are tied to this flag.
    is_farm_laborer = models.BooleanField(default=False)
    date_registered = models.DateTimeField(auto_now_add=True)
    # Auto-updates on every save() — the only reliable "last touched" signal
    # on this model (no per-field change history exists; see
    # rsbsa_import_views.py's module docstring). null=True so existing rows
    # backfill to whenever they were last actually saved, rather than a
    # fabricated value — a row untouched since its original import keeps
    # whatever timestamp its last real save produced.
    updated_at = models.DateTimeField(auto_now=True, null=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registered_farmers',
    )
    farmers_organization = models.ForeignKey(
        'associations.FarmersOrganization',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='member_farmers',
        help_text="Organization this farmer belongs to (optional)",
    )
    # Toggle-not-delete batch: Farmers Organization membership has no join
    # row (it IS farmers_organization above), so "removing" a member can't
    # flip a status flag on a row the way Fisherfolk's join table can — this
    # flag lives on Farmer instead, representing whether the membership
    # itself is currently active. Deliberately separate from `is_active`
    # above (whole-record registry status, unrelated to org membership) —
    # a farmer can be a fully active registrant with an inactive org
    # membership, or vice versa.
    is_org_membership_active = models.BooleanField(default=True)

    @property
    def full_name(self):
        names = [self.first_name, self.middle_name, self.last_name]
        return ' '.join(name for name in names if name).strip()

    @property
    def age(self):
        if not self.birthdate:
            return None
        from datetime import date
        today = date.today()
        return today.year - self.birthdate.year - (
            (today.month, today.day) < (self.birthdate.month, self.birthdate.day)
        )

    def save(self, *args, **kwargs):
        self.is_senior_citizen = bool(self.birthdate and self.age is not None and self.age >= 60)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.rsbsa_number} - {self.full_name}'


class FarmParcel(models.Model):
    class LandOwnership(models.TextChoices):
        OWNER = 'Owner', 'Owner'
        TENANT = 'Tenant', 'Tenant'
        LESSEE = 'Lessee', 'Lessee'

    class CommodityType(models.TextChoices):
        RICE = 'Rice', 'Rice'
        CORN = 'Corn', 'Corn'
        VEGETABLES = 'Vegetables', 'Vegetables'
        HIGH_VALUE_CROPS = 'High-Value Crops', 'High-Value Crops'
        OTHER = 'Other', 'Other'

    class FarmStatus(models.TextChoices):
        ACTIVE = 'Active', 'Active'
        INACTIVE = 'Inactive', 'Inactive'

    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.CASCADE,
        related_name='farm_parcels',
    )
    parcel_number = models.CharField(
        max_length=50, blank=True,
        validators=[validate_parcel_number],
        help_text='Format: RR-PP-MM-BBB-SSS-LL-NNN, e.g. 01-33-02-005-001-02-003. Optional — not every parcel has one yet.',
    )
    area_hectares = models.DecimalField(max_digits=10, decimal_places=2)
    land_ownership = models.CharField(
        max_length=20,
        choices=LandOwnership.choices,
    )
    # RSBSA form's "Name of Land Owner" / "RSBSA Number" fields — only
    # meaningful when land_ownership is Tenant or Lessee (the farmer working
    # the land isn't the owner), but kept unconditional at the DB level
    # (blank=True, no CHECK constraint tied to land_ownership) since that's
    # the simplest, most honest schema — the frontend enforces the
    # conditional requirement, matching the real form's own conditional
    # logic ("Name of Land Owner" only appears when Type of Ownership/Tenure
    # isn't "Registered Owner").
    land_owner_name = models.CharField(
        max_length=200, blank=True,
        help_text='Only meaningful when land_ownership is Tenant or Lessee.',
    )
    land_owner_rsbsa_number = models.CharField(
        max_length=50, blank=True,
        validators=[validate_rsbsa],
        help_text='RSBSA number of the land owner (if different from the farmer). Same format as the farmer\'s own RSBSA number.',
    )
    tax_declaration_number = models.CharField(
        max_length=100, blank=True,
        validators=[validate_tax_declaration_number],
        help_text='Format: RR-MMM-BBBBB-YYYY-NNNN, e.g. 01-002-00005-2023-0142. Optional — not every parcel has one yet.',
    )
    commodity_type = models.CharField(max_length=50, blank=True)
    commodity_name = models.CharField(max_length=100, blank=True)
    farm_status = models.CharField(
        max_length=20,
        choices=FarmStatus.choices,
        default=FarmStatus.ACTIVE,
    )
    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)

    # Matches the official DA RSBSA Enrollment Form's Farm Type legend
    # exactly (codes 1-4 + N/A, N/A being fisheries-only and not applicable
    # here). Confirmed against the real form during the RSBSA document
    # review — the previous choice set (Irrigated/Rainfed/Upland/Lowland,
    # 4 flat unrelated options) didn't match the form at all. Verified
    # against live data first: zero real FarmParcel rows had any of those
    # old values set, so this is a pure choice-list correction, not a
    # remap of real data.
    FARM_TYPE_CHOICES = [
        ('Irrigated', 'Irrigated'),
        ('Rainfed Upland', 'Rainfed Upland'),
        ('Rainfed Lowland', 'Rainfed Lowland'),
        ('Urban or Peri-Urban', 'Urban or Peri-Urban'),
    ]
    CROPPING_SCHEDULE_CHOICES = [
        ('Single Cropping', 'Single Cropping'),
        ('Double Cropping', 'Double Cropping'),
        ('Triple Cropping', 'Triple Cropping'),
    ]

    farm_type = models.CharField(max_length=20, choices=FARM_TYPE_CHOICES, blank=True)
    is_organic = models.BooleanField(default=False)
    within_ancestral_domain = models.BooleanField(default=False)
    is_agrarian_reform_beneficiary = models.BooleanField(default=False)
    cropping_schedule = models.CharField(max_length=20, choices=CROPPING_SCHEDULE_CHOICES, blank=True)

    def update_commodity(self):
        top_crop = (
            self.crops.order_by('-area_hectares').first()
        )
        if top_crop:
            self.commodity_type = top_crop.crop_name
            if top_crop.crop_name == FarmCrop.CropName.OTHER:
                self.commodity_name = top_crop.crop_name_other
            else:
                self.commodity_name = top_crop.crop_name
        else:
            self.commodity_type = ''
            self.commodity_name = ''
        self.save(update_fields=['commodity_type', 'commodity_name'])

    def __str__(self):
        return f'{self.farmer.rsbsa_number} - Parcel {self.parcel_number}'


class FarmCrop(models.Model):
    class CropName(models.TextChoices):
        PALAY = 'Palay (Rice)', 'Palay (Rice)'
        CORN = 'Corn (Mais)', 'Corn (Mais)'
        ONION = 'Onion', 'Onion'
        GARLIC = 'Garlic', 'Garlic'
        TOMATO = 'Tomato', 'Tomato'
        EGGPLANT = 'Eggplant (Talong)', 'Eggplant (Talong)'
        BITTER_GOURD = 'Bitter Gourd (Ampalaya)', 'Bitter Gourd (Ampalaya)'
        STRING_BEANS = 'String Beans (Sitaw)', 'String Beans (Sitaw)'
        PECHAY = 'Pechay', 'Pechay'
        CABBAGE = 'Cabbage', 'Cabbage'
        MANGO = 'Mango', 'Mango'
        CACAO = 'Cacao (Kakaw)', 'Cacao (Kakaw)'
        BANANA = 'Banana (Saging)', 'Banana (Saging)'
        COFFEE = 'Coffee (Kape)', 'Coffee (Kape)'
        CASSAVA = 'Cassava', 'Cassava'
        SWEET_POTATO = 'Sweet Potato (Kamote)', 'Sweet Potato (Kamote)'
        OTHER_VEGETABLES = 'Other Vegetables', 'Other Vegetables'
        OTHER_FRUITS = 'Other Fruits', 'Other Fruits'
        OTHER_ROOT_CROPS = 'Other Root Crops', 'Other Root Crops'
        CASH_CROPS = 'Cash Crops', 'Cash Crops'
        OTHER = 'Other', 'Other'

    farm_parcel = models.ForeignKey(
        FarmParcel,
        on_delete=models.CASCADE,
        related_name='crops',
    )
    SEED_SOURCE_CHOICES = [
        ('Certified Seed', 'Certified Seed'),
        ('Farmer-saved Seed', 'Farmer-saved Seed'),
        ('Hybrid Seed', 'Hybrid Seed'),
        ('OPV Seed', 'OPV (Open-Pollinated Variety)'),
        ('Other', 'Other'),
    ]
    SEEDS_UNIT_CHOICES = [
        ('kg', 'kg'),
        ('bag', 'bag (50kg)'),
        ('piece', 'piece (seedling)'),
    ]

    crop_name = models.CharField(max_length=100, choices=CropName.choices)
    crop_name_other = models.CharField(max_length=100, blank=True)
    area_hectares = models.DecimalField(max_digits=10, decimal_places=4)
    is_main_crop = models.BooleanField(default=False)
    number_of_trees = models.PositiveIntegerField(null=True, blank=True)
    variety_used = models.CharField(max_length=100, blank=True)
    seed_source = models.CharField(max_length=30, choices=SEED_SOURCE_CHOICES, blank=True)
    quantity_of_seeds_used = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    seeds_unit = models.CharField(max_length=10, choices=SEEDS_UNIT_CHOICES, blank=True)

    def __str__(self):
        return f'{self.crop_name} - {self.farm_parcel}'


class FarmMachinery(models.Model):
    class MachineryType(models.TextChoices):
        HAND_TRACTOR = 'Hand Tractor', 'Hand Tractor'
        FOUR_WHEEL_TRACTOR = 'Four-Wheel Tractor', 'Four-Wheel Tractor'
        THRESHER = 'Thresher', 'Thresher'
        WATER_PUMP = 'Water Pump', 'Water Pump'
        SPRAYER = 'Sprayer', 'Sprayer'
        HARVESTER = 'Harvester', 'Harvester'
        RICE_MILL = 'Rice Mill', 'Rice Mill'
        OTHER = 'Other', 'Other'

    class Ownership(models.TextChoices):
        OWNED = 'Owned', 'Owned'
        BORROWED = 'Borrowed', 'Borrowed'
        RENTED = 'Rented', 'Rented'
        ORGANIZATION = 'Organization-Owned', 'Organization-Owned'

    farm_parcel = models.ForeignKey(
        FarmParcel,
        on_delete=models.CASCADE,
        related_name='machinery',
    )
    machinery_type = models.CharField(max_length=30, choices=MachineryType.choices)
    machinery_type_other = models.CharField(max_length=100, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    ownership = models.CharField(max_length=20, choices=Ownership.choices)

    def __str__(self):
        return f'{self.machinery_type} - {self.farm_parcel}'


@receiver(post_save, sender=FarmCrop)
def on_crop_save(sender, instance, **kwargs):
    instance.farm_parcel.update_commodity()


@receiver(post_delete, sender=FarmCrop)
def on_crop_delete(sender, instance, **kwargs):
    instance.farm_parcel.update_commodity()
