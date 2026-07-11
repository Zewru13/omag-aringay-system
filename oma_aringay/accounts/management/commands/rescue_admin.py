from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

User = get_user_model()


class Command(BaseCommand):
    help = (
        'Recovery tool: reactivate the given user, promote them to ADMIN, and '
        'deactivate every other admin. Run this on the host machine when the '
        'single active admin has been locked out — no login required.'
    )

    def add_arguments(self, parser):
        parser.add_argument('email', type=str, help='Email of the user to rescue.')

    def handle(self, *args, **options):
        email = options['email'].strip()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise CommandError(f'No user found with email "{email}".')

        with transaction.atomic():
            others = User.objects.filter(role=User.Roles.ADMIN, is_active=True).exclude(pk=user.pk)
            deactivated_emails = list(others.values_list('email', flat=True))
            deactivated_users = list(others)
            others.update(is_active=False)

            try:
                from rest_framework_simplejwt.token_blacklist.models import (
                    BlacklistedToken,
                    OutstandingToken,
                )
                for admin in deactivated_users:
                    for token in OutstandingToken.objects.filter(user=admin):
                        BlacklistedToken.objects.get_or_create(token=token)
            except Exception:
                pass

            user.role = User.Roles.ADMIN
            user.is_active = True
            user.save(update_fields=['role', 'is_active'])

        self.stdout.write(self.style.SUCCESS(f'"{user.email}" is now the sole active ADMIN.'))
        if deactivated_emails:
            self.stdout.write(f'Deactivated other admin(s): {", ".join(deactivated_emails)}')
        else:
            self.stdout.write('No other active admins were found.')
