from django.db import models

from farmers.models import Farmer
from fisheries.models import Fisherfolk

from core.constants import BARANGAY_CHOICES


class FarmersAssociation(models.Model):
    REGISTRATION_AGENCY_CHOICES = [
        ('SEC',  'SEC — Securities and Exchange Commission'),
        ('CDA',  'CDA — Cooperative Development Authority'),
        ('DOLE', 'DOLE — Department of Labor and Employment'),
    ]

    name = models.CharField(max_length=200)
    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    street_address = models.CharField(max_length=200, blank=True, default='')
    registration_number = models.CharField(max_length=100, default='')
    dole_registration_number = models.CharField(max_length=100, blank=True, default='')
    bir_number = models.CharField(max_length=100, blank=True, default='')
    date_established = models.DateField(null=True, blank=True)
    date_organized = models.DateField(null=True, blank=False)
    date_registered = models.DateField(null=True, blank=False)
    registration_agency = models.CharField(max_length=10, choices=REGISTRATION_AGENCY_CHOICES)
    email_address = models.EmailField(default='')
    contact_person = models.CharField(max_length=150)
    contact_number = models.CharField(max_length=20)
    is_active = models.BooleanField(default=True)
    date_created = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class AssociationOfficer(models.Model):
    POSITION_CHOICES = [
        ('President',      'President'),
        ('Vice President', 'Vice President'),
        ('Secretary',      'Secretary'),
        ('Treasurer',      'Treasurer'),
        ('Auditor',        'Auditor'),
        ('Board Member',   'Board Member'),
        ('Manager',        'Manager'),
    ]

    association = models.ForeignKey(
        FarmersAssociation,
        on_delete=models.CASCADE,
        related_name='officers',
    )
    position  = models.CharField(max_length=50, choices=POSITION_CHOICES)
    full_name = models.CharField(max_length=200)

    class Meta:
        ordering = ['position', 'full_name']
        unique_together = [['association', 'position']]

    def __str__(self):
        return f'{self.position}: {self.full_name}'


class FarmersAssociationMember(models.Model):
    class Position(models.TextChoices):
        PRESIDENT = 'President', 'President'
        CHAIRPERSON = 'Chairperson', 'Chairperson'
        VICE_PRESIDENT = 'Vice President', 'Vice President'
        VICE_CHAIRPERSON = 'Vice Chairperson', 'Vice Chairperson'
        SECRETARY = 'Secretary', 'Secretary'
        TREASURER = 'Treasurer', 'Treasurer'
        AUDITOR = 'Auditor', 'Auditor'
        BOARD_MEMBER = 'Board Member', 'Board Member'
        MANAGER = 'Manager', 'Manager'
        MEMBER = 'Member', 'Member'

    association = models.ForeignKey(FarmersAssociation, on_delete=models.CASCADE, related_name='members')
    farmer = models.ForeignKey(Farmer, on_delete=models.CASCADE, related_name='farmer_associations')
    position = models.CharField(max_length=20, choices=Position.choices, default=Position.MEMBER)
    date_joined = models.DateField()

    class Meta:
        unique_together = [['association', 'farmer']]

    def __str__(self):
        return f'{self.farmer.full_name} — {self.association.name}'


class FarmersAssociationEquipment(models.Model):
    class EquipmentName(models.TextChoices):
        HAND_TRACTOR = 'Hand Tractor', 'Hand Tractor'
        FOUR_WHEEL_TRACTOR = 'Four-Wheel Tractor', 'Four-Wheel Tractor'
        RICE_THRESHER = 'Rice Thresher', 'Rice Thresher'
        CORN_SHELLER = 'Corn Sheller', 'Corn Sheller'
        WATER_PUMP = 'Water Pump/Irrigation Pump', 'Water Pump/Irrigation Pump'
        KNAPSACK_SPRAYER = 'Knapsack Sprayer', 'Knapsack Sprayer'
        POWER_SPRAYER = 'Power Sprayer', 'Power Sprayer'
        RICE_MILL = 'Rice Mill', 'Rice Mill'
        DRYER = 'Dryer', 'Dryer'
        STORAGE_FACILITY = 'Storage Facility', 'Storage Facility'
        POST_HARVEST = 'Post-Harvest Equipment', 'Post-Harvest Equipment'
        FARM_TOOLS = 'Farm Tools (Shovel, Hoe, etc.)', 'Farm Tools (Shovel, Hoe, etc.)'
        HARVESTING_EQUIPMENT = 'Harvesting Equipment', 'Harvesting Equipment'
        SEEDLING_TRAY = 'Seedling Tray', 'Seedling Tray'
        GREENHOUSE = 'Greenhouse/Net House', 'Greenhouse/Net House'
        GENERATOR = 'Generator', 'Generator'
        OTHER = 'Other', 'Other'

    class Condition(models.TextChoices):
        GOOD = 'Good', 'Good'
        NEEDS_REPAIR = 'Needs Repair', 'Needs Repair'
        NOT_OPERATIONAL = 'Not Operational', 'Not Operational'

    association = models.ForeignKey(FarmersAssociation, on_delete=models.CASCADE, related_name='equipment')
    equipment_name = models.CharField(max_length=50, choices=EquipmentName.choices)
    equipment_name_other = models.CharField(max_length=100, blank=True, default='')
    quantity = models.PositiveIntegerField()
    condition = models.CharField(max_length=20, choices=Condition.choices)
    acquisition_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    def __str__(self):
        return f'{self.equipment_name} — {self.association.name}'


class FisherfolkAssociation(models.Model):
    REGISTRATION_AGENCY_CHOICES = [
        ('SEC',  'SEC — Securities and Exchange Commission'),
        ('CDA',  'CDA — Cooperative Development Authority'),
        ('DOLE', 'DOLE — Department of Labor and Employment'),
        ('BFAR', 'BFAR — Bureau of Fisheries and Aquatic Resources'),
    ]

    name                = models.CharField(max_length=200)
    barangay            = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    street_address      = models.CharField(max_length=200, blank=True, default='')
    registration_number = models.CharField(max_length=100, blank=True, default='')
    date_established    = models.DateField(null=True, blank=True)
    date_organized      = models.DateField(null=True, blank=True)
    date_registered     = models.DateField(null=True, blank=True)
    registration_agency = models.CharField(max_length=10, choices=REGISTRATION_AGENCY_CHOICES, blank=True, default='')
    email_address       = models.EmailField(blank=True, default='')
    contact_person      = models.CharField(max_length=150)
    contact_number      = models.CharField(max_length=20)
    is_active           = models.BooleanField(default=True)
    date_created        = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class FisherfolkAssociationOfficer(models.Model):
    POSITION_CHOICES = [
        ('President',      'President'),
        ('Vice President', 'Vice President'),
        ('Secretary',      'Secretary'),
        ('Treasurer',      'Treasurer'),
        ('Auditor',        'Auditor'),
        ('Board Member',   'Board Member'),
        ('Manager',        'Manager'),
    ]

    association = models.ForeignKey(
        FisherfolkAssociation,
        on_delete=models.CASCADE,
        related_name='officers',
    )
    position  = models.CharField(max_length=50, choices=POSITION_CHOICES)
    full_name = models.CharField(max_length=200)

    class Meta:
        ordering = ['position', 'full_name']
        unique_together = [['association', 'position']]

    def __str__(self):
        return f'{self.position}: {self.full_name}'


class FisherfolkAssociationMember(models.Model):
    class Position(models.TextChoices):
        PRESIDENT = 'President', 'President'
        CHAIRPERSON = 'Chairperson', 'Chairperson'
        VICE_PRESIDENT = 'Vice President', 'Vice President'
        VICE_CHAIRPERSON = 'Vice Chairperson', 'Vice Chairperson'
        SECRETARY = 'Secretary', 'Secretary'
        TREASURER = 'Treasurer', 'Treasurer'
        AUDITOR = 'Auditor', 'Auditor'
        BOARD_MEMBER = 'Board Member', 'Board Member'
        MANAGER = 'Manager', 'Manager'
        MEMBER = 'Member', 'Member'

    association = models.ForeignKey(FisherfolkAssociation, on_delete=models.CASCADE, related_name='members')
    fisherfolk = models.ForeignKey(Fisherfolk, on_delete=models.CASCADE, related_name='fisherfolk_associations')
    position = models.CharField(max_length=20, choices=Position.choices, default=Position.MEMBER)
    date_joined = models.DateField()

    class Meta:
        unique_together = [['association', 'fisherfolk']]

    def __str__(self):
        return f'{self.fisherfolk.full_name} — {self.association.name}'


class FisherfolkAssociationEquipment(models.Model):
    class EquipmentName(models.TextChoices):
        FISHING_BOAT = 'Fishing Boat/Banca', 'Fishing Boat/Banca'
        MOTORIZED_BANCA = 'Motorized Banca', 'Motorized Banca'
        OUTBOARD_MOTOR = 'Outboard Motor', 'Outboard Motor'
        FISH_CAGE = 'Fish Cage', 'Fish Cage'
        GILL_NET = 'Fish Net (Gill Net)', 'Fish Net (Gill Net)'
        CAST_NET = 'Fish Net (Cast Net)', 'Fish Net (Cast Net)'
        TRAWL_NET = 'Fish Net (Trawl Net)', 'Fish Net (Trawl Net)'
        FISHING_LINES = 'Fishing Lines and Hooks', 'Fishing Lines and Hooks'
        FISH_POND = 'Fish Pond/Tank', 'Fish Pond/Tank'
        AERATOR = 'Aerator/Air Pump', 'Aerator/Air Pump'
        WATER_PUMP = 'Water Pump', 'Water Pump'
        LIFE_VEST = 'Life Vest/Safety Gear', 'Life Vest/Safety Gear'
        ICE_BOX = 'Ice Box/Cooler', 'Ice Box/Cooler'
        WEIGHING_SCALE = 'Fish Weighing Scale', 'Fish Weighing Scale'
        GPS = 'GPS/Navigation Equipment', 'GPS/Navigation Equipment'
        FEED_EQUIPMENT = 'Feeding Equipment', 'Feeding Equipment'
        HARVESTING_NET = 'Harvesting Net', 'Harvesting Net'
        GENERATOR = 'Generator', 'Generator'
        OTHER = 'Other', 'Other'

    class Condition(models.TextChoices):
        GOOD = 'Good', 'Good'
        NEEDS_REPAIR = 'Needs Repair', 'Needs Repair'
        NOT_OPERATIONAL = 'Not Operational', 'Not Operational'

    association = models.ForeignKey(FisherfolkAssociation, on_delete=models.CASCADE, related_name='equipment')
    equipment_name = models.CharField(max_length=50, choices=EquipmentName.choices)
    equipment_name_other = models.CharField(max_length=100, blank=True, default='')
    quantity = models.PositiveIntegerField()
    condition = models.CharField(max_length=20, choices=Condition.choices)
    acquisition_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    def __str__(self):
        return f'{self.equipment_name} — {self.association.name}'
