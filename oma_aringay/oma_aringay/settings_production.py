"""Production settings: the development settings plus everything a public deployment must lock down.

This used to be a full copy of settings.py that drifted out of date (no gzip, no connect timeout, ...). It now imports
settings.py and only overrides what differs, so a change to the shared settings can never be missed here.

Required environment (the server refuses to start without them):
    SECRET_KEY, DJANGO_ALLOWED_HOST, CORS_ALLOWED_ORIGIN       (+ the database and storage variables settings.py needs)

Choose how the site is served - HTTPS is the default and plain HTTP must be asked for:
    (nothing)             Django itself sees HTTPS requests (or the proxy rewrites the scheme): redirect to HTTPS,
                          Secure cookies, HSTS.
    BEHIND_TLS_PROXY=1    A reverse proxy (nginx, a hosting platform) ends TLS and sets X-Forwarded-Proto. Only enable
                          this when the proxy overwrites that header on every request, or anyone could fake it.
    ALLOW_INSECURE_HTTP=1 No HTTPS at all (an isolated office LAN). Passwords and tokens then travel in clear text.

See docs/security-deployment.md.
"""
import os

from .settings import *  # noqa: F401,F403
from .settings import BASE_DIR, DB_BACKEND, DATABASES, MIDDLEWARE, REST_FRAMEWORK  # noqa: F401


def _flag(name):
    return os.environ.get(name, '').strip().lower() in ('1', 'true', 'yes')


def _required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise RuntimeError(f'{name} must be set for production (see docs/security-deployment.md).')
    return value


DEBUG = False

# Exactly the hosts and the one front-end origin that are meant to reach this server. No development defaults.
ALLOWED_HOSTS = [host.strip() for host in _required('DJANGO_ALLOWED_HOST').split(',') if host.strip()]
CORS_ALLOWED_ORIGINS = [origin.strip().rstrip('/') for origin in _required('CORS_ALLOWED_ORIGIN').split(',') if origin.strip()]
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)

if DB_BACKEND == 'mysql':
    DATABASES['default'].update({
        'NAME': os.environ.get('MYSQL_DATABASE', 'oma_aringay_db'),
        'USER': os.environ.get('MYSQL_USER', 'root'),
        'PASSWORD': os.environ.get('MYSQL_PASSWORD', ''),
        'HOST': os.environ.get('MYSQL_HOST', '127.0.0.1'),
        'PORT': os.environ.get('MYSQL_PORT', '3306'),
    })

# The browsable HTML API is a debugging aid; production answers JSON only.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    # The site signs in with tokens only; cookie-based API logins (there for browser testing) are not accepted.
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],
}
# How many proxies sit in front of Django, for the per-address login limits: they read the visitor's address from
# X-Forwarded-For, counting that many hops from the right. One proxy is assumed when BEHIND_TLS_PROXY is set; override
# with NUM_PROXIES. With 0 the proxy's own address is used, so every visitor would share one limit.
REST_FRAMEWORK['NUM_PROXIES'] = int(os.environ.get('NUM_PROXIES') or (1 if _flag('BEHIND_TLS_PROXY') else 0))

# ── Transport security ─────────────────────────────────────────────────────
_https = not _flag('ALLOW_INSECURE_HTTP')
SECURE_SSL_REDIRECT = _https
SESSION_COOKIE_SECURE = _https
CSRF_COOKIE_SECURE = _https
SECURE_HSTS_SECONDS = 31536000 if _https else 0     # one year: browsers refuse plain HTTP to this host afterwards
SECURE_HSTS_INCLUDE_SUBDOMAINS = _https
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if _flag('BEHIND_TLS_PROXY') else None

# ── Browser-side hardening ─────────────────────────────────────────────────
SESSION_COOKIE_HTTPONLY = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
