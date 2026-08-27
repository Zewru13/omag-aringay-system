from django.utils import timezone

from .models import FisherfolkOrganizationOfficer, OrganizationOfficer


def expire_due_officer_terms():
    """
    Lazy status transition for officer terms — no job scheduler, mirrors
    interventions.lifecycle.advance_due_distributions' pattern. Any
    is_active officer whose term_end_date has arrived without an early exit
    (End Term Early already flips is_active itself, so this never touches
    those rows again) is flipped to is_active=False here, with
    early_exit_reason left blank — that blank is what distinguishes a
    completed term from an early exit in the history view. term_end_date is
    left untouched: the auto-computed date IS the real end date for a
    natural completion.
    """
    today = timezone.localdate()
    OrganizationOfficer.objects.filter(
        is_active=True, term_end_date__lte=today,
    ).update(is_active=False)
    FisherfolkOrganizationOfficer.objects.filter(
        is_active=True, term_end_date__lte=today,
    ).update(is_active=False)
