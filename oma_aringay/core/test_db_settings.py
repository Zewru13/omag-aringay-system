"""The production database settings keep connections open between requests: opening a new SSL connection to Supabase for every request costs
about 0.3 s, and a page makes several requests."""
from django.test import SimpleTestCase

from oma_aringay import settings


class PostgresConnectionSettingsTests(SimpleTestCase):
    def setUp(self):
        self.db = settings._DATABASES_POSTGRES['default']

    def test_connections_are_kept_open_between_requests(self):
        self.assertGreaterEqual(self.db['CONN_MAX_AGE'], 30)
        self.assertLessEqual(self.db['CONN_MAX_AGE'], 600)

    def test_a_connection_the_pooler_dropped_is_replaced_not_reused(self):
        self.assertTrue(self.db['CONN_HEALTH_CHECKS'])

    def test_server_side_cursors_are_off_for_the_pooler(self):
        # A transaction pooler (Supabase's) cannot hold a cursor across statements.
        self.assertTrue(self.db['DISABLE_SERVER_SIDE_CURSORS'])

    def test_the_connect_timeout_that_skips_a_dead_pooler_address_stays(self):
        self.assertEqual(self.db['OPTIONS']['connect_timeout'], 3)
        self.assertEqual(self.db['OPTIONS']['sslmode'], 'require')

    def test_the_idle_time_can_be_changed_without_a_deploy(self):
        import importlib
        import os
        from unittest import mock

        with mock.patch.dict(os.environ, {'DB_CONN_MAX_AGE': '120'}):
            reloaded = importlib.reload(settings)
            self.assertEqual(reloaded._DATABASES_POSTGRES['default']['CONN_MAX_AGE'], 120)
        importlib.reload(settings)
