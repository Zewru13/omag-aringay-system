"""
Phase 4 Step 1: connection settings for the REAL Supabase Postgres project.

Unlike settings_postgres_test.py (a throwaway local instance), this points
at real, user-owned infrastructure. Connection details come exclusively
from environment variables (oma_aringay/.env, loaded by settings.py's own
load_dotenv() call) — never hardcoded here, never logged, never printed.
This module must fail loudly if any required variable is missing rather
than silently falling back to a guessed value.

Supabase requires SSL on its Postgres connections; sslmode is set to
'require' explicitly rather than relying on a driver default.
"""
import os

from .settings import *  # noqa: F401,F403

_REQUIRED_VARS = [
    'SUPABASE_DB_HOST',
    'SUPABASE_DB_PORT',
    'SUPABASE_DB_NAME',
    'SUPABASE_DB_USER',
    'SUPABASE_DB_PASSWORD',
]
_missing = [name for name in _REQUIRED_VARS if not os.environ.get(name)]
if _missing:
    raise RuntimeError(
        f'settings_supabase.py: missing required environment variable(s) '
        f'{_missing} — set them in oma_aringay/.env before using this '
        f'settings module.'
    )

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['SUPABASE_DB_NAME'],
        'USER': os.environ['SUPABASE_DB_USER'],
        'PASSWORD': os.environ['SUPABASE_DB_PASSWORD'],
        'HOST': os.environ['SUPABASE_DB_HOST'],
        'PORT': os.environ['SUPABASE_DB_PORT'],
        'OPTIONS': {
            'sslmode': 'require',
        },
    }
}
