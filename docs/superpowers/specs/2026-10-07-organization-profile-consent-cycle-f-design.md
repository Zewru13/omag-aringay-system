# Cycle F — Organization profile changes with the consent of the Admin and the Focal Person

Date: 2026-10-07. Last of six cycles from the user's 12-item request (item 12). Cycles A-E are committed.

## The request (user's words)

12. "organization profile update like farmers/fisherfolk with the consent of admin and focal person"

Answers to my questions: a reviewed organization change needs BOTH an Admin and a Focal Person to approve; the new requestable
organization fields are email and contact person (registration number, agency and dates stay staff-only).
"Focal Person" is the existing `EVALUATOR` role.

## What the code does today (verified)

- Citizen self-service lives in `core/profile_self_service.py`: logo and contact number apply instantly
  (`ProfileImageUploadView`, `ContactNumberUpdateView`); name, barangay and street address (organizations) and name and
  barangay (farmers, fisherfolk) go through `core.models.ProfileChangeRequest` (`REQUESTABLE_FIELDS` per record type), filed with
  `MyProfileChangeRequestView` (one row per field, duplicate-pending check under `select_for_update`), reviewed by
  `StaffChangeRequestListView` / `StaffChangeRequestDecisionView` (`/staff/change-requests/`, `.../<pk>/approve|reject/`,
  `IsAdminOrEvaluator`): ONE staff approval writes the value onto the record (atomic with the status change) and notifies the
  requester; a rejection stores an optional reason. `notify_staff` notifies every other active Admin and Evaluator.
- The organization account page (`OrgAccountPages.jsx`) has the `REQUESTABLE` list (name, barangay, street address), shows the
  request history with `Pending review / Approved / Rejected` and a rejection reason. The staff queue is the "Pending Change
  Requests" panel of `StaffDashboard.jsx` (approve / reject buttons per request).
- `ProfileChangeRequest` columns: record type and id, `field_name`, `old_value`, `requested_value`, `status`, `requested_by`,
  `requested_at`, `reviewed_by`, `reviewed_at`, `rejection_reason` (the partial unique constraint does not exist on MySQL).
- Organization fields: `email_address` (EmailField, required in the staff forms) and `contact_person` (CharField 150) on both
  organization models; email is where cycle B's emailed temporary password goes.
- There is a single active Admin at a time (`_deactivate_other_admins`) and any number of Focal Persons.

## Decisions

### 1. Two approvals for organization changes (organizations only)

`ProfileChangeRequest` gains: `requires_both` (bool, default False), `admin_approved_by` / `admin_approved_at`,
`focal_approved_by` / `focal_approved_at` (nullable). One additive migration; every existing row keeps `requires_both=False`
and behaves exactly as before.

- A request filed by an organization account (record type `FARMERS_ORG` or `FISHERFOLK_ORG`) is created with
  `requires_both=True`. Farmer and fisherfolk requests are unchanged (`requires_both=False`).
- `StaffChangeRequestDecisionView.approve` on a `requires_both` request records the approval for the caller's role (Admin →
  admin fields, Evaluator → focal fields) and returns the updated request:
  - the first approval leaves the request `PENDING`, writes nothing to the record, and notifies the requester ("approved by the
    Admin / the Focal Person, waiting for the Focal Person / the Admin") and the staff of the other role;
  - the second approval (from the other role) applies the value to the record and sets `APPROVED`, `reviewed_by` = the second
    approver, `reviewed_at`, in the SAME transaction (row-locked read of the request first, so two simultaneous second approvals
    cannot both apply), and notifies the requester;
  - a second approval from a role that has already approved is refused: 400 "The Admin already approved this request." (or the
    Focal Person); a user never counts for both roles.
- `reject` by either role at any time sets `REJECTED` with the reason, regardless of earlier approvals; nothing was written yet.
- The check "the value still differs from the current record value" is repeated when the second approval applies it; if the record
  already holds the requested value, the request is approved without a write.
- The serializer returns `requires_both`, `admin_approved_by_name`, `admin_approved_at`, `focal_approved_by_name`,
  `focal_approved_at`, and `awaiting` (a list: `['ADMIN']`, `['EVALUATOR']`, both, or `[]` once decided) so screens do not
  recompute it.
- The citizen-facing history and the staff list use the same serializer; `reviewed_by` stays the person who completed or
  rejected the request.

### 2. New requestable organization fields

`REQUESTABLE_FIELDS` for `FARMERS_ORG` and `FISHERFOLK_ORG` becomes name, barangay, street_address, `email_address`,
`contact_person`. `FIELD_LABELS` gains `email address` and `contact person`.

- `email_address`: the value is trimmed, must be a valid email (`django.core.validators.validate_email`), may not be empty, at most
  254 characters; compared case-insensitively with the current value for the "already the current value" rule.
- `contact_person`: trimmed, may not be empty, at most 150 characters (the model limit).
- Applying an approved change writes the column (`update_fields`) exactly like the existing fields.
- Registration number, agency, dates and the account's login stay staff-only.

### 3. Organization screens

- `REQUESTABLE` in `OrgAccountPages.jsx` gains Email address and Contact person (email input type for the first); the form uses
  `EmailInput` for the email field.
- Request history: a pending request shows "Waiting for approval from the Admin and the Focal Person" with a line per role
  ("Admin: approved Oct 7" / "Admin: pending", same for the Focal Person); a rejected one keeps its reason.

### 4. Staff screens

- The "Pending Change Requests" panel (`StaffDashboard.jsx`) shows, for a `requires_both` request, "Admin ✓ / Focal Person pending"
  (the approvals that exist); the logged-in role's Approve button is disabled with the title "You already approved this" once that
  role has approved; Reject stays available. Requests with `requires_both=false` look as today.
- The record name and the field label read naturally for the two new fields (`email address`, `contact person`).

## Out of scope

Two-approval review for farmers and fisherfolk; changing which fields farmers and fisherfolk can request; registration number,
agency and date self-service; a delegated approver when a role has nobody active; a time limit on pending requests.

## Risks and costs

- If no active Admin or no active Focal Person exists, an organization's reviewed change cannot complete; the staff queue shows
  which approval is missing, and staff can still edit the organization directly.
- An approved email change redirects later emailed passwords to the new address; both an Admin and a Focal Person have approved
  it, which is the point of the two-approval rule.
- Existing pending organization requests (filed before this ships) stay single-approval.

## Testing

Backend (throwaway database; tests only): first approval by an Admin does not write the record and returns the request pending
with `awaiting == ['EVALUATOR']`; the Focal Person's approval then writes the value and sets `APPROVED` (and the same in the other
order); the same role approving twice is refused; one user cannot count for both roles; reject by either role after one approval
leaves the record untouched; two simultaneous second approvals apply once (simulate with the status flipped by a hook between
read and write, as the confirmation race test does); an organization request is created with `requires_both=True` and a farmer
request with `False`; an old pending request (`requires_both=False`) still completes on one approval; the two new fields: valid
email accepted, invalid / blank / unchanged-by-case refused, contact person blank refused / over 150 refused, approved values
written to both organization models; the requester and the other role are notified at each step; notification text for each
case; serializer fields.
Frontend: build, lint compared with HEAD, a node check of any pure helper (the "who is still needed" label), and browser checks on
the throwaway stack (mail credentials blanked): the organization requests an email change; the Admin approves (the request
stays pending, the organization page shows Admin approved), the Focal Person approves (applied, record shows the new email); a
reject path; the dashboard buttons for each role.

## Review focus (inputs the tests above do not name)

1. An Admin who is later deactivated or replaced (a new Admin is created) after approving: the approval still counts.
2. A user whose role changes between the two approvals.
3. Two pending requests for different fields of the same organization approved in opposite orders.
4. An email change to an address already used by another organization or a staff user (allowed; the email is not a login).
5. A rejection reason longer than 255 characters (already truncated by the existing code) and rejecting an already-approved-once request twice.
