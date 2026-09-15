from django.db import models
from django.utils import timezone

from farmers.models import Farmer
from fisheries.models import Fisherfolk

from core.constants import BARANGAY_CHOICES


def _plus_two_years(d):
    """term_start_date + 2 years, landing on Feb 28 if term_start_date was a
    Feb 29 that doesn't recur two years later."""
    try:
        return d.replace(year=d.year + 2)
    except ValueError:
        return d.replace(year=d.year + 2, day=28)


class FarmersOrganization(models.Model):
    REGISTRATION_AGENCY_CHOICES = [
        ('SEC',  'SEC — Securities and Exchange Commission'),
        ('CDA',  'CDA — Cooperative Development Authority'),
        ('DOLE', 'DOLE — Department of Labor and Employment'),
    ]

    name = models.CharField(max_length=200)
    barangay = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    street_address = models.CharField(max_length=200, blank=True, default='')
    # Batch 10: unique=True added — this is now also the login identifier
    # for this organization's self-service CITIZEN account (see
    # accounts.views.LoginView), which requires a reliable 1:1 mapping.
    # Confirmed safe: 0 duplicate values among existing real records.
    registration_number = models.CharField(max_length=100, unique=True, default='')
    dole_registration_number = models.CharField(max_length=100, blank=True, default='')
    bir_number = models.CharField(max_length=100, blank=True, default='')
    date_established = models.DateField(null=True, blank=True)
    date_organized = models.DateField(null=True, blank=False)
    date_registered = models.DateField(null=True, blank=False)
    registration_agency = models.CharField(max_length=10, choices=REGISTRATION_AGENCY_CHOICES)
    # Batch: was missing blank=True (unlike FisherfolkOrganization.email_address
    # below, which already had it) — required at the model level despite the
    # field being genuinely optional. Fixed for consistency between the two org
    # types; default='' unchanged.
    email_address = models.EmailField(blank=True, default='')
    contact_person = models.CharField(max_length=150)
    contact_number = models.CharField(max_length=20)
    # Batch: citizen-uploaded organization logo, applies instantly.
    logo = models.ImageField(upload_to='logos/farmers_orgs/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    date_created = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Backstop matching FarmersOrganizationListCreateView's own
        # explicit -date_created, -id ordering — see CropMonitoringRecord.Meta
        # (production/models.py) for why.
        ordering = ['-date_created', '-id']

    def __str__(self):
        return self.name


class OrganizationOfficer(models.Model):
    POSITION_CHOICES = [
        ('President',      'President'),
        ('Vice President', 'Vice President'),
        ('Secretary',      'Secretary'),
        ('Treasurer',      'Treasurer'),
        ('Auditor',        'Auditor'),
        ('Board Member',   'Board Member'),
        ('Manager',        'Manager'),
    ]

    organization = models.ForeignKey(
        FarmersOrganization,
        on_delete=models.CASCADE,
        related_name='officers',
    )
    # Farmers Organizations track membership via Farmer.farmers_organization
    # directly (not a join table — see FarmersOrganizationMember's docstring
    # below), so the officer's real link is straight to Farmer. SET_NULL
    # (not CASCADE) so a hard Farmer deletion doesn't silently wipe the
    # historical officer record — full_name survives as a display cache.
    # Null only for pre-Batch-4 legacy rows entered as free text.
    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='officer_positions',
    )
    position  = models.CharField(max_length=50, choices=POSITION_CHOICES)
    full_name = models.CharField(max_length=200)

    # Batch: 2-year officer terms with full history. A row is never deleted
    # or overwritten on any kind of exit (early end, natural completion,
    # reassignment, membership deactivation) — is_active=False plus the
    # term_end_date/early_exit_reason it ended with IS the historical
    # record. unique_together deliberately removed: multiple historical
    # rows per (organization, position) are now expected; "only one current
    # holder per position" is enforced in the view instead (is_active=True
    # uniqueness can't be a DB constraint on MySQL, which has no partial/
    # conditional unique index support).
    term_start_date = models.DateField(default=timezone.localdate)
    term_end_date = models.DateField(null=True, blank=True)
    early_exit_reason = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['position', 'full_name']

    def save(self, *args, **kwargs):
        if self.term_end_date is None and self.term_start_date:
            self.term_end_date = _plus_two_years(self.term_start_date)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.position}: {self.full_name}'


class FarmersOrganizationMember(models.Model):
    """
    NOTE (Batch 4): live Farmers Organization membership is actually tracked
    via Farmer.farmers_organization (a direct FK, set from the farmer's own
    profile) — that's what OrganizationDetailPage's Members tab and the
    officer-assignment search both read from. This join table exists but is
    currently unused by the frontend (0 real rows); left in place/dormant
    rather than removed, matching this project's convention of not deleting
    infrastructure that might be wired up later.
    """
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

    organization = models.ForeignKey(FarmersOrganization, on_delete=models.CASCADE, related_name='members')
    farmer = models.ForeignKey(Farmer, on_delete=models.CASCADE, related_name='farmer_organizations')
    position = models.CharField(max_length=20, choices=Position.choices, default=Position.MEMBER)
    date_joined = models.DateField()

    class Meta:
        unique_together = [['organization', 'farmer']]

    def __str__(self):
        return f'{self.farmer.full_name} — {self.organization.name}'


class FarmersOrganizationEquipment(models.Model):
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

    organization = models.ForeignKey(FarmersOrganization, on_delete=models.CASCADE, related_name='equipment')
    equipment_name = models.CharField(max_length=50, choices=EquipmentName.choices)
    equipment_name_other = models.CharField(max_length=100, blank=True, default='')
    quantity = models.PositiveIntegerField()
    condition = models.CharField(max_length=20, choices=Condition.choices)
    acquisition_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    def __str__(self):
        return f'{self.equipment_name} — {self.organization.name}'


class FisherfolkOrganization(models.Model):
    REGISTRATION_AGENCY_CHOICES = [
        ('SEC',  'SEC — Securities and Exchange Commission'),
        ('CDA',  'CDA — Cooperative Development Authority'),
        ('DOLE', 'DOLE — Department of Labor and Employment'),
        ('BFAR', 'BFAR — Bureau of Fisheries and Aquatic Resources'),
    ]

    name                = models.CharField(max_length=200)
    barangay            = models.CharField(max_length=100, choices=BARANGAY_CHOICES)
    street_address      = models.CharField(max_length=200, blank=True, default='')
    # Batch 10: unique=True added — see FarmersOrganization.registration_number
    # comment. Left blank=True unchanged (a business-rule call outside this
    # batch's scope); a second org saved with a blank value would correctly
    # fail at the database's unique constraint rather than silently colliding.
    registration_number = models.CharField(max_length=100, unique=True, blank=True, default='')
    date_established    = models.DateField(null=True, blank=True)
    date_organized      = models.DateField(null=True, blank=True)
    date_registered     = models.DateField(null=True, blank=True)
    registration_agency = models.CharField(max_length=10, choices=REGISTRATION_AGENCY_CHOICES, blank=True, default='')
    email_address       = models.EmailField(blank=True, default='')
    contact_person      = models.CharField(max_length=150)
    contact_number      = models.CharField(max_length=20)
    # Batch: citizen-uploaded organization logo, applies instantly.
    logo                = models.ImageField(upload_to='logos/fisherfolk_orgs/', null=True, blank=True)
    is_active           = models.BooleanField(default=True)
    date_created        = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Backstop matching FisherfolkOrganizationListCreateView's own
        # explicit -date_created, -id ordering — see CropMonitoringRecord.Meta
        # (production/models.py) for why.
        ordering = ['-date_created', '-id']

    def __str__(self):
        return self.name


class FisherfolkOrganizationOfficer(models.Model):
    POSITION_CHOICES = [
        ('President',      'President'),
        ('Vice President', 'Vice President'),
        ('Secretary',      'Secretary'),
        ('Treasurer',      'Treasurer'),
        ('Auditor',        'Auditor'),
        ('Board Member',   'Board Member'),
        ('Manager',        'Manager'),
    ]

    organization = models.ForeignKey(
        FisherfolkOrganization,
        on_delete=models.CASCADE,
        related_name='officers',
    )
    # Fisherfolk Organizations DO use FisherfolkOrganizationMember as the real
    # membership join table, so the officer links straight to that row (not
    # to Fisherfolk directly). CASCADE remains as a safety net for a genuine
    # row deletion, but the normal "remove a member" path no longer deletes
    # this row at all (toggle-not-delete batch) — it flips
    # FisherfolkOrganizationMember.is_active instead, so the officer-clear
    # on deactivation is now explicit view-layer logic, not this cascade.
    member = models.ForeignKey(
        'FisherfolkOrganizationMember',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='officer_position',
    )
    position  = models.CharField(max_length=50, choices=POSITION_CHOICES)
    full_name = models.CharField(max_length=200)

    # Batch: 2-year officer terms with full history — see
    # OrganizationOfficer's identical fields/comment above.
    term_start_date = models.DateField(default=timezone.localdate)
    term_end_date = models.DateField(null=True, blank=True)
    early_exit_reason = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['position', 'full_name']

    def save(self, *args, **kwargs):
        if self.term_end_date is None and self.term_start_date:
            self.term_end_date = _plus_two_years(self.term_start_date)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.position}: {self.full_name}'


class FisherfolkOrganizationMember(models.Model):
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

    organization = models.ForeignKey(FisherfolkOrganization, on_delete=models.CASCADE, related_name='members')
    fisherfolk = models.ForeignKey(Fisherfolk, on_delete=models.CASCADE, related_name='fisherfolk_organizations')
    position = models.CharField(max_length=20, choices=Position.choices, default=Position.MEMBER)
    date_joined = models.DateField()
    # Toggle-not-delete batch: "removing" a member now deactivates this row
    # instead of deleting it — the row (and any assistance-distribution
    # history attributed through it) survives. Deliberately NOT reusing
    # FisherfolkOrganization/Fisherfolk's own `is_active` — this represents
    # membership-in-this-org status, not the org's or the person's own
    # whole-record status, which are independent.
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [['organization', 'fisherfolk']]

    def __str__(self):
        return f'{self.fisherfolk.full_name} — {self.organization.name}'


class FisherfolkOrganizationEquipment(models.Model):
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

    organization = models.ForeignKey(FisherfolkOrganization, on_delete=models.CASCADE, related_name='equipment')
    equipment_name = models.CharField(max_length=50, choices=EquipmentName.choices)
    equipment_name_other = models.CharField(max_length=100, blank=True, default='')
    quantity = models.PositiveIntegerField()
    condition = models.CharField(max_length=20, choices=Condition.choices)
    acquisition_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    def __str__(self):
        return f'{self.equipment_name} — {self.organization.name}'
