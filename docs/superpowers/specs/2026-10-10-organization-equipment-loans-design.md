# Cycle H — Organization equipment: repair, broken/lost, and borrowing with tracking

Date: 2026-10-10. Built on branch `org-equipment-loans`, after the compact My Organization lists (commit `65d6e90`).

## The request (user's words)

"We should be able to repair those equipment that has no good condition, also add condition lost or broken, and also let's also
be able to let a member borrowed an equipment and let's track who's having or using it, and then a member can borrow and return
it and the organization will track the equipment."

Answers to my questions:
- **Quantity:** split the row into separate lines (Water Pump x3 Good, mark 1 Broken -> Good x2 + Broken x1).
- **Who borrows:** both ways: the organization records a borrow/return for any member, and a member with an account can also
  request and return from their own account.
- **Repairs:** a repair log with date, what was done and an optional cost.
- **Rules:** only Good units can be lent; on return the officer sets the condition of what came back.

## What the code does today (verified)

- `associations.FarmersOrganizationEquipment` / `FisherfolkOrganizationEquipment`: one row per kind of equipment with
  `equipment_name` (+ `equipment_name_other`), `quantity`, `condition` (Good, Needs Repair, Not Operational), `acquisition_date`,
  `remarks`. Add and Remove only (`.../<pk>/equipment/`, `.../equipment/<equip_id>/`); the organization detail serializer returns
  them nested. An organization account manages only its own (`IsOwnOrgOrStaff`, `IsOrgCitizenOrStaff`).
- Organization membership is two mirrored join tables (`FarmersOrganizationMember`, `FisherfolkOrganizationMember`, `is_active`);
  a farmer/fisherfolk account's `/accounts/me/` returns `organization_names`. Notifications use `core.notifications`
  (`notify_user`, `resolve_owner_user`); the bell routes a citizen to `/my-account` for unknown types.
- Frontend: the organization's own page (`OrganizationDetailPage own`) now shows compact Members / Equipment / Officers lists with
  details in a dialog (`OrgCompactList.jsx`).

## Decisions

### 1. Conditions and splitting

- `Condition` gains `BROKEN = 'Broken'` and `LOST = 'Lost'` on both equipment models (choices only; the column is unchanged).
- A line with `quantity = 0` is hidden from every list but kept (loan and repair history points at it).
- `POST /api/organizations/<type>/equipment/<equip_id>/condition/` `{quantity, condition}` moves `quantity` units of this line to
  `condition`: they join the existing line of the same equipment (same `equipment_name` and `equipment_name_other`, that condition)
  or a new line is created copying `acquisition_date` and `remarks`. Only units not out on loan can move
  (`movable = quantity - on_loan`); the target must differ from the current condition. Lost -> Good (found) uses this too.
- Add Equipment keeps working; its condition list gains Broken and Lost.

### 2. Repairs

- New model per domain `...EquipmentRepair`: `equipment` (FK PROTECT), `quantity`, `repaired_on` (date, not in the future),
  `description` (required, 255), `cost` (Decimal 10,2, null, >= 0), `from_condition`, `recorded_by`, `recorded_at`.
- `POST .../equipment/<equip_id>/repair/` `{quantity, repaired_on, description, cost?}`: allowed on lines whose condition is Needs
  Repair, Not Operational or Broken (never Good or Lost); moves `quantity` units (<= movable) to the Good line (found or created
  as in section 1) and writes the log row. `GET .../equipment/<equip_id>/history/` returns that line's repairs and loans.

### 3. Loans

- New model per domain `...EquipmentLoan`: `equipment` (FK PROTECT), `member` (FK Farmer / Fisherfolk), `quantity` (>= 1),
  `status`, `origin` (`ORGANIZATION` | `MEMBER`), `requested_by` / `decided_by` / `returned_by` (users, null), `requested_at`,
  `decided_at`, `borrowed_at`, `due_date` (null), `return_requested_at`, `returned_at`, `return_breakdown` (JSON, e.g.
  `{"Good": 2, "Broken": 1}`), `member_note`, `reject_reason` (255).
- Statuses: `REQUESTED` (member asked; no units reserved), `BORROWED`, `RETURN_PENDING` (member says it is back),
  `RETURNED`, `REJECTED`, `CANCELLED` (member withdrew a request). Units are "out" while BORROWED or RETURN_PENDING.
- A line's figures: `on_loan` = units out; `available` = `quantity - on_loan` for a Good line, 0 for any other condition. Only Good
  units can be lent; a loan can never take more than `available`.
- Organization: `POST .../equipment/<equip_id>/lend/` `{member, quantity, due_date?}` creates a BORROWED loan at once (the member must
  be an ACTIVE member of this organization). `POST .../equipment-loans/<id>/approve/` turns a REQUESTED loan into BORROWED (re-checking
  `available` under the lock; 400 "Only N units are available" otherwise), `.../reject/` `{reason}`, and
  `.../return/` `{breakdown: [{condition, quantity}]}` (sum must equal the loan quantity; default all Good) closes it: the loan becomes
  RETURNED with `return_breakdown`; for each non-Good part the units move from the loan's line to that condition's line (section 1).
  `GET .../<pk>/equipment-loans/` lists the organization's loans (filters: `status`, `member` name, `equipment` name, `overdue`).
- Member (FARMER / FISHERFOLK account): `GET /api/organizations/my-equipment/` returns, for each organization the person actively
  belongs to, its lendable lines (Good, `available > 0`) and the person's own loans; `POST .../my-equipment/request/`
  `{equipment, quantity, due_date?, note?}` creates a REQUESTED loan (one open request per member per line);
  `POST .../my-equipment/loans/<id>/cancel/` (REQUESTED only) and `.../return/` (BORROWED -> RETURN_PENDING). The organization still
  confirms the return and sets the condition.
- Overdue = BORROWED or RETURN_PENDING with `due_date` before today (computed, never stored). No reminders.
- Every action that changes units re-reads the equipment line with `select_for_update` inside one transaction, so two people cannot
  borrow the same last unit.

### 4. Protections

- Removing a line that has units out, or any loan or repair history, is refused with a clear 409 message ("mark it Lost or Broken
  instead"); a line with no history is removed as today.
- An organization account only sees and acts on its own organization's lines and loans (another organization's ids are 404);
  staff may act on any. A member account only sees organizations they are an ACTIVE member of; a deactivated member's open loans stay
  on record and can still be returned by the organization.
- Notifications (via `notify_user`): a new request and a member's "I returned it" go to the organization account; an approval,
  rejection and confirmed return go to the member's own account (silently skipped when they have none). The bell sends the
  organization to `/my-organization?tab=borrowed` and the member to `/my-equipment`.

### 5. Screens

- **My Organization (organization account):** the Equipment tab's details dialog shows total / available / on loan, who holds the
  units, and the actions Change condition, Repair (Needs Repair / Not Operational / Broken lines), Lend, History and Remove. A new
  **Borrowed** tab (with a count of open requests) lists loans with the member's name, equipment, units, borrowed date, return-by date
  and an Overdue badge; its dialog offers Approve / Reject for requests and Mark returned (with the per-condition return form) for loans
  out. It has the same name search and filters as the other tabs (Status, Overdue only, Equipment). Phone and desktop use one layout.
- **My Equipment (FARMER / FISHERFOLK accounts that belong to an organization):** a new page `/my-equipment` with "Available to
  borrow" (request with units and an optional return-by date) and "My loans" (Cancel a request, "I returned it"), on phone and desktop.
  It is linked from the sidebar and from the organization row of My Profile; it is hidden for accounts with no organization.
- Staff's view of an organization keeps its table; the new conditions show with their own pill colours.

## Out of scope

Automatic overdue reminders, fees or deposits, lending between organizations, photos of damage, editing a line's total quantity,
reports/exports of loans, per-unit serial numbers.

## Risks and costs

- Splitting makes more lines over time; the empty-line hiding and merging into an existing line of the same condition keep it small.
- A member who never taps "I returned it" is still tracked: the organization can always mark the loan returned itself.
- A new migration (`associations`) adds the repair and loan tables and the two conditions; the live database must be migrated before the
  new code runs (see the standing note about unapplied migrations).

## Testing

Backend (throwaway MariaDB, mail blanked), both domains: condition change (split, merge into an existing line, hidden empty line,
moving more than movable refused, same-condition refused, units on loan cannot move); repair (log written, units to Good, refused on
Good/Lost, future date and negative cost refused); lend (units out, available shrinks, over-available refused, non-Good line refused,
inactive or foreign member refused); member request / cancel / approve / reject / return-request; return with a mixed breakdown moves
units to the right lines and the sums refuse a wrong total; remove protections (409 with units out or history); scoping (another
organization's ids 404, a non-member cannot request, a member sees only their organizations); notifications at each step; the race
(patched lock hook flips the line before the borrow so the second borrow is refused); overdue computed. Frontend: node checks for any pure
helpers (units summary, overdue, return-breakdown validation), lint compared with HEAD, build, and browser checks on the throwaway stack
(organization account: change condition, repair, lend, return with a breakdown, request approval; a member account: request, cancel,
return; phone and desktop width).

## Review focus (inputs the tests above do not name)

1. Returning a loan whose line was meanwhile reduced (other units moved to Broken): the loaned units still return to that line.
2. Two members requesting the last unit, both approved in a row: the second approval is refused with the available count.
3. A member who belongs to two organizations sees and borrows from each separately (no cross-organization ids).
4. Lost/Broken units that were borrowed stay attributed in the loan history and in the line's history.
5. Removing a line that only has an open request (no units reserved): refused like any line with history, never orphaning the request.
