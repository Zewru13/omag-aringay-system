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
