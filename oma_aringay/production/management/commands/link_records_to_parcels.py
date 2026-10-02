from django.core.management.base import BaseCommand

from production.models import CropMonitoringRecord
from production.parcel_link import infer_farm_parcel


class Command(BaseCommand):
    help = (
        "Link existing crop monitoring records that have no farm parcel to the "
        "farmer's one parcel that declares the same crop (same barangay). "
        "Ambiguous or unmatched records are left alone. Dry run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the links (default: only report them).')

    def handle(self, *args, **options):
        records = (
            CropMonitoringRecord.objects
            .filter(farm_parcel__isnull=True, farmer__isnull=False, farmer__farm_parcels__isnull=False)
            .select_related('farmer', 'crop_type')
            .distinct()
        )
        planned = []
        skipped = 0
        for rec in records:
            parcel = infer_farm_parcel(rec.farmer_id, rec.crop_type.name, rec.farm_location_barangay)
            if parcel:
                planned.append((rec, parcel))
            else:
                skipped += 1

        for rec, parcel in planned:
            self.stdout.write(
                f'record {rec.id} ({rec.crop_type.name}, {rec.season} {rec.year}, {rec.farm_location_barangay}) '
                f'-> parcel {parcel.id} ({parcel.parcel_number or "no number"}, {parcel.barangay}) '
                f'of farmer {rec.farmer_id}'
            )
        self.stdout.write(f'{len(planned)} record(s) can be linked; {skipped} left unlinked (no single matching parcel).')

        if options['apply'] and planned:
            # update() on purpose: save() recomputes harvest dates and status, and
            # linking a parcel must not change either.
            for rec, parcel in planned:
                CropMonitoringRecord.objects.filter(pk=rec.pk).update(farm_parcel=parcel)
            self.stdout.write(self.style.SUCCESS(f'Linked {len(planned)} record(s).'))
        elif not options['apply']:
            self.stdout.write('Dry run — nothing written. Re-run with --apply to link them.')
