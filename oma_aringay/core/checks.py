"""Start-up checks of the environment the backend runs in."""
import sys

from django.core.checks import Warning, register

NEWEST_SUPPORTED = (3, 13)


@register()
def check_python_version(app_configs, **kwargs):
    """Django 5.2 supports Python 3.10 to 3.13; anything newer starts but can break pages. Warn so it shows in `manage.py check`, the test run and the deploy log."""
    if tuple(sys.version_info[:2]) <= NEWEST_SUPPORTED:
        return []
    running = '.'.join(str(part) for part in sys.version_info[:3])
    return [Warning(
        f'This backend is running on Python {running}, which Django 5.2 does not support.',
        hint='Use Python 3.12 or 3.13 (on Render set the PYTHON_VERSION environment variable, for example 3.13.1).',
        id='core.W001',
    )]
