"""Django 5.2 supports Python 3.10 to 3.13. Running on a newer Python still starts but breaks some pages (audit 2026-11-20: 8 tests
errored on 3.14), so `manage.py check` warns about it."""
from unittest import mock

from django.test import SimpleTestCase

from core.checks import check_python_version


class PythonVersionCheckTests(SimpleTestCase):
    def test_a_supported_python_gives_no_warning(self):
        for version in ((3, 12, 4), (3, 13, 1)):
            with mock.patch('core.checks.sys.version_info', version):
                self.assertEqual(check_python_version(None), [], version)

    def test_a_newer_python_gives_a_warning_naming_the_fix(self):
        with mock.patch('core.checks.sys.version_info', (3, 14, 2)):
            found = check_python_version(None)
        self.assertEqual([w.id for w in found], ['core.W001'])
        self.assertIn('3.12 or 3.13', found[0].hint)

    def test_the_check_is_registered_with_django(self):
        from django.core.checks.registry import registry
        self.assertIn(check_python_version, registry.registered_checks)
