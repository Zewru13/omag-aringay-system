# Organization account redesign: the system's own pages, on desktop and phone

Status: draft for review (2026-10-06). Nothing in this spec is built yet.

## 1. Goal

A farmers' or fisherfolk organization account should look and feel like the farmer and fisherfolk accounts do now:
the system's real pages (the same sidebar, header, tables, forms and modals staff use), limited to the
organization's own record, with the same phone layout. The organization's current purpose-built portal
(`OrganizationHomeScreen` and the `Org*Screen` files, about 4,000 lines, Filipino wording, its own look) is
replaced.

What the user said: "redesign the organization account, make sure it matches the system design UI and
functionalities, just like we did at fisheries and farmers accounts."

## 2. Decisions already made

| Question | Decision |
|---|---|
| Language | English, like the farmer and fisherfolk accounts |
| Abilities | Today's abilities **plus equipment** (the organization manages its own equipment list, which only staff can today). Nothing else is added |
| Approach | Reuse the existing admin pages in an "own organization" mode (the pattern used for farmers and fisherfolk), plus an own-organization backend rule. Not a restyle of the old portal screens |
| Both organization types | Farmers' organizations (`FARMERS_ORG`) and fisherfolk organizations (`FISHERFOLK_ORG`) get the same treatment, each on its own domain's pages |

An organization account keeps what it can do today: view and add members, deactivate or reactivate a member, assign
officers and view officer history, report assistance (to one member, or distribute to several), view the history of
what it reported, edit a submission that has not yet become citizen-facing, confirm receipt on behalf of members
who have no account, and see and update its own profile (contact number, picture, password, change requests).
New: add and remove its own equipment.

## 3. Out of scope

- Crop or pond records of members, disaster reporting, editing member profiles (none of these exist today).
- Editing the organization's registration details (staff only; the organization requests changes as today).
- Setting a member's "main organization" and ending an officer's term early (staff only today, stay staff-only).
- The farmer and fisherfolk accounts, and the staff pages' behaviour (unchanged).
- A Filipino version of the new screens.

## 4. Backend: the "own organization" rule

The organization-scoped permission already exists: `IsOwnOrgOrStaff` plus `org_linked_record_type`
(`accounts/permissions.py`). It compares the linked record TYPE as well as the id, so a fisherfolk organization can
never match a farmers' organization with the same number. Most organization routes already use it. The gaps:

| Route (both domains) | Now | After |
|---|---|---|
| `organizations/<type>/<pk>/` GET (organization detail with members, officers, equipment, officer history) | staff only | own organization may GET; PATCH stays staff. The staff-facing `citizen_account` block is left out of an organization's own response |
| `organizations/<type>/<pk>/equipment/` POST | staff only | own organization or staff |
| `organizations/<type>/equipment/<equip_id>/` DELETE | staff only | own organization (the equipment's organization must be the caller's, type included) or staff |

Already open to the organization and own-scoped (reviewed, no change expected): members list/add and member
search (`<pk>/members/`, `<pk>/member-search/`), the organization-scoped activate/deactivate
(`<pk>/members/<id>/`), officers list/assign and history (`<pk>/officers/`), distribute assistance,
assistance history, accountless confirmables, confirm on behalf, individual assistance create, and the profile
requests and picture.

Stay staff-only: organization create/edit/import, member set-main, officer end-term, every farmer/fisherfolk
registry route.

### Backend tests (written first)

Own organization works; another organization's id is refused (403/404) on every route above; a fisherfolk
organization with a matching id number cannot reach a farmers' organization route, and the reverse; a farmer, a
fisherfolk and an unlinked citizen are refused; staff unchanged; an organization cannot PATCH its own record or
reach any staff-only route (a sweep like the farmer one). Two-organization isolation: neither sees the other's
members, equipment or history. The whole suite (191 tests) stays green.

## 5. Frontend

### Routing and navigation
- `AuthContext` gains `isOrg` (and the organization's domain: farmers or fisherfolk); `ProtectedRoute` gains
  `allowOrg`.
- Desktop sidebar for an organization (`ORG_NAV`, plain top-level links like `FARMER_NAV`): **My Organization**
  and **Assistance**. Profile and Help are in the header menu (the sidebar has no My Profile entry). The landing
  page (`/my-account`) forwards to My Organization on desktop.
- Phone (under 768 px): the shared `CitizenPhoneShell` gains an organization role (green for a farmers'
  organization, blue for a fisherfolk one) with three tabs: Home, Organization, Assistance, and the same avatar
  menu (My Profile, Help, Log out).

### My Organization (the existing `OrganizationDetailPage` in own-organization mode)
Routed at `/my-organization`; the type and id come from the signed-in account's linked record, not the URL.
- Shows the organization's registration and contact details, the **Members** tab, the **Equipment Inventory** tab
  and the **Officers** table with Officer History, in the page's existing tables and modals.
- The write actions are allowed for the organization: Add Member, Deactivate/Reactivate (through the
  organization-scoped route, with the reason as today), Add Equipment, Remove Equipment, Assign Officer.
- Hidden in this mode: Back to Organizations, Activate Account, Set Main, End Term Early.
- Phone: tables become cards via the shared `DataTable` where the page already uses it; the rest of the page is made
  to fit 375 px.

### Assistance (the existing assistance page of the organization's domain, in own-organization mode)
Crop Assistance for a farmers' organization, Fisheries Assistance for a fisherfolk organization.
- **History**: what this organization reported (`my-org-beneficiary-history` and the fisherfolk equivalent), with
  the farmer-style status names (Received, Not Received, Pending, Awaiting Confirmation).
- **Report Assistance**: to one member (the member picker is limited to the organization's own members) or to
  several (the existing Distribute modal with the organization fixed to the caller's own).
- **Edit** a submission only while it is still editable (the backend's pending-only rule), as today.
- **Confirm for Members**: the members without an account whose receipt the organization may confirm on their
  behalf (the existing accountless-confirmables list and confirm-on-behalf action).
- Staff tools stay hidden: import, the staff organization picker, resolving follow-ups.

### My Profile / Help
`/my-profile` and `/my-help` gain an organization version (`OwnProfilePage`/`OwnHelpPage` dispatch like the
farmer and fisherfolk ones): the existing organization info, contact number, picture, password and change-request
logic, shown inside the normal page layout, and English help text for organization accounts.

### Phone Home (new `OrgPhoneHome`, like `FarmerPhoneHome`)
Four tiles (active members, officer positions filled of the domain's total, assistance reported this year,
members awaiting confirmation) and quick actions (Report Assistance, Members, Officers), reading the same
endpoints the old home read.

### Retiring the old portal
After the new routes are verified: remove `OrganizationHomeScreen`, the `Org*Screen` files and their dashboard
parts. `orgDomainConfig.js` stays because it holds the organization endpoints; its Filipino wording is replaced or
unused. Shared citizen components and the other accounts' screens stay. This is the last phase, so the old portal
remains available until the new screens pass.

## 6. Risks and how they are covered

- **Data exposure** (an unscoped route shows another organization's data): per-route tests, a staff-only sweep and
  a two-organization isolation test; the type check closes the id-collision case between the two domains.
- **Opening the detail view leaks staff data**: the organization's response omits `citizen_account`; a test checks
  it, and PATCH stays refused.
- **Staff pages regress** (the organization page and both assistance pages are large and shared): every change is
  behind `isOrg`; staff screens are re-checked in the browser; build and lint are compared with the committed
  versions.
- **Farmer and fisherfolk regress** (shared phone shell and header): the existing roles' views are re-checked.
- **An organization with no members or no officers**: empty states with an explanation, not blank tables.

## 7. Phases (each usable on its own)

1. **Backend rule and tests** (section 4). Done when the sweep and isolation tests pass and the suite is green.
2. **Desktop organization mode**: routing, `ORG_NAV`, My Organization, Assistance, Profile and Help. Done when an
   organization account can do everything in section 2 through the system's pages on a desktop-size window and
   nothing outside it.
3. **Phone**: the organization role in the shared shell, `OrgPhoneHome`, the three tabs. Done when the same is
   true at 375 px.
4. **Retire the old portal**, then update the help text.

## 8. Verification at the end of each phase

Backend tests and the full suite; browser checks as a farmers' organization and as a fisherfolk organization
(desktop and 375 px), as staff, as a farmer and as a fisherfolk (to prove nothing moved); frontend build; lint
compared with the committed versions. Writes (add member, equipment, report assistance) are exercised only on a
throwaway database with its own backend, never on the live server; the live server is checked read-only.
Temporary login tokens are short-lived and nothing's password is changed.

## 9. Open items to settle while planning

- How the single-member assistance form limits the picker to the organization's members (a member-search source
  passed into the existing form, versus a small wrapper).
- Whether the organization's profile reuses `OrgInfoScreen` through a new embeddable mode (preferred, like
  `CitizenProfileScreen`'s `bare`) or is extracted into a shared component.
- Exact English wording for the organization help text (drafted from the existing Filipino help).
