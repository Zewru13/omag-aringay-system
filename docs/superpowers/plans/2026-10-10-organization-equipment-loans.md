# Cycle H — Organization Equipment: Repair, Broken/Lost and Borrowing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organization can split equipment lines by condition (adding Broken and Lost), repair units with a log, lend Good units to members and track who holds them, and members with an account can request, cancel and return from their own page.

**Architecture:** One module `associations/equipment_ops.py` holds all unit arithmetic for both domains (move units between condition lines, repair, lend, approve, return) behind a small domain config, always under a row lock on the equipment line. Two mirrored model pairs (`...EquipmentLoan`, `...EquipmentRepair`) follow the codebase's per-domain convention. Thin DRF views call the module; the organization detail serializer gains computed figures. The frontend adds actions to the equipment details dialog, a Borrowed tab on My Organization, and a My Equipment page for members.

**Tech Stack:** Django 4.2 + DRF, MariaDB (tests), React, Vite.

**Spec:** `docs/superpowers/specs/2026-10-10-organization-equipment-loans-design.md`

## Global Constraints

- Conditions on both equipment models: `Good`, `Needs Repair`, `Not Operational`, `Broken`, `Lost` (TextChoices `BROKEN = 'Broken'`, `LOST = 'Lost'`).
- Unit arithmetic: `on_loan(line)` = sum of `quantity` of its loans in `BORROWED` or `RETURN_PENDING`; `movable(line) = line.quantity - on_loan(line)`; `available(line) = movable(line)` when `line.condition == 'Good'`, else 0. Invariant `0 <= on_loan <= quantity`. A line with `quantity == 0` is hidden from the organization detail `equipment` list but kept.
- Moving units (condition change, repair, non-Good return) goes to the line with the same `equipment_name`, `equipment_name_other` and target condition (the first by id); when none exists a new line is created copying `acquisition_date` and `remarks`.
- Loan statuses: `REQUESTED`, `BORROWED`, `RETURN_PENDING`, `RETURNED`, `REJECTED`, `CANCELLED`; `origin`: `ORGANIZATION` | `MEMBER`. Repair allowed only from `Needs Repair`, `Not Operational`, `Broken`. Condition change target must differ from the line's condition.
- Every unit-changing action re-reads the equipment line with `select_for_update()` inside `transaction.atomic()` (helper `lock_line`), then re-checks its preconditions.
- Error messages (400 `{'detail': ...}` unless a field error): `Only N units are available.` · `Only N units can be moved (the rest are out on loan).` · `The breakdown must add up to N units.` · `This equipment has loan or repair history and cannot be removed. Mark it Lost or Broken instead.` (409).
- An organization account touches only its own organization's lines and loans (other ids are 404); staff any; a member account only organizations it is an ACTIVE member of. `member` on a lend must be an active member of that organization.
- Notifications (`notify_user`, `record_type='equipment_loan'`, `record_id` = loan id): request -> organization account; member's "I returned it" -> organization account; approve / reject / confirmed return -> the member (`resolve_owner_user(farmer_id=...)`; silently skipped without an account). Verbs: `requested to borrow equipment` · `says the equipment was returned` · `approved your equipment request` · `rejected your equipment request` · `confirmed the return of your equipment`; details name the equipment and units and fit 255 characters (`core.notifications.fit`).
- English only. Never test against Supabase; throwaway stack with mail credentials blanked; run `makemigrations` only with `--settings=mysqlplain`. Commit only when the user says so; no push. After finishing, tell the user the live database needs `manage.py migrate` (associations 0025) before the new code runs; never run it unasked.

## Review Focus

1. Returning a loan whose line was meanwhile reduced (other units moved to Broken): loaned units still return to that line. (Task 3)
2. Two members requesting the last unit, both approved in a row: the second approval is refused with the available count. (Task 3)
3. A member in two organizations sees and borrows from each separately; ids never cross organizations or domains. (Task 4)
4. Lost/Broken units that were borrowed stay attributed in the loan and in the line history. (Task 3)
5. Removing a line that only has an open request is refused like any line with history. (Task 2)

## Harness

Same recipe as cycles A-G: throwaway MariaDB on port 3307 (`mysql_install_db.exe --datadir=<scratch>\mdb`; `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci`; database `oma_aringay_db` utf8mb4), `<old scratch>\mysqlplain.py` on `PYTHONPATH`, tests `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput`. Fixtures: copy `make_org`, `make_person`, `make_citizen` from `interventions/test_distribution_members.py` (organization accounts linked with `UserLinkedRecord`, members via `FarmersOrganizationMember` / `FisherfolkOrganizationMember`, a second organization for scoping). Endpoints live under `/api/organizations/`. Browser stack: `migrate`, `seed_org.py` as `manage.py shell < file`, then `seed_g.py` via `exec(open(...).read())` (members), extra seed for equipment lines and a member account with a token; `runserver 127.0.0.1:8001 --settings=mysqlplain --noreload`, `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`; set `localStorage.accessToken` and a placeholder `refreshToken`. Cleanup: clear browser storage, stop processes by PID, delete the scratch `mdb` and tokens.

## File Structure

- Backend modified: `associations/models.py`, `associations/serializers.py`, `associations/views.py`, `associations/urls.py`, `core/notifications.py` (record-type titles only if needed). New migration `associations/migrations/0025_equipment_loans.py`.
- Backend new: `associations/equipment_ops.py` (arithmetic), `associations/equipment_views.py` (condition, repair, history, lend, loan actions, member endpoints), tests `associations/test_equipment_units.py`, `associations/test_equipment_loans.py`, `associations/test_equipment_member.py`.
- Frontend new: `utils/equipmentLoans.js` (pure helpers), `pages/Organizations/EquipmentActionDialogs.jsx` (condition / repair / lend / return forms), `pages/Organizations/BorrowedPanel.jsx`, `pages/Equipment/MyEquipmentPage.jsx`, tests `tests/equipmentLoans.test.mjs`. Modified: `pages/Organizations/OrganizationDetailPage.jsx`, `components/Layout/Sidebar.jsx`, `components/Layout/NotificationBell.jsx`, `App.jsx`, `pages/Citizen/CitizenProfileScreen.jsx` (organization row link), `pages/Organizations/OrgCompactList.jsx` only if a prop is needed.

---

### Task 1: Models, conditions, figures on the equipment payload

**Files:**
- Modify: `oma_aringay/associations/models.py`, `oma_aringay/associations/serializers.py`
- Create: `oma_aringay/associations/migrations/0025_equipment_loans.py` (via `makemigrations associations -n equipment_loans --settings=mysqlplain`), `oma_aringay/associations/equipment_ops.py` (figures only in this task)
- Test: `oma_aringay/associations/test_equipment_units.py` (new)

**Interfaces:**
- Produces: `Condition.BROKEN` / `Condition.LOST` on both equipment models; models `FarmersOrganizationEquipmentLoan`, `FisherfolkOrganizationEquipmentLoan`, `FarmersOrganizationEquipmentRepair`, `FisherfolkOrganizationEquipmentRepair` with the fields in the spec (FKs to the equipment line and the member use `on_delete=PROTECT`); `EquipmentDomain` (NamedTuple: `key`, `org_model`, `line_model`, `loan_model`, `repair_model`, `member_model`, `person_model`, `person_field`, `owner_kwarg`) and `equipment_domain(key: 'farmers'|'fisherfolk') -> EquipmentDomain` in `equipment_ops.py`; `on_loan(line) -> int`, `movable(line) -> int`, `available(line) -> int`, `OUT_STATUSES = ('BORROWED', 'RETURN_PENDING')`; the equipment serializers gain read-only `on_loan`, `available`, `holders` (`[{loan_id, member_id, member_name, quantity, borrowed_at, due_date, overdue}]` for loans out) and the organization detail `equipment` list excludes `quantity == 0` lines.

- [ ] **Step 1: Write the failing tests** (`APITestCase`, both domains via a loop): a Good line of 3 with a BORROWED loan of 2 reports `on_loan 2`, `available 1`; a non-Good line reports `available 0`; `holders` lists the borrower with `overdue` true only when `due_date` is before today and the loan is out; RETURNED / REQUESTED loans do not count as out; the organization detail (`GET /api/organizations/<type>/<id>/`) omits a `quantity == 0` line and shows the figures; a line created through the existing add endpoint can use `Broken` and `Lost` and an unknown condition is refused; `equipment_domain` returns the right models and raises `KeyError` for an unknown key.
- [ ] **Step 2: Run** `manage.py test associations.test_equipment_units`. Expected: FAIL (models and fields missing).
- [ ] **Step 3: Implement** the choices, the four models, the migration, `equipment_ops` figures and the serializer fields (`SerializerMethodField`s; prefetch loans for the nested list to avoid per-row queries).
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** count RETURN_PENDING as not out and confirm the figures test fails; restore.
- [ ] **Step 5: Run the whole suite and `makemigrations --check --settings=mysqlplain`.** Expected: OK, no changes.

---

### Task 2: Change condition, repair, history, remove protections

**Files:**
- Modify: `oma_aringay/associations/equipment_ops.py`, `oma_aringay/associations/urls.py`, `oma_aringay/associations/views.py` (the two Remove views)
- Create: `oma_aringay/associations/equipment_views.py`
- Test: `oma_aringay/associations/test_equipment_units.py` (extend)

**Interfaces:**
- Consumes (Task 1): `equipment_domain`, `on_loan`, `movable`, the models.
- Produces: `lock_line(domain, pk) -> line | None`; `move_units(domain, line, quantity: int, condition: str) -> line_moved_to` (inside the caller's transaction); `change_condition(domain, line_pk, quantity, condition) -> {'from': line, 'to': line}`; `repair(domain, user, line_pk, quantity, repaired_on, description, cost=None) -> EquipmentRepair`; views `EquipmentConditionView`, `EquipmentRepairView`, `EquipmentHistoryView` at `POST <type>/equipment/<equip_id>/condition/`, `POST <type>/equipment/<equip_id>/repair/`, `GET <type>/equipment/<equip_id>/history/` (`{repairs: [...], loans: [...]}` newest first); the Remove views refuse (409) a line with any loan or repair row or units out.

- [ ] **Step 1: Write the failing tests:** splitting 1 of 3 Good into Broken gives lines Good 2 / Broken 1 (and a second split merges into the existing Broken line); moving all units hides the source (`quantity 0`); moving more than `movable` or the same condition or `quantity < 1` is 400; units on loan cannot move; repair from Needs Repair / Not Operational / Broken moves units into the Good line (found or created), writes the log (`from_condition`, `cost`) and refuses Good and Lost lines, a future date, a negative cost, a blank description, and `quantity > movable`; Lost -> Good through the condition endpoint works ("found"); history lists repairs and loans newest first; Remove is 409 with units out, with a repair row, with an open REQUESTED loan (Review Focus 5) and still 204 for a plain line; an organization account cannot touch another organization's line (404) and a non-organization citizen is 403; the farmers and fisherfolk variants behave the same.
- [ ] **Step 2: Run** the new tests. Expected: FAIL (404).
- [ ] **Step 3: Implement** the operations (always under `lock_line`, the moved-to line found with `select_for_update()` as well), the three views and routes, the Remove guards (catch `ProtectedError`, check units out first).
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** let repair run on a Good line and confirm its test fails; restore.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 3: Loans on the organization side

**Files:**
- Modify: `oma_aringay/associations/equipment_ops.py`, `oma_aringay/associations/equipment_views.py`, `oma_aringay/associations/urls.py`
- Test: `oma_aringay/associations/test_equipment_loans.py` (new)

**Interfaces:**
- Consumes (Tasks 1-2): `lock_line`, `move_units`, figures.
- Produces: `lend(domain, user, line_pk, member_id, quantity, due_date=None) -> loan` (BORROWED, `origin='ORGANIZATION'`); `approve(domain, user, loan_pk) -> loan`; `reject(domain, user, loan_pk, reason) -> loan`; `return_loan(domain, user, loan_pk, breakdown: list[{'condition': str, 'quantity': int}] | None) -> loan` (None = all Good); `loan_notify(domain, loan, event)` (the notifications in Global Constraints, never raising); views and routes `POST <type>/equipment/<equip_id>/lend/`, `GET <type>/<pk>/equipment-loans/` (filters `status`, `member`, `equipment`, `overdue=1`; serialized loan: `{id, equipment_id, equipment_name, member_id, member_name, quantity, status, origin, requested_at, borrowed_at, due_date, return_requested_at, returned_at, return_breakdown, member_note, reject_reason, overdue}`), `POST <type>/equipment-loans/<loan_id>/approve|reject|return/`.

- [ ] **Step 1: Write the failing tests:** lend takes units out (available shrinks, loan BORROWED, `borrowed_at` set) and is refused for a non-Good line, `quantity > available`, `quantity < 1`, an inactive member, another organization's member, a member of the other domain, and a past `due_date` is allowed but a malformed one is 400; return all-Good closes the loan and frees the units; return with `[{Good 2}, {Broken 1}]` moves 1 unit to a Broken line, keeps the others out of the loan, and records `return_breakdown`; a breakdown that does not sum to the loan quantity, an unknown condition or a negative part is 400 with the "must add up" message; returning a RETURNED/REJECTED loan is 400; Lost units leave the Good line's `quantity` (Review Focus 4: the loan keeps `return_breakdown {"Lost": 1}` and the history shows it); returning after other units were moved to Broken still returns the loaned units to the line (Review Focus 1); approve turns a REQUESTED loan into BORROWED, refuses with `Only N units are available.` when short (Review Focus 2: two requests for the last unit, second approval refused), reject stores the reason (255) and frees nothing; list filters (status, member name, equipment name, overdue) and scoping (another organization's loans never appear, staff see any); the race: patch `associations.equipment_ops.lock_line` with a side effect that lends the last unit first, then lend again -> refused; notifications for approve / reject / return reach the member's account and are skipped without one; farmers and fisherfolk variants.
- [ ] **Step 2: Run** the module. Expected: FAIL (404).
- [ ] **Step 3: Implement** the operations and views per Interfaces; notifications after the transaction, wrapped so a failure never breaks the action.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** skip the `available` check in `lend` and confirm the over-borrow test fails; restore.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 4: Member side

**Files:**
- Modify: `oma_aringay/associations/equipment_ops.py`, `oma_aringay/associations/equipment_views.py`, `oma_aringay/associations/urls.py`
- Test: `oma_aringay/associations/test_equipment_member.py` (new)

**Interfaces:**
- Consumes (Task 3): loan operations and serialization.
- Produces: `member_request(domain, user, line_pk, quantity, due_date=None, note='') -> loan` (REQUESTED, `origin='MEMBER'`, `requested_by=user`); `member_cancel(domain, user, loan_pk)`; `member_return(domain, user, loan_pk)` (BORROWED -> RETURN_PENDING, sets `return_requested_at`); views and routes `GET /api/organizations/my-equipment/` -> `[{organization: {id, name}, equipment: [{id, equipment_name, available, ...}], loans: [...]}]` per ACTIVE membership, `POST /api/organizations/my-equipment/request/` `{equipment, quantity, due_date?, note?}`, `POST /api/organizations/my-equipment/loans/<id>/cancel|return/`. The member's domain is taken from their linked record type (FARMER -> farmers, FISHERFOLK -> fisherfolk); organization accounts and staff get 403.

- [ ] **Step 1: Write the failing tests:** a member sees only lines with `available > 0` and Good condition from organizations they are ACTIVELY in, and their own loans only (Review Focus 3: a member of two organizations gets two groups, another organization's line id is refused with 400/404); request creates REQUESTED without reserving units and notifies the organization account; a second open request for the same line is 400; `quantity` above available or below 1, a non-Good line and a non-member are refused; cancel only for REQUESTED and only for the owner (another member's loan is 404); return only for BORROWED, becomes RETURN_PENDING, still counts as out, and notifies the organization; the organization then confirms with the Task 3 return endpoint; a deactivated member's open loan can still be returned by the organization; organization accounts / staff / unlinked citizens get 403; both domains.
- [ ] **Step 2: Run** the module. Expected: FAIL (404).
- [ ] **Step 3: Implement** the operations (membership check through the join tables' `is_active`) and views.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** drop the membership check and confirm the non-member test fails; restore.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 5: Frontend helpers and the equipment details actions

**Files:**
- Create: `oma-frontend/src/utils/equipmentLoans.js`, `oma-frontend/src/pages/Organizations/EquipmentActionDialogs.jsx`
- Modify: `oma-frontend/src/pages/Organizations/OrganizationDetailPage.jsx`
- Test: `oma-frontend/tests/equipmentLoans.test.mjs`

**Interfaces:**
- Produces in `equipmentLoans.js`: `CONDITIONS` (`['Good','Needs Repair','Not Operational','Broken','Lost']`), `REPAIRABLE` (the three repairable ones), `unitsSummary(line) -> { total, available, onLoan }` (tolerates missing fields), `validateBreakdown(parts, quantity) -> { ok: boolean, message: string }` (parts `[{condition, quantity}]`; every part a whole number >= 0, known condition, sum equals `quantity`), `defaultBreakdown(quantity) -> [{condition:'Good', quantity}]`, `isOverdue(loan, todayIso) -> boolean`, `loanStatusLabel(status) -> string` (`Requested`, `Borrowed`, `Return pending`, `Returned`, `Rejected`, `Cancelled`). `EquipmentActionDialogs.jsx` exports `ChangeConditionDialog`, `RepairDialog`, `LendDialog` (member picker from the organization's active members, units, optional return-by date), `ReturnDialog` (per-condition counts, default all Good, live validation message) and `EquipmentHistoryDialog`, each `({ line|loan, organization, type, onClose, onDone })` calling the Task 2-3 endpoints and surfacing the server's 400 message.

- [ ] **Step 1: Write the failing check** `tests/equipmentLoans.test.mjs`: `unitsSummary` for 3 units with 2 out, missing fields and a Lost line; `validateBreakdown` for exact sums, a wrong total (the "must add up" text), a decimal, a negative, an unknown condition and an empty list; `defaultBreakdown`; `isOverdue` for before/on/after the due date, no due date, and a returned loan (never overdue); `loanStatusLabel` for every status and an unknown one.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the helpers, the dialogs, and in own mode the Equipment details dialog (`OrgCompactList` item `details`/`actions`): add total / available / on loan, a "Who has it" block from `holders`, and the actions Change condition, Repair (shown for repairable conditions), Lend (Good with `available > 0`), History and Remove; the Remove error message from the server is shown in a toast. Equipment pill colours: Broken rose, Lost slate. The Add Equipment condition list gains Broken and Lost.
- [ ] **Step 4: Run** `npm test`; per-file eslint compared with HEAD; `vite build`. Expected: PASS, no new lint messages, build OK.

---

### Task 6: Borrowed tab

**Files:**
- Create: `oma-frontend/src/pages/Organizations/BorrowedPanel.jsx`
- Modify: `oma-frontend/src/pages/Organizations/OrganizationDetailPage.jsx`

**Interfaces:**
- Consumes: Task 3 list endpoint, Task 5 dialogs and helpers, `OrgCompactList`, `filterOrgItems`.
- Produces: `BorrowedPanel({ type, organizationId, refreshKey, onChanged })` — a list (member name as the row, equipment and units as the subtitle, Overdue badge) with a name search and filters (Status, Overdue only, Equipment), a details dialog per loan (equipment, units, borrowed, return-by, member note, return breakdown) with Approve / Reject (reason field) for REQUESTED loans, Mark returned (opens `ReturnDialog`) for BORROWED / RETURN_PENDING, and a "Lend equipment" shortcut; the tab label shows a count of open requests (`Borrowed (2)`); opened by `?tab=borrowed`.

- [ ] **Step 1: Implement** the panel and the tab in own mode only (staff view unchanged); reload after every action (a `reloadKey`), toasts with the server's message on failure.
- [ ] **Step 2: Run lint compared with HEAD and `vite build`.** Expected: no new messages, build OK.
- [ ] **Step 3: Browser check** is in Task 8 (needs the seeded stack).

---

### Task 7: My Equipment page, navigation and notifications

**Files:**
- Create: `oma-frontend/src/pages/Equipment/MyEquipmentPage.jsx`
- Modify: `oma-frontend/src/App.jsx`, `oma-frontend/src/components/Layout/Sidebar.jsx`, `oma-frontend/src/components/Layout/NotificationBell.jsx`, `oma-frontend/src/pages/Citizen/CitizenProfileScreen.jsx`

**Interfaces:**
- Consumes: Task 4 endpoints, `OrgCompactList`, `loanStatusLabel`.
- Produces: route `/my-equipment` (`ProtectedRoute` for FARMER and FISHERFOLK accounts) rendering `MyEquipmentPage`: per organization a search box, "Available to borrow" rows (name, units available; details dialog with a request form: units, optional return-by date, note) and "My loans" rows (equipment, units, status, due; details with Cancel for Requested and "I returned it" for Borrowed); a sidebar entry `Equipment` for those accounts only when `user.linked_record.organization_names.length > 0`; a link "Borrow equipment" under the organization row on My Profile; bell routing: record type `equipment_loan` -> `/my-organization?tab=borrowed` for an organization account, `/my-equipment` for a member.

- [ ] **Step 1: Implement** the page, the route, the nav entry, the profile link and the bell routes; empty states ("You are not a member of an organization yet." / "No equipment is available right now.").
- [ ] **Step 2: Run lint compared with HEAD and `vite build`.** Expected: no new messages, build OK.

---

### Task 8: Verification

- [ ] **Step 1: Whole backend suite** (`manage.py test`, output to a scratch file). Expected: OK. **`makemigrations --check --settings=mysqlplain`.** Expected: no changes.
- [ ] **Step 2: Browser, organization account (phone and desktop width):** change condition 1 of 3 to Broken (lines split), repair it with a note and cost (back to Good, history shows it), lend 2 units to a member (available shrinks, the Borrowed tab lists it, details show who has it), return with a mixed breakdown (units land in the right lines), a request from a member appears with a count on the tab and is approved / rejected; Remove refuses with history; staff view of the organization still works.
- [ ] **Step 3: Browser, member account (phone and desktop width):** My Equipment lists the organization's Good units, request with units and a due date, cancel one, "I returned it" on a borrowed loan, and the organization confirms; the sidebar entry is absent for an account with no organization.
- [ ] **Step 4: Cleanup** per the harness; report the live-database migration reminder to the user and leave everything uncommitted.

---

## Self-review notes

- Spec coverage: conditions and splitting (Tasks 1-2), repairs (2), organization loans (3), member side (4), protections (2-4), notifications (3-4, 7), screens (5-7); all five Review Focus items have a named test.
- Decisions the spec left to the plan: operations module with a domain config, per-line `lock_line`, "first by id" merge target, 409 for blocked removal, `?tab=borrowed`, no zero-line deletion.
- Out of scope per the spec: reminders, fees, cross-organization lending, damage photos, editing totals, loan reports, serial numbers.
