from django.utils import timezone

from core.notifications import notify_user

from .models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord


def advance_due_distributions(user):
    """
    Lazy status transition for the scheduled-distribution lifecycle — no job
    scheduler. Flips any of THIS user's own PENDING beneficiary records
    whose date_given has arrived to AWAITING_CONFIRMATION, and notifies them
    individually (notify_user — targeted, never a fan-out, same discipline
    the notify_all_except fan-out bug fix established).

    Called from exactly two places, deliberately not scattered further:
      - accounts.views.MeView.get() — the session-bootstrap call every
        citizen screen loads through AuthContext on app start, so a citizen
        picks up any newly-due distribution the moment they open the app,
        without a background job.
      - interventions.views.MyBeneficiaryHistoryView / their fisherfolk
        equivalent — so the one screen that actually displays these records
        never shows a stale PENDING when the date has already passed, even
        on a session that's been open a while.
    Both call sites are read endpoints already gated to CITIZEN; this
    function re-checks role/linked_record_type itself so it's safe to call
    unconditionally without the caller needing to guard first.

    No-ops immediately (cheap: one attribute check, no query) for staff,
    organization citizens, or anyone with no linked FARMER/FISHERFOLK
    record — the vast majority of MeView's real traffic.
    """
    if user.role != 'CITIZEN' or not user.linked_record_id:
        return

    today = timezone.localdate()

    if user.linked_record_type == 'FARMER':
        due = BeneficiaryRecord.objects.filter(
            farmer_id=user.linked_record_id,
            status=DistributionStatus.PENDING,
            date_given__lte=today,
        )
        record_type = 'beneficiary'
    elif user.linked_record_type == 'FISHERFOLK':
        due = FisherfolkBeneficiaryRecord.objects.filter(
            fisherfolk_id=user.linked_record_id,
            status=DistributionStatus.PENDING,
            date_given__lte=today,
        )
        # 'fisherfolk_beneficiary' (22 chars) exceeds Notification.record_type's
        # max_length=20 and gets silently swallowed by _safe_bulk's DB-error
        # handling — same short form used by the report-not-received view.
        record_type = 'ff_beneficiary'
    else:
        return

    for record in due:
        record.status = DistributionStatus.AWAITING_CONFIRMATION
        record.save()
        notify_user(
            recipient=user,
            actor=None,
            verb='is ready for you to confirm',
            record_type=record_type,
            record_id=record.id,
            record_label=f'{record.assistance_type or "Assistance"} — {record.date_given}',
            detail='Please confirm you received this, or report that you did not.',
        )


def advance_due_distributions_for_org(org_linked_type, org_id):
    """
    Accountless-beneficiary counterpart to advance_due_distributions above.
    That function only ever advances a record when the RECIPIENT's own
    account calls in (MeView / MyBeneficiaryHistoryView) — which a genuinely
    accountless beneficiary (see accounts.utils.accountless_or_unactivated_ids)
    structurally never can. Without this, a future-scheduled distribution
    for such a person would sit at PENDING forever once its date arrived,
    never reaching AWAITING_CONFIRMATION — the precondition
    BeneficiaryConfirmOnBehalfView requires.

    Called instead from MyOrgAccountlessConfirmablesView /
    MyOrgFisherfolkAccountlessConfirmablesView (interventions/views.py) —
    the org's own equivalent of "the one screen that displays these
    records" advancing them lazily, same philosophy as the citizen path,
    just for the case that path cannot reach. Strictly scoped to THIS
    organization's own current, accountless members only — never advances a
    record for someone who could self-confirm, or who belongs to a
    different organization. No notify_user() here (there is no recipient
    account to notify); the org simply sees it appear on its next fetch.
    """
    from accounts.utils import accountless_or_unactivated_ids

    today = timezone.localdate()

    if org_linked_type == 'FARMERS_ORG':
        candidates = list(BeneficiaryRecord.objects.filter(
            status=DistributionStatus.PENDING,
            date_given__lte=today,
            farmer__farmer_organizations__organization_id=org_id,
            farmer__farmer_organizations__is_active=True,
        ).distinct())
        person_field, record_type = 'farmer_id', 'FARMER'
    elif org_linked_type == 'FISHERFOLK_ORG':
        candidates = list(FisherfolkBeneficiaryRecord.objects.filter(
            status=DistributionStatus.PENDING,
            date_given__lte=today,
            fisherfolk__fisherfolk_organizations__organization_id=org_id,
            fisherfolk__fisherfolk_organizations__is_active=True,
        ).distinct())
        person_field, record_type = 'fisherfolk_id', 'FISHERFOLK'
    else:
        return

    if not candidates:
        return
    eligible_ids = accountless_or_unactivated_ids(record_type, [getattr(r, person_field) for r in candidates])
    for record in candidates:
        if getattr(record, person_field) in eligible_ids:
            record.status = DistributionStatus.AWAITING_CONFIRMATION
            record.save()
