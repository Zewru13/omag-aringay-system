from django.conf import settings
from django.db import models
from django.utils import timezone

from associations.models import FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember
from farmers.models import Farmer
from fisheries.models import Fisherfolk


class DistributionStatus(models.TextChoices):
    """
    Shared by both BeneficiaryRecord and FisherfolkBeneficiaryRecord — one
    lifecycle, one set of labels, so the two domains can never drift apart
    on wording the way separate per-model TextChoices classes eventually
    would.

    PENDING              date_given is in the future; nothing has happened
                          yet, nothing is shown to the recipient.
    AWAITING_CONFIRMATION date_given has arrived (set lazily — see
                          interventions.lifecycle.advance_due_distributions,
                          no scheduler); the recipient has been notified and
                          can now Confirm or Report Not Received.
    CONFIRMED            either the recipient confirmed receipt (real
                          lifecycle, confirmed_at set), or date_given was
                          today-or-past at creation time, in which case this
                          is set immediately and confirmed_at stays null —
                          the pre-existing, already-tested "logging
                          something that already happened" path, not a
                          confirmation event.
    NOT_RECEIVED         the recipient reported non-receipt; open, needs
                          staff follow-up.
    RESOLVED             staff closed out a NOT_RECEIVED case.
    """
    PENDING = 'PENDING', 'Pending'
    AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION', 'Awaiting Confirmation'
    CONFIRMED = 'CONFIRMED', 'Confirmed'
    NOT_RECEIVED = 'NOT_RECEIVED', 'Not Received'
    RESOLVED = 'RESOLVED', 'Resolved'


def _resolve_attributed_organization(candidates, own_barangay):
    """
    Batch 7: shared resolution algorithm for BOTH BeneficiaryRecord and
    FisherfolkBeneficiaryRecord, applied to whichever list of organizations
    is that person's actual live membership set:
      - farmers: every FarmersOrganization from that farmer's active
        FarmersOrganizationMember rows (Batch Phase B — this used to be at
        most one, from the single Farmer.farmers_organization FK, which
        made the 2+ branches below unreachable for farmers; farmers can now
        genuinely belong to more than one organization, same as fisherfolk).
      - fisherfolk: every FisherfolkOrganization from that fisherfolk's
        active FisherfolkOrganizationMember rows.
    Both domains run the identical resolution below on the identical shape
    of input, so they can never drift.

    NOTE: this is a live best-guess, not a source of truth — see
    FarmersOrganizationMember.is_main / FisherfolkOrganizationMember.is_main
    for the real, staff-confirmed "main organization" a person has, which
    this function does not consult (it predates is_main and is kept as the
    general-purpose attribution guess used for reporting/notifications; the
    30-day cross-org duplicate-assistance check in associations/views.py
    deliberately does NOT rely on this function's output to decide "is this
    my own record" — see _run_organization_distribution's own comment for
    why, and distributed_by_organization below for the fix).
    Resolution:
      0 candidates       -> None
      1 candidate        -> that one (barangay irrelevant)
      2+, exactly 1 match -> the matching one
      2+, 0 matches       -> None (don't guess)
      2+, 2+ matches      -> None (data-quality anomaly — organizations are
                              meant to be barangay-exclusive; caller should
                              treat this as worth a manual look, not silence)
    """
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    matches = [org for org in candidates if org.barangay == own_barangay]
    if len(matches) == 1:
        return matches[0]
    return None


# Batch: the formal InterventionProgram campaign system (and its
# quantity_given/unit fields, program-mode-only and never used by a single
# real row) was fully removed — every BeneficiaryRecord is now what used to
# be called "ad-hoc": a standalone assistance log entry, no campaign.
class BeneficiaryRecord(models.Model):
    class AssistanceType(models.TextChoices):
        # Mirrors production.models.CropAssistanceRecord.ASSISTANCE_TYPE_CHOICES exactly.
        FERTILIZER = 'Fertilizer', 'Fertilizer'
        SEEDS = 'Seeds', 'Seeds'
        EQUIPMENT = 'Equipment', 'Equipment'
        CASH_ASSISTANCE = 'Cash Assistance', 'Cash Assistance'
        TRAINING = 'Training', 'Training'
        OTHER = 'Other', 'Other'

    class Season(models.TextChoices):
        DRY = 'Dry', 'Dry'
        WET = 'Wet', 'Wet'

    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
    )
    date_given = models.DateField()
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_beneficiary_records',
    )

    # Absorbed from production.models.CropAssistanceRecord (Batch 6).
    assistance_type = models.CharField(max_length=30, choices=AssistanceType.choices, blank=True)
    source_agency = models.CharField(max_length=150, blank=True)
    quantity = models.CharField(max_length=100, blank=True)
    season = models.CharField(max_length=10, choices=Season.choices, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)

    # Batch 7: computed at save() time, not exposed as a writable API field —
    # see _resolve_attributed_organization's docstring above for the algorithm.
    attributed_organization = models.ForeignKey(
        FarmersOrganization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attributed_beneficiary_records',
    )
    # Batch (Phase B — Phase A gap fix): set ONLY by
    # associations.views._run_organization_distribution, to the real
    # organization object that ran THAT bulk-distribution request — durable,
    # never recomputed, and independent of attributed_organization (which is
    # a live barangay-match guess that can name a DIFFERENT organization
    # than the one whose button was actually clicked). The 30-day cross-org
    # duplicate check keys off this field when present, exactly so a record
    # created by org Y's distribution can never be mistaken for org X's own
    # past record just because attribution happened to resolve to X. Null
    # for every record created outside that one bulk-distribution flow
    # (individual "Report/Log Assistance" entries) — those still fall back
    # to attributed_organization in the duplicate check, unchanged.
    distributed_by_organization = models.ForeignKey(
        FarmersOrganization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='direct_distributed_beneficiary_records',
    )

    # Scheduled distribution + confirmation lifecycle. status is server-
    # computed on CREATE only (see save() below) — never a writable API
    # field, same discipline as attributed_organization above. Default here
    # exists only to backfill the migration (every real row today is
    # past-dated, so CONFIRMED is the correct value for 100% of existing
    # data); every future INSERT sets it explicitly in save().
    status = models.CharField(
        max_length=25, choices=DistributionStatus.choices, default=DistributionStatus.CONFIRMED,
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    non_receipt_reason = models.TextField(blank=True)
    follow_up_notes = models.TextField(blank=True)

    class Meta:
        # Backstop matching every real BeneficiaryRecord queryset's own
        # explicit -date_given, -id ordering — see CropMonitoringRecord.Meta
        # (production/models.py) for why.
        ordering = ['-date_given', '-id']

    def save(self, *args, **kwargs):
        if self.farmer_id:
            farmer = self.farmer
            candidates = [
                m.organization for m in
                FarmersOrganizationMember.objects.filter(farmer_id=self.farmer_id, is_active=True).select_related('organization')
            ]
            self.attributed_organization = _resolve_attributed_organization(candidates, farmer.barangay)
        else:
            self.attributed_organization = None
        if self._state.adding:
            self.status = (
                DistributionStatus.CONFIRMED if self.date_given and self.date_given <= timezone.localdate()
                else DistributionStatus.PENDING
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.assistance_type or "Ad-hoc"} - {self.farmer.full_name}'


# Absorbs fisheries.models.FisheriesAssistanceRecord — which is why this
# model additionally carries `description` as a field distinct from
# `remarks` (the retiring model had both, holding genuinely different data —
# description was a required summary, remarks was a free optional note — so
# both are preserved rather than collapsed into one).
class FisherfolkBeneficiaryRecord(models.Model):
    class AssistanceType(models.TextChoices):
        # Mirrors fisheries.models.FisheriesAssistanceRecord.ASSISTANCE_TYPE_CHOICES exactly.
        FISHING_GEAR = 'Fishing Gear', 'Fishing Gear'
        BOAT_VESSEL = 'Boat/Vessel', 'Boat/Vessel'
        FINGERLINGS_SEEDS = 'Fingerlings/Seeds', 'Fingerlings/Seeds'
        FEED = 'Feed', 'Feed'
        EQUIPMENT = 'Equipment', 'Equipment'
        CASH_ASSISTANCE = 'Cash Assistance', 'Cash Assistance'
        TRAINING = 'Training', 'Training'
        OTHER = 'Other', 'Other'

    fisherfolk = models.ForeignKey(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
    )
    date_given = models.DateField()
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_fisherfolk_beneficiary_records',
    )

    # Absorbed from fisheries.models.FisheriesAssistanceRecord (Batch 6).
    assistance_type = models.CharField(max_length=30, choices=AssistanceType.choices, blank=True)
    source_agency = models.CharField(max_length=150, blank=True)
    quantity = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=300, blank=True)
    season = models.CharField(max_length=20, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)

    # Batch 7: computed at save() time from FisherfolkOrganizationMember —
    # the live, genuinely-multi-capable membership mechanism for fisherfolk
    # (unlike the farmer side, Fisherfolk.fisherfolk_organization is a
    # write-only direct FK set at registration but never read back anywhere
    # in the frontend, so it is NOT used as a resolution candidate here).
    attributed_fisherfolk_organization = models.ForeignKey(
        FisherfolkOrganization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attributed_beneficiary_records',
    )
    # Batch (Phase B — Phase A gap fix): see BeneficiaryRecord.
    # distributed_by_organization's comment — identical field and purpose,
    # fisherfolk side.
    distributed_by_organization = models.ForeignKey(
        FisherfolkOrganization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='direct_distributed_beneficiary_records',
    )

    # Same lifecycle as BeneficiaryRecord — see DistributionStatus and that
    # model's save() comment for the exact reasoning, shared verbatim here.
    status = models.CharField(
        max_length=25, choices=DistributionStatus.choices, default=DistributionStatus.CONFIRMED,
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    non_receipt_reason = models.TextField(blank=True)
    follow_up_notes = models.TextField(blank=True)

    class Meta:
        # Backstop matching every real FisherfolkBeneficiaryRecord
        # queryset's own explicit -date_given, -id ordering — see
        # BeneficiaryRecord.Meta above for why.
        ordering = ['-date_given', '-id']

    def save(self, *args, **kwargs):
        if self.fisherfolk_id:
            fisherfolk = self.fisherfolk
            candidates = [
                m.organization for m in
                FisherfolkOrganizationMember.objects.filter(fisherfolk_id=self.fisherfolk_id, is_active=True).select_related('organization')
            ]
            self.attributed_fisherfolk_organization = _resolve_attributed_organization(candidates, fisherfolk.barangay)
        else:
            self.attributed_fisherfolk_organization = None
        if self._state.adding:
            self.status = (
                DistributionStatus.CONFIRMED if self.date_given and self.date_given <= timezone.localdate()
                else DistributionStatus.PENDING
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.assistance_type or "Ad-hoc"} - {self.fisherfolk.full_name}'
