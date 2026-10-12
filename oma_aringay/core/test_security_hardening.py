"""Security hardening: what a visitor can reach and which headers every API answer carries."""
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APITestCase


class ExposureTests(TestCase):
    def test_the_django_admin_is_not_reachable_by_default(self):
        # Nobody uses it (no account is allowed in), so it is switched off unless ENABLE_DJANGO_ADMIN is set.
        self.assertEqual(self.client.get('/admin/login/').status_code, 404)
        self.assertEqual(self.client.post('/admin/login/', {'username': 'x', 'password': 'y'}).status_code, 404)


class ApiHeaderTests(APITestCase):
    def test_every_api_answer_forbids_caching_framing_and_scripting(self):
        for url in ('/api/', '/api/accounts/me/'):          # a public answer and a 401
            response = self.client.get(url)
            self.assertEqual(response['Cache-Control'], 'no-store, private', url)
            self.assertEqual(response['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'none'", url)
            self.assertEqual(response['X-Content-Type-Options'], 'nosniff', url)
            self.assertIn('camera=()', response['Permissions-Policy'], url)

    def test_media_files_are_not_given_the_api_cache_rule(self):
        # Only /api/ answers are marked no-store; a photo served from /media/ keeps normal caching.
        response = self.client.get('/media/does-not-exist.png')
        self.assertNotIn('no-store', response.get('Cache-Control', ''))


class ProductionDefaultsTests(SimpleTestCase):
    def test_server_entry_points_default_to_the_production_settings(self):
        # wsgi/asgi are what a real server runs; if nobody sets the settings module they must NOT fall back to DEBUG=True.
        import pathlib
        base = pathlib.Path(__file__).resolve().parent.parent / 'oma_aringay'
        for name in ('wsgi.py', 'asgi.py'):
            text = (base / name).read_text(encoding='utf-8')
            self.assertIn("'oma_aringay.settings_production'", text, name)


class ProductionSettingsTests(SimpleTestCase):
    """The production settings are read in a fresh interpreter, with a controlled environment."""

    BASE = {
        'SECRET_KEY': 'k' * 60, 'DB_BACKEND': 'mysql', 'DJANGO_ALLOWED_HOST': 'oma.example.test',
        'CORS_ALLOWED_ORIGIN': 'https://oma.example.test', 'SUPABASE_STORAGE_ACCESS_KEY': 'x', 'SUPABASE_STORAGE_SECRET_KEY': 'x',
        'SUPABASE_STORAGE_BUCKET': 'b', 'SUPABASE_STORAGE_ENDPOINT': 'https://x.supabase.co/storage/v1/s3',
        'SUPABASE_STORAGE_REGION': 'ap-southeast-1',
    }
    SHOW = ("import json, oma_aringay.settings_production as s; "
            "print(json.dumps({k: getattr(s, k, None) for k in ('DEBUG', 'SECURE_SSL_REDIRECT', 'SESSION_COOKIE_SECURE', "
            "'CSRF_COOKIE_SECURE', 'SECURE_HSTS_SECONDS', 'SECURE_PROXY_SSL_HEADER', 'ALLOWED_HOSTS', 'CORS_ALLOWED_ORIGINS')} "
            "| {'auth': s.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'], 'proxies': s.REST_FRAMEWORK['NUM_PROXIES'], 'renderers': s.REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'], 'gzip': 'django.middleware.gzip.GZipMiddleware' in s.MIDDLEWARE, "
            "'headers_mw': 'core.middleware.SecurityHeadersMiddleware' in s.MIDDLEWARE}))")

    def read(self, **env):
        import json
        import os
        import pathlib
        import subprocess
        import sys
        full = {**os.environ, **self.BASE}
        for key in [k for k in env if env[k] is None]:
            full.pop(key, None)
        full.update({k: v for k, v in env.items() if v is not None})
        full.pop('DJANGO_SETTINGS_MODULE', None)
        done = subprocess.run([sys.executable, '-c', self.SHOW], capture_output=True, text=True, env=full,
                              cwd=str(pathlib.Path(__file__).resolve().parent.parent))
        return done.returncode, (json.loads(done.stdout) if done.returncode == 0 else done.stderr)

    def test_secure_by_default(self):
        code, s = self.read()
        self.assertEqual(code, 0, s)
        self.assertFalse(s['DEBUG'])
        self.assertTrue(s['SECURE_SSL_REDIRECT'] and s['SESSION_COOKIE_SECURE'] and s['CSRF_COOKIE_SECURE'])
        self.assertGreaterEqual(s['SECURE_HSTS_SECONDS'], 2592000)
        self.assertEqual(s['ALLOWED_HOSTS'], ['oma.example.test'])
        self.assertEqual(s['CORS_ALLOWED_ORIGINS'], ['https://oma.example.test'])
        self.assertEqual(s['renderers'], ['rest_framework.renderers.JSONRenderer'])   # no browsable HTML API in production
        self.assertTrue(s['gzip'] and s['headers_mw'])                                 # still the same stack as development
        self.assertEqual(s['auth'], ['rest_framework_simplejwt.authentication.JWTAuthentication'])   # tokens only, no cookie logins

    def test_plain_http_must_be_chosen_explicitly(self):
        code, s = self.read(ALLOW_INSECURE_HTTP='1')
        self.assertEqual(code, 0, s)
        self.assertFalse(s['SECURE_SSL_REDIRECT'] or s['SESSION_COOKIE_SECURE'] or s['CSRF_COOKIE_SECURE'])
        self.assertFalse(s['DEBUG'])

    def test_behind_a_tls_proxy_trusts_only_its_scheme_header(self):
        code, s = self.read(BEHIND_TLS_PROXY='1')
        self.assertEqual(code, 0, s)
        self.assertEqual(s['SECURE_PROXY_SSL_HEADER'], ['HTTP_X_FORWARDED_PROTO', 'https'])
        self.assertIsNone(self.read()[1]['SECURE_PROXY_SSL_HEADER'])

    def test_client_address_trust_follows_the_proxy_setup(self):
        self.assertEqual(self.read()[1]['proxies'], 0)                                  # direct: ignore X-Forwarded-For
        self.assertEqual(self.read(BEHIND_TLS_PROXY='1')[1]['proxies'], 1)             # one proxy in front
        self.assertEqual(self.read(BEHIND_TLS_PROXY='1', NUM_PROXIES='2')[1]['proxies'], 2)

    def test_refuses_to_start_without_a_host_or_an_allowed_origin(self):
        for missing in ('DJANGO_ALLOWED_HOST', 'CORS_ALLOWED_ORIGIN'):
            code, err = self.read(**{missing: None})
            self.assertNotEqual(code, 0, missing)
            self.assertIn(missing, err)


class PrivateBucketSettingsTests(SimpleTestCase):
    """Photos are served through short-lived signed links, so the storage bucket can be made private."""

    def storage(self):
        from django.conf import settings
        from storages.backends.s3boto3 import S3Boto3Storage
        return S3Boto3Storage(
            access_key='AKIATEST', secret_key='secret', bucket_name='media', endpoint_url='https://x.supabase.co/storage/v1/s3',
            region_name='ap-southeast-1', addressing_style='path', default_acl=None,
            querystring_auth=settings.AWS_QUERYSTRING_AUTH, querystring_expire=settings.AWS_QUERYSTRING_EXPIRE,
            signature_version=settings.AWS_S3_SIGNATURE_VERSION, custom_domain=getattr(settings, 'AWS_S3_CUSTOM_DOMAIN', None))

    def test_links_are_signed_expire_and_do_not_use_the_public_path(self):
        from django.conf import settings
        self.assertTrue(settings.AWS_QUERYSTRING_AUTH)
        self.assertFalse(getattr(settings, 'AWS_S3_CUSTOM_DOMAIN', None), 'the public-path domain must be gone')
        self.assertEqual(settings.AWS_QUERYSTRING_EXPIRE, 3600)
        url = self.storage().url('profile_pictures/farmers/a.png')
        self.assertIn('/storage/v1/s3/media/profile_pictures/farmers/a.png', url)
        self.assertIn('X-Amz-Signature=', url)
        self.assertIn('X-Amz-Expires=3600', url)
        self.assertNotIn('/object/public/', url)
