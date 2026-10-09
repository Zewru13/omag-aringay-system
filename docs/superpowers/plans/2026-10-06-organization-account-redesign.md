# Organization Account Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Farmers' and fisherfolk organization accounts use the system's own pages (sidebar, header, shared tables and forms, phone shell), limited to their own organization, in English, with equipment management added; the old organization portal is retired.

**Architecture:** Mirror the farmer/fisherfolk redesigns. A backend "own organization" rule (the existing `IsOwnOrgOrStaff` plus a type check) opens three more routes to the organization itself. On the frontend, `AuthContext` gains `isOrg`/`orgType`; the existing `OrganizationDetailPage` and the two assistance pages gain an `isOrg` mode behind that flag; the shared `CitizenPhoneShell` gets an organization role; a new phone Home and an English profile/help page replace the old portal.

**Tech Stack:** Django REST Framework + JWT (backend, `oma_aringay/associations`), React 19 + Vite + Tailwind (frontend, `oma-frontend`). No frontend test framework: frontend tasks are verified by build, lint compared with the committed file, and browser checks on a throwaway database.

**Spec:** `docs/superpowers/specs/2026-10-06-organization-account-redesign-design.md`

## Global Constraints

- Language is English on every new or changed organization screen (the old portal's Filipino wording is removed with it).
- Organizations keep today's abilities and gain equipment add/remove. No crop/pond records, no disaster reporting, no member profile editing, no editing the organization's registration details.
- Staff-only stays staff-only: organization create/edit/import, member set-main, officer end-term, all registry routes. The organization never sees "Back to Organizations", "Activate Account", "Set Main" or "End Term Early".
- Every permission check compares the linked record TYPE as well as the id (`org_linked_record_type`), so a `FISHERFOLK_ORG` id can never match a farmers' organization.
- Every frontend change is behind `isOrg`; staff, farmer and fisherfolk views must not change.
- Frontend files edited with CRLF preserved (a Python patch script that detects `\r\n`); new files written LF. Lint is compared per file against `git show HEAD:<file>`: no new messages.
- Writes (add member, add equipment, report assistance) are exercised only on a throwaway database with its own backend and frontend (see Harness). The live server on port 8000 is read-only, and no password is changed.
- Commit only when the user says so. Nothing is pushed unless asked.

## Review Focus

Input classes and failure modes the spec implies; each has its test in the owning task.

1. An organization guesses another organization's id (detail, equipment add, equipment delete): refused. (Task 1)
2. A `FISHERFOLK_ORG` account whose id equals a farmers' organization's id (and the reverse): refused on every route. (Task 1)
3. An organization PATCHes its own record, or reads another organization's staff-only `citizen_account` block: refused / omitted. (Task 1)
4. An organization with no members, no officers or no equipment, and with no assistance history: empty states with an explanation, not blank tables. (Tasks 3, 4, 5, 7)
5. The organization tries to assign an officer to an occupied position: shows "ask OMAg staff to end their term" instead of a dead end. (Task 3)

## Harness (used by Tasks 2 to 7; scratch files live in the session scratchpad, never in the repo)

1. Throwaway MariaDB: `D:\xampp\mysql\bin\mysql_install_db.exe --datadir=<scratch>\mdb`, then start `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1`; create database `oma_aringay_db` (utf8mb4).
2. Settings file `<scratch>\mysqlplain.py`: `from oma_aringay.settings import *`, `DATABASES['default']['PORT'] = '3307'`, local `FileSystemStorage` storages, `CORS_ALLOWED_ORIGINS` including `http://localhost:5174`.
3. Migrate and seed: `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py migrate --settings=mysqlplain`, then a seed script (`<scratch>\seed_org.py`, written in Task 2) run through `manage.py shell --settings=mysqlplain`. It creates one farmers' organization and one fisherfolk organization, each with a CITIZEN account linked through `UserLinkedRecord`, five members, two officers and two equipment items, a few `BeneficiaryRecord` / `FisherfolkBeneficiaryRecord` rows in different statuses (set with `.update(status=...)`, because `save()` recomputes it), and prints short-lived access tokens (`AccessToken.for_user`).
4. Servers: `manage.py runserver 127.0.0.1:8001 --settings=mysqlplain --noreload` and `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort` (from `oma-frontend`). In the browser pane, put the token in `localStorage.accessToken` (and any value in `refreshToken`) on `http://localhost:5174`, then open the page.
5. Cleanup at the end of each task that used it: clear browser `localStorage`, stop the three processes, delete `<scratch>\mdb` and the test media folder.

## File Structure

- Backend: `oma_aringay/associations/views.py` (permissions on four views, two detail serializers' staff block), `oma_aringay/associations/serializers.py` (omit `citizen_account` for a non-staff caller), new `oma_aringay/associations/test_own_org_scope.py`.
- Frontend (modified): `context/AuthContext.jsx`, `components/ProtectedRoute.jsx`, `App.jsx`, `components/Layout/Sidebar.jsx`, `Navbar.jsx`, `PageLayout.jsx`, `pages/Citizen/CitizenPhoneShell.jsx`, `pages/Citizen/CitizenHomePage.jsx`, `pages/Citizen/OwnAccountPages.jsx`, `pages/Organizations/OrganizationDetailPage.jsx`, `pages/AssistanceManagement/CropAssistancePage.jsx`, `FisheriesAssistancePage.jsx`, `DistributeAssistanceModal.jsx`.
- Frontend (new): `pages/Citizen/OrgAccountPages.jsx` (`OrgProfilePage`, `OrgHelpPage`, English help text), `pages/Citizen/OrgPhoneHome.jsx`.
- Frontend (removed in Task 8): `OrganizationHomeScreen.jsx`, `OrgAccountlessConfirmablesScreen.jsx`, `OrgAddMemberScreen.jsx`, `OrgAssignOfficerScreen.jsx`, `OrgDashboardParts.jsx`, `OrgHelpScreen.jsx`, `OrgInfoScreen.jsx`, `OrgMemberPicker.jsx`, `OrgMembersScreen.jsx`, `OrgOfficerHistoryScreen.jsx`, `OrgReportAssistanceScreen.jsx`, `OrgReportHistoryScreen.jsx`, `OrgSetMemberActiveDialog.jsx`, `OrgAvatar.jsx`, `orgStyles.js` (each only after a grep proves nothing else imports it). `orgDomainConfig.js` stays (it holds the organization endpoints).

---

### Task 1: Backend own-organization rule and tests

**Files:**
- Modify: `oma_aringay/associations/views.py` (`FarmersOrganizationDetailView`, `FisherfolkOrganizationDetailView`, the two `*EquipmentAddView`, the two `*EquipmentRemoveView`)
- Modify: `oma_aringay/associations/serializers.py` (the two `*OrganizationDetailSerializer.to_representation`)
- Test: `oma_aringay/associations/test_own_org_scope.py` (new)

**Interfaces:**
- Produces (all four routes, per domain `farmers` / `fisherfolk`):
  - `GET organizations/<type>/<pk>/`: staff, or the CITIZEN linked to exactly that organization (type and id). `PATCH` stays staff-only. For a non-staff caller the response has no `citizen_account` key.
  - `POST organizations/<type>/<pk>/equipment/`: same callers as the GET; creates equipment on that organization (existing serializer, `organization` forced from the URL).
  - `DELETE organizations/<type>/equipment/<equip_id>/`: staff, or a CITIZEN whose linked organization (type and id) owns that equipment row; any other id is 404.
- Implementation shape: use the existing `IsOwnOrgOrStaff` for GET/POST (it already reads the `pk` kwarg and `org_linked_record_type`, which each view must set), and a `get_permissions()` on the detail views that returns `[IsAuthenticated, IsAdminOrEvaluator]` for PATCH/PUT. For the equipment DELETE (no `pk` kwarg) override `get_queryset()` to filter by the caller's own organization for a CITIZEN (`organization_id=request.user.linked_record_id` and `linked_record_type` equal to the view's `org_linked_record_type`, else `.none()`), with permission `[IsAuthenticated, IsOrgCitizenOrStaff]`, a new tiny class in `accounts/permissions.py` that admits staff, or a CITIZEN whose `linked_record_type` equals the view's `org_linked_record_type`.

- [ ] **Step 1: Write the failing tests** in `associations/test_own_org_scope.py` (`APITestCase`, `force_authenticate`, fixtures built like `production/test_farmer_scope.py`'s `make_citizen` with `UserLinkedRecord`; read both organization models for their required fields). Classes and test names:
  - `OwnOrgDetailTests`: `test_org_reads_its_own_detail_for_both_domains`; `test_org_cannot_read_another_orgs_detail` (404 or 403); `test_org_response_has_no_citizen_account_but_staff_response_does`; `test_org_cannot_patch_its_own_record` (403); `test_farmer_fisherfolk_and_unlinked_citizen_are_refused`.
  - `OwnOrgEquipmentTests`: `test_org_adds_and_removes_its_own_equipment_for_both_domains`; `test_org_cannot_add_equipment_to_another_org`; `test_org_cannot_delete_another_orgs_equipment` (404 and the row still exists); `test_staff_unchanged` (staff add/remove on any org).
  - `OrgIdCollisionTests`: a `FISHERFOLK_ORG` citizen whose `linked_record_id` equals a farmers' organization's pk gets 403/404 on detail, equipment add and equipment delete of that farmers' organization, and the reverse.
  - `OrgStaffOnlyRoutesTests`: an organization account gets 403 on `organizations/farmers/` (list/create), `organizations/<type>/<pk>/members/<id>/set-main/`, `organizations/<type>/officers/<id>/end-term/`, `farmers/`, `fisheries/fisherfolk/`, `accounts/users/`.
- [ ] **Step 2: Run to confirm RED.** Run the tests with the throwaway-DB recipe (Harness 1-3, test runner form: `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test associations.test_own_org_scope --settings=mysqlplain --noinput` from `oma_aringay/`). Expected: the new organization-allowed assertions FAIL with 403/404, the refusal tests PASS already; read each failure and confirm it is the missing permission, not a fixture error.
- [ ] **Step 3: Implement** the permissions, queryset filter and `citizen_account` omission as described in Interfaces (both domains, same shape; keep `get_object()`'s `expire_due_officer_terms()` call).
- [ ] **Step 4: Run the new tests: all PASS. Then the whole suite** (same command without a label). Expected: 191 existing tests plus the new ones, all OK.
- [ ] **Step 5: Mutation check.** Temporarily remove the type comparison from the equipment-delete queryset filter; `OrgIdCollisionTests` must fail; restore it and re-run green.

---

### Task 2: Account plumbing, routes, navigation and phone-shell role (desktop usable)

**Files:**
- Modify: `context/AuthContext.jsx`, `components/ProtectedRoute.jsx`, `App.jsx`, `components/Layout/Sidebar.jsx`, `components/Layout/Navbar.jsx`, `components/Layout/PageLayout.jsx`, `pages/Citizen/CitizenPhoneShell.jsx`, `pages/Citizen/CitizenHomePage.jsx`, `pages/Citizen/OwnAccountPages.jsx`
- Scratch (not in the repo): `<scratch>\seed_org.py`, `<scratch>\mysqlplain.py`

**Interfaces:**
- Produces from `useAuth()`: `isOrg: boolean`, `orgType: 'FARMERS_ORG' | 'FISHERFOLK_ORG' | null` (from `user.linked_record_type` when the role is CITIZEN), `isFisherfolkOrg: boolean`.
- Produces `ProtectedRoute` prop `allowOrg?: Array<'FARMERS_ORG' | 'FISHERFOLK_ORG'>`: admits a CITIZEN whose linked type is in the list (with `allowedRoles={[]}` an organization-only route).
- Produces routes: `/my-organization` (both types), `/crop-assistance` additionally `allowOrg={['FARMERS_ORG']}`, `/fisheries-assistance` additionally `allowOrg={['FISHERFOLK_ORG']}`, `/my-profile` and `/my-help` additionally both types (served by `OwnProfilePage`/`OwnHelpPage`, which Task 6 extends; until then they render the existing farmer/fisherfolk page chosen by `isFarmer`, so Task 2 changes them only to admit organizations and shows a plain placeholder heading for an organization).
- Produces `ORG_NAV` in `Sidebar.jsx`: `[{ to: '/my-organization', icon: Building2, label: 'My Organization' }, { to: <'/crop-assistance' | '/fisheries-assistance'>, icon: HandHeart, label: 'Assistance' }]`, chosen by `orgType`; `ownNav` becomes fisherfolk / farmer / org. No My Profile entry.
- Produces in `CitizenPhoneShell.jsx`: `TABS_BY_ROLE.org(orgType)` with Home (`/my-account`), Organization (`/my-organization`), Assistance; theme `crop` for a farmers' organization, `fish` for a fisherfolk one; `PageLayout` uses the phone shell when `(isFisherfolk || isFarmer || isOrg) && isPhone`, and sets `data-account-theme="fisherfolk"` also for `isFisherfolkOrg`.
- Produces in `CitizenHomePage.jsx`: for an organization on a non-phone width, `<Navigate to="/my-organization" replace />`; on a phone it still renders the existing `OrganizationHomeScreen` until Task 7.

- [ ] **Step 1: Write the seed script** (`<scratch>\seed_org.py`, per Harness 3) and bring the throwaway stack up (Harness 1-4). Expected: `curl http://127.0.0.1:8001/api/accounts/me/` returns 401 and `http://localhost:5174/` returns 200.
- [ ] **Step 2: Implement** the interfaces above (`AuthContext` flags next to `isFarmer`; `Navbar`: `ownAccount` includes `isOrg`, role label `'Farmers Organization'`/`'Fisherfolk Organization'`; `Sidebar`: `ORG_NAV`).
- [ ] **Step 3: Verify in the browser** as each organization account on the throwaway stack: after login, desktop lands on `/my-organization` (the page itself is Task 3; a 404-free route that renders the existing page is enough), the sidebar shows exactly My Organization and Assistance, the header menu has Profile/Help/Log out, `/crop-assistance` is refused for the fisherfolk organization and `/fisheries-assistance` for the farmers' one (Access Denied), a staff account's sidebar and a farmer's are unchanged. At 375 px the bottom bar shows Home, Organization, Assistance in the right theme.
- [ ] **Step 4: Build and lint.** Run `npx vite build` and `npx eslint <each modified file>` against `git show HEAD:<file>` copies. Expected: build OK, no new lint messages.

---

### Task 3: My Organization (`OrganizationDetailPage` in own-organization mode)

**Files:**
- Modify: `pages/Organizations/OrganizationDetailPage.jsx`, `App.jsx` (the `/my-organization` element)

**Interfaces:**
- Consumes: Task 1 routes; Task 2 `isOrg`, `orgType`, `user.linked_record.id`, the `/my-organization` route.
- Produces: `OrganizationDetailPage` accepts an optional prop `own?: boolean`; when `own`, `type` is `'farmers'` for `FARMERS_ORG` and `'fisherfolk'` for `FISHERFOLK_ORG`, and `id` is `user.linked_record.id` (otherwise both come from `useParams()` as today). Inside the page `canManage = isAdmin || isEvaluator || own` replaces the existing `(isAdmin || isEvaluator)` checks for: Add Member, member Deactivate/Reactivate, Add Equipment, Remove Equipment, Assign Officer.
- Own-mode differences: title "My Organization"; no Back to Organizations link; no Activate Account button; no Set Main; no End Term Early; member Deactivate/Reactivate calls `PATCH /organizations/<type>/<id>/members/<memberId>/` (the organization-scoped route, same `{ is_active, reason }` body); Add Member's candidate search calls `GET /organizations/<type>/<id>/member-search/?search=` (the organization-scoped candidate search, results `{ id, full_name, barangay, current_organizations }`) and posts `{ <farmer|fisherfolk>: candidate.id, date_joined: today }` as the old portal did, instead of the staff registry search; Assign Officer's "position held" message reads "This position is held by <name>. Ask OMAg staff to end their term first."; Officer History is available.
- Phone: wide tables get `overflow-x-auto` containers with the existing look; the page title and tabs fit 375 px.

- [ ] **Step 1: Implement** the `own` prop and the differences above, reading the old portal's `OrgAddMemberScreen.jsx` for the candidate shape and the `main_choice_required` error handling (show the plain message "This person is already in another organization with no main one. Ask OMAg staff to set it.").
- [ ] **Step 2: Wire** `/my-organization` in `App.jsx` to a small element that reads `useAuth()` and renders `<OrganizationDetailPage own />` inside `ProtectedRoute allowedRoles={[]} allowOrg={['FARMERS_ORG','FISHERFOLK_ORG']}`; staff keep `/organizations/:type/:id` unchanged.
- [ ] **Step 3: Verify in the browser on the throwaway stack** for both organization types, desktop and 375 px: the page shows its own members/officers/equipment; add a member from the candidate search, deactivate and reactivate a member (with the reason), add and remove equipment, assign an officer to a vacant position, try an occupied position (the staff message), open Officer History; confirm none of Back/Activate/Set Main/End Term appear; an organization with no members/officers/equipment (create a bare one in the seed) shows the empty-state messages. As staff, `/organizations/farmers/<id>` is unchanged (all staff controls present).
- [ ] **Step 4: Build and lint** as in Task 2 for the two files.

---

### Task 4: Crop Assistance in organization mode (farmers' organization)

**Files:**
- Modify: `pages/AssistanceManagement/CropAssistancePage.jsx`, `pages/AssistanceManagement/DistributeAssistanceModal.jsx`

**Interfaces:**
- Consumes: `isOrg`, `orgType === 'FARMERS_ORG'`, `user.linked_record.id` and `.label`; `FARMERS_ORG_DOMAIN` in `pages/Citizen/orgDomainConfig.js` (`historyUrl`, `memberSearchUrl(orgId)`, `createUrl`, `distributeUrl(orgId)`, `accountlessConfirmablesUrl`, `confirmOnBehalfUrl(id)`, `detailUrl(id)`).
- Produces: `DistributeAssistanceModal` accepts an optional prop `fixedOrg?: { id: number, name: string }`; when present the organization search is skipped and the form starts with that organization selected.
- In own-organization mode (`isOrg`) the page:
  - Title "Assistance"; tabs **History** and **Confirm for Members** (no Needs Follow-up, no staff organization filter).
  - History lists `GET domain.historyUrl` with the farmer-style status names (`Received` for CONFIRMED, `Not Received`, `Pending`, `Awaiting Confirmation`, `Resolved`); includes the member's name column.
  - **Report Assistance** button (split menu or two buttons): *To one member* opens the existing `AddAssistanceModal` with its farmer picker replaced by a picker over `GET domain.memberSearchUrl(orgId)?search=` (the organization's own members; result row person id `row.farmer`, label `row.farmer_full_name`), the future-date restriction removed (a future `date_given` becomes a scheduled/Pending record), same payload to `domain.createUrl`; *To all members* opens `DistributeAssistanceModal fixedOrg={{ id: orgId, name: label }}`.
  - **Edit** row action only while the record is still editable (the page's existing `EDITABLE_STATUSES` rule), through the existing edit modal.
  - **Confirm for Members** tab lists `GET domain.accountlessConfirmablesUrl` (member name, assistance, date) with a **Confirm Received** action posting to `domain.confirmOnBehalfUrl(id)`, behind a `ConfirmDialog`.
  - Hidden: Import, Distribute-with-organization-search, Mark Resolved, barangay filter.

- [ ] **Step 1: Implement** the `fixedOrg` prop and the organization mode above, reading `OrgReportAssistanceScreen.jsx`, `OrgReportHistoryScreen.jsx` and `OrgAccountlessConfirmablesScreen.jsx` for the exact payload fields (`assistance_type`, `source_agencies`, `quantity`, `date_given`, `season`, `year`, type-conditional fields, `remarks`) and error handling; reuse `buildTypeConditionalPayload`/`validateTrainingDuration` as the staff form does.
- [ ] **Step 2: Verify in the browser on the throwaway stack** as the farmers' organization (desktop and 375 px): History shows seeded rows with the right status names; report to one member (including a future date, which then shows Pending under History) and to all members (preview step, then confirm; check the result counts match the seeded active members); edit a Pending row; the Confirm for Members tab lists the accountless member's awaiting row and Confirm Received moves it to Received; an organization with no history shows the empty state; as staff, Crop Assistance is unchanged and as a farmer the farmer mode is unchanged.
- [ ] **Step 3: Build and lint** the two files against HEAD.

---

### Task 5: Fisheries Assistance in organization mode (fisherfolk organization)

**Files:**
- Modify: `pages/AssistanceManagement/FisheriesAssistancePage.jsx` (and the fisheries add-assistance modal it uses, if separate)

**Interfaces:**
- Consumes: the same as Task 4 with `orgType === 'FISHERFOLK_ORG'` and `FISHERFOLK_ORG_DOMAIN` (`createUrl: /interventions/fisherfolk-beneficiaries/adhoc/`, `personField: 'fisherfolk'`, `historyUrl: /interventions/my-org-fisherfolk-beneficiary-history/`, `accountlessConfirmablesUrl: /interventions/my-org-fisherfolk-accountless-confirmables/`, `confirmOnBehalfUrl`, `distributeUrl(orgId)`), and Task 4's `DistributeAssistanceModal fixedOrg`.
- Produces: the same organization mode as Task 4 on the fisheries page: History, Report Assistance (one member / all members), Edit while editable, Confirm for Members; fisherfolk assistance types (`Fishing Gear`, `Boat/Vessel`, `Fingerlings/Seeds`, `Feed`, `Equipment`, `Cash Assistance`, `Training`, `Other`) and no season.

- [ ] **Step 1: Implement** the organization mode on the fisheries page, mirroring Task 4 (the page already has an `isFisherfolk` branch with its phone layout; add `isOrg` beside it rather than rewriting).
- [ ] **Step 2: Verify in the browser on the throwaway stack** as the fisherfolk organization (desktop and 375 px) with the same checklist as Task 4; as staff and as a fisherfolk account the page is unchanged.
- [ ] **Step 3: Build and lint** against HEAD.

---

### Task 6: Organization profile and help (English)

**Files:**
- Create: `pages/Citizen/OrgAccountPages.jsx`
- Modify: `pages/Citizen/OwnAccountPages.jsx`

**Interfaces:**
- Produces: `OrgProfilePage()` and `OrgHelpPage()` (no props), both rendered inside `PageLayout`; `OwnProfilePage`/`OwnHelpPage` choose organization / farmer / fisherfolk from `useAuth()`.
- `OrgProfilePage` shows, in English and with the system's form components: the organization logo with change (`POST /profile/image/`, multipart), the read-only registration details (registration number, agency, date organized, date registered, contact person, email), editable contact number (`PATCH /profile/contact-number/ { contact_number }`), a change-password form (`POST /accounts/change-password/`, with the shared/institutional-account warning), and the change-request list with a request form for name and address (`GET`/`POST /profile/change-requests/`). The payloads and validation come from `OrgInfoScreen.jsx` (read it; port the logic, not the Filipino markup).
- `OrgHelpPage` renders `CitizenHelpScreen` in its `bare` mode with an English `ORG_HELP_EN` object of the same shape as `FARMER_HELP_EN` (members, officers, reporting assistance to one or all members, confirming on behalf, equipment, profile and password, requesting a change), translated from `labels.orgHelp`. The contact block keeps the existing honest placeholders.

- [ ] **Step 1: Implement** the two pages and the dispatch.
- [ ] **Step 2: Verify in the browser on the throwaway stack** as both organization types (desktop and 375 px): profile loads real values, contact number saves and persists after reload, an invalid contact number is rejected, a change request appears as pending, the password form validates (do not change a real account's password; use the seeded throwaway account), logo upload accepts a small PNG; help renders. As a farmer and as a fisherfolk, `/my-profile` and `/my-help` are unchanged.
- [ ] **Step 3: Build and lint** the two files against HEAD (new file: lint clean).

---

### Task 7: Organization phone Home

**Files:**
- Create: `pages/Citizen/OrgPhoneHome.jsx`
- Modify: `pages/Citizen/CitizenHomePage.jsx`

**Interfaces:**
- Produces: `OrgPhoneHome()` (no props), rendered for an organization on a phone, inside `PageLayout` (which supplies the phone shell). It reads `GET domain.membersUrl(orgId)`, `GET domain.officersUrl(orgId)`, `GET domain.historyUrl` and `GET domain.accountlessConfirmablesUrl` (the same endpoints the old home read) and shows four tiles (active members; officer positions filled of `domain.officerPositions.length`; assistance reported this year; members awaiting confirmation) and three quick actions that navigate to `/my-organization` (Members), `/my-organization` (Officers) and the assistance route (Report Assistance). Visual style copies `FarmerPhoneHome.jsx` (`StatTile`, cards, `cz-*` tokens). Empty states for a brand-new organization.
- `CitizenHomePage.jsx`: organization → phone: `<OrgPhoneHome />`; otherwise `<Navigate to="/my-organization" replace />`. The old `OrganizationHomeScreen` is no longer rendered anywhere.

- [ ] **Step 1: Implement** `OrgPhoneHome` and the dispatch.
- [ ] **Step 2: Verify in the browser on the throwaway stack** at 375 px for both organization types: tiles match the seeded numbers, quick actions navigate, a bare organization shows zeros and the empty message; at desktop width `/my-account` forwards to My Organization.
- [ ] **Step 3: Build and lint** the two files against HEAD.

---

### Task 8: Retire the old organization portal

**Files:**
- Delete: the files listed under "Frontend (removed in Task 8)" in File Structure
- Modify: `pages/Citizen/labels.js` (remove only the organization-portal sections that nothing else reads; leave anything shared)

- [ ] **Step 1: Prove each file is unused.** For every file to delete run a search for its import path across `oma-frontend/src`; delete only files whose only importers are other files in the list. Keep any file still imported elsewhere and ledger why.
- [ ] **Step 2: Delete** the proven-unused files and the unused `labels.js` sections.
- [ ] **Step 3: Build and lint.** Run `npx vite build` and `npx eslint src` compared with the committed tree (message count not higher). Expected: build OK; the live module count drops by the number of deleted modules.
- [ ] **Step 4: Final regression in the browser** (throwaway stack for writes, live server read-only for look): both organization types desktop and 375 px through Tasks 2-7's checklists in one pass; a staff account, a farmer and a fisherfolk each open their own main pages unchanged. Then run the full backend suite once more. Expected: all green.
- [ ] **Step 5: Cleanup.** Clear browser storage, reset the viewport, stop the throwaway servers and database, delete the scratch data.
