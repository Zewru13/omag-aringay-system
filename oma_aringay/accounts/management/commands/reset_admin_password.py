import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = (
        'Recovery tool: set a known password for the given account from the '
        'terminal. Also clears must_change_password, marks the email verified '
        '(host access is a stronger trust signal than clicking an email link), '
        'and logs out any existing session, so the new password actually works '
        'immediately.'
    )

    def add_arguments(self, parser):
        parser.add_argument('email', type=str, help='Email of the account to reset.')
        parser.add_argument(
            '--password', type=str, default=None,
            help='Password to set. If omitted, you will be prompted (input hidden).',
        )

    def handle(self, *args, **options):
        email = options['email'].strip()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise CommandError(f'No user found with email "{email}".')

        password = options['password']
        if not password:
            password = getpass.getpass('New password (min 8 characters, with a capital letter, a special character and 3 numbers): ')
            confirm = getpass.getpass('Confirm password: ')
            if password != confirm:
                raise CommandError('Passwords do not match.')

        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            raise CommandError('Password rejected: ' + ' '.join(exc.messages))

        user.set_password(password)
        user.must_change_password = False
        # A new password only "takes effect immediately" (this command's
        # promise) if the account can actually log in with it — an
        # unverified account would otherwise still be blocked by the email
        # verification gate right after this runs.
        user.is_email_verified = True
        user.email_verification_token = None
        user.save(update_fields=[
            'password', 'must_change_password', 'is_email_verified', 'email_verification_token',
        ])

        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass

        self.stdout.write(self.style.SUCCESS(f'Password reset for "{user.email}".'))
