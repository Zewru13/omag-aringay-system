"""What one request of a staff member changes, gathered while it runs, for its single Audit Log entry.

Each record is remembered the first time the request touches it (how it was before). When the request is over, the records are read
again and compared, so the entry says what is really in the database now: a change that was rolled back is not listed. Passwords
and keys are never read into the entry; they only show as "hidden".

Only the first MAX_RECORDS records of an action are listed in full (an import can add hundreds); the rest are counted. Changes made
without loading a record (a bulk update) send no signal and are not listed, but the action itself still gets its entry.
"""
import datetime as dt
import json
import logging
import os
import re
import threading

from django.db import models
from django.db.models.fields.files import FieldFile
from django.db.models.signals import post_save, pre_delete, pre_save
from django.dispatch import receiver
from django.utils import timezone

from auditlog.middleware import get_current_user

logger = logging.getLogger(__name__)

MAX_RECORDS = 25
MAX_TEXT = 200
STAFF_ROLES = ('ADMIN', 'EVALUATOR')
HIDDEN = 'hidden'
SECRET_NAME = re.compile(r'password|secret|token|otp|api_?key|private_?key|checksum|verification|reset_code', re.IGNORECASE)
# bookkeeping nobody asks about
IGNORED = {'id', 'last_login', 'must_change_password', 'temp_password_expires_at'}
OUR_APPS = {'accounts', 'associations', 'backups', 'core', 'farmers', 'fisheries', 'interventions', 'monitoring', 'production', 'reports'}
# the system's own housekeeping (a backup or restore gets its own entry)
NOT_TRACKED = {'backups.backuprecord', 'core.importbatch', 'core.importbatchitem', 'core.notification', 'core.recordlock',
               'farmers.rsbsaimportchangelog'}

_local = threading.local()


def actor_of(request):
    """The signed-in account of a request: the one the view authenticated, else the one the middleware read from the token."""
    user = getattr(request, 'user', None)
    if user is not None and user.is_authenticated:
        return user
    return get_current_user()


def is_staff(user):
    return bool(user is not None and getattr(user, 'role', None) in STAFF_ROLES)


def begin(request):
    _local.collector = Collector(request)
    return _local.collector


def end():
    _local.collector = None


def current():
    return getattr(_local, 'collector', None)


def staff_request_running():
    """True while a staff member's changing request is running: its one entry covers what it saves."""
    collector = current()
    return collector is not None and is_staff(actor_of(collector.request))


def _change_request_name(request):
    return f'{request.field_name.replace("_", " ")} change to "{request.requested_value}"'


def _crop_record_name(crop):
    owner = crop.farmer.full_name if crop.farmer_id else (crop.farmers_organization.name if crop.farmers_organization_id else '')
    name = f'{crop.crop_type} ({crop.season} {crop.year})'
    return f'{owner}: {name}' if owner else name


# records whose own name is written for programmers, or does not say whose they are
NAMES = {'core.profilechangerequest': _change_request_name, 'production.cropmonitoringrecord': _crop_record_name}


def label_of(record):
    """The record's own name, or "Kind #5" when it has none."""
    try:
        text = NAMES.get(record._meta.label_lower, str)(record)
    except Exception:
        text = ''
    if not text or re.fullmatch(r'\w+ object \(.+\)', text):
        text = f'{_title(record._meta.verbose_name)} #{record.pk}'
    return text[:120]


def _title(text):
    text = str(text)
    return text[:1].upper() + text[1:]


def _kept_fields(model, creating):
    for field in model._meta.concrete_fields:
        if field.name in IGNORED or field.primary_key:
            continue
        if not creating and (getattr(field, 'auto_now', False) or getattr(field, 'auto_now_add', False)):
            continue
        if creating and getattr(field, 'auto_now', False):
            continue
        yield field


def _raw(record, field):
    value = getattr(record, field.attname)
    return (value.name or '') if isinstance(value, FieldFile) else value


def _snapshot(record):
    return {field.attname: _raw(record, field) for field in record._meta.concrete_fields}


def _empty(value):
    return value is None or value == '' or value == [] or value == {}


def _without_secrets(value):
    if isinstance(value, dict):
        return {k: HIDDEN if SECRET_NAME.search(str(k)) else _without_secrets(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_without_secrets(v) for v in value]
    return value


def _show(field, value):
    """A stored value as a person reads it, or None for an empty one."""
    if _empty(value):
        return None
    if SECRET_NAME.search(field.name):
        return HIDDEN
    if field.is_relation:
        target = field.related_model._base_manager.filter(**{field.target_field.attname: value}).first()
        return label_of(target) if target is not None else f'#{value}'
    if field.choices:
        return str(dict(field.flatchoices).get(value, value))
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    if isinstance(value, dt.datetime):
        local = timezone.localtime(value) if timezone.is_aware(value) else value
        return f'{local:%b} {local.day}, {local.year} {local.strftime("%I:%M %p").lstrip("0")}'
    if isinstance(value, dt.date):
        return f'{value:%b} {value.day}, {value.year}'
    if isinstance(value, dt.time):
        return value.strftime('%I:%M %p').lstrip('0')
    if isinstance(field, models.FileField):
        return os.path.basename(str(value))[:MAX_TEXT]
    if isinstance(value, (dict, list)):
        return json.dumps(_without_secrets(value), ensure_ascii=False, default=str)[:MAX_TEXT]
    return str(value)[:MAX_TEXT]


class Collector:
    def __init__(self, request):
        self.request = request
        self.records = {}    # (model, pk) -> {'kind', 'before', 'name'}, in the order first touched
        self.waiting = {}    # (model, pk) -> how it was, between pre_save and post_save
        self.more = set()    # touched after the list was full

    def _full(self, key):
        if len(self.records) >= MAX_RECORDS:
            self.more.add(key)
            return True
        return False

    def before_save(self, record):
        if record.pk is None or record._state.adding:
            return
        key = (type(record), record.pk)
        if key in self.records or key in self.waiting or len(self.records) >= MAX_RECORDS:
            return
        old = type(record)._base_manager.filter(pk=record.pk).first()
        if old is not None:
            self.waiting[key] = _snapshot(old)

    def after_save(self, record, created):
        key = (type(record), record.pk)
        before = self.waiting.pop(key, None)
        if key in self.records or self._full(key):
            return
        self.records[key] = {'kind': 'created' if created else 'updated', 'before': before, 'name': label_of(record)}

    def before_delete(self, record):
        key = (type(record), record.pk)
        seen = self.records.get(key)
        if seen is not None:
            seen['kind'] = 'added and removed' if seen['kind'] == 'created' else 'deleted'
            return
        if not self._full(key):
            self.records[key] = {'kind': 'deleted', 'before': _snapshot(record), 'name': label_of(record)}

    def finish(self):
        """(changes, how many more records were touched than are listed). One query for each kind of record, to see how it is now."""
        wanted = {}
        for model, pk in self.records:
            wanted.setdefault(model, []).append(pk)
        now = {(model, row.pk): row for model, pks in wanted.items() for row in model._base_manager.filter(pk__in=pks)}
        changes = []
        for key, seen in self.records.items():
            model, record, kind, before = key[0], now.get(key), seen['kind'], seen['before']
            if kind == 'created' and record is not None:
                fields = [self._field(f, None, _raw(record, f)) for f in _kept_fields(model, True) if not _empty(_raw(record, f))]
            elif kind == 'updated' and record is not None and before is not None:
                fields = [self._field(f, before[f.attname], _raw(record, f)) for f in _kept_fields(model, False)
                          if before[f.attname] != _raw(record, f)]
                if not fields:
                    continue
            elif kind == 'deleted' and record is None and before is not None:
                fields = [self._field(f, before[f.attname], None) for f in _kept_fields(model, True) if not _empty(before[f.attname])]
            else:
                continue    # rolled back, or added and removed again
            changes.append({
                'record': _title(model._meta.verbose_name), 'model': model._meta.label_lower, 'change': kind,
                'name': label_of(record) if record is not None else seen['name'], 'fields': fields,
            })
        return changes, len(self.more)

    @staticmethod
    def _field(field, old, new):
        return {'field': _title(field.verbose_name), 'old': _show(field, old), 'new': _show(field, new)}


def _collector_for(sender):
    collector = current()
    if collector is None or sender._meta.app_label not in OUR_APPS or sender._meta.label_lower in NOT_TRACKED:
        return None
    return collector if is_staff(actor_of(collector.request)) else None


@receiver(pre_save, dispatch_uid='audit_capture_pre_save')
def _before_save(sender, instance, raw=False, **kwargs):
    collector = None if raw else _collector_for(sender)
    if collector is not None:
        collector.before_save(instance)


@receiver(post_save, dispatch_uid='audit_capture_post_save')
def _after_save(sender, instance, created, raw=False, **kwargs):
    collector = None if raw else _collector_for(sender)
    if collector is not None:
        collector.after_save(instance, created)


@receiver(pre_delete, dispatch_uid='audit_capture_pre_delete')
def _before_delete(sender, instance, **kwargs):
    collector = _collector_for(sender)
    if collector is not None:
        collector.before_delete(instance)
