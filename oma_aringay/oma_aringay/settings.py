import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Loads oma_aringay/.env if present (gitignored — never commit real
# credentials). Safe to call even when the file doesn't exist yet: every
# setting below has a working default, so a missing .env just means "SMTP
# not configured", not a crash.
load_dotenv(BASE_DIR / '.env')

# Security remediation (2026-09-26): was a hardcoded, auto-generated
# "django-insecure-" dev key, committed since the project's first commit.
# Read from the environment now, same as DB_BACKEND/SUPABASE_DB_* below —
# no insecure fallback here, since unlike those a missing SECRET_KEY has no
# safe default to fall back to (it signs sessions, CSRF tokens, and
# password-reset tokens). Set a fresh one via
# django.core.management.utils.get_random_secret_key() in oma_aringay/.env.
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError(
        'SECRET_KEY is not set. Generate one with '
        '`python -c "from django.core.management.utils import get_random_secret_key; '
        'print(get_random_secret_key())"` and add it to oma_aringay/.env.'
    )

DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'accounts',
    'core',
    'farmers',
    'fisheries',
    'interventions',
    'production',
    'monitoring',
    'reports',
    'associations',
    'auditlog.apps.AuditlogConfig',
    'storages',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Compress API responses (the yield analysis list alone is ~15 MB of JSON, ~0.3 MB gzipped).
    'django.middleware.gzip.GZipMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'auditlog.middleware.CurrentUserMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'oma_aringay.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'oma_aringay.wsgi.application'

# Phase 4 Step 6: DB_BACKEND toggle. Defaults to 'postgres' (Supabase) now
# that Phase 4 has fully verified schema + real data against it. MySQL
# stays completely intact behind DB_BACKEND=mysql as the tested rollback
# path — nothing about the MySQL branch is deleted, commented out, or
# degraded. Flip with an environment variable, no code change required:
#   DB_BACKEND=mysql    -> real MySQL (oma_aringay_db)
#   DB_BACKEND=postgres -> real Supabase (default)
DB_BACKEND = os.environ.get('DB_BACKEND', 'postgres')

_DATABASES_MYSQL = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'oma_aringay_db',
        'USER': 'root',
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '3306',
        'OPTIONS': {
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

_DATABASES_POSTGRES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('SUPABASE_DB_NAME', ''),
        'USER': os.environ.get('SUPABASE_DB_USER', ''),
        'PASSWORD': os.environ.get('SUPABASE_DB_PASSWORD', ''),
        'HOST': os.environ.get('SUPABASE_DB_HOST', ''),
        'PORT': os.environ.get('SUPABASE_DB_PORT', ''),
        'OPTIONS': {
            'sslmode': 'require',
            # The pooler hostname resolves to several addresses and some intermittently never answer the
            # SSL handshake. Without a timeout libpq waits on such an address for minutes (every request
            # opens a new connection), so a save could hang on "Saving...". With it, libpq gives up on that
            # address after 3 s and connects to the next one (a healthy connect takes ~0.3 s).
            'connect_timeout': 3,
        },
    }
}

if DB_BACKEND == 'mysql':
    DATABASES = _DATABASES_MYSQL
elif DB_BACKEND == 'postgres':
    _missing = [
        name for name in
        ('SUPABASE_DB_HOST', 'SUPABASE_DB_PORT', 'SUPABASE_DB_NAME', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD')
        if not os.environ.get(name)
    ]
    if _missing:
        raise RuntimeError(
            f'DB_BACKEND=postgres but missing required environment variable(s) {_missing} '
            f'in oma_aringay/.env. Set DB_BACKEND=mysql to use the MySQL fallback instead.'
        )
    DATABASES = _DATABASES_POSTGRES
else:
    raise RuntimeError(f"DB_BACKEND must be 'mysql' or 'postgres', got {DB_BACKEND!r}")


# Passphrase-friendly policy: length + denylist, no forced composition rules
# (no mandatory symbol/number/uppercase) and no periodic/expiry logic anywhere
# in this project — both are deliberate, per NIST 800-63B guidance.
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
        'OPTIONS': {'user_attributes': ('username', 'email', 'full_name')},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 15},
    },
    {
        'NAME': 'accounts.validators.MaximumLengthValidator',
        'OPTIONS': {'max_length': 128},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'accounts.validators.LocalDenylistPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Manila'

USE_I18N = True

USE_TZ = True

STATIC_URL = 'static/'

# Media storage migration (2026-09-26): real uploaded files (disaster report
# photos, beneficiary-confirmation photos, profile pictures) now live in
# Supabase Storage (an S3-compatible gateway), not local disk — almost every
# hosting platform has an ephemeral filesystem, so local MEDIA_ROOT would
# silently lose every uploaded file on the first restart/redeploy. Uses
# django-storages' S3Boto3Storage (NOT the smaller, explicitly-unfinished
# django-storage-supabase package) — S3Boto3Storage is the mature, actively
# maintained backend, and Supabase Storage's S3-compatible endpoint works
# with it directly via a long-lived Access Key/Secret Key pair (generated
# from the Supabase dashboard's Storage > S3 Configuration page), not the
# JWT/session-token auth flow that has known compatibility issues with some
# AWS SDK versions.
AWS_ACCESS_KEY_ID = os.environ.get('SUPABASE_STORAGE_ACCESS_KEY')
AWS_SECRET_ACCESS_KEY = os.environ.get('SUPABASE_STORAGE_SECRET_KEY')
AWS_STORAGE_BUCKET_NAME = os.environ.get('SUPABASE_STORAGE_BUCKET')
AWS_S3_ENDPOINT_URL = os.environ.get('SUPABASE_STORAGE_ENDPOINT')
AWS_S3_REGION_NAME = os.environ.get('SUPABASE_STORAGE_REGION')
if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_STORAGE_BUCKET_NAME, AWS_S3_ENDPOINT_URL, AWS_S3_REGION_NAME]):
    raise RuntimeError(
        'Supabase Storage is not configured. Set SUPABASE_STORAGE_ACCESS_KEY, '
        'SUPABASE_STORAGE_SECRET_KEY, SUPABASE_STORAGE_BUCKET, '
        'SUPABASE_STORAGE_ENDPOINT, and SUPABASE_STORAGE_REGION in oma_aringay/.env '
        '(see .env.example).'
    )
# Bucket is public (matches local-disk MEDIA_URL's own always-unauthenticated
# serving today) — plain object URLs, no per-request query-string signing.
AWS_QUERYSTRING_AUTH = False
# S3Boto3Storage.url() builds URLs from AWS_S3_ENDPOINT_URL by default —
# Supabase's S3 gateway (/storage/v1/s3/...) rejects unsigned GETs there
# with 403 AccessDenied ("Missing signature"), confirmed by a real request.
# Public objects are served from a DIFFERENT path instead:
# /storage/v1/object/public/<bucket>/<key> — confirmed working (200, exact
# content match). AWS_S3_CUSTOM_DOMAIN redirects .url() to build URLs there.
AWS_S3_CUSTOM_DOMAIN = (
    f'{urlparse(AWS_S3_ENDPOINT_URL).netloc}/storage/v1/object/public/{AWS_STORAGE_BUCKET_NAME}'
)
# Supabase's S3 gateway rejects the ACL header S3Boto3Storage sends by
# default; bucket-level public access already covers read access, so no
# per-object ACL is needed.
AWS_DEFAULT_ACL = None
AWS_S3_ADDRESSING_STYLE = 'path'
AWS_S3_FILE_OVERWRITE = False
STORAGES = {
    'default': {
        'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage',
    },
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}

MEDIA_URL = 'media/'

MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Import commits send back every selected preview row as one JSON body:
# ~0.5-1 KB per row, so a full 3,600-row RSBSA file is ~2-3.5 MB — over
# Django's 2.5 MB default, which made large commits fail with an opaque 400
# ("Failed to commit"). Uploaded FILES are separately capped at 10 MB in
# core.utils.MAX_IMPORT_BYTES.
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

AUTH_USER_MODEL = 'accounts.User'

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication', # For React App
        'rest_framework.authentication.SessionAuthentication',       # Para sa browser testing
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
    # The reports app uses its own ?format=pdf|excel|json query param convention.
    # DRF's built-in format-suffix content negotiation also binds to "format" by
    # default and 404s before the view even runs when the value isn't a registered
    # renderer format (only "json"/"api" are). Disabling it here restores every
    # report endpoint's PDF/Excel export, which was silently 404ing app-wide.
    'URL_FORMAT_OVERRIDE': None,
    # Batch 10: login throttling. 5/min keyed per submitted identifier (see
    # accounts.views.LoginRateThrottle) — enough headroom for a genuine typo
    # or two, tight enough to make scripted password-guessing against a
    # single email/RSBSA number/org registration number impractical. DRF's
    # throttle window is a rolling one (SimpleRateThrottle), so this isn't a
    # hard lockout — the oldest attempt ages out of the 60s window and a new
    # attempt becomes available continuously, rather than a fixed "wait
    # exactly 60s" cliff.
    'DEFAULT_THROTTLE_RATES': {
        'login': '5/min',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    # When a user's password changes, every access token issued before that
    # change (not just refresh tokens) stops passing authentication on its
    # very next request — SimpleJWT embeds a hash of the password at token
    # issuance and compares it against the current one on each request.
    'CHECK_REVOKE_TOKEN': True,
}

# ── Email ────────────────────────────────────────────────────────────────
# Real SMTP settings come from .env (never committed — see .env.example).
# Hybrid fallback: if EMAIL_HOST_USER/EMAIL_HOST_PASSWORD are blank (SMTP
# not configured yet), we deliberately fall back to the console backend
# instead of pointing an unconfigured SMTP backend at a real server and
# crashing on every send. accounts/utils.py additionally treats ANY send
# failure (auth error, connection refused, rejected recipient, console
# backend or real SMTP alike) as non-fatal — user creation always succeeds,
# and the admin-relay fallback (default password + verification link shown
# in the UI) takes over. See accounts/utils.py:send_welcome_email.
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL') or (
    f'OMA Aringay System <{EMAIL_HOST_USER}>' if EMAIL_HOST_USER
    else 'OMA Aringay System <noreply@omaaringay.local>'
)

SMTP_CONFIGURED = bool(EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)
EMAIL_BACKEND = (
    'django.core.mail.backends.smtp.EmailBackend' if SMTP_CONFIGURED
    else 'django.core.mail.backends.console.EmailBackend'
)

# Base URL of the frontend app, used to build verification links
# (http://<host>/verify-email?token=...) embedded in outgoing emails.
#
# Deliberately empty by default, NOT a hardcoded public domain or
# "localhost" — on a LAN deployment there is no public domain, and the link
# has to resolve to whatever address the office actually reaches this
# server at (e.g. http://192.168.1.50). When unset, accounts.utils
# derives the base URL from the incoming request's own host/scheme instead
# (see accounts/utils.py:resolve_frontend_base_url), so the link always
# matches whatever machine the admin is using right now. Set this
# explicitly only when the frontend is served from a different
# host/port than the API (e.g. local dev: http://localhost:5173).
FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', '').rstrip('/')

# How long an email-verification token stays valid.
EMAIL_VERIFICATION_TOKEN_HOURS = int(os.environ.get('EMAIL_VERIFICATION_TOKEN_HOURS', '72'))
# ==========================================================
# PYTHON 3.14 COMPATIBILITY PATCH FOR DJANGO 4.2 ADMIN PANELS
# ==========================================================
import copy
from django.template import context

def safe_context_copy(self):
    # Create a brand new instance of the current class directly, bypassing broken super() layouts
    duplicate = object.__new__(self.__class__)
    
    # Copy all top-level attributes safely
    for key, value in self.__dict__.items():
        if key == 'dicts':
            # Create a shallow copy of the context list layers
            duplicate.dicts = self.dicts[:]
        else:
            setattr(duplicate, key, value)
            
    return duplicate

# Override Django's base copying mechanism globally
context.BaseContext.__copy__ = safe_context_copy