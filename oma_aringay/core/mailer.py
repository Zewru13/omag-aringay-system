import logging
import threading

from django.conf import settings

logger = logging.getLogger(__name__)


def in_background(task, *args):
    """Run an e-mail task without making the request wait for the mail server. A failure is logged, never raised.
    settings.EMAIL_IN_BACKGROUND = False runs it in place (tests)."""
    def run():
        try:
            task(*args)
        except Exception:
            logger.exception('Background e-mail failed (non-fatal)')

    if getattr(settings, 'EMAIL_IN_BACKGROUND', True):
        threading.Thread(target=run, daemon=True).start()
    else:
        run()
