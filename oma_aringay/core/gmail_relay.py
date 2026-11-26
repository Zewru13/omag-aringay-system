"""Send e-mail over HTTPS through the office's own Google Apps Script (see scripts/email-relay/README.md), for hosts
that block the mail ports, such as Render's free plan. The messages leave from the office's real Gmail address.

The script only sends for a caller that knows the shared secret. The secret travels in the body of the first request;
Google answers with a redirect, which is followed without it."""
import json
import urllib.request
from urllib.parse import urlsplit

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

SENDER_NAME = 'OMAg Aringay System'


class RelayError(Exception):
    pass


def usable_relay(url, secret):
    """The secret is only ever sent to Google Apps Script, over HTTPS."""
    parts = urlsplit(url or '')
    return bool(secret) and parts.scheme == 'https' and parts.hostname == 'script.google.com'


class GmailRelayBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or ():
            try:
                self._send(message)
            except Exception:
                if not self.fail_silently:
                    raise
                continue
            sent += 1
        return sent

    def _send(self, message):
        payload = {
            'secret': settings.EMAIL_RELAY_SECRET,
            'to': ','.join(message.to),
            'subject': str(message.subject),
            'text': str(message.body),
            'name': SENDER_NAME,
        }
        request = urllib.request.Request(
            settings.EMAIL_RELAY_URL, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        # The script takes a few seconds, so it gets longer than a mail server would.
        with urllib.request.urlopen(request, timeout=max(settings.EMAIL_TIMEOUT, 20)) as response:
            body = response.read(10000)
        try:
            answer = json.loads(body)
        except ValueError:
            raise RelayError('The email script did not answer properly. Check that the web app is deployed with access "Anyone".')
        if not isinstance(answer, dict) or not answer.get('ok'):
            reason = answer.get('error') if isinstance(answer, dict) else None
            raise RelayError(f'The email script refused the message: {str(reason or "no reason given")[:200]}')
