"""Writes the Audit Log entries of what staff do: one per successful changing request and per downloaded file, plus sign-ins.

Recording must never break what is being done, so every public function here swallows (and logs) its own errors. Nothing typed by
anyone is stored: only the words of auditlog.catalog and what auditlog.capture read from the saved records.
"""
import logging
import re

from django.contrib.auth import get_user_model

from auditlog import catalog
from auditlog.capture import actor_of, is_staff
from auditlog.models import AuditLogEntry

logger = logging.getLogger(__name__)

WRITE_METHODS = ('POST', 'PUT', 'PATCH', 'DELETE')


def record(user, action, text, model_name='', details=None, user_name=''):
    """One entry. An account that is no longer there (a restore can remove it) is kept by name only."""
    try:
        fields = {'action': action, 'model_name': model_name[:100], 'object_repr': text[:255], 'details': details}
        if user is not None:
            fields['user_name'] = (user.full_name or user.get_username())[:255]
            fields['user_email'] = (user.email or '')[:254]
            if get_user_model()._base_manager.filter(pk=user.pk).exists():
                fields['user_id'] = user.pk
        else:
            fields['user_name'] = (user_name or 'Unknown')[:255]
        return AuditLogEntry.objects.create(**fields)
    except Exception:
        logger.exception('Writing an Audit Log entry failed (non-fatal): %s', action)
        return None


def signed_in(user):
    if is_staff(user):
        record(user, 'SIGN_IN', 'Signed in', 'accounts.user')


def sign_in_failed(user, reason):
    """A refused sign-in on a staff account, or for something that is no account at all (what was typed is not kept: people do type
    a password into the first box). Farmers, fisherfolk and cooperatives are not recorded."""
    if user is None or is_staff(user):
        record(user, 'SIGN_IN_FAILED', f'Failed sign-in: {reason}', 'accounts.user')


def _file_name(response):
    """The name of the file an answer sends, or None when it is not a file."""
    disposition = response.get('Content-Disposition', '') or ''
    if 'attachment' not in disposition.lower() and not (response.get('Content-Type', '') or '').startswith('application/pdf'):
        return None
    found = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)', disposition)
    return found.group(1).strip() if found else 'a report'


def _headline(changes, more):
    """The record the action is mostly about, and how many others it touched."""
    main = [c for c in changes if c['model'] not in ('accounts.user', 'accounts.userlinkedrecord')]
    main = main or [c for c in changes if c['model'] != 'accounts.userlinkedrecord'] or changes
    if not main:
        return ''
    others = len(main) - 1 + more
    return f'{main[0]["name"]} and {others} more' if others else main[0]['name']


def record_request(request, response, collector):
    """After a request: the entry for what a staff member changed or downloaded, if anything."""
    try:
        match = getattr(request, 'resolver_match', None)
        if match is None or response.status_code >= 400:
            return
        user = actor_of(request)
        if not is_staff(user):
            return
        route = match.route[len('api/'):] if match.route.startswith('api/') else match.route
        name = _file_name(response)
        if name is not None:
            if 'template' not in route:      # blank import forms are not records
                words = 'Downloaded a backup file' if route.startswith('backups/') else 'Downloaded a file'
                record(user, 'DOWNLOAD', f'{words}: {name}', 'download')
            return
        if request.method not in WRITE_METHODS:
            return
        data = getattr(response, 'data', None)
        found = catalog.describe(route, request.method.lower(), match.kwargs, data)
        if found is None:
            return
        action, text = found
        changes, more = collector.finish() if collector is not None else ([], 0)
        if action == 'IMPORT' and isinstance(data, dict) and isinstance(data.get('created'), int):
            text = f'{text} ({data["created"]} added)'
        headline = _headline(changes, more)
        if not headline and route.startswith('backups/') and isinstance(data, dict):
            headline = str(data.get('name') or '')       # a backup and a restore are known by their name
        main_model = next((c['model'] for c in changes if c['model'] not in ('accounts.user', 'accounts.userlinkedrecord')), '')
        record(user, action, f'{text}: {headline}' if headline else text, main_model,
               {'changes': changes, 'more': more} if changes or more else None)
    except Exception:
        logger.exception('Recording a request in the Audit Log failed (non-fatal): %s %s', request.method, request.path)
