import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from accounts.models import User


def _seed_password(env_var, debug_fallback):
    """
    Security remediation (2026-09-26): these seeded accounts are ADMIN/
    EVALUATOR — real, privileged roles — so a weak hardcoded password
    ('Admin1234'/'Eval1234') sitting in a script that ships with the repo
    is a real credential risk, not just a dev convenience. Same DEBUG-gated
    failure policy as core/notifications.py's _safe_bulk(): permissive only
    where DEBUG=True makes that safe (a local dev box), loud and blocking
    everywhere else — this command must never silently create a real
    privileged account with a publicly-known password outside local dev.
    """
    value = os.environ.get(env_var)
    if value:
        return value
    if settings.DEBUG:
        return debug_fallback
    raise CommandError(
        f'{env_var} is not set and DEBUG=False — refusing to seed a privileged '
        f'account with a hardcoded default password. Set {env_var} in the '
        f'environment (or run with DEBUG=True for local dev only).'
    )


class Command(BaseCommand):
    help = 'Seed the database with sample data for testing'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting seed data creation...'))
        self.create_users()
        self.stdout.write(self.style.SUCCESS('Seed data created successfully!'))
        self.stdout.write('For demo farmers, crops, fisherfolk and organizations run seed_demo_data, seed_fisheries_demo_data and seed_demo_fisherfolk_orgs.')

    def create_users(self):
        """Create admin and evaluator users"""
        # Admin user
        admin_email = 'admin@omaaringay.gov.ph'
        if not User.objects.filter(email=admin_email).exists():
            admin_password = _seed_password('SEED_ADMIN_PASSWORD', 'Admin1234')
            User.objects.create_user(
                username=admin_email,
                email=admin_email,
                password=admin_password,
                full_name='Administrator',
                role='ADMIN',
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS(f'OK Admin user created ({admin_email})'))
        else:
            self.stdout.write('  Admin user already exists, skipping')

        # Evaluator user
        eval_email = 'evaluator@omaaringay.gov.ph'
        if not User.objects.filter(email=eval_email).exists():
            eval_password = _seed_password('SEED_EVAL_PASSWORD', 'Eval1234')
            User.objects.create_user(
                username=eval_email,
                email=eval_email,
                password=eval_password,
                full_name='Evaluator',
                role='EVALUATOR',
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS(f'OK Evaluator user created ({eval_email})'))
        else:
            self.stdout.write('  Evaluator user already exists, skipping')
