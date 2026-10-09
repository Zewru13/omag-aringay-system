from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# Production hardening
DEBUG = False

# 2026-09-26: removed the "CHANGE_ME_IN_ENV_FOR_PRODUCTION" placeholder
# fallback — a missing SECRET_KEY has no safe default (it signs sessions,
# CSRF tokens, and password-reset tokens), so this fails loudly instead of
# silently running with a known, public value. Exact same pattern as the
# real dev settings.py. Renamed the env var from DJANGO_SECRET_KEY to
# SECRET_KEY to match the name actually used in oma_aringay/.env and
# .env.example everywhere else in this project.
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError(
        'SECRET_KEY is not set. Generate one with '
        '`python -c "from django.core.management.utils import get_random_secret_key; '
        'print(get_random_secret_key())"` and add it to oma_aringay/.env.'
    )

# Server local IP or hostname (set this to your OMA Aringay server IP)
ALLOWED_HOSTS = [
    os.environ.get("DJANGO_ALLOWED_HOST", "127.0.0.1"),
    # Example: "192.168.1.100"
]

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

# 2026-09-26: mirrors the real dev settings.py's DB_BACKEND toggle exactly —
# this file was still hardcoded to local MySQL only, predating the Phase 5
# Postgres cutover. Defaults to 'postgres' (Supabase), same as dev settings.py.
#   DB_BACKEND=mysql    -> real MySQL (oma_aringay_db)
#   DB_BACKEND=postgres -> real Supabase (default)
DB_BACKEND = os.environ.get('DB_BACKEND', 'postgres')

_DATABASES_MYSQL = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.environ.get("MYSQL_DATABASE", "oma_aringay_db"),
        'USER': os.environ.get("MYSQL_USER", "root"),
        'PASSWORD': os.environ.get("MYSQL_PASSWORD", ""),
        'HOST': os.environ.get("MYSQL_HOST", "127.0.0.1"),
        'PORT': os.environ.get("MYSQL_PORT", "3306"),
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
        },
    }
}

if DB_BACKEND == 'mysql':
    DATABASES = _DATABASES_MYSQL
elif DB_BACKEND == 'postgres':
    _missing_db = [
        name for name in
        ('SUPABASE_DB_HOST', 'SUPABASE_DB_PORT', 'SUPABASE_DB_NAME', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD')
        if not os.environ.get(name)
    ]
    if _missing_db:
        raise RuntimeError(
            f'DB_BACKEND=postgres but missing required environment variable(s) {_missing_db} '
            f'in oma_aringay/.env. Set DB_BACKEND=mysql to use the MySQL fallback instead.'
        )
    DATABASES = _DATABASES_POSTGRES
else:
    raise RuntimeError(f"DB_BACKEND must be 'mysql' or 'postgres', got {DB_BACKEND!r}")

# Password policy: minimum length 8, at least 1 capital letter, 1 special character and 3 numbers
# (accounts.validators.CompositionPasswordValidator), plus the common-password and local denylists.
# No periodic password expiry for chosen passwords; only temporary (system-issued) passwords expire.
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
        'OPTIONS': {'user_attributes': ('username', 'email', 'full_name')},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {
        'NAME': 'accounts.validators.CompositionPasswordValidator',
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

# 2026-09-26: mirrors the real dev settings.py's Supabase Storage config
# exactly — this file previously still pointed at local MEDIA_ROOT, which
# predates the Phase 6 media-storage migration and would silently lose every
# uploaded file (disaster report photos, beneficiary-confirmation photos,
# profile pictures) on an ephemeral-filesystem host's first restart/redeploy.
# Uses django-storages' S3Boto3Storage against Supabase's S3-compatible
# endpoint. See settings.py for the full reasoning (package choice, the
# custom-domain URL fix for Supabase's public-object path, ACL handling).
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
AWS_QUERYSTRING_AUTH = False
AWS_S3_CUSTOM_DOMAIN = (
    f'{urlparse(AWS_S3_ENDPOINT_URL).netloc}/storage/v1/object/public/{AWS_STORAGE_BUCKET_NAME}'
)
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

# Collectstatic output directory
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Import commits send every selected preview row back as one JSON body
# (~0.5-1 KB per row); Django's 2.5 MB default fails a full 3,600-row commit.
# Mirrors settings.py. Uploaded files are capped separately in core.utils.
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

AUTH_USER_MODEL = 'accounts.User'

# CORS for React production URL
CORS_ALLOWED_ORIGINS = [
    os.environ.get("CORS_ALLOWED_ORIGIN", "http://192.168.1.100:5173"),
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
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
    # Login throttling. 5/min keyed per submitted identifier (see
    # accounts.views.LoginRateThrottle) — enough headroom for a genuine typo
    # or two, tight enough to make scripted password-guessing against a
    # single email/RSBSA number/org registration number impractical.
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
# Hybrid fallback: if EMAIL_HOST_USER/EMAIL_HOST_PASSWORD are unset (SMTP not
# configured yet), fall back to the console backend instead of pointing an
# unconfigured SMTP backend at a real server and crashing on every send.
# accounts/utils.py additionally treats ANY send failure as non-fatal — user
# creation always succeeds, and the admin-relay fallback (default password +
# verification link shown in the UI) takes over. See
# accounts/utils.py:send_welcome_email. Kept in sync with settings.py's own
# copy of this block — accounts/utils.py and accounts/views.py reference
# these directly (settings.FRONTEND_BASE_URL, settings.SMTP_CONFIGURED,
# settings.EMAIL_VERIFICATION_TOKEN_HOURS) with no getattr default, so
# omitting any of them here is a hard AttributeError the moment a citizen
# account is created or a verification link is checked.
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
# server at (e.g. http://192.168.1.50). When unset, accounts.utils derives
# the base URL from the incoming request's own host/scheme instead (see
# accounts/utils.py:resolve_frontend_base_url). Set this explicitly only
# when the frontend is served from a different host/port than the API.
FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', '').rstrip('/')

# How long an email-verification token stays valid.
EMAIL_VERIFICATION_TOKEN_HOURS = int(os.environ.get('EMAIL_VERIFICATION_TOKEN_HOURS', '72'))

# How long a system-issued temporary password can still be used to log in.
TEMP_PASSWORD_VALID_DAYS = int(os.environ.get('TEMP_PASSWORD_VALID_DAYS', '7'))

# Seconds to wait on the mail server before giving up (an unreachable server must not hang a request).
EMAIL_TIMEOUT = int(os.environ.get('EMAIL_TIMEOUT', '10'))

# ── Deliberately NOT set here yet — open questions for real deployment ────
# These are standard Django production-hardening settings (SECURE_SSL_REDIRECT,
# SESSION_COOKIE_SECURE, CSRF_COOKIE_SECURE, SECURE_HSTS_SECONDS, and related
# X_FRAME_OPTIONS/SECURE_PROXY_SSL_HEADER settings). Deliberately left out of
# this update rather than guessed at — the right values depend on the real
# deployment shape that doesn't exist yet: whether TLS terminates at this
# Django process directly or at a reverse proxy in front of it, whether the
# LAN deployment even uses HTTPS at all, and what header a proxy would set to
# signal the original scheme. Decide and add these explicitly when that
# deployment shape is actually known — not before.
