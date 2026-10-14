"""One-time clean-up: organizations' on-behalf confirmations no longer wait for staff approval, so any request that was
still Pending from before that change is finalized here (the member's assistance becomes Confirmed and the request
becomes Approved, which is how it then appears in the organization's "Confirmed for Members" history).

    python manage.py finalize_pending_org_confirmations --dry-run     # only count them
    python manage.py finalize_pending_org_confirmations               # do it
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from interventions.models import (
    BeneficiaryConfirmationRequest, DistributionStatus, FisherfolkBeneficiaryConfirmationRequest,
)


class Command(BaseCommand):
    help = 'Finalize organization on-behalf confirmations that were left Pending (no staff approval is needed any more).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only report what would be finalized.')

    def handle(self, *args, **options):
        dry = options['dry_run']
        now = timezone.now()
        for model in (BeneficiaryConfirmationRequest, FisherfolkBeneficiaryConfirmationRequest):
            pending = list(model.objects.filter(status=model.Status.PENDING).select_related('beneficiary_record'))
            done = skipped = 0
            for req in pending:
                record = req.beneficiary_record
                if dry:
                    continue
                with transaction.atomic():
                    if record.status == DistributionStatus.AWAITING_CONFIRMATION:
                        record.status = DistributionStatus.CONFIRMED
                        record.confirmed_at = now
                        record.save()
                        done += 1
                    else:
                        skipped += 1       # already confirmed another way: the request is just closed
                    req.status = model.Status.APPROVED
                    req.reviewed_at = now
                    req.save(update_fields=['status', 'reviewed_at'])
            label = model.__name__
            if dry:
                self.stdout.write(f'{label}: {len(pending)} pending (dry run, nothing changed).')
            else:
                self.stdout.write(f'{label}: {done} confirmed, {skipped} already confirmed; {len(pending)} request(s) closed.')
