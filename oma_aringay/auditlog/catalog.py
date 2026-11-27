"""What each address that changes something does, in words for the Audit Log.

Every such address of the API is listed (auditlog.test_audit_log fails when one is missing), by its URL pattern without "api/".
None means it is not recorded: it saves nothing (a preview), is the system's own housekeeping (edit locks, reading a notice,
refreshing a sign-in) or is recorded elsewhere (signing in, auditlog.recorder).
"""

CREATE, UPDATE, DELETE = 'CREATE', 'UPDATE', 'DELETE'
APPROVE, REJECT, IMPORT, SIGN_OUT, BACKUP, RESTORE = 'APPROVE', 'REJECT', 'IMPORT', 'SIGN_OUT', 'BACKUP', 'RESTORE'
METHODS = ('post', 'put', 'patch', 'delete')


def thing(noun):
    """A kind of record that is added, edited and deleted the usual way."""
    return {'post': (CREATE, f'Added {noun}'), 'put': (UPDATE, f'Updated {noun}'), 'patch': (UPDATE, f'Updated {noun}'),
            'delete': (DELETE, f'Deleted {noun}')}


def does(action, text):
    """One thing, whatever the method."""
    return {method: (action, text) for method in METHODS}


def photo(what):
    return {'post': (UPDATE, f'Uploaded {what}'), 'delete': (DELETE, f'Removed {what}')}


def equipment(kind):
    """The equipment addresses of one kind of cooperative ('farmers' or 'fisherfolk')."""
    base = f'organizations/{kind}/'
    return {
        base + 'equipment/<int:equip_id>/condition/': does(UPDATE, 'Changed the condition of cooperative equipment'),
        base + 'equipment/<int:equip_id>/repair/': does(UPDATE, 'Recorded an equipment repair'),
        base + 'equipment/<int:equip_id>/lend/': does(UPDATE, 'Lent cooperative equipment'),
        base + 'equipment/<int:equip_id>/lend-many/': does(UPDATE, 'Lent cooperative equipment to several members'),
        base + '<int:pk>/equipment-lend/': does(UPDATE, 'Lent cooperative equipment'),
        base + 'equipment-loans/<int:loan_id>/approve/': does(APPROVE, 'Approved an equipment loan'),
        base + 'equipment-loans/<int:loan_id>/reject/': does(REJECT, 'Rejected an equipment loan'),
        base + 'equipment-loans/<int:loan_id>/return/': does(UPDATE, 'Recorded returned equipment'),
    }


def cooperative(kind, words):
    base = f'organizations/{kind}/'
    return {
        base + 'import/': does(IMPORT, f'Imported {words} cooperatives from a spreadsheet'),
        base: thing(f'a {words} cooperative'),
        base + '<int:pk>/': thing(f'a {words} cooperative'),
        base + '<int:pk>/members/import/': does(IMPORT, 'Imported cooperative members from a spreadsheet'),
        base + '<int:pk>/members/': does(CREATE, 'Added cooperative members'),
        base + '<int:pk>/members/<int:member_id>/': does(UPDATE, "Changed a cooperative member's status"),
        base + '<int:pk>/members/<int:member_id>/set-main/': does(UPDATE, "Set a member's main cooperative"),
        base + 'members/<int:member_id>/': does(UPDATE, "Changed a cooperative member's status"),
        base + '<int:pk>/distribute-assistance/': does(CREATE, 'Gave assistance to cooperative members'),
        base + '<int:pk>/equipment/import/': does(IMPORT, 'Imported cooperative equipment from a spreadsheet'),
        base + '<int:pk>/equipment/': does(CREATE, 'Added cooperative equipment'),
        base + 'equipment/<int:equip_id>/': does(DELETE, 'Removed cooperative equipment'),
        base + '<int:pk>/officers/': does(CREATE, 'Assigned a cooperative officer'),
        base + 'officers/<int:officer_id>/end-term/': does(UPDATE, "Ended a cooperative officer's term"),
        **equipment(kind),
    }


ROUTES = {
    # ── profiles, requests, locks, notices ──
    'profile/image/': photo('a profile picture'),
    'profile/contact-number/': does(UPDATE, 'Updated a contact number'),
    'profile/change-requests/': does(CREATE, 'Asked for a profile change'),
    'staff/change-requests/<int:pk>/<str:action>/': does(UPDATE, 'Decided a profile change request'),
    'locks/acquire/': None,
    'locks/heartbeat/': None,
    'locks/release/': None,
    'locks/release-beacon/': None,
    'notifications/<int:pk>/read/': None,
    'notifications/read-all/': None,
    'imports/batches/<uuid:batch_id>/undo/': does(DELETE, 'Undid an import'),

    # ── accounts ──
    'accounts/login/': None,
    'accounts/token/refresh/': None,
    'token/refresh/': None,
    'accounts/logout/': does(SIGN_OUT, 'Signed out'),
    'accounts/me/': does(UPDATE, 'Updated their own account'),
    'accounts/me/photo/': photo('their own profile picture'),
    'accounts/change-password/': does(UPDATE, 'Changed their own password'),
    'accounts/verify-email/': None,
    'accounts/forgot-password/': None,
    'accounts/reset-password/': None,
    'accounts/reset-password/check/': None,
    'accounts/resend-verification/': does(UPDATE, 'Sent a verification e-mail again'),
    'accounts/users/create/': does(CREATE, 'Created a staff account'),
    'accounts/users/<int:id>/': does(UPDATE, 'Updated a user account'),
    'accounts/users/<int:id>/reactivate/': does(UPDATE, 'Reactivated a user account'),
    'accounts/users/<int:id>/regenerate-password/': does(UPDATE, 'Issued a new temporary password to a staff account'),
    'accounts/users/<int:id>/set-citizen-password/': does(UPDATE, 'Set up a farmer, fisherfolk or cooperative account'),
    'accounts/users/<int:id>/regenerate-citizen-password/': does(UPDATE, 'Issued a new temporary password to a farmer, fisherfolk or cooperative account'),

    # ── farmers ──
    'farmers/': thing('a farmer'),
    'farmers/harvest-comparison/': thing('a farmer'),   # takes the farmer list's POST too
    'farmers/parcels/bulk-import/': does(IMPORT, 'Imported farm parcels from a spreadsheet'),
    'farmers/parcel-crops/parse/': None,                 # reads a file into the form; nothing is saved
    'farmers/parcel-crop-records/parse/': None,
    'farmers/parcel-machinery/parse/': None,
    'farmers/parcel-classifications/': thing('a parcel classification'),
    'farmers/parcel-classifications/<int:pk>/': thing('a parcel classification'),
    'farmers/rsbsa-import/preview/': None,
    'farmers/rsbsa-import/commit/': does(IMPORT, 'Imported the RSBSA registry'),
    'farmers/rsbsa-import/batches/<uuid:batch_id>/undo/': does(DELETE, 'Undid an RSBSA registry import'),
    'farmers/create/': thing('a farmer'),
    'farmers/<int:id>/': thing('a farmer'),
    'farmers/<int:id>/delete/': thing('a farmer'),
    'farmers/<int:farmer_id>/parcels/': thing('a farm parcel'),
    'farmers/<int:farmer_id>/parcels/bulk/': does(CREATE, 'Added farm parcels'),
    'farmers/<int:farmer_id>/parcels/import/': does(IMPORT, "Imported a farmer's parcels from a spreadsheet"),
    'farmers/<int:farmer_id>/parcels/create/': thing('a farm parcel'),
    'farmers/parcels/<int:id>/': thing('a farm parcel'),
    'farmers/parcels/<int:parcel_id>/crops/': thing('a parcel crop'),
    'farmers/crops/<int:id>/': thing('a parcel crop'),
    'farmers/crops/<int:id>/pcic-form/': photo('a PCIC insurance form photo'),
    'farmers/parcels/<int:parcel_id>/machinery/': thing('farm machinery'),
    'farmers/machinery/<int:id>/': thing('farm machinery'),
    'farmers/<int:farmer_id>/machinery/': thing('farm machinery'),
    'farmers/farmer-machinery/<int:id>/': thing('farm machinery'),

    # ── fisheries ──
    'fisheries/fisherfolk/harvest-comparison/': thing('a fisherfolk'),   # takes the list's POST too
    'fisheries/fisherfolk/': thing('a fisherfolk'),
    'fisheries/fisherfolk/<int:id>/': thing('a fisherfolk'),
    'fisheries/fisherfolk/<int:fisherfolk_id>/ponds/': thing('a pond or cage'),
    'fisheries/fisherfolk/<int:fisherfolk_id>/ponds/bulk/': does(CREATE, 'Added ponds or cages'),
    'fisheries/ponds/<int:pk>/': thing('a pond or cage'),
    'fisheries/ponds/<int:pk>/pcic-form/': photo('a PCIC insurance form photo'),
    'fisheries/fingerling-sources/': thing('a fingerling source'),
    'fisheries/fingerling-sources/<int:pk>/': thing('a fingerling source'),
    'fisheries/species-categories/': thing('a species category'),
    'fisheries/species-categories/<int:pk>/': thing('a species category'),
    'fisheries/activity-types/': thing('a fisheries activity type'),
    'fisheries/activity-types/<int:pk>/': thing('a fisheries activity type'),
    'fisheries/species/': thing('a species'),
    'fisheries/species/<int:pk>/': thing('a species'),
    'fisheries/species/<int:species_id>/stages/': thing('a species activity step'),
    'fisheries/species/stages/<int:pk>/': thing('a species activity step'),
    'fisheries/feed-types/': thing('a feed type'),
    'fisheries/feed-types/<int:pk>/': thing('a feed type'),
    'fisheries/disease-types/': thing('a disease type'),
    'fisheries/disease-types/<int:pk>/': thing('a disease type'),
    'fisheries/stocking/<int:pk>/': thing('a stocking record'),
    'fisheries/stocking/<int:pk>/pcic-form/': photo('a PCIC insurance form photo'),
    'fisheries/stocking/<int:stocking_id>/logs/': thing('a stocking activity log'),
    'fisheries/stocking/logs/<int:pk>/': thing('a stocking activity log'),
    'fisheries/stocking/logs/<int:id>/detail/': thing('a stocking activity log'),
    'fisheries/stocking/<int:stocking_id>/disasters/': does(CREATE, 'Logged a fisheries disaster'),
    'fisheries/disasters/<int:pk>/resolve/': does(UPDATE, 'Marked a fisheries disaster as recovered'),
    'fisheries/disasters/<int:pk>/': thing('a fisheries disaster report'),
    'fisheries/disaster-reports/stocks/': does(CREATE, 'Logged a fisheries disaster'),
    'fisheries/disaster-reports/multi/': does(CREATE, 'Logged a disaster for several fisherfolk'),
    'fisheries/stocking/<int:stocking_id>/harvests/': does(CREATE, 'Recorded a fisheries harvest'),
    'fisheries/stocking/harvests/<int:pk>/': thing('a fisheries harvest'),
    'fisheries/stocking/harvests/<int:id>/detail/': thing('a fisheries harvest'),
    'fisheries/force-harvest/': does(CREATE, 'Recorded a forced fisheries harvest'),
    'fisheries/fishing-trips/': thing('a fishing trip'),
    'fisheries/fishing-trips/<int:pk>/': thing('a fishing trip'),
    'fisheries/fishing-trips/<int:trip_id>/species/': thing('a catch entry'),
    'fisheries/fishing-trips/species/<int:pk>/': thing('a catch entry'),

    # ── assistance ──
    'interventions/beneficiaries/adhoc/bulk/': does(CREATE, 'Gave assistance to selected farmers'),
    'interventions/fisherfolk-beneficiaries/adhoc/bulk/': does(CREATE, 'Gave assistance to selected fisherfolk'),
    'interventions/options/': thing('an assistance list entry'),
    'interventions/options/<int:pk>/': thing('an assistance list entry'),
    'interventions/assistance-type-units/': does(UPDATE, 'Updated the units of an assistance type'),
    'interventions/assistance-types/': thing('an assistance type'),
    'interventions/assistance-types/<int:pk>/': thing('an assistance type'),
    'interventions/agencies/': thing('a source agency'),
    'interventions/agencies/<int:pk>/': thing('a source agency'),
    'interventions/assistance-removals/': does(DELETE, 'Removed people from an assistance distribution'),
    'interventions/beneficiaries/<int:id>/detail/': does(UPDATE, 'Updated crop assistance'),
    'interventions/fisherfolk-beneficiaries/<int:id>/detail/': does(UPDATE, 'Updated fisheries assistance'),
    'interventions/beneficiaries/adhoc/import/': does(IMPORT, 'Imported crop assistance from a spreadsheet'),
    'interventions/beneficiaries/adhoc/': thing('crop assistance'),
    'interventions/beneficiaries/adhoc/<int:id>/': thing('crop assistance'),
    'interventions/fisherfolk-beneficiaries/adhoc/import/': does(IMPORT, 'Imported fisheries assistance from a spreadsheet'),
    'interventions/fisherfolk-beneficiaries/adhoc/': thing('fisheries assistance'),
    'interventions/fisherfolk-beneficiaries/adhoc/<int:id>/': thing('fisheries assistance'),

    # ── crops ──
    'production/create/': does(CREATE, 'Recorded a harvest'),
    'production/planting/': thing('a planting record'),
    'production/planting/<int:pk>/': thing('a planting record'),
    'production/damage-reports/': thing('a damage report'),
    'production/damage-reports/<int:pk>/': thing('a damage report'),
    'production/crop-types/': thing('a crop type'),
    'production/crop-types/<int:pk>/': thing('a crop type'),
    'production/crop-types/<int:crop_type_id>/stages/': thing('a crop activity step'),
    'production/stages/<int:pk>/': thing('a crop activity step'),
    'production/seed-sources/': thing('a seed source'),
    'production/seed-sources/<int:pk>/': thing('a seed source'),
    'production/activity-types/': thing('a crop activity type'),
    'production/activity-types/<int:pk>/': thing('a crop activity type'),
    'production/varieties/': thing('a crop variety'),
    'production/varieties/<int:pk>/': thing('a crop variety'),
    'production/input-types/': thing('a crop input type'),
    'production/input-types/<int:pk>/': thing('a crop input type'),
    'production/monitoring/bulk/': does(CREATE, 'Added crop records'),
    'production/monitoring/': thing('a crop record'),
    'production/monitoring/<int:pk>/': thing('a crop record'),
    'production/monitoring/<int:pk>/pcic-form/': photo('a PCIC insurance form photo'),
    'production/monitoring/bulk-logs/': does(CREATE, 'Logged an activity on several crops'),
    'production/monitoring/<int:monitoring_id>/logs/': does(CREATE, 'Logged a crop activity'),
    'production/monitoring/<int:monitoring_id>/disasters/': does(CREATE, 'Logged a crop disaster'),
    'production/disasters/multi/': does(CREATE, 'Logged a disaster on several crops'),
    'production/forced-harvest/': does(CREATE, 'Recorded a forced crop harvest'),
    'production/harvest-unit-weights/': thing('a harvest unit weight'),
    'production/harvest-unit-weights/group/': thing('a harvest unit weight'),
    'production/harvest-unit-weights/<int:pk>/': thing('a harvest unit weight'),
    'production/disasters/<int:pk>/resolve/': does(UPDATE, 'Marked a crop disaster as recovered'),
    'production/disasters/<int:pk>/': thing('a crop disaster report'),
    'production/monitoring/<int:monitoring_id>/remarks/': thing('a crop remark'),
    'production/monitoring/logs/<int:pk>/': thing('a crop activity log'),
    'production/monitoring/logs/<int:id>/detail/': thing('a crop activity log'),
    'production/monitoring/<int:monitoring_id>/labor/': thing('a labor log'),
    'production/monitoring/labor/<int:pk>/': thing('a labor log'),
    'production/monitoring/<int:monitoring_id>/inputs/': thing('a farm input log'),
    'production/monitoring/inputs/<int:pk>/': thing('a farm input log'),
    'production/monitoring/<int:monitoring_id>/pest-disease/': thing('a pest or disease report'),
    'production/monitoring/pest-disease/<int:pk>/': thing('a pest or disease report'),
    'production/barangay-crop-summary/': thing('a barangay crop summary'),
    'production/barangay-crop-summary/<int:pk>/': thing('a barangay crop summary'),
    'production/barangay-crop-summary/<int:pk>/link-records/': does(UPDATE, 'Linked records to a barangay crop summary'),
    'production/crop-categories/': thing('a crop category'),
    'production/crop-categories/<int:pk>/': thing('a crop category'),
    'production/crop-subcategories/': thing('a crop subcategory'),
    'production/crop-subcategories/<int:pk>/': thing('a crop subcategory'),
    'production/remarks/': thing('a saved crop remark'),
    'production/remarks/<int:pk>/': thing('a saved crop remark'),
    'production/<int:id>/': thing('a harvest record'),

    # ── monitoring ──
    'monitoring/farm-visits/': thing('a farm visit'),
    'monitoring/farm-visits/<int:pk>/': thing('a farm visit'),
    'monitoring/aquaculture-cycles/': does(CREATE, 'Started a production cycle'),
    'monitoring/aquaculture-cycles/<int:pk>/': thing('a production cycle'),
    'monitoring/aquaculture-units/<int:pk>/': does(UPDATE, "Updated a pond or cage's insurance"),
    'monitoring/aquaculture-units/<int:pk>/pcic-form/': photo('a PCIC insurance form photo'),
    'monitoring/aquaculture-cycles/bulk-feeding/': does(CREATE, 'Logged feeding on several cycles'),
    'monitoring/aquaculture-cycles/bulk-health/': does(CREATE, 'Logged health on several ponds or cages'),
    'monitoring/aquaculture-cycles/<int:cycle_id>/feeding/': does(CREATE, 'Logged a feeding'),
    'monitoring/aquaculture-cycles/feeding/<int:pk>/': thing('a feeding log'),
    'monitoring/aquaculture-cycles/<int:cycle_id>/health/': does(CREATE, 'Logged a health observation'),
    'monitoring/aquaculture-cycles/health/<int:pk>/': thing('a health log'),
    'monitoring/aquaculture-cycles/<int:cycle_id>/inputs/': thing('a fishery input log'),
    'monitoring/aquaculture-inputs/<int:pk>/': thing('a fishery input log'),
    'monitoring/fisherfolk-disasters/': does(CREATE, 'Logged a fisheries disaster'),
    'monitoring/fisherfolk-disasters/<int:pk>/': thing('a fisheries disaster report'),

    # ── reports ──
    'reports/signatories/': thing('a report signatory'),
    'reports/signatories/<int:pk>/': thing('a report signatory'),
    'reports/spec-pdf/': None,                           # answers with a file: recorded as a download

    # ── cooperatives and their members' own equipment requests ──
    **cooperative('farmers', "farmers'"),
    **cooperative('fisherfolk', 'fisherfolk'),
    'organizations/my-equipment/request/': does(CREATE, 'Asked to borrow equipment'),
    'organizations/my-equipment/loans/<int:loan_id>/cancel/': does(UPDATE, 'Cancelled an equipment request'),
    'organizations/my-equipment/loans/<int:loan_id>/return/': does(UPDATE, 'Returned borrowed equipment'),

    # ── backup and restore ──
    'backups/': does(BACKUP, 'Started a backup'),
    'backups/restore/preview/': None,
    'backups/restore/': does(RESTORE, 'Started a restore from a backup file'),
    'backups/<int:pk>/': does(UPDATE, 'Updated the notes of a backup'),
    'backups/<int:pk>/downloaded/': None,                # the page's own "the file arrived"; the download itself is recorded
    'backups/<int:pk>/restore/': does(RESTORE, 'Started a restore'),
}


def _any_created(data):
    return any(row.get('status') == 'created' for row in (data or {}).get('results', []))


# addresses that can answer without having saved anything: they are recorded only when the answer says something was saved
SAVED_WHEN = {
    'interventions/beneficiaries/adhoc/bulk/': _any_created,
    'interventions/fisherfolk-beneficiaries/adhoc/bulk/': _any_created,
    'organizations/farmers/<int:pk>/distribute-assistance/': _any_created,
    'organizations/fisherfolk/<int:pk>/distribute-assistance/': _any_created,
    'farmers/rsbsa-import/batches/<uuid:batch_id>/undo/': lambda data: 'results' in (data or {}),   # without it: only the plan
}

DECISIONS = {'approve': (APPROVE, 'Approved a profile change request'), 'reject': (REJECT, 'Rejected a profile change request')}


def describe(route, method, kwargs, data):
    """(action, words) for a changing request that succeeded, or None when it is not recorded.
    `data` is the answer's body when it is JSON."""
    if route in ROUTES and ROUTES[route] is None:
        return None
    if isinstance(data, dict) and data.get('dry_run'):
        return None                                      # a trial run of an import
    saved = SAVED_WHEN.get(route)
    if saved is not None and not saved(data if isinstance(data, dict) else None):
        return None
    if route == 'staff/change-requests/<int:pk>/<str:action>/':
        return DECISIONS.get((kwargs or {}).get('action'), (UPDATE, 'Decided a profile change request'))
    found = ROUTES.get(route, {}).get(method)
    if found is None:                                    # never leave a change unrecorded, even for an address missed above
        found = ({'post': CREATE, 'delete': DELETE}.get(method, UPDATE), f'{method.upper()} {route}')
    return found
