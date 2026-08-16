"""
Batch 10: bulk-creates CITIZEN accounts for every Farmer (operator, not
laborer), Fisherfolk, FarmersOrganization, and FisherfolkOrganization
record that doesn't already have a linked account.

Accounts are created is_active=False, unusable_password ("created,
unclaimed") — a citizen cannot log in until staff meet them in person and
run them through the "Set Up Account" flow (see
accounts.views.SetCitizenPasswordView), which generates a strong random
password, activates the account with it, and shows it once for staff to
read aloud. No must_change_password flag is set — the account is fully
usable as soon as it's relayed, and the person can change the password
later at their own discretion.

Idempotent: skips any linked record that already has a User pointed at it
via (linked_record_type, linked_record_id) before creating a new one.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from accounts.utils import create_inactive_citizen_shell
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

    def _create_for(self, record_type, queryset):
        existing = self._existing_linked_ids(record_type)
        created = 0
        skipped = 0
        for record in queryset:
            if record.id in existing:
                skipped += 1
                continue
            # Same shape Farmer/FisherfolkListView.perform_create produces
            # for brand-new enrollments — see
            # accounts.utils.create_inactive_citizen_shell.
            create_inactive_citizen_shell(record_type, record)
            created += 1
        return created, skipped

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
            results['FARMER'] = self._create_for(User.LinkedRecordType.FARMER, farmer_qs)
            results['FISHERFOLK'] = self._create_for(User.LinkedRecordType.FISHERFOLK, fisherfolk_qs)
            results['FARMERS_ORG'] = self._create_for(User.LinkedRecordType.FARMERS_ORG, farmers_org_qs)
            results['FISHERFOLK_ORG'] = self._create_for(User.LinkedRecordType.FISHERFOLK_ORG, fisherfolk_org_qs)

        self.stdout.write(self.style.SUCCESS('=== Accounts created ==='))
        total_created = 0
        total_skipped = 0
        for record_type, (created, skipped) in results.items():
            self.stdout.write(f'  {record_type}: created={created} skipped_existing={skipped}')
            total_created += created
            total_skipped += skipped
        self.stdout.write(f'  TOTAL: created={total_created} skipped_existing={total_skipped}')
