from django.conf import settings
from django.db import models
from core.constants import BARANGAY_CHOICES


class Fisherfolk(models.Model):
    class Gender(models.TextChoices):
        MALE = 'Male', 'Male'
        FEMALE = 'Female', 'Female'

    class FisherfolkType(models.TextChoices):
        AQUACULTURE = 'Aquaculture', 'Aquaculture'
        CAPTURE = 'Capture', 'Capture Fishery'
        MARICULTURE = 'Mariculture', 'Mariculture'
        INLAND = 'Inland', 'Inland Fishery'
        VENDOR = 'Vendor', 'Fish Vendor'

    class Prefix(models.TextChoices):
        MR = 'Mr.', 'Mr.'
        MRS = 'Mrs.', 'Mrs.'
        MS = 'Ms.', 'Ms.'
        ENGR = 'Engr.', 'Engr.'
        DR = 'Dr.', 'Dr.'
        HON = 'Hon.', 'Hon.'

    prefix = models.CharField(
        max_length=10,
        choices=Prefix.choices,
        blank=True,
        default='',
    )
    lgu_registration_number = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    birthdate = models.DateField()
    contact_number = models.CharField(max_length=20, blank=True)
    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    municipality = models.CharField(max_length=100, default='Aringay')
    fisherfolk_type = models.CharField(
        max_length=20,
        choices=FisherfolkType.choices,
    )
    is_active = models.BooleanField(default=True)
    date_registered = models.DateTimeField(auto_now_add=True)

    # Aquaculture / Mariculture facility profile fields
    facility_location = models.CharField(max_length=200, blank=True)
    pond_area_ha = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    number_of_ponds = models.PositiveIntegerField(null=True, blank=True)
    water_source = models.CharField(max_length=100, blank=True)
    number_of_cages = models.PositiveIntegerField(null=True, blank=True)
    cage_dimensions = models.CharField(max_length=100, blank=True)
    fish_registration_number = models.CharField(max_length=20, blank=True)
    boat_registration_number = models.CharField(max_length=20, blank=True)
    has_vessel = models.BooleanField(default=True)

    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registered_fisherfolk',
    )

    @property
    def full_name(self):
        names = [self.first_name, self.middle_name, self.last_name]
        return ' '.join(name for name in names if name).strip()

    def __str__(self):
        return f'{self.lgu_registration_number} - {self.full_name}'


class AquacultureRecord(models.Model):
    class CultureType(models.TextChoices):
        FISH_CAGE = 'Fish Cage', 'Fish Cage'
        FISH_POND = 'Fish Pond', 'Fish Pond'
        FISH_PEN = 'Fish Pen', 'Fish Pen'
        POND_CAGE = 'Pond Cage', 'Pond Cage'
        PEN_TANK = 'Pen Tank', 'Pen Tank'
        OTHER = 'Other', 'Other'

    fisherfolk = models.OneToOneField(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='aquaculture_record',
    )
    culture_type = models.CharField(max_length=30, choices=CultureType.choices)
    species_cultured = models.CharField(max_length=100)
    area_hectares = models.DecimalField(max_digits=10, decimal_places=2)
    fingerlings_stocked = models.PositiveIntegerField()
    production_volume_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f'Aquaculture - {self.fisherfolk.lgu_registration_number}'


class CaptureRecord(models.Model):
    class VesselType(models.TextChoices):
        MOTORIZED = 'Motorized', 'Motorized'
        NON_MOTORIZED = 'Non-Motorized', 'Non-Motorized'
        NO_VESSEL = 'No Vessel', 'No Vessel'

    class VesselMaterial(models.TextChoices):
        WOODEN = 'Wooden', 'Wooden'
        COMPOSITE = 'Composite', 'Composite'
        FIBERGLASS = 'Fiberglass', 'Fiberglass'
        STEEL = 'Steel', 'Steel'
        OTHER = 'Other', 'Other'

    fisherfolk = models.OneToOneField(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='capture_record',
    )
    vessel_type = models.CharField(max_length=20, choices=VesselType.choices)
    vessel_material = models.CharField(
        max_length=20,
        choices=VesselMaterial.choices,
        blank=True,
        null=True,
    )
    vessel_registration_number = models.CharField(max_length=100, blank=True)
    fishing_gear_type = models.CharField(max_length=100)
    fishing_ground = models.CharField(max_length=100)
    average_catch_per_trip_kg = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f'Capture - {self.fisherfolk.lgu_registration_number}'


class VendorRecord(models.Model):
    class LocationType(models.TextChoices):
        FIXED_STALL = 'Fixed Stall', 'Fixed Stall'
        MARKET_STALL = 'Market Stall', 'Market Stall'
        AMBULANT = 'Ambulant / No Fixed Location', 'Ambulant / No Fixed Location'
        OTHER = 'Other', 'Other'

    fisherfolk = models.OneToOneField(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='vendor_record',
    )
    location_type = models.CharField(
        max_length=30,
        choices=LocationType.choices,
        default=LocationType.FIXED_STALL,
    )
    stall_location = models.CharField(max_length=150, blank=True, null=True)
    type_of_products_sold = models.CharField(max_length=150, verbose_name='Commodity')
    source_of_fish = models.CharField(max_length=150)

    def __str__(self):
        return f'Vendor - {self.fisherfolk.lgu_registration_number}'
