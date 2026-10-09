# Cycle G — Assistance distributions: confirm-before-received, member selection, grouped history, and duplicate RSBSA choice

Date: 2026-10-09. Second request round from the user (six items). Cycles A-F are committed and pushed on branch
`cycles-a-to-f-english-only`; this cycle is built on top of it.

## The request (user's words)

1. "Duplicate registration citizen should have choice between the duplicate whether to accept each one from them. The user
   should choose or reject both from the duplicate user to register."
2. "In assistance table history the header 'Date Given' should be 'Date and Time' and the Action should be Remove from the list
   not Edit."
3. "...to distribution to organization we should be able to select or unselect a member in the form, so in case a member is not
   valid for that assistance it is easy for the user to just unselect the name of invalid member and distribute to all other
   valid members."
4. "...error in giving assistance, it is already received even if the member hasn't confirmed it yet to their account please fix
   that, wait for the member to confirm or the organization to confirm before marked received."
5. "...the history should be a whole set of assistance not per member assistance received, for example in the history it shows the
   assistance given today and when clicked it will drop down or expand to all the users given."
6. "Add also the filters that is applicable to the organization. I'll leave that to you."

Answers to my questions:
- Item 1 is about duplicate RSBSA numbers on the RSBSA import (rows flagged "Duplicate In File"), not names or birthdates. The
  chosen behaviour: show the duplicate rows side by side; accept ONE or reject ALL.
- Item 4: every new record, however it was logged, waits for confirmation.
- Item 2: removing keeps the record in the database for audit, takes it out of the lists and counts, and the member can no longer
  receive (confirm) it.
- Item 5: records made before this change are grouped automatically into distributions.
- Assumptions I stated and the user accepted by proceeding: the grouped history applies to the organization's history (staff
  screens keep one row per record, with Edit); Remove works on one member entry and on a whole distribution; a member who has
  already confirmed cannot be removed.

## What the code does today (verified)

- `interventions.models.BeneficiaryRecord` / `FisherfolkBeneficiaryRecord`: `save()` sets `status` on creation to `CONFIRMED` when
  `date_given <= today`, else `PENDING` (`DistributionStatus`: PENDING, AWAITING_CONFIRMATION, CONFIRMED, NOT_RECEIVED,
  RESOLVED). There is no creation timestamp, no link between the records of one distribution, no removal concept.
  `interventions.lifecycle.advance_due_distributions` moves PENDING to AWAITING_CONFIRMATION lazily when the date arrives and
  notifies the recipient; `notify_assistance_recorded` only notifies for records that are already CONFIRMED.
- `associations.views._run_organization_distribution` creates one record per active member (each in its own transaction) with
  `distributed_by_organization`, after a 30-day cross-organization block check; `dry_run` previews. The request serializer is
  `OrganizationDistributionRequestSerializer`; the members are always "every active member". Frontend:
  `DistributeAssistanceModal.jsx` (3-step wizard).
- Organization history: `MyOrgBeneficiaryHistoryView` / `MyOrgFisherfolkBeneficiaryHistoryView` return one row per record
  (`recorded_by = the organization account`). Pages: `CropAssistancePage.jsx`, `FisheriesAssistancePage.jsx` (columns `Date Given`,
  `Member`, ..., `Actions` with Edit via `EDITABLE_STATUSES`).
- `PendingOnlyEditMixin` (cycle F follow-up): an organization edits only PENDING records.
- RSBSA import (`farmers.rsbsa_import_views`, `RsbsaImportModal.jsx`): a second and later row with the same RSBSA number gets status
  `duplicate_in_file` with `underlying_status`; select-all skips them; the commit view refuses a batch containing two rows for
  one RSBSA number.

## Decisions

### 1. Duplicate RSBSA rows: side-by-side, accept one or reject all (frontend only)

In `RsbsaImportModal.jsx` the rows of one duplicate group (same RSBSA number) are shown as one group: a "Duplicate RSBSA — choose
one" panel listing the rows side by side (row number, name, barangay, contact number, the fields that differ from the existing
record, and what committing it would do). Staff choose exactly one row (radio) or "Reject all rows for this RSBSA number". The
choice maps onto the existing selection set (the chosen row selected, the others deselected; reject all = none selected), so the
commit view and its one-row-per-RSBSA rule are unchanged. A group with no choice made is shown as undecided and cannot be
skipped silently: the Commit step lists "N duplicate groups need a decision". The preview response already carries everything
needed (`duplicate_in_file`, `colliding_rows` / `duplicate_of_row`); the backend only exposes the group key if it is missing.

### 2. New record states and the "received" rule (item 4)

- New records start `AWAITING_CONFIRMATION` when `date_given <= today` and `PENDING` when in the future — for every path (staff
  Log Assistance, organization single-member report, organization distribution), in both models' `save()`. Nothing is
  CONFIRMED until the recipient confirms, or an organization confirms on their behalf (the existing on-behalf request,
  approved by staff). Records already CONFIRMED stay as they are.
- `notify_assistance_recorded` notifies for an AWAITING_CONFIRMATION record ("needs your confirmation"), unchanged otherwise; the
  recipient's Confirm / Not received screens already handle that state.
- The 30-day cross-organization check keeps counting any non-removed record, whatever its status.
- The seed command `seed_fisheries_demo_data` that depends on the old rule sets its statuses explicitly.

### 3. Removal that keeps the record (item 2)

- New `DistributionStatus.REMOVED` plus `removed_at` (DateTimeField, null) and `removed_by` (FK to the user, null, SET_NULL) on both
  record models. The model's default manager excludes REMOVED rows so lists, histories, reports, counts, farmer/fisherfolk views and
  the 30-day check ignore them by construction; a second manager `all_objects` returns everything for audit.
- `POST /api/interventions/assistance-removals/` with `{domain: 'crop'|'fisheries', record_ids: [..]}` or
  `{domain, distribution: <group id>}` (the whole distribution): allowed for the organization account that recorded them (and
  staff). Only records in PENDING or AWAITING_CONFIRMATION are removed; CONFIRMED, NOT_RECEIVED and RESOLVED are kept and reported
  back (`removed`, `kept` lists with reasons). One transaction; removing records that are already REMOVED is a no-op. The recipient
  can no longer confirm or report it (the confirm endpoints already refuse anything not AWAITING_CONFIRMATION; the removed row is
  also absent from their list). A record removed after the recipient was notified leaves the notification in place but the screen
  it points to no longer lists it.
- Audit: the removal is written to the existing audit log (`auditlog`) with actor, record and time.

### 4. Choose members in the distribute form (item 3)

- `OrganizationDistributionRequestSerializer` gains optional `member_ids` (list of ids of the domain's people). When present,
  `_run_organization_distribution`'s member list is the organization's ACTIVE members whose person id is in the list; an id that is
  not an active member of that organization is a 400 (nothing is silently dropped); an empty list is a 400
  ("Select at least one member"). Absent = every active member, as today (backward compatible).
- `dry_run` (the review step) always lists the whole roster so the checklist can be built from it; the confirm step sends the
  selected `member_ids`.
- `DistributeAssistanceModal.jsx`: the review step shows every member with a checkbox (checked by default), Select all / Clear,
  a live "N of M selected" count, members the 30-day rule would block shown disabled with their reason, and the summary
  (will receive / blocked) computed from the selection. Confirm is disabled with none selected.

### 5. Distributions as a unit and grouped history (items 2 and 5)

- Both record models gain `distribution_batch` (UUIDField, null, indexed) and `recorded_at` (DateTimeField, null; set to now on
  creation by `save()`; old rows stay null). Organization distributions and the single-member report set a fresh batch id per
  submit (a batch of one for the single-member report).
- New endpoints `GET /api/interventions/my-org-distributions/` (and the fisheries mirror) returning, for the caller's
  organization, one item per distribution:
  `{ id, assistance_type, source_agencies, quantity, date_given, recorded_at, member_count, status_counts: {AWAITING_CONFIRMATION,
  CONFIRMED, NOT_RECEIVED, PENDING, RESOLVED}, summary_status, members: [{record_id, person_id, name, status, confirmed_at}] }`.
  The group id is the batch id; records without a batch are grouped per (recorded_by, assistance_type, date_given, quantity,
  sorted source_agencies) with the id `legacy-<hash of that key>`, so history before this change shows as distributions too.
  `summary_status` is one of: `Awaiting confirmation` (any member awaiting or pending), `Needs follow-up` (any NOT_RECEIVED), `Confirmed`
  (all confirmed/resolved). Server-side filters (item 6) apply before grouping. The endpoint is not paginated for the organization's
  own data size today; groups are sorted by `date_given` then `recorded_at`, newest first.
- The existing per-record history endpoints stay (other screens use them).

### 6. Organization history table and filters (items 2, 5, 6)

- `CropAssistancePage.jsx` / `FisheriesAssistancePage.jsx` in organization mode ("History" tab): columns `Date and Time`
  (`Oct 9, 2026 · 3:41 PM`; legacy rows show the date only), `Assistance`, `Quantity`, `Members`, `Status` (summary badge plus
  counts), `Action`. Clicking a row expands it to the members (name, status pill, confirmed time, and a per-member
  "Remove from the list" while the member is not yet confirmed). The row's Action is **Remove from the list** (whole
  distribution, with a confirmation naming how many entries will be removed and how many stay because already confirmed).
  Edit is gone from the organization's history. Staff screens are unchanged (`Date Given`, Edit).
- Filters for the organization history, in one filter bar: Status (Awaiting confirmation, Confirmed, Needs follow-up, Pending),
  Assistance type, Date range (from / to), Member name (matches any member in the distribution, and the expansion highlights it),
  Source agency. Filters apply server-side as query parameters on the distributions endpoint; "Clear filters" resets.
- English strings only; no new Tagalog.

## Out of scope

Grouped history on staff screens; editing a distribution after it is created; re-adding a removed member to a distribution
(distribute again instead); un-removing; removing confirmed entries; notifications to recipients about removal; paging of the
distributions list; changes to the confirm-on-behalf approval flow; showing REMOVED rows anywhere except the audit log.

## Risks and costs

- Changing the default manager affects every query on both record models; the removal tests and the existing suite (full run)
  guard against a leak. Anything that must read removed rows uses `all_objects`.
- Records created before this ships keep their old statuses; staff screens will show a mix of Confirmed (old) and Awaiting
  Confirmation (new) — intended.
- Today's date records now wait for the member. A member without an account can only be confirmed through the existing on-behalf
  request, which needs staff approval — so "received" for such members is slower than before. Intended by item 4.
- Two migrations (`interventions` new fields on both models) must be applied on the live database before the code is deployed.

## Testing

Backend (throwaway MariaDB, mail blanked): creation status for today / past / future dates on both models and on all three
creation paths; the recipient is notified when a record is created awaiting; distribute with `member_ids` (subset, all, empty,
foreign id, deactivated member), `dry_run` unchanged; batch id and `recorded_at` set; the distributions endpoint (grouping by
batch, legacy grouping, counts, `summary_status`, each filter, another organization's records never appear); removal (single,
whole distribution, confirmed kept, already removed, another organization's record refused, recipient cannot confirm a removed
record, removed rows absent from every list/history/report count and from the 30-day check, audit log entry); default manager
vs `all_objects`. Frontend: a node check of any pure helpers (selection summary, duplicate-group choice, date-and-time format),
lint compared with HEAD, build, and browser checks on the throwaway stack: distribute with unticked members, the grouped
history expanding, per-member and whole-distribution removal, the filters, and the RSBSA duplicate-group picker.

## Review focus (inputs the tests above do not name)

1. A distribution whose members have mixed statuses, partly removed: counts and summary exclude removed rows.
2. Two organizations distributing the same type, date and quantity: legacy groups never mix organizations.
3. Removing while the recipient is confirming at the same moment: the removal re-reads under a lock and refuses a record that just
   became CONFIRMED.
4. A member deactivated after being distributed to: they still appear in the old distribution.
5. The RSBSA duplicate picker with three rows for one number, and with rows whose underlying statuses differ.
