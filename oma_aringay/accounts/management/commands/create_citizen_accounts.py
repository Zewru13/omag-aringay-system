"""
Batch 10: bulk-creates CITIZEN accounts for every Farmer (operator, not
laborer), Fisherfolk, FarmersOrganization, and FisherfolkOrganization
record that doesn't already have a linked account.

Accounts are created is_active=False ("created, unclaimed") — a citizen
cannot log in until staff activate the account in person (see
accounts.views.ActivateCitizenAccountView, Step 5). No email exists for
these accounts, so nothing is sent; the temp password is only ever
surfaced on-screen at activation time.

Idempotent: skips any linked record that already has a User pointed at it
via (linked_record_type, linked_record_id) before creating a new one.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from accounts.utils import generate_default_password
from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk


class Command(BaseCommand):
    help = 'Bulk-create CITIZEN accounts for Farmers, Fisherfolk, and Organizations.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report counts only — no database writes.',
        )

    def _existing_linked_ids(self, record_type):
        return set(
            User.objects.filter(linked_record_type=record_type)
            .values_list('linked_record_id', flat=True)
        )

    def _create_for(self, record_type, queryset, full_name_fn):
        existing = self._existing_linked_ids(record_type)
        created = 0
        skipped = 0
        for record in queryset:
            if record.id in existing:
                skipped += 1
                continue
            self._create_one(record_type, record, full_name_fn)
            created += 1
        return created, skipped

    def _create_one(self, record_type, record, full_name_fn):
        user = User(
            username=f'{record_type.lower()}-{record.id}',
            email=None,
            full_name=full_name_fn(record),
            role=User.Roles.CITIZEN,
            is_active=False,
            must_change_password=True,
            linked_record_type=record_type,
            linked_record_id=record.id,
        )
        user.set_password(generate_default_password())
        user.save()
        return user

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        farmer_qs = Farmer.objects.filter(is_farm_laborer=False)
        fisherfolk_qs = Fisherfolk.objects.all()
        farmers_org_qs = FarmersOrganization.objects.all()
        fisherfolk_org_qs = FisherfolkOrganization.objects.all()

        self.stdout.write(self.style.SUCCESS('=== Eligible record counts ==='))
        self.stdout.write(f'  Farmer (is_farm_laborer=False, eligible): {farmer_qs.count()}')
        self.stdout.write(f'  Farmer (is_farm_laborer=True, EXCLUDED — laborers, no farm of their own to report on): {Farmer.objects.filter(is_farm_laborer=True).count()}')
        self.stdout.write(f'  Fisherfolk: {fisherfolk_qs.count()}')
        self.stdout.write(f'  FarmersOrganization: {farmers_org_qs.count()}')
        self.stdout.write(f'  FisherfolkOrganization: {fisherfolk_org_qs.count()}')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no accounts created.'))
            return

        results = {}
        with transaction.atomic():
            results['FARMER'] = self._create_for(
                User.LinkedRecordType.FARMER, farmer_qs, lambda r: r.full_name,
            )
            results['FISHERFOLK'] = self._create_for(
                User.LinkedRecordType.FISHERFOLK, fisherfolk_qs, lambda r: r.full_name,
            )
            results['FARMERS_ORG'] = self._create_for(
                User.LinkedRecordType.FARMERS_ORG, farmers_org_qs, lambda r: r.name,
            )
            results['FISHERFOLK_ORG'] = self._create_for(
                User.LinkedRecordType.FISHERFOLK_ORG, fisherfolk_org_qs, lambda r: r.name,
            )

        self.stdout.write(self.style.SUCCESS('=== Accounts created ==='))
        total_created = 0
        total_skipped = 0
        for record_type, (created, skipped) in results.items():
            self.stdout.write(f'  {record_type}: created={created} skipped_existing={skipped}')
            total_created += created
            total_skipped += skipped
        self.stdout.write(f'  TOTAL: created={total_created} skipped_existing={total_skipped}')
