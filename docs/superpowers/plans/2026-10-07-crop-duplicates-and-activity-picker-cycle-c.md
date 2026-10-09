# Cycle C — Duplicate Crops and the Crop Activity Picker: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crop names, varieties and farmers' active crop records cannot be duplicated (compared ignoring case, spaces and punctuation), and the staff activity picker offers only applicable next steps and hides activities already done.

**Architecture:** One pure `normalize_name` helper; one shared `find_active_duplicates` function used by the record serializer, the bulk view and the duplicate-check endpoint so the warning and the refusal never disagree; the picker becomes a pure function over the server's suggestions data.

**Tech Stack:** Django 4.2 + DRF, React, Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-crop-duplicates-and-activity-picker-cycle-c-design.md`

## Global Constraints

- Normalization: Unicode NFKC, case-folded, every character that is not a letter or digit removed; a value that normalizes to empty is refused as "not a real name".
- Crop options: compared against OTHER rows only, so an unchanged existing duplicate can still be edited; a variety is compared inside its crop type (varieties with no crop type among themselves).
- Crop records: duplicate = same farmer + same crop type + same normalized variety (both blank equal) + other record ACTIVE (`Planted` or `Near Harvest`) + same parcel (or, when the new record has no parcel, same `farm_location_barangay` case-insensitively; neither set counts as the same place). No override. Check runs on create, and on update only when one of `farmer`, `crop_type`, `variety_used`, `farm_parcel`, `farm_location_barangay` is in the request (barangay only matters when no parcel). Records without a farmer are not checked.
- Existing duplicates in the database are left alone. The crop record file import is unchanged.
- Messages: `A variety named '<name>' already exists for <crop>.` / `A crop type named '<name>' already exists.` (existing entry's own spelling) and `This farmer already has an active <crop> (<variety>) record on this parcel (record #<id>, planted <date>). Harvest or close it first, or choose a different parcel.` ("(<variety>)" omitted when blank; "on this parcel" becomes "in <barangay>" when there is no parcel).
- Picker: ordering only (the existing flat `ComboboxWithOther` option list takes plain strings, so the step's day is not shown beside the name; ruling taken in the plan, the spec's "Day 20" hint is dropped).
- Never test against Supabase; throwaway stack with the mail credentials blanked (`EMAIL_HOST_USER= EMAIL_HOST_PASSWORD=` on the runserver command). Commit only when the user says so; no push.

## Review Focus

1. A parcel-linked record and a barangay-only record for the same farmer and crop. (Task 2)
2. A variety typed with a trailing space or a different Unicode form (`Rc 222 `, full-width digits `Rc ２２２`). (Task 1)
3. An activity with several steps (days 20, 40, 60): after step 20 is done it is not "Suggested now" again until step 40 is due, and it is not hidden. (Task 4)
4. A step whose log is inside the window but carries a different `target_day`: the server marks it done and the picker follows the server. (Task 4)
5. Editing a log whose activity name would otherwise be hidden: that name stays selectable. (Task 4)

## Harness (Tasks 1-2 backend; Tasks 3-4 also browser)

Same recipe as cycles A and B: throwaway MariaDB on port 3307 (`mysql_install_db.exe --datadir=<scratch>\mdb`, `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1`, database `oma_aringay_db` utf8mb4), `<scratch>\mysqlplain.py`, tests with `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput`. Browser stack: `migrate`, seed with `seed_org.py` + `seed_fix.py` (admin, evaluator, farmer, fisherfolk, organizations; `org_tokens.json`), `runserver 127.0.0.1:8001 --settings=mysqlplain --noreload` started with the mail credentials blanked, `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`; in the browser set `localStorage.accessToken` and a placeholder `refreshToken`. Test data helpers for crop records: `production/test_farmer_scope.py` has `make_farmer`, `make_crop` and `make_staff` (copy the pattern, do not import it). Cleanup at the end: clear browser storage, stop the three processes, delete scratch `mdb`, test media, token file.

## File Structure

- Backend new: `production/naming.py`, `production/duplicates.py`; tests `production/test_name_duplicates.py`, `production/test_crop_record_duplicates.py`.
- Backend modified: `production/serializers.py` (`CropTypeSerializer.validate_name`, `CropVarietySerializer.validate`, `CropMonitoringRecordSerializer.validate`), `production/views.py` (`CropDuplicateCheckView`, `CropMonitoringBulkCreateView`).
- Frontend new: `utils/activityPicker.js`. Modified: `pages/Monitoring/AddCropMonitoringPage.jsx` (duplicate hook and row warning), `pages/Monitoring/CropMonitoringPage.jsx` (picker).

---

### Task 1: Crop type and variety duplicates

**Files:**
- Create: `oma_aringay/production/naming.py`
- Modify: `oma_aringay/production/serializers.py`
- Test: `oma_aringay/production/test_name_duplicates.py` (new)

**Interfaces:**
- Produces: `production.naming.normalize_name(value: str | None) -> str` (NFKC, `casefold()`, keep only `str.isalnum()` characters; `None` → `''`).
- `CropTypeSerializer.validate_name` and `CropVarietySerializer.validate` compare by `normalize_name` against OTHER rows and raise the messages in Global Constraints; a name that normalizes to empty raises `'Enter a real name (letters or numbers).'` on `name`.

- [ ] **Step 1: Write the failing tests** (`SimpleTestCase` for the helper, `APITestCase` as admin for the API): `normalize_name`: `'Rc 222'`, `'RC222'`, `'Rc-222'`, `' rc 222 '` all equal `'rc222'`; full-width `'Rc ２２２'` equals `'rc222'`; `'---'` → `''`; `None` → `''`. API: creating a crop type `'Rice  (Palay)'` when `'Rice (Palay)'` exists → 400 on `name` naming the existing entry; the crop type itself can be PATCHed to change another field and to rename to a new name; variety `'RC 222'` under Rice when `'Rc222'` exists under Rice → 400 with the exact message; the same name under a different crop type → 201; variety with no crop type vs another with no crop type → 400; two existing duplicates (created with `objects.create` bypassing the serializer) can each be PATCHed on another field → 200; a PATCH renaming a variety to another existing variety's normalized name → 400; a name `'---'` → 400 `Enter a real name (letters or numbers).`.
- [ ] **Step 2: Run** `manage.py test production.test_name_duplicates`. Expected: FAIL (module missing / duplicates accepted).
- [ ] **Step 3: Implement** `naming.py` and use it in the two serializers (the existing case-insensitive checks are replaced, not added to; keep `data['name'] = name` stripping in the variety serializer).
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** change `normalize_name` to only lower-case and confirm the punctuation and full-width tests fail; restore and ledger it.
- [ ] **Step 5: Run the whole suite.** Expected: OK (an existing test that relied on `Rc 222` and `RC222` being distinct is updated and listed in the ledger).

---

### Task 2: Farmers' crop record duplicates

**Files:**
- Create: `oma_aringay/production/duplicates.py`
- Modify: `oma_aringay/production/serializers.py` (`CropMonitoringRecordSerializer.validate`), `oma_aringay/production/views.py` (`CropDuplicateCheckView`, `CropMonitoringBulkCreateView`)
- Test: `oma_aringay/production/test_crop_record_duplicates.py` (new)

**Interfaces:**
- Consumes (Task 1): `normalize_name`.
- Produces: `production.duplicates.find_active_duplicates(*, farmer_id, crop_type_id, variety, farm_parcel_id=None, barangay='', exclude_id=None) -> list[CropMonitoringRecord]` — active records of that farmer and crop whose normalized variety equals `normalize_name(variety)` and whose place matches (parcel id equal when `farm_parcel_id` is given; otherwise barangay equal case-insensitively, with both empty counting as equal), newest first, excluding `exclude_id`; and `production.duplicates.duplicate_message(existing, crop_type, variety, barangay, has_parcel) -> str` building the Global Constraints message. The serializer raises `ValidationError({'crop_type': message})`. `CropDuplicateCheckView` accepts query parameters `farmer`, `crop_type`, `variety`, `parcel`, `barangay`, `exclude` and returns `{'duplicates': [{'id', 'crop_type', 'variety_used', 'date_planted', 'area_planted_ha', 'status'}]}` from the same function. The bulk view adds an in-batch check using the validated data of each row.

- [ ] **Step 1: Write the failing tests** (`APITestCase`, admin client; `Farmer`, `FarmParcel`, `CropType` fixtures as in `test_farmer_scope.py`; POST `/api/production/monitoring/`): same farmer + crop + variety + parcel with an active record → 400 on `crop_type` with the exact message including the record id and planting date; same with a different parcel → 201; no-parcel records in the same barangay → 400, in different barangays → 201; a parcel-linked new record vs an existing barangay-only record in the same barangay (Review Focus 1: the rule compares parcel only when the NEW record has one, so the existing barangay-only record does not block a new parcel-linked record on a different parcel but a record with the same parcel does) — pin both outcomes; Harvested and Total Loss earlier records never block; `Near Harvest` blocks; variety `'Rc 222'` vs existing `'RC222'` → 400; both blank varieties → 400; different farmer → 201; PATCH of `remarks` on an existing duplicate pair → 200; PATCH changing `variety_used` of record B into A's variety → 400 while PATCH to its own current variety → 200; `check-duplicate` returns the same record ids the refusal uses (`?farmer=..&crop_type=..&variety=..&parcel=..`) and `exclude=<id>` removes it; bulk endpoint: two identical rows in one submission → 400 with `errors` list whose second item mentions `duplicates row 1 of this form` and nothing saved (record count unchanged); bulk with an existing active duplicate → 400 on that row and nothing saved.
- [ ] **Step 2: Run** `manage.py test production.test_crop_record_duplicates`. Expected: FAIL.
- [ ] **Step 3: Implement** `duplicates.py`; call it from `CropMonitoringRecordSerializer.validate` after the existing parcel checks (create always; update only when one of the five trigger fields is in `self.initial_data`/`data`), using the farmer, crop, variety, parcel and barangay the request would leave (submitted value or stored one) and `exclude_id=self.instance.pk`; rewrite `CropDuplicateCheckView.get` to use it; in `CropMonitoringBulkCreateView.post`, after the per-row validation passes, loop the validated rows and for each row i compare with rows j < i using the same place rule and `normalize_name`, collecting `{'crop_type': 'This record duplicates row <j+1> of this form.'}` into the `errors` list (other rows get `{}`) and returning 400 when any exists.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** remove the status filter (so Harvested blocks) and confirm the "never block" test fails; restore, ledger it.
- [ ] **Step 5: Run the whole suite and `makemigrations --check`.** Expected: OK, no changes (no model change in this cycle).

---

### Task 3: Add-crop form warning and Crop Information messages

**Files:**
- Modify: `oma-frontend/src/pages/Monitoring/AddCropMonitoringPage.jsx`

**Interfaces:**
- Consumes (Task 2): `/production/monitoring/check-duplicate/` with `farmer`, `crop_type`, `variety`, `parcel`, `barangay`; the 400 `errors[i].crop_type` text from the bulk endpoint, which the page already renders per row as `Row N: crop type: <message>`.

- [ ] **Step 1:** change `useCropDuplicateCheck(farmerId, cropTypeId)` to `useCropDuplicateCheck(farmerId, rec)` sending `variety` (`rec.variety_used`), `parcel` (`rec.farm_parcel`) and `barangay` (`rec.farm_location_barangay`); the dependency list includes those fields; the row warning text now reads `An active <crop> (<variety>) record already exists: <date> (<area> ha)` and the amber line stays non-blocking (the server refuses on submit).
- [ ] **Step 2:** the page's per-row error text for the duplicate refusal must read as the server message (strip the `crop type: ` key prefix only for this key).
- [ ] **Step 3: Lint (scratch `lintcmp.sh` against HEAD) and `vite build`.** Expected: no new messages; build OK.
- [ ] **Step 4: Browser check on the throwaway stack (admin):** Add Crop Record for a farmer with an existing active record: the amber warning appears for the same crop and variety (spelled `RC222` vs stored `Rc 222`) and disappears for a different variety; submitting the duplicate shows the row error with the server message and nothing is saved; the same crop on another parcel saves. On Crop Option and Crop Variety pages add a duplicate spelling and confirm the server message is visible in the form (the forms already show server `name` errors; if a form hides it, show it).

---

### Task 4: Activity picker (next steps only)

**Files:**
- Create: `oma-frontend/src/utils/activityPicker.js`
- Modify: `oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx`
- Test: `check_picker.mjs` in the scratchpad (node script, same style as `check_guards.mjs`).

**Interfaces:**
- Produces: `groupActivityOptions({ allTypes, suggestions, editingType }) -> { suggested: string[], other: string[] }` where `allTypes` is the list of active activity type names, `suggestions` is the server list (`{ activity_name, day_after_planting, status }`), and `editingType` is the activity name of the log being edited or `''`. Rules: a name with at least one `due_now` or `overdue` step is `suggested`, ordered by the smallest `day_after_planting` among those steps (ties by name); a scheduled name whose steps are all `done` is omitted unless it equals `editingType`; every other name (scheduled with only `upcoming`/`done`+`upcoming` steps, and names with no steps at all) is in `other`, keeping `allTypes` order; `suggested` and `other` never overlap; with an empty `suggestions` list every type is `other`.
- Consumes (backend, existing): `/production/monitoring/<id>/suggestions/` → `{ suggestions: [...] }`.

- [ ] **Step 1: Write the failing check script** `check_picker.mjs`: no suggestions → all in `other` in order; one `due_now` step moves its name to `suggested`; several names ordered by smallest due day; Review Focus 3 (steps 20 done, 40 upcoming, 60 upcoming → name in `other`, not hidden; steps 20 done, 40 due_now → `suggested`); all steps `done` → omitted; the same name equal to `editingType` → kept (in `other`); `overdue` counts as suggested; a name present twice in `allTypes` appears once; unknown names in `suggestions` that are not in `allTypes` are ignored.
- [ ] **Step 2: Run** `node check_picker.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `groupActivityOptions` in `utils/activityPicker.js`.
- [ ] **Step 4: Run** the script. Expected: PASS (all assertions).
- [ ] **Step 5: Integrate** in the activity modal of `CropMonitoringPage.jsx`: fetch `/production/monitoring/${record.id}/suggestions/` (refetch after a log is saved or deleted, when the modal opens, and when the activity date changes is NOT needed: the server uses today), replace the `suggestedNowActivities`/`suggestedActivityOptions`/`otherActivityOptions` computation with `groupActivityOptions({ allTypes: activityTypeOptions, suggestions, editingType: editingLogId ? activityType-of-the-log-being-edited : '' })`, keep `[...suggested, ...other].filter(o => o !== 'Other')` as the combobox options and remove the browser-side ±7 day logic; the activity stages fetch is still needed for `selectedStageAllowsPrePlanting` and stays.
- [ ] **Step 6: Lint and build.** Expected: no new messages; build OK.
- [ ] **Step 7: Browser check (admin, throwaway stack):** open the activity modal of a seeded crop record: the first options are the due/overdue steps, an activity already logged for its window no longer appears, logging a due step and reopening the modal removes it from the top group, and editing that log still lists its activity. Then run the whole backend suite one last time.

---

## Self-review notes

- Spec coverage: decisions 1-2 (Task 1), 3 (Tasks 2-3), 4 (Task 4); the spec's bulk text was corrected before planning (the bulk endpoint validates all rows before saving any, so in-batch duplicates need their own check).
- Deviation recorded in Global Constraints: the picker shows ordering only; and the update trigger list includes `farm_location_barangay`.
- The citizen activity modal has no picker, fisheries is out of scope, `PlantingRecord` is untouched.
