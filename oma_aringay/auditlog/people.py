"""Who a changed record is about, for the "View history" links of the Audit Log: its farmer or fisherfolk, or, when it belongs to
no person, its cooperative. Found by following the record's own links, while they still exist (also just before a deletion)."""
import logging

from django.db import models, transaction

from associations.models import FarmersOrganization, FisherfolkOrganization
from auditlog.models import AuditLogEntry
from farmers.models import Farmer
from fisheries.models import Fisherfolk

logger = logging.getLogger(__name__)

MAX_PEOPLE = 25
MAX_STEPS = 5      # the longest chain is a photo -> report -> stocking -> pond -> fisherfolk

PERSON_KINDS = ((Farmer, 'farmer'), (Fisherfolk, 'fisherfolk'))
COOPERATIVE_KINDS = ((FarmersOrganization, 'farmers-cooperative'), (FisherfolkOrganization, 'fisherfolk-cooperative'))
# account links and change requests name their record by kind and number
LINKED_MODELS = {'FARMER': Farmer, 'FISHERFOLK': Fisherfolk, 'FARMERS_ORG': FarmersOrganization,
                 'FISHERFOLK_ORG': FisherfolkOrganization}
LINKED_FIELDS = (('record_type', 'record_id'), ('linked_record_type', 'linked_record_id'))
# the links that lead towards a person, nearest first, then the ones that lead to a cooperative
LINKS = ('farmer', 'fisherfolk', 'member', 'farm_parcel', 'monitoring_record', 'production_cycle', 'stocking_record', 'pond',
         'fishing_trip', 'disaster_report', 'beneficiary_record', 'confirmation_request', 'feeding_log', 'harvest', 'equipment',
         'organization', 'farmers_organization')


def _entry(kind, record):
    name = getattr(record, 'full_name', None) or getattr(record, 'name', '')
    return {'kind': kind, 'id': record.pk, 'name': str(name)[:120]}


def _linked(record):
    for type_field, id_field in LINKED_FIELDS:
        model = LINKED_MODELS.get(getattr(record, type_field, None) or '')
        number = getattr(record, id_field, None)
        if model is not None and number:
            return model._base_manager.filter(pk=number).first()
    return None


def _look(record, steps, found):
    """The person the record leads to, or None. Cooperatives met on the way are kept in `found`."""
    for model, kind in PERSON_KINDS:
        if isinstance(record, model):
            return _entry(kind, record)
    for model, kind in COOPERATIVE_KINDS:
        if isinstance(record, model):
            found.append(_entry(kind, record))
            return None
    if steps <= 0:
        return None
    linked = _linked(record)
    if linked is not None:
        return _look(linked, steps - 1, found)
    for name in LINKS:
        nearer = getattr(record, name, None)       # a link that is not set, or whose record is gone, reads as None
        if isinstance(nearer, models.Model):
            person = _look(nearer, steps - 1, found)
            if person is not None:
                return person
    return None


def owner_of(record):
    """{'kind', 'id', 'name'} of whom `record` is about, or None. Never raises: an entry is never lost over this."""
    try:
        cooperatives = []
        # a savepoint of its own: this runs inside the action's transaction, and on PostgreSQL a failed query would spoil all of
        # it even though the error is caught here
        with transaction.atomic():
            person = _look(record, MAX_STEPS, cooperatives)
        return person or (cooperatives[0] if cooperatives else None)
    except Exception:
        logger.exception('Finding whom an Audit Log record is about failed (non-fatal): %s', type(record).__name__)
        return None


def drop_stale_links(using='default'):
    """After an everything restore a number can belong to someone else, so every "View history" link whose record is gone, or has
    another name now, is taken off its entry (the entry and its words stay). An entry that was about more than one is marked
    `people_dropped`, so that the one who is left never looks like the only one it was about. Returns how many links went."""
    with_people = AuditLogEntry._base_manager.using(using).filter(details__has_key='people')
    wanted = {}
    for details in with_people.values_list('details', flat=True).iterator(chunk_size=2000):
        for person in details.get('people') or []:
            wanted.setdefault(person.get('kind'), set()).add(person.get('id'))
    names = {}          # (kind, number) -> the name a link to it would be given today
    for model, kind in PERSON_KINDS + COOPERATIVE_KINDS:
        if kind in wanted:
            for record in model._base_manager.using(using).filter(pk__in=wanted[kind]):
                names[kind, record.pk] = _entry(kind, record)['name']

    stale, dropped = [], 0
    for number, details in with_people.values_list('pk', 'details').iterator(chunk_size=2000):
        links = details.get('people') or []
        kept = [link for link in links
                if (link.get('kind'), link.get('id')) in names and names[link.get('kind'), link.get('id')] == link.get('name')]
        if len(kept) == len(links):
            continue
        dropped += len(links) - len(kept)
        changed = {**details, 'people': kept}
        if len(links) > 1:
            changed['people_dropped'] = True
        stale.append((number, changed))
    for number, details in stale:          # written after the reading is over
        AuditLogEntry._base_manager.using(using).filter(pk=number).update(details=details)
    return dropped


def unique(owners):
    """The first MAX_PEOPLE different people of `owners`, in order."""
    seen, out = set(), []
    for owner in owners:
        if owner is None or (owner['kind'], owner['id']) in seen:
            continue
        seen.add((owner['kind'], owner['id']))
        out.append(owner)
        if len(out) == MAX_PEOPLE:
            break
    return out
