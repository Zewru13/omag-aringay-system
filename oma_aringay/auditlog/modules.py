"""The part of the system an action belongs to, named the way the menu names it (the Module column of the Audit Log).

It is worked out from the address of the action (its URL pattern without "api/"). auditlog.test_modules fails when an address
belongs to none, so a new area has to be placed here.
"""
import logging

logger = logging.getLogger(__name__)

REGISTRATION = 'Registration'
COOPERATIVES = 'Cooperatives'
CROPS = 'Crop Management'
FISHERIES = 'Fisheries Management'
ASSISTANCE = 'Assistance'
DISASTER = 'Disaster'
REPORTS = 'Reports'
CROP_SETTINGS = 'Crop Settings'
FISHERIES_SETTINGS = 'Fisheries Settings'
ACTIVITY_SETTINGS = 'Activity Settings'
ASSISTANCE_SETTINGS = 'Assistance Settings'
CLASSIFICATION_SETTINGS = 'Classification Settings'
HARVEST_UNIT_SETTINGS = 'Harvest Unit Settings'
USERS = 'User Management'
SIGNATORIES = 'Signatories'
BACKUP = 'Backup & Restore'
ACCOUNT = 'Sign-in & Account'

MODULES = (REGISTRATION, COOPERATIVES, CROPS, FISHERIES, ASSISTANCE, DISASTER, REPORTS, CROP_SETTINGS, FISHERIES_SETTINGS,
           ACTIVITY_SETTINGS, ASSISTANCE_SETTINGS, CLASSIFICATION_SETTINGS, HARVEST_UNIT_SETTINGS, USERS, SIGNATORIES, BACKUP,
           ACCOUNT)

# (how the address starts, module). The first match wins, so the narrower beginnings come before the wider ones.
_BEFORE_DISASTER = (
    ('backups/', BACKUP),
    ('reports/signatories/', SIGNATORIES),
    ('reports/', REPORTS),
    ('accounts/users/', USERS),
    (('accounts/', 'token/', 'profile/', 'staff/change-requests/', 'notifications/', 'locks/'), ACCOUNT),
    ('organizations/', COOPERATIVES),
)
_AFTER_DISASTER = (
    ('farmers/parcel-classifications/', CLASSIFICATION_SETTINGS),
    (('farmers/parcels', 'farmers/<int:farmer_id>/parcels', 'farmers/parcel-', 'farmers/crops/', 'farmers/machinery/',
      'farmers/me/parcels'), CROPS),
    (('farmers/', 'fisheries/fisherfolk', 'fisheries/ponds', 'monitoring/farm-visits'), REGISTRATION),
    (('fisheries/species', 'fisheries/feed-types', 'fisheries/disease-types', 'fisheries/fingerling-sources'), FISHERIES_SETTINGS),
    (('production/activity-types', 'fisheries/activity-types'), ACTIVITY_SETTINGS),
    (('fisheries/', 'monitoring/'), FISHERIES),
    ('production/harvest-unit-weights', HARVEST_UNIT_SETTINGS),
    (('production/crop-types', 'production/crop-categories', 'production/crop-subcategories', 'production/stages/',
      'production/seed-sources', 'production/varieties', 'production/input-types', 'production/activity-stage-names'), CROP_SETTINGS),
    ('production/', CROPS),
    (('interventions/agencies', 'interventions/assistance-types', 'interventions/assistance-type-units'), ASSISTANCE_SETTINGS),
)


def _match(route, rules):
    return next((module for start, module in rules if route.startswith(start)), '')


def _dropdown(changes):
    """A dropdown name is kept on the settings page of its domain (its record is named "<domain> <kind>: <name>")."""
    first = changes[0] if changes else {}
    words = str(first.get('name') or '').split(':', 1)[0].split()
    if len(words) == 2 and words[1] in ('equipment', 'gear') and words[0] in ('crop', 'fisheries'):
        return CROP_SETTINGS if words[0] == 'crop' else FISHERIES_SETTINGS
    return ASSISTANCE_SETTINGS


def _undone_import(changes):
    model = str((changes[0] if changes else {}).get('model') or '')
    if model.startswith('associations.'):
        return COOPERATIVES
    if model.startswith('interventions.'):
        return ASSISTANCE
    if model.startswith('production.') or model in ('farmers.farmparcel', 'farmers.farmcrop'):
        return CROPS
    if model.startswith('monitoring.'):
        return FISHERIES
    return REGISTRATION


def _find(route, changes):
    found = _match(route, _BEFORE_DISASTER)
    if found:
        return found
    if 'disaster' in route:
        return DISASTER
    found = _match(route, _AFTER_DISASTER)
    if found:
        return found
    if route.startswith('interventions/options'):
        return _dropdown(changes)
    if route.startswith('interventions/'):
        return ASSISTANCE
    if route.startswith('imports/batches/'):
        return _undone_import(changes)
    return ''


def module_of(route, changes=()):
    """The module of the address `route`; `changes` are the records the action changed (auditlog.capture), needed only where one
    address serves several pages. '' for an address that is not placed. Never raises: an entry is never lost over its module."""
    try:
        return _find(route, changes)
    except Exception:
        logger.exception('Finding the Audit Log module failed (non-fatal): %s', route)
        return ''
