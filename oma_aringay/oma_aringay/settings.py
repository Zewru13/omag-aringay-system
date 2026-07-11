from datetime import timedelta

# Fix mysql-connector-python 9.7.0 incompatibility with Django 4.2
from mysql.connector.django.base import DatabaseWrapper as _MySQLDW
_MySQLDW.display_name = 'MySQL'
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-4-+29wh_&-=7i%8549bzd*5j2d(mvjvjfk6@-4-49v%63)8-0l'

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

DATABASES = {
    'default': {
        'ENGINE': 'mysql.connector.django',
        'NAME': 'oma_aringay_db',
        'USER': 'root',
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '3306',
        'OPTIONS': {
            'ssl_disabled': True,
            'auth_plugin': 'mysql_native_password',
        },
    }
}


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

MEDIA_URL = 'media/'

MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

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
# Dev default: prints outgoing mail to the console instead of sending it.
# Production needs a real SMTP backend configured via environment variables
# (.env) — never hardcode SMTP credentials in this file.
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
DEFAULT_FROM_EMAIL = 'OMA Aringay System <noreply@omaaringay.local>'

# Production SMTP example (uncomment and fill in via os.environ / .env):
# EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
# EMAIL_HOST = os.environ.get('EMAIL_HOST')
# EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
# EMAIL_USE_TLS = True
# EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER')
# EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD')
# DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)
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