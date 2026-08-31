from datetime import timedelta
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# Production hardening
DEBUG = False

# Load SECRET_KEY from environment variable
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "CHANGE_ME_IN_ENV_FOR_PRODUCTION")

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

# MySQL (MariaDB via XAMPP)
DATABASES = {
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

# Passphrase-friendly policy: length + denylist, no forced composition rules
# (no mandatory symbol/number/uppercase) and no periodic/expiry logic anywhere
# in this project — both are deliberate, per NIST 800-63B guidance. Kept in
# sync with settings.py's own copy of this list.
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
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Collectstatic output directory
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

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

