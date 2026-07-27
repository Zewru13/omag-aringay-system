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
import re
from collections import Counter
from datetime import datetime

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.constants import BARANGAY_CHOICES
from farmers.models import Farmer
from fisheries.models import Fisherfolk

User = get_user_model()

IMPORT_SYSTEM_USER_EMAIL = 'rsbsa-bfar-import@system.local'

RSBSA_RE_A = re.compile(r'^01-33-02-\d{3}-\d{6}$')
RSBSA_RE_B = re.compile(r'^BF-01-033-02-\d{3}-\d{8}$')
RSBSA_RE_C = re.compile(r'^01-033-02-\d{3}-\d{6}$')
RSBSA_RE_D = re.compile(r'^BF-01-033-02-\d{3}-\d{6}$')

BGY_NORMALIZE = {
    'PANGAO AOAN EAST': 'Pangao-aoan East',
    'PANGAO AOAN WEST': 'Pangao-aoan West',
}
SYSTEM_BGY = {name.upper(): name for name, _ in BARANGAY_CHOICES}


def normalize_barangay(raw):
    raw = (raw or '').strip()
    if raw in BGY_NORMALIZE:
        return BGY_NORMALIZE[raw]
    return SYSTEM_BGY.get(raw.upper())


def is_corrupted_rsbsa(value):
    v = value.strip()
    body = v[3:] if v.startswith('BF-') else v
    return any(not seg.isdigit() for seg in body.split('-'))


def is_blank(v):
    return not v or v.strip() == '' or v.strip().lower() == 'null'


def normalize_contact(raw):
    """CSV contact_num is always 10 digits, no leading 0 (e.g. '9307572121').
    System convention is 11 digits starting with 09. Blank stays blank."""
    v = (raw or '').strip()
    if is_blank(v):
        return ''
    if len(v) == 10 and v.isdigit() and v.startswith('9'):
        return '0' + v
    return v


def parse_birthday(raw):
    return datetime.strptime(raw.strip(), '%d/%m/%Y').date()


def normalize_name_part(raw):
    return (raw or '').strip().title()


def build_last_name(last_name, ext_name):
    last = normalize_name_part(last_name)
    ext = (ext_name or '').strip()
    if ext and ext.lower() != 'null':
        last = f'{last} {ext.title()}'
    return last


def classify_row(row):
    """Returns (disposition, reason_or_None) where disposition is one of
    'IMPORT-FARMER', 'IMPORT-FISHERFOLK', 'HOLD-BACK'."""
    rsbsa = row['rsbsa_no'].strip()
    if is_corrupted_rsbsa(rsbsa):
        return 'HOLD-BACK', 'corrupted_rsbsa'

    farmer_flag = (row['farmer'] or '').strip().upper()
    farmworker_flag = (row['farmworker'] or '').strip().upper()
    fisherfolk_flag = (row['fisherfolk'] or '').strip().upper()

    if is_blank(farmer_flag) and is_blank(farmworker_flag) and is_blank(fisherfolk_flag):
        return 'HOLD-BACK', 'all_flags_blank'

    if normalize_barangay(row['farmer_address_bgy']) is None:
        return 'HOLD-BACK', 'unmatched_barangay'

    if fisherfolk_flag == 'YES':
        return 'IMPORT-FISHERFOLK', None
    if farmer_flag == 'YES' or farmworker_flag == 'YES':
        return 'IMPORT-FARMER', None
    return 'HOLD-BACK', 'all_flags_no'


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

        expected_headers = [
            'rsbsa_no', 'control_no', 'first_name', 'middle_name', 'last_name', 'ext_name',
            'farmer_address_bgy', 'farmer_address_mun', 'farmer_address_prv', 'birthday',
            'gender', 'contact_num', 'cropname', 'crop_area', 'farmer', 'farmworker',
            'fisherfolk', 'agency', 'farm_type', 'date_created', 'date_updated',
        ]
        actual_headers = rows[0].keys() if rows else []
        if list(actual_headers) != expected_headers:
            raise CommandError(
                f'CSV headers do not match expected spec.\nExpected: {expected_headers}\nActual: {list(actual_headers)}'
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
