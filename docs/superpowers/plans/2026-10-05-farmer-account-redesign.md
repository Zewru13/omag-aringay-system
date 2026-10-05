# Farmer Account Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A farmer account uses the system's own crop pages (limited to their own records) on desktop and a farmer phone shell with Home on phone, replacing the Tagalog farmer portal.

**Architecture:** Mirror the fisherfolk implementation. Backend: an "own records" rule for farmers (`IsStaffOrFarmer`, `farmer_scope`, `scope_to_farmer`) applied to the few crop endpoints still staff-only. Frontend: `isFarmer` + `allowFarmer` route guard, a farmer sidebar, farmer mode on the existing pages, and the fisherfolk phone shell generalized to a role-themed `CitizenPhoneShell`.

**Tech Stack:** Django REST Framework (backend), React 19 + Vite + Tailwind (frontend), Supabase Postgres in production; tests on a throwaway MariaDB.

**Spec:** `docs/superpowers/specs/2026-10-05-farmer-account-redesign-design.md`

## Global Constraints

- Language of all new farmer screens: English.
- A farmer keeps exactly today's abilities: view own crops, log and edit activity, record a harvest, report and resolve a disaster, see yield results and crop history, see assistance and confirm or report not received, request profile changes. A farmer must NOT be able to create, import, edit or delete crop records, nor reach any staff-only route.
- A farmer with no crop records can log nothing; actions needing a crop show an explanation, not a form.
- Staff (ADMIN/EVALUATOR), fisherfolk and organization accounts behave exactly as before.
- Farmer ids and fisherfolk ids are different tables: every ownership check also compares the linked record TYPE (`user.get_linked_farmer_id()` returns None for a non-FARMER link).
- Phone layout applies under 768 px (`useIsPhone`); tablets and desktops use the admin layout.
- Shared components gain optional settings whose defaults reproduce today's behaviour exactly.
- Do NOT commit unless the user says so. Each task ends verified and uncommitted; the "Hand off" step shows the diff. When the user asks to commit, one commit per task or phase is fine.
- Repo files use CRLF line endings: edit with a script that preserves them (read bytes, replace `\r\n`, write back).
- Never run tests against Supabase and never start XAMPP's own MySQL (see Test environment).

## Test environment (backend tests)

Throwaway MariaDB from the scratchpad: `mysql_install_db.exe --datadir=<scratch>/mdb --password=`, then
`mysqld.exe --no-defaults --datadir=<scratch>/mdb --port=3307 --bind-address=127.0.0.1 --skip-grant-tables --standalone`.
Settings module `<scratch>/mysqlplain.py`: `from oma_aringay.settings import *`, `DATABASES['default']['PORT']='3307'`,
`STORAGES` = local `FileSystemStorage`. Run from `oma_aringay/`:
`DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test --settings=mysqlplain --noinput`.
Baseline before starting: 164 tests, all green. Stop the server (by PID) and delete `mdb` when finished.

## Frontend verification (there is no frontend test framework)

Every frontend task is verified by: `npx vite build` passes; `npx eslint` on the touched files shows nothing new compared with the committed version; and the browser checks written in the task, done with a temporary login token (`RefreshToken.for_user(user)`, injected into `localStorage` keys `accessToken` / `refreshToken` on `http://localhost:5173`, opened on a protected URL such as `/my-account`, never `/`), then revoked (`RefreshToken(r).blacklist()`). Ready farmer test account: user 4449 (`farmer-3650`, has crops). No ready zero-crop farmer exists: zero-crop behaviour is tested at the API level and in the browser by stubbing `XMLHttpRequest` responses for `/production/monitoring/`.

## Review Focus

1. A farmer id numerically equal to a fisherfolk id (or an organization id) must not match: tested in Task 1 and Task 5.
2. Query-string override attempts (`?farmer=<other>`, `?fisherfolk=`, `?search=<other farmer's name>`) on the crop disaster logs and crop history return only the caller's own rows: Task 3 and Task 4.
3. Another farmer's record id on every newly opened route (crop detail, disaster log document, PDF) is a 404, not 200 and not a data-revealing 403: Tasks 2 and 3.
4. A farmer with zero crop records opening each page sees an explanation, no form, no console error: Tasks 7 to 10 and 12.
5. A farmer sending PATCH, DELETE or POST to the newly opened read-only routes (crop detail, crop types, stages) is refused while staff still can: Task 2.

---

## Phase 1: Backend scoping

### Task 1: Farmer scope helpers and permission class

**Files:**
- Modify: `oma_aringay/accounts/permissions.py` (add after the fisherfolk block, ~line 207)
- Create: `oma_aringay/production/test_farmer_scope.py`

**Interfaces:**
- Produces: `is_farmer_citizen(user) -> bool`; `farmer_scope(user) -> int | None` (None for ADMIN/EVALUATOR, the linked Farmer id for a farmer citizen, None otherwise); `scope_to_farmer(queryset, user, lookup='farmer_id')`; `class IsStaffOrFarmer(BasePermission)` honouring a view attribute `farmer_blocked_methods` (tuple of HTTP methods refused for a farmer); `class IsStaffOrFarmerReadOnly(IsStaffOrFarmer)` (farmers may use SAFE_METHODS only). Task 2 to 5 use these names.

- [ ] **Step 1: Write the failing tests** in `production/test_farmer_scope.py`, class `FarmerScopeHelpersTests(APITestCase)`: `test_farmer_citizen_scope_is_own_farmer_id`; `test_staff_scope_is_none`; `test_organization_and_unlinked_and_fisherfolk_citizens_are_not_farmer_citizens`; `test_farmer_id_equal_to_a_fisherfolk_id_does_not_match` (create a Fisherfolk and a Farmer so their pks are equal, link a citizen to the FISHERFOLK: `is_farmer_citizen` is False and `farmer_scope` is None); `test_scope_to_farmer_filters_for_farmer_and_not_for_staff`. Fixtures: users created with `email=`; farmers need `rsbsa_number` (format `01-033-02-019-NNNNNN`), citizens linked with `UserLinkedRecord(record_type='FARMER', is_active=True)`.
- [ ] **Step 2: Run** `manage.py test production.test_farmer_scope` — expect ImportError/failures (helpers undefined).
- [ ] **Step 3: Implement** the four names above in `accounts/permissions.py`, reusing `STAFF_ROLES`, `BasePermission`, `SAFE_METHODS`; model the code on `is_fisherfolk_citizen`, `fisherfolk_scope`, `scope_to_fisherfolk`, `IsStaffOrFisherfolk`, `IsStaffOrFisherfolkReadOnly` in the same file.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Hand off** — `git diff --stat`; do not commit unless told.

### Task 2: Crop detail, crop types and stages readable by a farmer

**Files:**
- Modify: `oma_aringay/production/views.py` — `CropMonitoringDetailView` (GET open to farmer, scoped to own; PATCH/DELETE stay `IsAdminOrEvaluator`), `CropTypeListView` (GET only for farmer), `CropActivityStageListCreateView` (GET only for farmer)
- Test: `oma_aringay/production/test_farmer_scope.py`

**Interfaces:**
- Consumes: Task 1's `IsStaffOrFarmer`, `IsStaffOrFarmerReadOnly`, `scope_to_farmer`.
- Produces: farmer GET on `production/monitoring/<id>/` returns only an own record (other id: 404); `production/crop-types/` and `production/crop-types/<id>/stages/` return data to a farmer for GET only.

- [ ] **Step 1: Write failing tests**, class `FarmerReadRoutesTests`: `test_farmer_reads_own_crop_record_detail`; `test_farmer_gets_404_for_another_farmers_crop_record` (200 for the owner, 404 for the other farmer); `test_farmer_cannot_patch_or_delete_a_crop_record` (own record too: 403); `test_staff_can_still_patch_a_crop_record`; `test_farmer_lists_crop_types_and_stages_but_cannot_create_them` (GET 200; POST 403); `test_fisherfolk_and_organization_citizens_are_rejected_on_all_three`.
- [ ] **Step 2: Run** them — expect FAIL (403 for the farmer GETs).
- [ ] **Step 3: Implement** with `get_permissions()` returning `[IsAuthenticated(), IsStaffOrFarmer()]` for GET/HEAD/OPTIONS and `[IsAuthenticated(), IsAdminOrEvaluator()]` otherwise; scope `CropMonitoringDetailView.get_queryset` with `scope_to_farmer(qs, request.user, 'farmer_id')`. Follow the existing `get_permissions` pattern of `CropMonitoringListCreateView` (~line 752).
- [ ] **Step 4: Run** — expect PASS; then run the full suite — expect green (164 + new).
- [ ] **Step 5: Hand off.**

### Task 3: Crop disaster logs scoped to the farmer

**Files:**
- Modify: `oma_aringay/production/views.py` — `CropDisasterLogListView`, `CropDisasterLogDocumentView`, `CropDisasterLogPdfView` (use `IsStaffOrFarmer`; scope `crop_disaster_logs.crop_queryset()` with `scope_to_farmer(..., 'monitoring_record__farmer_id')` in all three)
- Test: `oma_aringay/production/test_farmer_scope.py`

**Interfaces:**
- Consumes: Task 1 helpers. Produces: the list, document and PDF endpoints return only the farmer's own logs.

- [ ] **Step 1: Write failing tests**, class `FarmerDisasterLogTests`: `test_farmer_list_contains_only_own_logs`; `test_farmer_cannot_widen_the_list_with_query_params` (`?search=<other farmer's surname>`, `?barangay=`, `?farmer=<other id>` still return only own rows); `test_farmer_document_and_pdf_of_another_farmers_log_are_404`; `test_farmer_pdf_of_own_log_is_a_pdf` (`%PDF-`); `test_staff_list_still_sees_every_log`. Create `CropDisasterReport` rows via the model (monitoring records owned by two farmers).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** as described; keep the paging and filter code untouched.
- [ ] **Step 4: Run** — expect PASS and the full suite green.
- [ ] **Step 5: Hand off.**

### Task 4: Farmer's own crop history report

**Files:**
- Modify: `oma_aringay/reports/views.py` — `FarmerCropHistoryReport` (permission `IsStaffOrFarmer`; for a farmer force `farmer_id = farmer_scope(user)` ignoring any `farmer` query parameter)
- Test: `oma_aringay/production/test_farmer_scope.py`

**Interfaces:** Consumes Task 1. Produces: `reports/farmer-crop-history/?format=json` for a farmer returns only own records.

- [ ] **Step 1: Failing tests**, class `FarmerCropHistoryTests`: `test_farmer_history_is_always_their_own` (with and without `?farmer=<other id>`); `test_staff_history_unchanged` (staff with `?farmer=` still filters); `test_farmer_cannot_use_other_report_routes` (`reports/farmers/masterlist/` returns 403).
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, suite green. **Step 5: Hand off.**

### Task 5: Farmer route sweep and cross-farmer isolation test

**Files:** Test: `oma_aringay/production/test_farmer_scope.py`

**Interfaces:** Consumes Tasks 1 to 4. Produces: a regression net for the whole rule.

- [ ] **Step 1: Write** `FarmerRouteSweepTests`: `test_farmer_is_refused_on_every_staff_only_route` — a fixed list of GET routes that must give 403 (`production/yield-analysis/summary/`, `production/monitoring/bulk/`, `production/monitoring/check-duplicate/`, `production/varieties/`, `production/seed-sources/`, `production/monitoring/<own id>/remarks/`, `.../labor/`, `.../inputs/`, `.../pest-disease/`, `farmers/`, `farmers/<id>/`, `fisheries/fisherfolk/`, `reports/farmers/masterlist/`, `reports/production/`, `accounts/users/`, `auditlog/`) and `test_two_farmers_cannot_see_each_others_records` (each farmer's monitoring list, logs, suggestions, disasters, disaster logs, yield analysis contain only their own ids; the other's ids are 403/404). Use two farmers with one crop record each plus a log and a disaster each.
- [ ] **Step 2: Run** — expect PASS (it proves Tasks 1 to 4 and today's existing scoping); any failure is a real leak: fix the view, not the test.
- [ ] **Step 3: Run the full suite.** Expected: all green.
- [ ] **Step 4: Hand off** Phase 1 (`git diff --stat`). Phase 1 is complete and usable on its own.

---

## Phase 2: Desktop farmer mode

### Task 6: Auth flag, route guard, farmer sidebar, landing and account pages

**Files:**
- Modify: `oma-frontend/src/context/AuthContext.jsx` (add `isFarmer`); `src/components/ProtectedRoute.jsx` (prop `allowFarmer`); `src/App.jsx` (routes, `HomeRedirect`); `src/components/Layout/Sidebar.jsx` (`FARMER_NAV`); `src/components/Layout/Navbar.jsx` (profile and help paths, role label); `src/pages/Citizen/CitizenHomePage.jsx` (farmer on desktop forwards to `/crop-monitoring`)
- Create: `src/pages/Citizen/FarmerAccountPages.jsx` (exports `FarmerProfilePage`, `FarmerHelpPage`, English `FARMER_HELP_EN` with the same shape as `FISHERFOLK_HELP_EN`); `src/pages/Citizen/OwnAccountPages.jsx` (exports `OwnProfilePage`, `OwnHelpPage`, choosing the farmer or fisherfolk page from `useAuth()`)

**Interfaces:**
- Produces: `useAuth().isFarmer = role==='CITIZEN' && linked_record_type==='FARMER'`; `<ProtectedRoute allowFarmer>` admits a farmer; `FARMER_NAV` = Crop Monitoring `/crop-monitoring`, Forecasting `/forecasting`, Disaster `/disaster`, Assistance `/crop-assistance`, My Profile `/my-profile`; `/my-profile` and `/my-help` routes admit fisherfolk and farmers and render `OwnProfilePage` / `OwnHelpPage`.

- [ ] **Step 1: Implement** the flag, the guard (same shape as `allowFisherfolk`), `FARMER_NAV` and its rendering in the sidebar (same branch style as `isFisherfolk`), the landing logic and the account pages. Routes `/crop-monitoring`, `/forecasting`, `/crop-assistance`, `/disaster`, `/my-profile`, `/my-help` get `allowFarmer`; `/crop-records`, `/farmers`, registry and admin routes do NOT.
- [ ] **Step 2: Verify build and lint.**
- [ ] **Step 3: Browser check as farmer 4449 on a desktop-size window:** `/my-account` lands on `/crop-monitoring`; the sidebar shows exactly the five links; `/farmers`, `/crop-records`, `/users` show "Access Denied"; My Profile shows the RSBSA number; Help shows English text. As staff and as fisherfolk: sidebars unchanged.
- [ ] **Step 4: Hand off.**

### Task 7: Crop Monitoring in farmer mode

**Files:** Modify `oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx` (and the Add/Import entry points it renders)

**Interfaces:** Consumes `useAuth().isFarmer`. Produces: for a farmer, a page titled "Crop Monitoring" showing only own crops, with no Add, Import, bulk, Edit or Delete controls; the detail modal keeps activity log (log, edit), suggestions, harvest and disasters; calls to `locks/*` are skipped for a farmer.

- [ ] **Step 1: Implement** the `isFarmer` branches (hide controls; keep everything the farmer may do per the spec).
- [ ] **Step 2: Verify build and lint.**
- [ ] **Step 3: Browser check as farmer 4449 (desktop):** the table lists only own crops; no Add/Import/Edit/Delete anywhere; opening a crop shows details and the activity log; logging an activity is allowed by the page (do NOT submit on live data; confirm the form opens). No failed network requests (`read_network_requests`). Zero-crop check with a stubbed empty `/production/monitoring/` response: empty-state message, no form. Staff view unchanged (Add and Import present).
- [ ] **Step 4: Hand off.**

### Task 8: Forecasting in farmer mode

**Files:** Modify `oma-frontend/src/pages/Forecasting/ForecastingPage.jsx`

**Interfaces:** Consumes `isFarmer`. Produces: yield analysis and crop history of the farmer's own crops only (the farmer picker and aggregate summary are hidden; `farmers/`, `production/crop-types/` fetches are guarded or use the now-open GET routes).

- [ ] **Step 1: Implement**; resolve the spec's open item (By Farmer / By Crop tabs): keep only what works from the farmer's own data.
- [ ] **Step 2: Verify build and lint.** **Step 3: Browser check as farmer 4449:** the page loads, no failed requests, no other farmer's name anywhere; staff view unchanged. **Step 4: Hand off.**

### Task 9: Crop Disaster in farmer mode

**Files:** Create `oma-frontend/src/pages/Monitoring/FarmerDisasterPage.jsx`; modify `src/pages/Monitoring/DisasterPage.jsx` (dispatch: fisherfolk, farmer, staff)

**Interfaces:** Produces: for a farmer, "Crop Disaster" with own logs (view, print, download, resolve) from `production/disaster-logs/`, and Log Disaster limited to the farmer's own active crops, disabled with an explanation when they have none.

- [ ] **Step 1: Implement**, reusing the table, details modal and crop disaster form that `AdminDisasterPage`'s farmer tab uses (`DisasterLogDetailsModal`, `CropDisasterReportModal`, `usePagedLogs`-style fetching); model the page on `FisherfolkDisasterPage.jsx`.
- [ ] **Step 2: Verify build and lint.** **Step 3: Browser check as farmer 4449:** own logs only; open details and the PDF of an own log; Log Disaster lists only own crops (cancel before submitting); stubbed zero-crop response disables the button with the message. Staff and fisherfolk Disaster pages unchanged. **Step 4: Hand off.**

### Task 10: Crop Assistance in farmer mode

**Files:** Modify `oma-frontend/src/pages/AssistanceManagement/CropAssistancePage.jsx`

**Interfaces:** Produces: for a farmer, "Assistance Received" from `interventions/my-beneficiary-history/` with Confirm Received and Report Not Received on rows awaiting confirmation; Import, Distribute, edit and resolve stay staff tools. Pattern: the `isFisherfolk` branch of `FisheriesAssistancePage.jsx`.

- [ ] **Step 1: Implement.** **Step 2: Build and lint.** **Step 3: Browser check as farmer 4449:** own assistance rows only; the confirm actions appear only on awaiting rows (do not click them on live data); staff page unchanged. **Step 4: Hand off** Phase 2; a farmer can now do everything in the spec on desktop.

---

## Phase 3: Phone

### Task 11: Shared role-themed phone shell

**Files:** Rename `src/pages/Citizen/FisherfolkPhoneShell.jsx` to `CitizenPhoneShell.jsx` (use `git mv`); modify `src/components/Layout/PageLayout.jsx` (phone branch for fisherfolk OR farmer) and `src/pages/Citizen/FisherfolkPhoneHome.jsx` import if needed

**Interfaces:** Consumes `isFarmer`, `isFisherfolk`, `FarmerHeader`/`FarmerTabBar` (`theme="crop" | "fish"`). Produces `CitizenPhoneShell({ title, subtitle, action, children })`; a per-role config chooses the theme and tabs: fisherfolk exactly as today; farmer = Home `/my-account`, Monitoring `/crop-monitoring`, Disaster `/disaster`, Forecasting `/forecasting`, Assistance `/crop-assistance`; avatar menu My Profile `/my-profile`, Help `/my-help`, Log out.

- [ ] **Step 1: Implement** the role config and rename; no behaviour change for fisherfolk.
- [ ] **Step 2: Build and lint.** **Step 3: Browser check at 375 px:** fisherfolk 4563 phone view identical to before (blue, same tabs, Home works); farmer 4449 shows the green shell with the five tabs; each tab lights correctly with no sideways scroll; desktop views unchanged. **Step 4: Hand off.**

### Task 12: Farmer phone Home

**Files:** Create `src/pages/Citizen/FarmerPhoneHome.jsx`; modify `src/pages/Citizen/CitizenHomePage.jsx` (farmer: phone Home, desktop forward)

**Interfaces:** Produces `FarmerPhoneHome()` (wrapped in `PageLayout`): four tiles (parcels from `farmers/me/parcels/`, active crops, total area ha, harvests this month), a needs-attention card from `production/monitoring/<id>/suggestions/` entries with status `overdue` or `due_now`, one card per active crop with "Open crop" (navigates to `/crop-monitoring`; no per-crop deep link) and "Report disaster" (`/disaster`); zero crops shows an explanatory empty state with no actions. Reuse the figure logic of the current `FarmerHomeScreen`.

- [ ] **Step 1: Implement.** **Step 2: Build and lint.** **Step 3: Browser check at 375 px as farmer 4449:** tiles match the old farmer home's numbers for the same account; attention card and crop cards present; buttons navigate correctly; stubbed zero-crop response shows the empty state. **Step 4: Hand off** Phase 3.

---

## Phase 4: Retire the old portal

### Task 13: Remove the Tagalog farmer portal and run the final regression

**Files:** Delete only files with no remaining importers, decided by `grep -rn "<Name>" oma-frontend/src` before each deletion. Expected candidates: `FarmerHomeScreen.jsx`, `FarmerHomeView.jsx`, `FarmerAniScreen.jsx`, `FarmerAssistanceList.jsx`, `FarmerCropPicker.jsx`, `FarmerCropHistoryView.jsx`, `FarmerDisasterList.jsx`, `FarmerDisasterReportForm.jsx`, `MyYieldAnalysisSection.jsx`, `CitizenFarmerActivityScreen.jsx`, the desktop-only parts of `FarmerChrome.jsx` (keep `FarmerHeader` and `FarmerTabBar`, which the phone shell uses), and the farmer-only parts of `labels.js`. Keep every file the organization portals, the fisherfolk pages or `CitizenProfileScreen` still import.

- [ ] **Step 1: Delete** unreferenced files one at a time, rebuilding after each batch.
- [ ] **Step 2: Final checks:** `npx vite build`; eslint compared with the committed baseline; the full backend suite green; the route sweep (Task 5) passes.
- [ ] **Step 3: Browser regression** (desktop and 375 px): farmer, fisherfolk, staff, organization accounts all land correctly and nothing references the removed screens (no console errors, no 404 imports).
- [ ] **Step 4: Update notes:** the memory note and the spec status line ("implemented").
- [ ] **Step 5: Hand off** the full diff for review; revoke all temporary tokens, stop the throwaway database, clear the browser.
