# Form Rules (Cycle A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organization cannot be registered before it was organized; every formatted field refuses wrong characters and extra length while typing (with the same rule on the backend); a disaster can be a Total Loss only when the whole area is affected.

**Architecture:** Backend rules first, each test-first: a shared `date_registered >= date_organized` check on both organization serializers (so create, edit and import all enforce it), a Total Loss rule on the crop and pond disaster serializers, and tighter format validators. Frontend: small pure guard functions plus three shared inputs (`PhoneInput`, `EmailInput`, `DecimalInput`) and a PhilSys mask, applied form by form; the Total Loss checkbox logic is reversed in the three live disaster forms.

**Tech Stack:** Django REST Framework (`associations`, `production`, `fisheries`, `core`), React 19 + Vite + Tailwind (`oma-frontend`). No frontend test framework: pure guard functions are checked with a Node script; forms are checked by build, per-file lint compared with the committed file, and browser checks on a throwaway database.

**Spec:** `docs/superpowers/specs/2026-10-07-form-rules-cycle-a-design.md`

## Global Constraints

- Date registered may equal date organized; either date may be missing (the model allows null): compare only when both exist. Neither may be in the future (already enforced, keep).
- A PATCH is validated against the stored value of whichever date it does not send; a PATCH that does not touch either date is never blocked by an old bad pair.
- Guarded inputs refuse input while typing AND the backend refuses the same value. A guard never rejects something the backend accepts: RSBSA stays as it is today (segmented in the add forms; the backend accepts five shapes, so no narrower guard is added).
- Phone format is exactly `09` followed by 9 digits (`^09\d{9}$`). Email is capped at 254 characters with no spaces.
- Total Loss: `is_total_loss=True` requires `area_affected_ha` equal to the full area (crop: `monitoring_record.area_planted_ha`; pond: `stocking_record.area_hectares`), compared as decimals.
- Frontend files are edited with CRLF preserved (a Python patch script that detects `\r\n`); new files are written LF. Lint is compared per file against `git show HEAD:<file>`: no new messages.
- Writes are exercised only on a throwaway database with its own backend and frontend (see Harness); the live server on port 8000 is never written to and no password is changed.
- Commit only when the user says so; nothing is pushed unless asked.

## Review Focus

Inputs and conditions the spec implies but the tasks' tests alone do not exercise; each has its test in the owning task.

1. A PATCH that moves only `date_organized` later than the stored `date_registered` (and the reverse) is refused; a PATCH of an unrelated field on a record that already breaks the rule is allowed. (Task 1)
2. Same-day dates and a missing date are accepted. (Task 1)
3. A pasted phone number such as `+63 917 123 4567` or `0917-123-4567` becomes `09171234567` instead of being refused or mangled. (Tasks 4, 6)
4. Total Loss with the area typed as `1.0` against a stored `1.00` (decimals, not strings) is accepted; one hundredth of a hectare less is refused. (Task 2)
5. Opening an edit form on a record whose stored value breaks the new format (a phone with dashes, a free-text PhilSys) shows a normalized value, does not crash, and saving is refused only on the guarded field itself. (Tasks 6, 7)

## Harness (Tasks 1-3 run the backend; Tasks 5-9 also need the browser stack)

Same recipe as the organization work. Scratch files live in the session scratchpad, never in the repo.
1. Throwaway MariaDB: `D:\xampp\mysql\bin\mysql_install_db.exe --datadir=<scratch>\mdb`; start `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1`; create database `oma_aringay_db` (utf8mb4).
2. `<scratch>\mysqlplain.py` already exists (`from oma_aringay.settings import *`, port 3307, local `FileSystemStorage`, CORS for `http://localhost:5174`).
3. Backend tests: `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput` from `oma_aringay/`.
4. Browser stack: `manage.py migrate --settings=mysqlplain`, then `manage.py shell --settings=mysqlplain -c "exec(open(r'<scratch>\seed_org.py').read()); exec(open(r'<scratch>\seed_fix.py').read())"` (accounts: admin, evaluator, farmer, fisherfolk, two organizations; it writes `<scratch>\org_tokens.json` with short-lived access tokens), then `runserver 127.0.0.1:8001 --settings=mysqlplain --noreload` and, from `oma-frontend`, `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`. In the browser pane set `localStorage.accessToken` (and any `refreshToken`) on `http://localhost:5174`.
5. Cleanup at the end of each task that used it: clear browser `localStorage`, stop the three processes, delete `<scratch>\mdb`, the test media folder and the token file.

## File Structure

- Backend modified: `oma_aringay/associations/serializers.py`, `oma_aringay/production/serializers.py`, `oma_aringay/fisheries/serializers.py`, `oma_aringay/core/validators.py` (only if the audit in Task 3 finds a missing validator).
- Backend new tests: `oma_aringay/associations/test_org_dates.py`, `oma_aringay/production/test_total_loss_rule.py`, `oma_aringay/fisheries/test_total_loss_rule.py`, `oma_aringay/core/test_format_validators.py`.
- Frontend new: `utils/inputGuards.js` (pure functions), `components/UI/PhoneInput.jsx`, `components/UI/EmailInput.jsx`, `components/UI/DecimalInput.jsx`.
- Frontend modified (applied per task): `pages/Organizations/CreateOrganizationModal.jsx`, `EditOrganizationModal.jsx`; `pages/Farmers/AddFarmerModal.jsx`, `EditFarmerModal.jsx`, `AddFarmParcelModal.jsx`; `pages/Fisherfolk/AddFisherfolkModal.jsx`; `pages/Fisheries/EditFisherfolkModal.jsx`; `pages/Users/CreateUserModal.jsx`, `EditUserModal.jsx`; `pages/Profile/ProfilePage.jsx`; `pages/Citizen/CitizenProfileScreen.jsx`, `OrgAccountPages.jsx`; the area-field forms found by Task 8's grep; `pages/Monitoring/CropMonitoringPage.jsx`, `FisherfolkStockDisasterModal.jsx`; `pages/FisheriesRecords/StockingMonitoringModals.jsx`.

---

### Task 1: Organization dates (backend rule, tests first)

**Files:**
- Modify: `oma_aringay/associations/serializers.py` (`FarmersOrganizationDetailSerializer`, `FisherfolkOrganizationDetailSerializer`)
- Test: `oma_aringay/associations/test_org_dates.py` (new)

**Interfaces:**
- Produces: a module helper `_check_registered_not_before_organized(data, instance)` in `associations/serializers.py`; each of the two Detail serializers gains `validate(self, data)` that calls it and returns `data`. It raises `serializers.ValidationError({'date_registered': 'Date registered cannot be before the date organized.'})` when both effective dates exist and `registered < organized`. The effective value of a date is the submitted one if present in `data`, else `instance.<field>` when `instance` is not None, else None.
- Consumes: the import path (`_run_organization_import` in `associations/views.py`) builds its serializer from the same Detail serializer class; confirm this when reading it and, if it uses another class, give that class the same `validate`.

- [ ] **Step 1: Write the failing tests** in `associations/test_org_dates.py` (`APITestCase`; staff user created like `associations/test_own_org_scope.py`'s `make_staff`; organizations created with `make_org`-style fixtures; both domains via `/api/organizations/<farmers|fisherfolk>/`). Test names: `test_create_rejects_registered_before_organized` (POST, 400, error on `date_registered`); `test_create_accepts_registered_equal_to_organized`; `test_patch_moving_only_date_organized_after_stored_registered_is_refused`; `test_patch_moving_only_date_registered_before_stored_organized_is_refused`; `test_patch_of_an_unrelated_field_on_an_already_bad_record_is_allowed` (create the bad pair directly with the model, PATCH `contact_person`, expect 200); `test_missing_date_is_not_compared` (PATCH `date_registered` on a record whose `date_organized` is null is accepted); `test_import_row_with_registered_before_organized_is_invalid` (dry-run import of a one-row file through the import endpoint; read `_run_organization_import` and the template for the row layout, expect the row status `invalid` and the error mentioning `date_registered`).
- [ ] **Step 2: Run to confirm RED:** `... manage.py test associations.test_org_dates ...`. Expected: the "refused"/"invalid" tests FAIL (200/201 instead of 400, row status `ready`), the "allowed/accepted" tests PASS; read each failure and confirm it is the missing rule, not a fixture error.
- [ ] **Step 3: Implement** the helper and the two `validate` methods (keep the existing `validate_date_organized`/`validate_date_registered`).
- [ ] **Step 4: Run the new tests: all PASS. Then the full suite.** Expected: the existing 213 tests plus the new ones, all OK.
- [ ] **Step 5: Mutation check.** Temporarily make the helper compare `<=`; `test_create_accepts_registered_equal_to_organized` must fail; restore and re-run green.

---

### Task 2: Total Loss rule (backend, tests first)

**Files:**
- Modify: `oma_aringay/production/serializers.py` (`CropDisasterReportSerializer.validate`), `oma_aringay/fisheries/serializers.py` (`FisheriesDisasterReportSerializer.validate`)
- Test: `oma_aringay/production/test_total_loss_rule.py`, `oma_aringay/fisheries/test_total_loss_rule.py` (new)

**Interfaces:**
- Produces: in both `validate` methods, after the existing area checks: when `is_total_loss` is true (taken from `data`, else from `self.instance` for the fisheries edit path) and the full area is known, `Decimal(area_affected_ha) != Decimal(full_area)` raises `serializers.ValidationError({'is_total_loss': 'Total Loss is only allowed when the whole area is affected (<full_area> ha).'})`. Full area: `monitoring_record.area_planted_ha` / `stocking_record.area_hectares`. When the full area is unknown (no record resolved) the rule is skipped, as the existing maximum check is.
- The unaffected paths (no `is_total_loss`, or false) behave exactly as today.

- [ ] **Step 1: Write the failing tests.** Crop: create a farmer, a crop record (`area_planted_ha='2.00'`) like `production/test_farmer_scope.py`'s `make_farmer`/`make_crop`, a staff user, then POST `/api/production/monitoring/<id>/disasters/` with `{disaster_type, date_of_occurrence, area_affected_ha, is_total_loss, ...}` (read the serializer for the minimum required fields). Names: `test_total_loss_with_the_whole_area_is_accepted` (area `2.0`), `test_total_loss_with_less_than_the_whole_area_is_refused` (`1.99`, 400 on `is_total_loss`), `test_partial_loss_is_unchanged` (`1.00`, no total loss, 201), `test_total_loss_compares_decimals_not_strings` (`2` and `2.0000` both accepted). Pond: the same four against `/api/fisheries/stocking/<id>/disasters/` (read `fisheries/urls.py` for the route and the stocking record fixture in `monitoring/test_fisheries_notifications.py`), plus `test_editing_a_draft_to_total_loss_with_a_smaller_area_is_refused` if the fisheries serializer supports updating drafts.
- [ ] **Step 2: Run to confirm RED.** Expected: the two "refused" tests FAIL (201), the others PASS.
- [ ] **Step 3: Implement** the rule in both serializers.
- [ ] **Step 4: Run the new tests, then the full suite.** Expected: all OK.
- [ ] **Step 5: Mutation check.** Replace `!=` with `>` ; the "less than whole" test must fail; restore.

---

### Task 3: Backend format validators (audit, tests first)

**Files:**
- Modify: `oma_aringay/associations/serializers.py` (`_validate_contact`), and whichever of `farmers/serializers.py`, `fisheries/serializers.py`, `accounts/serializers.py`, `core/validators.py` the audit shows is looser than the frontend guard
- Test: `oma_aringay/core/test_format_validators.py` (new)

**Interfaces:**
- Produces: `_validate_contact(value)` accepts only `^09\d{9}$` on the submitted value (no stripping); a blank value stays accepted (the field is optional where it already was). Every other contact-number validator the audit finds (farmers, fisherfolk, users) enforces the same exact pattern. PhilSys, RSBSA, LGU, FishR, parcel and tax-declaration validators in `core/validators.py` stay unchanged.

- [ ] **Step 1: Audit.** Run `grep -rn "contact_number\|_validate_contact\|validate_contact\|RegexValidator" --include=*.py oma_aringay | grep -v "migrations\|test"` and list, in the ledger, every serializer or model that validates a phone number and what it accepts today. Expected: a table of validators with their current pattern.
- [ ] **Step 2: Write the failing tests** in `core/test_format_validators.py`: for each validator found, parametrised cases: accepted `09171234567`; refused `0917-123-4567`, `+639171234567`, `0817123456`, `0917123456` (10 digits), `091712345678` (12 digits), `0917 1234567`; blank accepted where the field is optional. Include one API-level test per domain that POSTs a bad phone and expects 400 keyed to the phone field.
- [ ] **Step 3: Run to confirm RED.** Expected: the formatted-but-loose values (`0917-123-4567`, `0917 1234567`) are accepted today by `_validate_contact` and FAIL the new tests; validators that were already exact PASS.
- [ ] **Step 4: Implement** the exact check wherever the audit showed a looser rule.
- [ ] **Step 5: Run the new tests, then the full suite.** Expected: all OK. If an existing test posts a dashed number, fix that test's fixture to the plain format (record this as a ledger ruling).

---

### Task 4: Guard functions and shared inputs

**Files:**
- Create: `oma-frontend/src/utils/inputGuards.js`, `oma-frontend/src/components/UI/PhoneInput.jsx`, `EmailInput.jsx`, `DecimalInput.jsx`
- Scratch test: `<scratch>\check_guards.mjs` (not in the repo)

**Interfaces:**
- Produces in `inputGuards.js` (pure, no React):
  - `guardPhone(raw: string): string`: keeps digits only; if the digits start with `63` and have 12 or more digits, converts to `0` + the rest (so `+63 917 123 4567` becomes `09171234567`); then forces the first digit to be `0` and the second to be `9` by dropping any leading digit that breaks that (an input of `9171234567` becomes `09171234567`; `1…` becomes empty until a valid first digit is typed); caps at 11.
  - `guardEmail(raw: string): string`: removes whitespace, caps at 254.
  - `guardDecimal(raw: string, { decimals = 2, max = null, allowNegative = false } = {}): string`: keeps digits and a single `.` (a `,` is read as `.`), drops a leading `-` unless `allowNegative`, trims the fraction to `decimals`, and if the numeric value would exceed `max` it returns `max` as text (the value is clamped; a pure function does not know the previous text).
  - `guardPhilsys(raw: string): string`: digits only, capped at 16, formatted as `NNNN-NNNN-NNNN-NNNN` with hyphens inserted as the digits are typed.
  - `isPhoneComplete(v)`, `isPhilsysComplete(v)`: format checks matching `^09\d{9}$` and `^\d{4}-\d{4}-\d{4}-\d{4}$`.
- `PhoneInput({ value, onChange, ...inputProps })`: a controlled `<input type="tel" inputMode="numeric" maxLength={11} placeholder="09XXXXXXXXX">` whose `onChange` receives the guarded string (not the event); forwards `className`, `id`, `disabled`, `required`, `aria-label`.
- `EmailInput({ value, onChange, ...inputProps })`: `<input type="email" maxLength={254}>`; `onChange` receives the guarded string; lower-cases on blur.
- `DecimalInput({ value, onChange, decimals, max, ...inputProps })`: `<input type="text" inputMode="decimal">`; `onChange` receives the guarded string; shows the maximum as helper text only when the caller passes `helper`.

- [ ] **Step 1: Write the failing check** `<scratch>\check_guards.mjs`: `import` the functions from the repo file by absolute path and `assert` each case: phone (`'0917-123-4567'`→`'09171234567'`, `'+63 917 123 4567'`→`'09171234567'`, `'9171234567'`→`'09171234567'`, `'abc'`→`''`, a 15-digit string→11 digits, `'08'`→`'0'`), email (`' a b@c.com '`→`'ab@c.com'`, 300 chars→254), decimal (`'12.3456'` with `decimals:2`→`'12.34'`, `'1,5'`→`'1.5'`, `'-3'`→`'3'`, `'7.5'` with `max:5`→`'5'`, `'..'`→`'.'` handled as a single dot, `''`→`''`), philsys (`'8419503277413096'`→`'8419-5032-7741-3096'`, `'84195'`→`'8419-5'`, letters dropped).
- [ ] **Step 2: Run it to confirm RED:** `node <scratch>\check_guards.mjs`. Expected: fails with "Cannot find module" or an assertion failure (the file does not exist yet).
- [ ] **Step 3: Implement** `inputGuards.js` and the three components until the check passes.
- [ ] **Step 4: Run the check: all assertions pass.** Run `npx eslint` on the four new files (clean) and `npx vite build` (OK).

---

### Task 5: Organization forms (item 1 UI plus guarded inputs)

**Files:**
- Modify: `pages/Organizations/CreateOrganizationModal.jsx`, `pages/Organizations/EditOrganizationModal.jsx`

**Interfaces:**
- Consumes: Task 1 (backend rule), Task 4 (`PhoneInput`, `EmailInput`).
- Produces in both forms: the Date Registered `<input type="date">` gets `min={form.date_organized || undefined}`; `set('date_organized', v)` clears `date_registered` when the new organized date is after it; the submit-time validation adds `errs.date_registered = 'Date registered cannot be before the date organized.'` when both are set and registered is earlier (the `errs` object already exists); contact number uses `PhoneInput`, email uses `EmailInput`.

- [ ] **Step 1: Implement** the changes in both files (CRLF-preserving patch script).
- [ ] **Step 2: Verify in the browser on the throwaway stack** as admin: Create Organization: the registered-date picker offers no day before the organized date; typing an earlier date shows the error and blocks Save; setting a later organized date clears a now-too-early registered date; phone refuses letters, shows at most 11 digits and fixes a pasted `0917-123-4567`; email refuses spaces; the same in Edit. A valid organization still saves. A server-side refusal (use a browser request with an earlier date) shows the backend message on the date field.
- [ ] **Step 3: Build and lint** the two files against HEAD.

---

### Task 6: Farmer and fisherfolk forms (phone, email, PhilSys)

**Files:**
- Modify: `pages/Farmers/AddFarmerModal.jsx`, `EditFarmerModal.jsx`; `pages/Fisherfolk/AddFisherfolkModal.jsx`; `pages/Fisheries/EditFisherfolkModal.jsx`

**Interfaces:**
- Consumes: Task 4. Produces: contact number via `PhoneInput`; email via `EmailInput`; PhilSys number via a plain text input whose `onChange` applies `guardPhilsys` (so it is always `NNNN-NNNN-NNNN-NNNN` or a prefix of it), with a `placeholder="NNNN-NNNN-NNNN-NNNN"`, `maxLength={19}`, and an inline hint while incomplete (the backend refuses an incomplete value). In the edit forms the initial value is passed through the same guard so a stored value with stray characters opens normalized.

- [ ] **Step 1: Implement** in the four forms (CRLF-preserving patch script; the RSBSA, LGU and FishR `SegmentedIdInput` usage stays unchanged).
- [ ] **Step 2: Verify in the browser** as admin: Add Farmer, Edit Farmer, Add Fisherfolk and Edit Fisherfolk: phone and email behave as in Task 5; PhilSys auto-inserts hyphens, refuses letters and a 17th digit, and an incomplete value shows the hint; opening an existing record with a free-text PhilSys or dashed phone (set one directly in the throwaway database) shows it normalized and does not crash; saving a valid record works.
- [ ] **Step 3: Build and lint** the four files against HEAD.

---

### Task 7: Users and profile forms (phone, email)

**Files:**
- Modify: `pages/Users/CreateUserModal.jsx`, `EditUserModal.jsx`; `pages/Profile/ProfilePage.jsx`; `pages/Citizen/CitizenProfileScreen.jsx`, `pages/Citizen/OrgAccountPages.jsx`

**Interfaces:**
- Consumes: Task 4. Produces: every phone input in these files uses `PhoneInput` (the two citizen profile files replace their local `sanitizePhoneDigits` usage with it so there is one implementation) and every email input uses `EmailInput`; existing validation messages stay.

- [ ] **Step 1: Implement** (CRLF-preserving patch script; `OrgAccountPages.jsx` is LF).
- [ ] **Step 2: Verify in the browser** as admin (Create/Edit User, My Profile), as a farmer and as an organization (profile contact number): same guarded behaviour; a valid change still saves (on the throwaway database).
- [ ] **Step 3: Build and lint** the files against HEAD.

---

### Task 8: Area and quantity fields

**Files:**
- Modify: the forms found by this task's grep, expected to include `pages/Farmers/AddFarmParcelModal.jsx` (parcel area), the crop add/edit forms (area planted), `pages/Monitoring/CropMonitoringPage.jsx` (area affected in the disaster and pest forms), `pages/Monitoring/FisherfolkStockDisasterModal.jsx`, `pages/FisheriesRecords/StockingMonitoringModals.jsx` (area affected), and pond/stocking area forms

**Interfaces:**
- Consumes: Task 4's `DecimalInput`. Produces: every hectare field uses `DecimalInput` with `decimals={4}` (matching the model `DecimalField`; read each model for the real `decimal_places`) and `max` set to the known parent area where one exists (area affected: the planted or stocked area; area planted: the parcel area when the form knows it); quantity fields use `decimals={2}`; no field accepts a negative value.

- [ ] **Step 1: Audit.** Run `grep -rn "type=\"number\"" --include=*.jsx oma-frontend/src/pages | grep -i "area\|hectare\|ha\b\|quantity"` and write the resulting list (file, field, model decimal places, maximum available in that form) in the ledger.
- [ ] **Step 2: Implement** the list, one form at a time (CRLF-preserving patch script).
- [ ] **Step 3: Verify in the browser** a representative form of each family (parcel, crop, crop disaster, pond disaster): extra decimals and letters are refused while typing, a value above the maximum is clamped to it, the existing validation messages and saves still work.
- [ ] **Step 4: Build and lint** the files against HEAD.

---

### Task 9: Total Loss in the disaster forms

**Files:**
- Modify: `pages/Monitoring/CropMonitoringPage.jsx` (`DisasterReportModal`, around the `isTotalLoss` state), `pages/Monitoring/FisherfolkStockDisasterModal.jsx`, `pages/FisheriesRecords/StockingMonitoringModals.jsx` (its disaster report modal, around its `isTotalLoss` state)

**Interfaces:**
- Consumes: Task 2 (backend rule), Task 8 (`DecimalInput` area field). Produces in each of the three forms: `const isWholeArea = maxArea !== null && Math.abs(parseFloat(area) - maxArea) < 0.00005`; the Total Loss checkbox is `disabled={!isWholeArea}` with a visible line "Available only when the whole area is affected." beside it; when the area changes so that `isWholeArea` becomes false, `isTotalLoss` is reset to false; ticking it no longer rewrites the area field (the area stays editable text equal to the maximum); the payload sends `is_total_loss: isTotalLoss && isWholeArea` and the typed area.

- [ ] **Step 1: Implement** in the three forms (CRLF-preserving patch script).
- [ ] **Step 2: Verify in the browser** as admin (crop and pond), as a farmer (crop) and as a fisherfolk (pond): the checkbox is disabled with the reason for an empty or partial area; typing the exact full area enables it; ticking it saves a total loss and the record shows "Total loss"; typing a smaller area afterwards unticks and disables it; a partial disaster saves exactly as before.
- [ ] **Step 3: Build and lint** the three files against HEAD.

---

### Task 10: Final sweep

- [ ] **Step 1: Remaining raw inputs.** Run `grep -rn "type=\"tel\"\|type=\"email\"" --include=*.jsx oma-frontend/src/pages` and confirm every remaining match is either inside the shared components or a field that is not part of this cycle (list any in the ledger with the reason).
- [ ] **Step 2: Full backend suite and frontend build.** Run the whole backend suite and `npx vite build`. Expected: all green.
- [ ] **Step 3: Final regression in the browser** (throwaway stack): open each touched form once as staff, and a farmer, a fisherfolk and an organization through their own screens, at desktop and 375 px; save one valid record per form family.
- [ ] **Step 4: Cleanup.** Clear browser storage, reset the viewport, stop the throwaway servers and database, delete scratch data and token files.
