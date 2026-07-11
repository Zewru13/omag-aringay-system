from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.constants import BARANGAY_CHOICES
from core.validators import validate_philsys, validate_rsbsa


class Farmer(models.Model):
    class Gender(models.TextChoices):
        MALE = 'Male', 'Male'
        FEMALE = 'Female', 'Female'

    class CivilStatus(models.TextChoices):
        SINGLE = 'Single', 'Single'
        MARRIED = 'Married', 'Married'
        WIDOWED = 'Widowed', 'Widowed'
        SEPARATED = 'Separated', 'Separated'

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
    date_registered = models.DateTimeField(auto_now_add=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registered_farmers',
    )
    farmers_association = models.ForeignKey(
        'associations.FarmersAssociation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='member_farmers',
        help_text="Association this farmer belongs to (optional)",
    )

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
    parcel_number = models.CharField(max_length=50)
    area_hectares = models.DecimalField(max_digits=10, decimal_places=2)
    land_ownership = models.CharField(
        max_length=20,
        choices=LandOwnership.choices,
    )
    tax_declaration_number = models.CharField(max_length=100, blank=True)
    commodity_type = models.CharField(max_length=50, blank=True)
    commodity_name = models.CharField(max_length=100, blank=True)
    farm_status = models.CharField(
        max_length=20,
        choices=FarmStatus.choices,
        default=FarmStatus.ACTIVE,
    )
    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)

    FARM_TYPE_CHOICES = [
        ('Irrigated', 'Irrigated'),
        ('Rainfed', 'Rainfed'),
        ('Upland', 'Upland'),
        ('Lowland', 'Lowland'),
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
        ASSOCIATION = 'Association-Owned', 'Association-Owned'

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
