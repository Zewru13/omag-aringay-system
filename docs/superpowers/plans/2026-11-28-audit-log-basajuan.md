# Audit Log, the BasaJuan way: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Audit Log a search box, a Module column and filter, numbered pages, "View history" links, and Farmer, Fisherfolk and Cooperative history tabs, and record every signed-in account's changes.

**Architecture:** Each entry stores its module (new column), worked out from the address of the action, and the people it is about (inside the existing `details` JSON). A new read-only address builds a person's history from the records themselves. The page becomes tabs: All Activity plus three history tabs.

**Tech Stack:** Django 5.2 + DRF, React 19 + Vite, `node --test` for website tests.

**Spec:** `docs/superpowers/specs/2026-11-28-basajuan-audit-backup-manual-design.md`, Part 1 only. Parts 2 and 3 get their own plans.

## Global Constraints

- Work on branch `basajuan-audit-log` cut from `master`.
- **No commit, push, PR, merge or live database change until the user says so.** Task steps therefore end with a ledger line, not a commit.
- Never run tests, scripts or browser checks against the live database. Local default Django settings point at LIVE Supabase.
- Hand-started servers and scripts use `EMAIL_HOST_USER=` and `EMAIL_HOST_PASSWORD=` (blank) and the throwaway settings.
- Never stage `docs/*.json`, `demo-import-files*`, `package-lock.json`, `docs/superpowers/plans/2026-10-27-sample-data-*` or `2026-11-11-forms-consistency-audit.md`.
- Keep our colors and components. Wording says "Cooperative". UI imports use `components/UI` (capitals).
- Audit Log is **Admin only**. Recording must never break the action being done. Passwords, keys and typed secrets are never stored.
- Non-staff sign-ins, sign-outs and failed sign-ins are not recorded.
- 10 entries per page. Line under the title, exact: "Every action in the system, newest first: who did it, what they did, and to whom."
- Module names, exact and in this order: Registration, Cooperatives, Crop Management, Fisheries Management, Assistance, Disaster, Reports, Crop Settings, Fisheries Settings, Activity Settings, Assistance Settings, Classification Settings, Harvest Unit Settings, User Management, Signatories, Backup & Restore, Sign-in & Account.
- User Manual and Help text are not touched in this part.

## Test commands

```bash
S="C:/Users/roron/AppData/Local/Temp/claude/4cedfa40b38d84bd/b8b75d7e-c47b-4be0-95ea-c2d32ac09a2e/scratchpad"
OLD="C:/Users/roron/AppData/Local/Temp/claude/4cedfa40b38d84bd/57548099-34bd-4551-958a-a5e0a29a9bfb/scratchpad"
# throwaway database (run in the background), stop it with mysqladmin ... shutdown
rm -f "$OLD/mdb/Zewru.pid"; "D:/xampp/mysql/bin/mysqld.exe" --no-defaults --datadir="$OLD/mdb" --port=3307 --bind-address=127.0.0.1 --console > "$S/mysqld.log" 2>&1
bash "$S/rt.sh" auditlog                       # server tests (settings: $S/mysqlplain.py)
cd "D:/CAPSTONE SYSTEM MJ/oma-frontend" && npm test
```

Baseline: 2155 server tests with only 6 known Python 3.14 errors ("'super' object has no attribute 'dicts'"); 214/214 website tests.

## Review Focus

- A refused request (400/403) by a farmer or cooperative that saved something part-way: no entry, no error (Task 3).
- A row about someone who has since been deleted: Who still shows, and View history says the record is gone instead of failing (Tasks 5, 7).
- One action over many people (bulk, import): no single row link, at most 25 people kept (Task 4).
- A search typed as "Cruz, Juan" or in the other order finds the same rows (Task 2).
- Anything going wrong while working out module or people: the user's action still succeeds and is still recorded (Task 4).

---

### Task 1: A module for every address

**Files:**
- Create: `oma_aringay/auditlog/modules.py`
- Create: `oma_aringay/auditlog/test_modules.py`

**Interfaces:**
- Produces: `MODULES: tuple[str, ...]` (the Global Constraints order); `module_of(route: str, changes=()) -> str` where `route` is the URL pattern without `api/` and `changes` is the list `capture.Collector.finish()` returns.

- [ ] **Step 1: Write the failing tests**

```python
from django.test import SimpleTestCase

from auditlog.modules import MODULES, module_of


def all_api_routes():
    # same walk as writing_routes(), without the method filter
    ...


class ModuleTests(SimpleTestCase):
    def test_every_address_has_a_module(self):
        for route in sorted(all_api_routes()):
            if route.startswith('auditlog/'):
                continue
            self.assertIn(module_of(route), MODULES, route)

    def test_examples(self):
        for route, module in {
            'farmers/create/': 'Registration', 'farmers/<int:farmer_id>/machinery/': 'Registration',
            'farmers/<int:farmer_id>/parcels/bulk/': 'Crop Management', 'farmers/parcel-classifications/': 'Classification Settings',
            'fisheries/ponds/<int:pk>/': 'Registration', 'monitoring/farm-visits/': 'Registration',
            'monitoring/aquaculture-cycles/': 'Fisheries Management', 'fisheries/species/<int:species_id>/stages/': 'Fisheries Settings',
            'fisheries/activity-types/': 'Activity Settings', 'production/activity-types/': 'Activity Settings',
            'production/crop-types/<int:crop_type_id>/stages/': 'Crop Settings', 'production/stages/<int:pk>/': 'Crop Settings',
            'production/harvest-unit-weights/group/': 'Harvest Unit Settings', 'production/monitoring/bulk-logs/': 'Crop Management',
            'production/monitoring/<int:monitoring_id>/disasters/': 'Disaster', 'monitoring/fisherfolk-disasters/': 'Disaster',
            'production/disaster-logs/<int:pk>/pdf/': 'Disaster', 'reports/disasters/crops/': 'Reports',
            'reports/signatories/': 'Signatories', 'reports/spec-pdf/': 'Reports', 'organizations/my-equipment/request/': 'Cooperatives',
            'interventions/agencies/': 'Assistance Settings', 'interventions/beneficiaries/adhoc/': 'Assistance',
            'accounts/users/create/': 'User Management', 'accounts/login/': 'Sign-in & Account',
            'staff/change-requests/<int:pk>/<str:action>/': 'Sign-in & Account', 'backups/restore/': 'Backup & Restore',
        }.items():
            self.assertEqual(module_of(route), module, route)

    def test_a_dropdown_entry_goes_to_the_settings_page_that_holds_it(self):
        option = lambda name: [{'model': 'interventions.assistanceoption', 'name': name}]
        for name, module in {'crop equipment: Hand Tractor': 'Crop Settings', 'fisheries gear: Gill Net': 'Fisheries Settings',
                             'fisheries equipment: Aerator': 'Fisheries Settings', 'crop seed: Hybrid': 'Assistance Settings'}.items():
            self.assertEqual(module_of('interventions/options/<int:pk>/', option(name)), module, name)
        self.assertEqual(module_of('interventions/options/', ()), 'Assistance Settings')

    def test_odd_input_never_raises(self):
        # a module must never cost the entry: whatever the changes look like, the answer is a string
        for changes in (None, [{}], [{'name': None, 'model': None}], 'nonsense'):
            self.assertIsInstance(module_of('interventions/options/', changes), str)
            self.assertIsInstance(module_of('imports/batches/<uuid:batch_id>/undo/', changes), str)

    def test_an_undone_import_goes_where_its_records_belong(self):
        route = 'imports/batches/<uuid:batch_id>/undo/'
        self.assertEqual(module_of(route, [{'model': 'associations.farmersorganization', 'name': 'x'}]), 'Cooperatives')
        self.assertEqual(module_of(route, ()), 'Registration')
```

`all_api_routes()` is written out in the file: the same walk as `writing_routes()` in `test_audit_log.py`, yielding every `api/` view route.

- [ ] **Step 2:** `bash "$S/rt.sh" auditlog.test_modules` → fails: `No module named 'auditlog.modules'`.

- [ ] **Step 3: Implement `module_of` in `modules.py`** as an ordered list of rules, first match wins:

| Order | Addresses | Module |
|---|---|---|
| 1 | `backups/` | Backup & Restore |
| 2 | `reports/signatories/` | Signatories |
| 3 | other `reports/` | Reports |
| 4 | `accounts/users/` | User Management |
| 5 | other `accounts/`, `token/`, `profile/`, `staff/change-requests/`, `notifications/`, `locks/` | Sign-in & Account |
| 6 | `organizations/` | Cooperatives |
| 7 | any address containing `disaster` | Disaster |
| 8 | `farmers/parcel-classifications/` | Classification Settings |
| 9 | `farmers/parcels`, `farmers/<int:farmer_id>/parcels`, `farmers/parcel-`, `farmers/crops/`, `farmers/machinery/`, `farmers/me/parcels` | Crop Management |
| 10 | other `farmers/`, `fisheries/fisherfolk`, `fisheries/ponds`, `monitoring/farm-visits` | Registration |
| 11 | `fisheries/species`, `fisheries/feed-types`, `fisheries/disease-types`, `fisheries/fingerling-sources` | Fisheries Settings |
| 12 | `production/activity-types`, `fisheries/activity-types` | Activity Settings |
| 13 | other `fisheries/`, `monitoring/` | Fisheries Management |
| 14 | `production/harvest-unit-weights` | Harvest Unit Settings |
| 15 | `production/crop-types`, `crop-categories`, `crop-subcategories`, `stages/`, `seed-sources`, `varieties`, `input-types`, `activity-stage-names` (all under `production/`) | Crop Settings |
| 16 | other `production/` | Crop Management |
| 17 | `interventions/agencies`, `assistance-types`, `assistance-type-units` | Assistance Settings |
| 18 | `interventions/options`: the first change's name is `"<domain> <kind>: <name>"`; kind `equipment` or `gear` → `<Crop or Fisheries> Settings`, anything else or no change → Assistance Settings | |
| 19 | other `interventions/` | Assistance |
| 20 | `imports/batches/`: from the first change's model (`associations.*` Cooperatives, `interventions.*` Assistance, `production.*` and `farmers.farmparcel/farmcrop` Crop Management, `monitoring.*` Fisheries Management), else Registration | |

An address matching nothing returns `''`, which fails the first test for a new area. `module_of` never raises: on any error it logs and returns `''`.

- [ ] **Step 4:** `bash "$S/rt.sh" auditlog` → all pass.

---

### Task 2: Store the module, search and filter

**Files:**
- Modify: `auditlog/models.py`, `auditlog/recorder.py`, `auditlog/serializers.py`, `auditlog/views.py`, `backups/service.py` (the restore's `recorder.record` call), `accounts/password_reset.py`
- Create: `auditlog/migrations/0003_auditlogentry_module.py`
- Test: `auditlog/test_modules.py`, `auditlog/test_audit_log.py`

**Interfaces:**
- Consumes: `module_of`, `MODULES` (Task 1).
- Produces: `AuditLogEntry.module = CharField(max_length=40, blank=True, default='', db_default='')`; `recorder.record(user, action, text, model_name='', details=None, user_name='', module='')`; list rows carry `module` and `user.role` (`'Admin' | 'Focal Person' | 'Farmer' | 'Fisherfolk' | 'Cooperative' | ''`); query parameters `search`, `module`, `action`, `date_from`, `date_to`, `page`; 10 per page.

- [ ] **Step 1: Write the failing tests** (class `ListFilterTests(APITestCase)`, using `make_staff`, `make_citizen`):

```python
test_a_recorded_action_carries_its_module        # POST /api/production/seed-sources/ -> entry.module == 'Crop Settings'
test_sign_in_download_and_restore_carry_theirs   # 'Sign-in & Account'; a pdf download of /api/reports/organization-assistance/ -> 'Reports'
test_search_takes_words_in_any_order             # entry "Updated a farmer: Juan dela Cruz", user_name 'Ada Admin':
                                                 # ?search=Cruz,%20Juan and ?search=juan%20cruz find it; ?search=ada%20farmer too; ?search=pedro none
test_module_filter                               # ?module=Disaster returns only Disaster rows
test_ten_to_a_page                               # 11 entries -> count 11, len(results) 10, page 2 has 1
test_who_shows_the_kind_of_account               # ADMIN 'Admin', EVALUATOR 'Focal Person', linked FARMER 'Farmer', FISHERFOLK 'Fisherfolk',
                                                 # FARMERS_ORG 'Cooperative', entry whose account is gone ''
test_older_entries_are_given_a_module            # calls the migration's module_for_old(action, model_name)
```

`module_for_old` expectations: `('SIGN_IN','accounts.user') → 'Sign-in & Account'`, `('RESTORE','backups.backuprecord') → 'Backup & Restore'`, `('UPDATE','Farmer') → 'Registration'`, `('UPDATE','FarmParcel') → 'Crop Management'`, `('CREATE','User') → 'User Management'`, `('CREATE','BeneficiaryRecord') → 'Assistance'`, `('CREATE','interventions.assistanceagency') → 'Assistance Settings'`, `('CREATE','production.croptype') → 'Crop Settings'`, `('CREATE','production.cropdisasterreport') → 'Disaster'`, `('CREATE','associations.farmersorganizationmember') → 'Cooperatives'`, `('CREATE','fisheries.pond') → 'Registration'`, `('DOWNLOAD','download') → ''`, `('UPDATE','') → ''`.

- [ ] **Step 2:** `bash "$S/rt.sh" auditlog` → the new tests fail (no `module`).

- [ ] **Step 3: Implement.**
  - `record_request` passes `module_of(route, changes)`; for downloads `module_of(route)`; `signed_in` / `sign_in_failed` pass `'Sign-in & Account'`; the restore's record passes `'Backup & Restore'`; the password-reset record passes `'Sign-in & Account'`.
  - Migration `0003`: `AddField` + `RunPython(fill_modules, RunPython.noop)`. `fill_modules` updates only rows with `module=''`, grouped by `(action, model_name)` with `.update()`. `module_for_old(action, model_name)` lives **inside the migration file** (it must not change later). It lower-cases `model_name`; sign-in actions and `BACKUP`/`RESTORE` come first; then the record name after the dot, then the app before it: associations → Cooperatives; interventions settings models (assistanceagency, assistanceoption, assistancecustomtype, assistancetypeunits) → Assistance Settings, other interventions and both beneficiary names → Assistance; any name containing `disaster` → Disaster; crop settings models (cropcategory, cropsubcategory, croptype, cropvariety, cropinputtype, cropactivitystage, seedsource) → Crop Settings; activitytype, fisheriesactivitytype → Activity Settings; harvestunitweight → Harvest Unit Settings; speciescategory, speciesoption, speciesactivitystage, feedtype, diseasetype, fingerlingsource → Fisheries Settings; parcelclassification → Classification Settings; farmparcel, farmcrop, farmmachinery, harvestrecord, other production → Crop Management; farmer, fisherfolk, pond, farmvisit, farmermachinery, other farmers → Registration; other fisheries and monitoring → Fisheries Management; user → User Management; signatory → Signatories; profilechangerequest → Sign-in & Account; backup, backuprecord → Backup & Restore; else `''`.
  - View: `search` uses `core.utils.build_text_search_q(search, ['object_repr', 'user_name', 'user_email'])`; add the `module` filter; `page_size = 10`; `prefetch_related('user__linked_records')`. The older `model_name` and `user_id` parameters stay.
  - Serializer: add `module`; `user.role` from the current account (`role`, and for CITIZEN the active link's `record_type`; `*_ORG` → Cooperative); `''` when the account is gone or is the system account.
  - Create the migration with the throwaway settings (`makemigrations auditlog`), then add the `RunPython`.

- [ ] **Step 4:** `bash "$S/rt.sh" auditlog backups` → all pass; `makemigrations --check --dry-run` reports no changes.

---

### Task 3: Every signed-in account gets one entry per action

**Files:**
- Modify: `auditlog/capture.py`, `auditlog/recorder.py`, `auditlog/signals.py`, `auditlog/catalog.py` (docstring only), `interventions/distributions.py`, `accounts/password_reset.py`
- Test: `auditlog/test_audit_log.py`, `interventions/test_distribution_removal.py`

**Interfaces:**
- Produces: `capture.request_being_recorded() -> bool` (replaces `staff_request_running`): True while a changing request by **any** signed-in account runs.

- [ ] **Step 1: Write / change the tests.**

```python
# replaces test_what_a_citizen_changes_is_still_recorded_as_before
def test_a_citizen_gets_one_entry_with_what_changed(self):
    # PATCH /api/profile/contact-number/ as self.farmer_user
    # -> exactly 1 entry in all of AuditLogEntry; action 'UPDATE'; object_repr startswith 'Updated a contact number: ';
    #    details['changes'] holds field 'Contact number' with the new value; module 'Sign-in & Account'

class CitizenActionTests(APITestCase):
    test_a_farmer_logging_an_activity_is_recorded            # POST /api/production/monitoring/<id>/logs/ -> 'Logged a crop activity: ...', Crop Management
    test_a_cooperative_logging_for_a_member_is_shown_as_who  # same address as a cooperative account -> entry.user is the cooperative's account
    test_a_citizen_reporting_a_disaster_is_recorded          # module 'Disaster'
    test_a_refused_citizen_request_leaves_no_entry_and_no_error   # another farmer's crop -> 403/404, count 0
    test_a_citizen_signing_out_is_not_recorded
    test_a_citizen_download_is_recorded                      # their own pdf download -> action 'DOWNLOAD'
    test_a_citizen_password_reset_from_the_link_is_one_entry_without_the_password
    test_a_script_save_is_still_noted_by_the_system_account  # Farmer.save() outside a request -> 1 entry, user_email = system account
```

`test_citizens_signing_in_are_not_recorded` stays unchanged. In `test_distribution_removal.py` (about line 241) the assertion becomes: the entry made by the removing account starts with `'Removed people from an assistance distribution'`. Update the module docstring of `test_audit_log.py`: every signed-in account is recorded.

- [ ] **Step 2:** `bash "$S/rt.sh" auditlog interventions.test_distribution_removal` → new tests fail.

- [ ] **Step 3: Implement.**
  - `capture._collector_for` collects when `actor_of(request)` is not None.
  - `recorder.record_request` records any signed-in actor, except `SIGN_OUT` for a non-staff account.
  - `signals._log` and `distributions.py` use `request_being_recorded()`.
  - `password_reset.py` records every role in the person's name; `on_user_save` skips the `RESET_BY_LINK` save for every role.
  - Anonymous requests and scripts behave as before.

- [ ] **Step 4:** `bash "$S/rt.sh" auditlog interventions backups accounts` → only the known Python 3.14 errors.

---

### Task 4: Remember who an entry is about

**Files:**
- Create: `auditlog/people.py`, `auditlog/test_people.py`
- Modify: `auditlog/capture.py`, `auditlog/recorder.py`

**Interfaces:**
- Produces: `people.owner_of(record) -> dict | None` with `{'kind': 'farmer'|'fisherfolk'|'farmers-cooperative'|'fisherfolk-cooperative', 'id': int, 'name': str}`; `people.MAX_PEOPLE = 25`; `Collector.finish()` still returns `(changes, more)` and `Collector.people` is the unique list, filled by `finish()`; entry `details` = `{'changes', 'more', 'people'}` (`details` stays None when all three are empty).

Rule: each changed record points to **its person** (farmer or fisherfolk); a record with no person points to its cooperative. So adding a member points to the member.

- [ ] **Step 1: Write the failing tests:**

```python
test_owner_of_each_kind_of_record   # farmer; farm parcel; crop record (farmer's -> farmer, cooperative's own -> farmers-cooperative);
                                    # crop activity log; crop disaster report; harvest record; assistance record (both domains);
                                    # fisherfolk; pond; production cycle; feeding log; stocking; fisheries disaster report; fishing trip;
                                    # membership -> the member; cooperative equipment -> the cooperative; equipment loan -> the borrower;
                                    # profile change request and UserLinkedRecord -> the linked record; seed source -> None
test_an_action_on_one_farmer_keeps_that_one_person      # PATCH a farmer -> details['people'] == [{'kind':'farmer','id':..,'name':..}]
test_a_deletion_still_knows_whose_it_was                # delete a farm visit
test_a_bulk_action_keeps_each_person_once_up_to_25      # 30 farmers given assistance -> len(people) <= 25, no duplicates
test_an_undone_change_names_nobody
test_a_failure_while_naming_people_breaks_nothing       # patch auditlog.people.owner_of to raise -> request succeeds, one entry, no people
```

- [ ] **Step 2:** `bash "$S/rt.sh" auditlog.test_people` → fails: no `auditlog.people`.

- [ ] **Step 3: Implement.** `owner_of` follows the links on the record (`farmer`, `fisherfolk`, `member`, `farm_parcel`, `monitoring_record`, `production_cycle`, `stocking_record`, `fishing_trip`, `disaster_report`, `beneficiary_record`, `feeding_log`, `harvest`, `organization`, `farmers_organization`, `equipment`; `linked_record_type/id`, `record_type/id`), stopping at the first Farmer or Fisherfolk and falling back to a cooperative. It returns None on any error and logs it, and the collector guards its call too, so nothing in it can stop the action or lose the entry. The collector calls it inside `after_save` and `before_delete`, while the links still exist, and keeps people only for records that end up listed in `changes`.

- [ ] **Step 4:** `bash "$S/rt.sh" auditlog` → all pass.

---

### Task 5: The history address

**Files:**
- Create: `auditlog/history.py`, `auditlog/test_history.py`
- Modify: `auditlog/views.py`, `auditlog/urls.py`

**Interfaces:**
- Produces: `GET /api/auditlog/history/<str:kind>/<int:pk>/?page=N`, kind one of the four of Task 4. Admin only. Response `{'subject': {'kind', 'id', 'name', 'facts': [{'label', 'value'}]}, 'count': int, 'results': [{'date': 'YYYY-MM-DD', 'what': str, 'module': str}]}`, newest first, 10 per page. Unknown kind or missing record → 404 `{'detail': 'This record is no longer in the system.'}`.
- `history.history_of(kind: str, pk: int) -> tuple[dict, list[dict]] | None`. The address is read-only, so it needs no `catalog` entry.

Events (date used → sentence · module). Sentences use the records' display names; empty parts are left out.

| Farmer | Fisherfolk | Cooperative |
|---|---|---|
| date_registered → "Registered as a farmer" · Registration | "Registered as a fisherfolk" · Registration | date_registered, else date_created → "Cooperative registered" · Cooperatives |
| crop date_planted → "Planted {crop} ({season} {year}), {area} ha" · Crop Management | pond date_created → "Added pond or cage {name}" · Registration | member date_joined → "{member} joined" + " (ended)" · Cooperatives |
| activity log date_of_activity → "{activity} on {crop}" · Crop Management | cycle stocking_date → "Started cycle {cycle_name} ({species})" · Fisheries Management | officer term_start_date → "{full_name} became {position}"; term_end_date when not active → "{full_name} ended the term as {position}" |
| harvest end date, else start date, else date_recorded → "Harvested {crop_name}: {volume_kg} kg", or "Force harvested {crop_name}: {reason}" · Crop Management | stocking date_stocked → "Stocked {number} {species}" · Fisheries Management | equipment acquisition_date → "Acquired {quantity} {equipment}" |
| disaster date_of_occurrence → "Disaster on {crop}: {type}"; recovered_date → "{crop} recovered from {type}" · Disaster | feeding_date → "Fed {kg} kg of {feed} ({cycle})"; health log_date → "Health observation ({cycle}): {observation}"; stocking activity date_of_activity → "{activity} on {species}" · Fisheries Management | loan borrowed_at → "Lent {quantity} {equipment} to {member}"; returned_at → "{member} returned {quantity} {equipment}" |
| assistance date_given → "Assistance: {type} {item}, {quantity}"; removed_at → "Removed from the list: {type}" (no "Assistance:" line for a removed one) · Assistance | stocking harvest harvest_date → "Harvested {kg} kg of {species}"; cycle actual_harvest_date → "Cycle {cycle_name} harvested" · Fisheries Management | repair repaired_on → "Repaired {quantity} {equipment}: {description}" |
| farm visit visit_date → "Farm visit: {purpose}" · Registration | trip_date → "Fishing trip to {ground}: {kg} kg" · Fisheries Management | assistance with distributed_by_organization = this one, grouped by (date_given, assistance_type, distribution_batch), removed ones left out → "Gave {type} to {n} member(s)" · Assistance |
| membership date_joined → "Joined {cooperative}" + " (ended)" · Cooperatives | disasters (own, or through stocking; each report once) as for farmers, "{species or 'Fisheries'}" in place of crop · Disaster | |
| officer terms as for cooperatives, "Became {position} of {cooperative}" | assistance, membership, officer terms (through `member__fisherfolk`) as for farmers | |
| loan borrowed_at → "Borrowed {quantity} {equipment} from {cooperative}"; returned_at → "Returned …"; never borrowed: requested_at → "Asked to borrow {quantity} {equipment}" | loans as for farmers | |
| change request requested_at → "Asked to change {field} to {value}"; reviewed_at → "Change of {field}: {status}" · Sign-in & Account | change requests as for farmers | |

Facts: farmer — RSBSA number, Barangay, Farm parcels (`FarmParcel.objects`), Machinery. Fisherfolk — RSBSA number, Barangay, Ponds and cages. Cooperative — Registration number, Barangay, Current members, Equipment items.

- [ ] **Step 1: Write the failing tests:** one per column that creates one record of each row with distinct dates and asserts the exact list of `(date, what, module)` newest first; plus `test_only_that_persons_records_are_listed` (a second farmer's records never appear), `test_ten_to_a_page`, `test_only_an_admin_reads_it` (Focal Person, farmer account → 403), `test_a_missing_record_says_so` (404 with the sentence above), `test_a_removed_assistance_shows_once_as_removed`.

- [ ] **Step 2:** `bash "$S/rt.sh" auditlog.test_history` → fails with 404 for the unknown address.

- [ ] **Step 3: Implement `history_of`** with one small function per kind; `select_related` for names so the query count does not grow with the number of events; sort by `(date, order the row appears in the table)` descending, then cut the page in the view.

- [ ] **Step 4:** `bash "$S/rt.sh" auditlog` → all pass.

---

### Task 6: The All Activity tab

**Files:**
- Create: `oma-frontend/src/pages/Admin/AuditActivityTab.jsx`, `oma-frontend/src/pages/Admin/NumberedPages.jsx`
- Modify: `pages/Admin/AuditLogPage.jsx`, `pages/Admin/AuditEntryWindow.jsx`, `pages/Admin/auditLog.js`
- Test: `oma-frontend/tests/auditLog.test.mjs`

**Interfaces:**
- Consumes: the list rows and parameters of Task 2; `details.people` of Task 4.
- Produces in `auditLog.js`: `MODULE_OPTIONS`, `pageNumbers(current, total)`, `showingText(page, size, total)`, `peopleOf(entry)`, `rowPerson(entry)` (the only person, else null), `historyLink(person)`, `historyTarget(params: URLSearchParams) -> {tab, kind, id}`.
- `NumberedPages({ page, pageSize, total, onPage })` (also used by Task 7).

- [ ] **Step 1: Add the failing tests** to `auditLog.test.mjs`:

```js
eq(MODULE_OPTIONS[0], { label: 'All modules', value: '' })
// every name in MODULES of auditlog/modules.py is an option, in the same order
eq(pageNumbers(1, 137), [1, 2, 3, 4, '…', 137])
eq(pageNumbers(5, 137), [1, '…', 4, 5, 6, '…', 137])
eq(pageNumbers(137, 137), [1, '…', 134, 135, 136, 137])
eq(pageNumbers(3, 5), [1, 2, 3, 4, 5])
eq(pageNumbers(1, 1), [1])
eq(showingText(1, 10, 1363), 'Showing 1 to 10 of 1,363 entries')
eq(showingText(137, 10, 1363), 'Showing 1,361 to 1,363 of 1,363 entries')
eq(showingText(1, 10, 1), 'Showing 1 to 1 of 1 entry')
const pia = { kind: 'farmer', id: 5, name: 'Pia' }
eq(rowPerson({ details: { people: [pia] } }), pia)
eq(rowPerson({ details: { people: [pia, { kind: 'farmer', id: 6, name: 'Noy' }] } }), null)
eq(rowPerson({ details: null }), null)
eq(historyLink(pia), '/audit-log?tab=farmer&id=5')
eq(historyLink({ kind: 'fisherfolk', id: 2 }), '/audit-log?tab=fisherfolk&id=2')
eq(historyLink({ kind: 'farmers-cooperative', id: 3 }), '/audit-log?tab=cooperative&kind=farmers-cooperative&id=3')
eq(historyTarget(new URLSearchParams('')), { tab: 'all', kind: '', id: null })
eq(historyTarget(new URLSearchParams('tab=farmer&id=5')), { tab: 'farmer', kind: 'farmer', id: 5 })
eq(historyTarget(new URLSearchParams('tab=cooperative&kind=fisherfolk-cooperative&id=3')), { tab: 'cooperative', kind: 'fisherfolk-cooperative', id: 3 })
eq(historyTarget(new URLSearchParams('tab=nonsense&id=abc')), { tab: 'all', kind: '', id: null })
```

Change the old page checks to read `AuditActivityTab.jsx` for `AuditEntryWindow`, `onClick`, `onKeyDown`, `What Happened`, `Module`, `View history`, `NumberedPages`, `actionLabel` (no longer `Description`); the "no Model column or filter" check stays and also covers the new tab; `AuditLogPage.jsx` has the sentence under the title and the four tab names.

- [ ] **Step 2:** `npm test` → fails on the missing exports.

- [ ] **Step 3: Implement.**
  - `AuditLogPage`: title "Audit Log", the subtitle, `PillTabs` (All Activity, Farmer History, Fisherfolk History, Cooperative History); the tab and person live in the address (`useSearchParams`).
  - `AuditActivityTab`: today's list code moved here. `FilterPanel` with search ("Search a name or what happened…", asked 300 ms after typing stops), Module, Action, From Date, To Date, `onReset`. Any filter change returns to page 1; a late answer to an older request is ignored.
  - Table: Date & Time, Who (name, role under it; "System / Automation" badge as now), What Happened (the button that opens the window, then View history when `rowPerson` exists; its click does not open the window), Module ("—" when empty). Phone cards show the same, without the Action pill.
  - `NumberedPages`: `showingText`, Previous, `pageNumbers`, Next; the current page has `aria-current="page"`; on a phone the buttons wrap.
  - Window: adds Module, keeps e-mail and Action, and lists "View history: {name}" links for `peopleOf(entry)`.

- [ ] **Step 4:** `npm test` → all pass; `npm run build` succeeds.

---

### Task 7: The history tabs

**Files:**
- Create: `oma-frontend/src/pages/Admin/AuditHistoryTab.jsx`, `oma-frontend/src/pages/Admin/historyTabs.js`
- Modify: `pages/Admin/AuditLogPage.jsx`
- Test: `oma-frontend/tests/auditHistory.test.mjs`

**Interfaces:**
- Consumes: the address of Task 5; `historyTarget`, `historyLink`, `NumberedPages` of Task 6; `components/UI/SearchBar.jsx`, `DataTable.jsx`.
- Produces: `historyTabs.js`: `HISTORY_TABS = { farmer, fisherfolk, cooperative }`, each `{ title, intro, placeholder, empty, sources: [{url, kind}] }`, and `pickerRows(kind, data) -> [{kind, id, name, note}]` (accepts a plain list or `{results}`).

Exact words:

| Tab | Title | Line under it | Before a pick |
|---|---|---|---|
| farmer | Farmer History | "Search for a farmer to see their history: crops, harvests, disasters, assistance, farm visits and more." | "Pick a farmer above to see their history." |
| fisherfolk | Fisherfolk History | "Search for a fisherfolk to see their history: ponds, cycles, harvests, fishing trips, disasters, assistance and more." | "Pick a fisherfolk above to see their history." |
| cooperative | Cooperative History | "Search for a cooperative to see its history: members, officers, equipment and assistance given." | "Pick a cooperative above to see its history." |

Sources: farmer `/farmers/?search=`, fisherfolk `/fisheries/fisherfolk/?search=`, cooperative both `/organizations/farmers/?search=` (kind `farmers-cooperative`) and `/organizations/fisherfolk/?search=` (kind `fisherfolk-cooperative`). Read each list serializer for the name and RSBSA fields before writing `pickerRows`.

- [ ] **Step 1: Write the failing test:** the three tabs have those exact strings and sources; `pickerRows('farmer', {results:[{id:1, first_name:'Pia', last_name:'Cruz', rsbsa_number:'01-1'}]})` and the plain-list form give `[{kind:'farmer', id:1, name:'Pia Cruz', note:'01-1'}]`; a cooperative row is `{kind:'farmers-cooperative', id:3, name:'…', note:'Farmers cooperative'}`; the component has `Date`, `What Happened`, `Module`, `NumberedPages`, and shows the server's `detail` on a 404.
- [ ] **Step 2:** `npm test` → fails: no `historyTabs.js`.
- [ ] **Step 3: Implement.** Search starts at 2 letters, 300 ms after typing stops, up to 20 matches in a list under the box. Picking one puts it in the address. Then: name, the facts, the table (phone cards through `DataTable` with `phoneTitleKey`), pages. "Nothing recorded yet." for an empty history; a "Pick another" button clears the pick; a late answer for an earlier pick is ignored.
- [ ] **Step 4:** `npm test` and `npm run build` pass.

---

### Task 8: Check everything, then ask the user

**Files:** none new in the repository.

- [ ] **Step 1:** Full server suite in the background (about 15 minutes): `bash "$S/rt.sh"` → only the 6 known errors. `makemigrations --check --dry-run` → no changes.
- [ ] **Step 2:** `npm test`, `npm run build`; lint compare of changed website files against `master` → no new problems.
- [ ] **Step 3:** Migrate the throwaway browser database (`scratch_run.py manage migrate`, with `$S` added to its `PYTHONPATH`) and browser-check as Admin on computer and phone size: search, each filter, pages 1/2/last, a row link, window links, each history tab with a real pick, a farmer account's new entry, and that a Focal Person cannot open the page. Restore `.claude/launch.json` and stop the servers.
- [ ] **Step 4:** Prepare (do not run) the live SQL: `alter table auditlog_auditlogentry add column module varchar(40) not null default '';`, the backfill `update … where module = ''` statements matching `module_for_old`, and the `django_migrations` row for `auditlog 0003_auditlogentry_module`. Test the backfill statements on a copy of the throwaway table against `module_for_old`.
- [ ] **Step 5:** Report to the user with screenshots and **ask** to apply the live SQL, then commit (`git add -A -- oma-frontend oma_aringay docs/superpowers/specs/2026-11-28-basajuan-audit-backup-manual-design.md docs/superpowers/plans/2026-11-28-audit-log-basajuan.md`), push, open the PR and merge. Order: live SQL first, merge only after the Vercel preview of the pushed commit says `success`.
