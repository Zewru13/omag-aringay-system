"""
One-time (but safely repeatable) data correction for CropMonitoringRecord
rows created by the crop-record importer (production.crop_record_import_views
._create_crop_record) BEFORE commit 6b049ae added that function's
retroactive-Harvested check. That check only ever runs at the moment a row
is created — it has no way to reach back and correct rows that already
existed when it was added, so any such row is stuck at "Planted" forever
(the Near-Harvest auto-transition is itself skipped whenever
date_planted_is_estimated=True, so nothing else will ever move it either).

Investigated and confirmed against the real database: exactly 1,860
CropMonitoringRecord rows (Corn (Mais) only, one bulk import batch,
2026-09-12 18:18 UTC — about 19 hours before 6b049ae landed) matched this
gap. Rice and Tobacco had zero records with date_planted_is_estimated=True
at all as of that investigation — nothing to correct for either. This
command does not hardcode "Corn" or any other crop type, though: it queries
by the same real, general condition the live feature itself checks
(date_planted_is_estimated=True, expected_harvest_date in the past, status
still Planted), so it stays correct and equally usable if some other crop
type or a future import ever falls into the same kind of gap.

Idempotent: an already-corrected row's status is "Harvested", which the
query above never matches, so re-running this command after a successful
run finds (and changes) nothing. Safe to run again at any time as a check.
"""
from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from production.crop_record_import_views import SYSTEM_HARVEST_NOTE
from production.models import CropMonitoringRecord


class Command(BaseCommand):
    help = (
        'Retroactively marks Harvested any CropMonitoringRecord created via the '
        'crop-record importer whose expected_harvest_date has already passed but '
        'whose status is still Planted — the correction the live feature applies '
        'at creation time, applied here once to rows that predate it.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report matching records only — no database writes.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        today = date.today()

        queryset = CropMonitoringRecord.objects.filter(
            date_planted_is_estimated=True,
            expected_harvest_date__lt=today,
            status='Planted',
        ).select_related('crop_type')

        by_crop_type = {}
        for record in queryset:
            by_crop_type[record.crop_type.name] = by_crop_type.get(record.crop_type.name, 0) + 1

        self.stdout.write(self.style.SUCCESS('=== Records matching the correction (Planted, past-due, estimated date) ==='))
        if not by_crop_type:
            self.stdout.write('  None found — nothing to correct.')
        for crop_type_name, count in sorted(by_crop_type.items()):
            self.stdout.write(f'  {crop_type_name}: {count}')
        total = sum(by_crop_type.values())
        self.stdout.write(f'  TOTAL: {total}')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no records changed.'))
            return

        if total == 0:
            return

        target_ids = list(queryset.values_list('id', flat=True))
        with transaction.atomic():
            updated = CropMonitoringRecord.objects.filter(id__in=target_ids).update(
                status='Harvested',
                notes=SYSTEM_HARVEST_NOTE,
            )

        self.stdout.write(self.style.SUCCESS(f'=== Corrected {updated} record(s) to Harvested ==='))
