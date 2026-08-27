"""
Batch 8: one-time import of the real RSBSA/BFAR registry CSV (4,618 rows)
into Farmer and Fisherfolk. Registry data only — does NOT create any
CropMonitoringRecord, FarmParcel, or StockingRecord from cropname/crop_area
(confirmed decision).

Classification (applied before any write):
  HOLD-BACK if:
    - rsbsa_no has non-digit characters in a numeric segment (corrupted)
    - farmer, farmworker, AND fisherfolk are all blank/null
    - farmer_address_bgy has no reasonable match in BARANGAY_CHOICES
  IMPORT-FISHERFOLK if fisherfolk=YES (and not held back)
  IMPORT-FARMER if farmer=YES or farmworker=YES (and not held back)
    - farmer=YES takes precedence over farmworker=YES (operator, not laborer)

Idempotent: skips any row whose rsbsa_no already exists as a
Farmer.rsbsa_number / Fisherfolk.rsbsa_number before creating.
"""
import csv

from collections import Counter

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from farmers.models import Farmer
from farmers.rsbsa_import import (
    EXPECTED_HEADERS,
    IMPORT_SYSTEM_USER_EMAIL,
    build_last_name,
    classify_row,
    normalize_barangay,
    normalize_contact,
    normalize_name_part,
    parse_birthday,
)
from fisheries.models import Fisherfolk

User = get_user_model()


class Command(BaseCommand):
    help = 'Import the RSBSA/BFAR registry CSV into Farmer and Fisherfolk (registry data only).'

    def add_arguments(self, parser):
        parser.add_argument('csv_path', type=str, help='Path to the RSBSA/BFAR CSV file.')
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Classify and report only — no database writes.',
        )

    def handle(self, *args, **options):
        csv_path = options['csv_path']
        dry_run = options['dry_run']

        try:
            with open(csv_path, newline='', encoding='utf-8-sig') as f:
                rows = list(csv.DictReader(f))
        except FileNotFoundError:
            raise CommandError(f'File not found: {csv_path}')

        actual_headers = rows[0].keys() if rows else []
        if list(actual_headers) != EXPECTED_HEADERS:
            raise CommandError(
                f'CSV headers do not match expected spec.\nExpected: {EXPECTED_HEADERS}\nActual: {list(actual_headers)}'
            )

        self.stdout.write(f'Loaded {len(rows)} rows from {csv_path}')

        # ── Classify everything first ──────────────────────────────────
        classified = [(row, *classify_row(row)) for row in rows]
        disposition_counts = Counter(d for _, d, _ in classified)
        reason_counts = Counter(r for _, d, r in classified if d == 'HOLD-BACK')

        self.stdout.write(self.style.SUCCESS('=== Classification summary ==='))
        for disp, count in disposition_counts.items():
            self.stdout.write(f'  {disp}: {count}')
        self.stdout.write('  Held-back reasons:')
        for reason, count in reason_counts.items():
            self.stdout.write(f'    {reason}: {count}')
        total = sum(disposition_counts.values())
        self.stdout.write(f'  Total: {total} (source rows: {len(rows)})')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no records were written.'))
            return

        import_user, created = User.objects.get_or_create(
            email=IMPORT_SYSTEM_USER_EMAIL,
            defaults={
                'username': IMPORT_SYSTEM_USER_EMAIL,
                'full_name': 'RSBSA/BFAR Data Import (System)',
                'role': User.Roles.ADMIN,
                'is_active': False,
                'is_staff': False,
            },
        )
        if created:
            import_user.set_unusable_password()
            import_user.save(update_fields=['password'])
            self.stdout.write(self.style.SUCCESS(f'Created system import user: {import_user.email}'))
        else:
            self.stdout.write(f'Using existing system import user: {import_user.email}')

        farmers_created = 0
        farmers_skipped_existing = 0
        fisherfolk_created = 0
        fisherfolk_skipped_existing = 0

        with transaction.atomic():
            for row, disposition, _reason in classified:
                if disposition == 'HOLD-BACK':
                    continue

                rsbsa = row['rsbsa_no'].strip()
                birth_date = parse_birthday(row['birthday'])
                gender = 'Male' if row['gender'].strip().upper() == 'MALE' else 'Female'
                barangay = normalize_barangay(row['farmer_address_bgy'])
                contact_number = normalize_contact(row['contact_num'])
                first_name = normalize_name_part(row['first_name'])
                middle_name = normalize_name_part(row['middle_name'])
                last_name = build_last_name(row['last_name'], row['ext_name'])

                if disposition == 'IMPORT-FARMER':
                    if Farmer.objects.filter(rsbsa_number=rsbsa).exists():
                        farmers_skipped_existing += 1
                        continue
                    farmer_flag = (row['farmer'] or '').strip().upper()
                    is_farm_laborer = farmer_flag != 'YES'  # farmworker=YES only -> laborer
                    Farmer.objects.create(
                        rsbsa_number=rsbsa,
                        first_name=first_name,
                        middle_name=middle_name,
                        last_name=last_name,
                        gender=gender,
                        birthdate=birth_date,
                        contact_number=contact_number,
                        barangay=barangay,
                        municipality='Aringay',
                        province='La Union',
                        civil_status=Farmer.CivilStatus.UNSPECIFIED,
                        is_farm_laborer=is_farm_laborer,
                        registered_by=import_user,
                    )
                    farmers_created += 1

                elif disposition == 'IMPORT-FISHERFOLK':
                    if Fisherfolk.objects.filter(rsbsa_number=rsbsa).exists():
                        fisherfolk_skipped_existing += 1
                        continue
                    Fisherfolk.objects.create(
                        rsbsa_number=rsbsa,
                        first_name=first_name,
                        middle_name=middle_name,
                        last_name=last_name,
                        gender=gender,
                        birthdate=birth_date,
                        contact_number=contact_number,
                        barangay=barangay,
                        municipality='Aringay',
                        fisherfolk_type=Fisherfolk.FisherfolkType.UNSPECIFIED,
                        is_aquaculture=False,
                        is_capture_fishery=False,
                        is_mariculture=False,
                        is_inland_fishery=False,
                        is_fish_vendor=False,
                        has_vessel=False,
                        registered_by=import_user,
                    )
                    fisherfolk_created += 1

        self.stdout.write(self.style.SUCCESS('=== Import complete ==='))
        self.stdout.write(f'  Farmers created: {farmers_created}')
        self.stdout.write(f'  Farmers skipped (rsbsa_number already existed): {farmers_skipped_existing}')
        self.stdout.write(f'  Fisherfolk created: {fisherfolk_created}')
        self.stdout.write(f'  Fisherfolk skipped (rsbsa_number already existed): {fisherfolk_skipped_existing}')
