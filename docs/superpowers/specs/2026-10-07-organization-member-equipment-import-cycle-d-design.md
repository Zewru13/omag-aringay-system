# Cycle D — Import members and equipment for organizations

Date: 2026-10-07. Fourth of six cycles from the user's 12-item request (item 7). Cycles A-C are committed.

## The request (user's words)

7. "import file member/equipment (bulk or single) for organizations"

Answers to my questions: members are matched to ALREADY-REGISTERED people only; the import is available to staff AND to the
organization's own account (never another organization's).

## What the code does today (verified)

- A member is a join row: `FarmersOrganizationMember(organization, farmer, position, date_joined, is_active, is_main)` and
  the fisherfolk twin `FisherfolkOrganizationMember(organization, fisherfolk, ...)`, unique per (organization, person).
  `FarmersOrganizationMemberAddView.perform_create` / `FisherfolkOrganizationMemberAddView.perform_create` reject a person who
  is already a member, save the row, then call `_resolve_and_assign_main(member, other_active_memberships, person_barangay,
  explicit_is_main)`. Only staff may pass an explicit `is_main`; an organization account never does. When the person has other
  active memberships, no explicit choice, no unique barangay match and no existing main, the call raises `MainChoiceRequired`
  (HTTP 400). Positions are the `Position` choices on the model (President ... Member; default Member). `date_joined` is
  required and may not be in the future (`FarmersOrganizationMemberSerializer.validate_date_joined`).
- RSBSA numbers are unique on both `Farmer` and `Fisherfolk` (`rsbsa_number`, unique, validated), so a row can be matched by
  RSBSA number in either domain. The Add Member search (`*AddCandidateSearchView`, `IsOwnOrgOrStaff`) already lets an
  organization account find any registered person of its own domain by name or RSBSA number, so an import adds no new
  visibility.
- Equipment is `*OrganizationEquipment(organization, equipment_name (choices), equipment_name_other, quantity (positive int),
  condition (Good / Needs Repair / Not Operational), acquisition_date (optional), remarks)`; the serializers refuse a future
  acquisition date. Add and remove views exist (`*EquipmentAddView`, `*EquipmentRemoveView`), `IsOwnOrgOrStaff` with
  `org_linked_record_type`.
- The organization file import (`associations/views.py`: `_run_organization_import`, `_import_organizations`,
  `*ImportTemplateView`) and `core.utils.read_template_rows` (header row found by content, sample row and note line
  skipped, max 1000 rows) and the frontend `ImportFileModal` (template download, preview, confirm) already exist; the
  import response is `{created, errors, dry_run, summary, rows[{row, status, label, detail}]}` and the modal maps row statuses
  to labels and tones.
- `core.utils.run_import_atomically` runs an import as one all-or-nothing transaction.

## Decisions

### 1. Endpoints (one set per domain, scoped to one organization)

For `farmers` and `fisherfolk`, under `/api/organizations/<domain>/<pk>/`:

- `members/import/` (POST, multipart `file`, `dry_run`) and `members/import/template/` (GET, xlsx download);
- `equipment/import/` (POST) and `equipment/import/template/` (GET).

Permission `IsAuthenticated + IsOwnOrgOrStaff` with `org_linked_record_type` on each view, exactly like the add views, so staff
can import into any organization and an organization account only into itself (a different organization's id is a 403/404 as
for the add views today). The organization must exist (404 otherwise).

### 2. Members file

Template headers: `RSBSA Number`, `Position`, `Date Joined (YYYY-MM-DD)`, with a note line listing the valid positions.
Each row, in order:

- the RSBSA number is trimmed and matched exactly (case-insensitive) to a registered person of the organization's domain;
  none found → `not_found` ("No registered farmer/fisherfolk has this RSBSA number. Register them first.");
- the position is matched case-insensitively to the `Position` choices (blank means Member); otherwise `invalid`;
- the date is parsed like the organization import (Excel date cells, `YYYY-MM-DD`), required, not in the future; otherwise `invalid`;
- the same RSBSA number earlier in the file → `duplicate_in_file` (the later row);
- the person is already a member of this organization (active or not) → `already_member` ("already a member");
- otherwise the membership is created with the SAME logic as the Add Member view (position, date joined, then
  `_resolve_and_assign_main` with `explicit_is_main=None`, so even staff imports never set main explicitly); if that raises
  `MainChoiceRequired` the row is `needs_main_choice` ("This person is in other organizations and needs a main-organization
  choice: add them with the Add Member form.") and nothing is created for that row.

A matched row's label shows the person's full name and RSBSA number (the same visibility as the Add Member search). The
person's own `is_active` flag is not checked, matching the Add Member form today.

Dry run and confirm run the same code. Each row runs inside its own savepoint; in a dry run every savepoint (and the whole
transaction) is rolled back, so the preview shows exactly what the confirm will do, including the main-organization rule.
A confirm is one transaction; an unexpected database error saves nothing (409, as the organization import does).

### 3. Equipment file

Template headers: `Equipment`, `Quantity`, `Condition`, `Acquisition Date (YYYY-MM-DD)`, `Remarks`, with a note line listing
the valid equipment names (the domain's `EquipmentName` list) and conditions.

- `Equipment`: matched case-insensitively and ignoring extra spaces to the domain's `EquipmentName` choices; a name that is not
  in the list is recorded as `Other` with the typed text in `equipment_name_other`, and the row detail says "Recorded as Other:
  <text>". Blank → `invalid`. When the name is `Other` itself, `equipment_name_other` is required (`invalid` if blank).
- `Quantity`: a positive whole number (Excel numbers like `2.0` accepted); otherwise `invalid`.
- `Condition`: case-insensitive match to Good / Needs Repair / Not Operational; otherwise `invalid`.
- `Acquisition Date`: optional; parsed like above; not in the future; otherwise `invalid`.
- Duplicate: the same equipment name (and `equipment_name_other`, compared with `core`-style trimmed case-folded text),
  condition, quantity and acquisition date as an existing row of this organization → `already_exists`; the same key earlier in
  the file → `duplicate_in_file`. So uploading a file twice cannot double the inventory.
- Rows are created through the domain's `*EquipmentSerializer`, so the same validation as the Add Equipment form applies.

### 4. Response, statuses and frontend

- Response: the organization import's shape (`created`, `errors`, `dry_run`, `summary`, `rows`) with `summary` counting `ready`,
  `already_member` / `already_exists`, `duplicate_in_file`, `not_found`, `needs_main_choice`, `invalid`.
- `ImportFileModal` gains the new statuses (labels and tones: `already_member`, `already_exists`, `not_found`,
  `needs_main_choice`) and takes the summary tiles from the response instead of the four fixed ones when the response says
  which to show; the organization import and the assistance imports keep their current look.
- `OrganizationDetailPage.jsx`: an "Import Members" button beside "Add Member" and an "Import Equipment" button beside "Add
  Equipment", in both the staff view and the organization's own view (`own`), opening `ImportFileModal` with the right URLs;
  on a confirmed import the member or equipment list reloads.

## Out of scope

Registering unknown people from the file; setting a main organization from the file; officers; removing or deactivating members
by file; importing across several organizations in one file; equipment edit/update by file (rows only ever add).

## Risks and costs

- A person who needs the main-organization decision must be added one at a time through the Add Member form.
- A wrong import is undone one member or one equipment row at a time (existing remove actions).
- Two genuinely identical items entered on purpose in one file collapse to one row.
- An organization account can probe which RSBSA numbers are registered (`not_found` vs a name); this is what its Add Member
  search already allows.

## Testing

Backend (throwaway database; tests only): per domain — template downloads (headers, note line); members import: ready rows
create memberships with the right position and date, first-ever membership becomes main, `not_found`, `already_member`
(including an inactive membership), `duplicate_in_file`, invalid position / future date / missing date, case-insensitive and
spaced RSBSA match, `needs_main_choice` row skipped while other rows in the same file import, dry run creates nothing and
predicts the same statuses as the confirm, rollback on an unexpected error, a 1001-row file refused, wrong header refused;
equipment import: list match, unknown name → Other with text, `Other` without text invalid, quantity `2.0` accepted and `0`/`1.5`/text
invalid, bad condition, future date, `already_exists` vs a stored row and `duplicate_in_file`, dry run; permissions: staff
may import into any organization, an organization account only into itself (a different organization → 403/404), a farmer or
fisherfolk citizen account → 403, anonymous → 401, a farmers-organization account on the fisherfolk route → 403.
Frontend: build, lint compared with HEAD, a node check of the status/summary mapping if it is extracted as a pure function;
browser checks on the throwaway stack (mail credentials blanked): staff and the organization account each import members
and equipment through the modal, preview then confirm, lists reload.

## Review focus (inputs the tests above do not name)

1. A file whose RSBSA cell is a number (Excel stored `0103302...` without dashes or leading zeros) or has trailing spaces.
2. The same person on two rows with different positions (the first wins, the second is `duplicate_in_file`).
3. A person who is a member of the organization with an inactive membership (`already_member`, not re-activated).
4. A row that needs the main choice leaves no trace: no membership, and no change to any other membership's `is_main`, even though the earlier savepoint work of that row ran.
5. A confirm after the data changed since the preview (a person added by someone else in between): the confirm result, not the preview, is the truth.
