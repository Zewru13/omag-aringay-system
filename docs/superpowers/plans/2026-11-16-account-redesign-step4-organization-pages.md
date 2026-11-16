# Account redesign, step 4: the organization pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A farmers' or fisherfolk organization account gets Members, Equipment, Officers and Assistance pages built on the account kit. My Organization's six tabs are split up so no screen has more than three tabs.

**Architecture:** As in steps 2 and 3.
- Each page is a screen in `oma-frontend/src/pages/Account/` with a pure, tested rules module.
- `/my-organization` stays the address. A small router reads `?tab=` and shows the right page, so every link and notification keeps working.
- `/crop-assistance` and `/fisheries-assistance` show the organization's own Assistance page to an organization account.
- Every form and window is the existing one, exported from where it lives.

**Tech Stack:** React 19, Vite, Tailwind v4, react-router. Tests: `node --test "tests/*.test.mjs"`.

**Spec:** `docs/superpowers/specs/2026-11-16-account-redesign-design.md`.

## Global Constraints

Same as steps 2 and 3:
- Frontend only.
- The office (staff) organization page `/organizations/:type/:id` is unchanged, as are the farmer and fisherfolk screens.
- Every address keeps working: `/my-organization?tab=members|equipment|borrowed|borrowed-history|officers|confirmed`, `/crop-assistance?tab=confirm|history`, `/fisheries-assistance?tab=confirm|history`.
- An organization keeps every action it has today.
- Plain English; phone buttons at least 44px; no text under 13px in what this step adds.
- A failed load shows as failed.
- Branch `account-redesign-step4`; push only after the owner says yes.
- Scratch stack only.

## Rulings made while planning

- **Equipment has two tabs, not three.** The plan was Items / On loan / History. Today's Borrowed and Borrowed History tabs become one Loans list in sections: Requests, On loan, Returned.
  - Each request has Approve and Reject; each loan out has Mark returned.
  - Returned loans are listed under Returned.
  - This replaces `BorrowedPanel`'s list of borrowers that open onto their items with one row per loan.
  - The same dialogs (`RejectDialog`, `ReturnDialog`) and the same approve call are used.
- **Equipment items keep their per-condition actions in Details.** A row is one kind of equipment. Details opens a window holding the existing `EquipmentGroupBody`, which lists each condition with Change condition, Record repair, Lend, History and Remove. The page header keeps Lend equipment (several members at once), Add equipment and Import.
- **Confirm for members keeps choosing several at once.** The kit's record list gains an optional tick box per row, used with the existing `useConfirmSelection` and `ConfirmActionBar`. The records already confirmed for members are listed under it, using the existing `ConfirmedForMembersPanel` as it is.
- **One Distribute assistance button.** It opens a small window, "Give to one member" or "Give to all members". These open the existing `DistributeAssistanceModal` in people mode, or for the whole organization, exactly as the two buttons do today.
- **Home's organization to-dos stay links.** They are counts ("2 borrow requests to review"), so they open the page where the list is.
- **The windows defined inside the 1,576-line organization page are exported where they are.** These are Add member, Assign officer, End term, Officer history and Add equipment. Moving them would risk the staff page.

## Review Focus

1. A member who is no longer active: listed under Inactive, never offered as a borrower or an officer. Pinned in Task 2.
2. A loan in each state the server can send (`REQUESTED`, `BORROWED`, `RETURN_PENDING`, `RETURNED`, `REJECTED`, `CANCELLED`, overdue). Each lands in one section with the right buttons. Pinned in Task 3.
3. Old links: `?tab=borrowed` and `?tab=borrowed-history` open Equipment on Loans; `?tab=confirmed` opens Assistance on Confirm for members; `?tab=officers` opens Officers. Pinned in Task 2.
4. Confirm for members with nothing waiting: the tab says so, and the already-confirmed list still shows. Pinned in Task 5.
5. A farmers' organization and a fisherfolk organization each use their own endpoints and windows. Pinned in Tasks 2 and 5 (both domains in the tests).

---

## File Structure

New, in `oma-frontend/src/pages/Account/`:

| File | Responsibility |
|---|---|
| `myOrganization.js` | Pure. Domain config (farmers/fisherfolk), the `?tab=` routing, member sections, officer rows. |
| `orgEquipment.js` | Pure. Equipment rows from `groupEquipment`, loan sections and buttons. |
| `MyOrganizationRoute.jsx` | `/my-organization`: reads `?tab=` and shows Members, Equipment, Officers or sends `confirmed` to Assistance. |
| `useMyOrganization.js` | Loads `/organizations/<type>/<id>/` once per page; `reload()`. |
| `MyMembersPage.jsx` | Members: Active, Inactive. |
| `MyOrgEquipmentPage.jsx` | Equipment: Items and Loans tabs. |
| `MyOfficersPage.jsx` | Officers. |
| `MyOrgAssistancePage.jsx` | Assistance: To do, History, Confirm for members. |
| `ChooseDistributeWindow.jsx` | "Give to one member" / "Give to all members". |
| `TabBar.jsx` | The account kit's tab row (at most three tabs; 44px tall on a phone). |

Modified:
- `RecordList.jsx` and `recordList.js` (optional tick boxes).
- `Organizations/OrganizationDetailPage.jsx` (five `export`s).
- `accountRoutes.jsx` (organization branches in the two assistance routes).
- `App.jsx` (`/my-organization`).

---

### Task 1: The kit gains tick boxes and a tab row; the organization windows become importable

- [ ] **Test first** (`tests/orgShared.test.mjs`):
  - **`recordList.js` `selectionState(rows, selected)`** returns `{ all, some }`:
    - none selected → `{ all: false, some: false }`;
    - all selected → `{ all: true, some: true }`;
    - one of two → `{ all: false, some: true }`;
    - no rows → `{ all: false, some: false }`.
  - **`RecordList.jsx`:** holds `selectable` and a tick box with an `aria-label` naming the row.
  - **`TabBar.jsx`:** holds `role="tablist"` and `min-h-[44px]`.
  - **`OrganizationDetailPage.jsx`:** exports `AddMemberModal`, `AssignOfficerModal`, `EndTermModal`, `OfficerHistoryModal` and `AddEquipmentModal`.
- [ ] **Implement.** `RecordList` gets `selectable={{ selected: Set, onToggle(row), onToggleAll() }}`:
  - on a phone, a tick box sits before the title;
  - on a computer, a first column of tick boxes, with a header box that ticks every row.
- [ ] **Run it, then `npm test`; lint against `master`. Commit.**

### Task 2: Members, and the `/my-organization` router

**Interfaces — Produces** (`myOrganization.js`):
- `orgDomain(kind)`: everything that differs between a farmers' and a fisherfolk organization:
  - `type` (`'farmers'` | `'fisherfolk'`), the member name and RSBSA fields, and the person field;
  - the assistance address (`'/crop-assistance'` | `'/fisheries-assistance'`);
  - the distribution domain, and `FARMERS_ORG_DOMAIN` / `FISHERFOLK_ORG_DOMAIN`.
- `orgView(search)`: what `/my-organization` shows.

  | `?tab=` | Opens |
  |---|---|
  | `members` or none | Members |
  | `equipment` | Equipment on Items |
  | `borrowed`, `borrowed-history` | Equipment on Loans |
  | `officers` | Officers |
  | `confirmed` | A redirect to Assistance on Confirm for members |
  | unknown | Members |

- `MEMBER_SECTIONS`: Active (`is_active !== false`), Inactive.
- `memberText(m, domain)`: what the search reads.

- [ ] **Test first** (`tests/myOrganization.test.mjs`):
  - `orgView` for every value in the table above;
  - `orgDomain` for both kinds;
  - the sections;
  - the search text.

  Source checks:
  - `MyMembersPage.jsx` holds `RecordList`, `AddMemberModal`, `ImportFileModal`, `Add member` and `Import`;
  - `MyOrganizationRoute.jsx` holds `Navigate` (for `confirmed`) and the three pages;
  - `App.jsx` renders `MyOrganizationRoute` for `/my-organization`.
- [ ] **Implement.**
  - `MyMembersPage`: `AccountPage title="Members"`, helper "Everyone in your organization."
  - Main button: Add member. Import members sits beside it.
  - Columns:
    - Name (title)
    - RSBSA no. (hidden on a phone)
    - Position (badge)
    - Date joined
    - Main organization (Yes / No, hidden on a phone)
  - No row buttons: there are none today.
  - Search over name, RSBSA number and position.
- [ ] **Run; `npm test`; commit.**

### Task 3: Equipment

**Interfaces — Produces** (`orgEquipment.js`):
- `equipmentRows(equipment)` builds on `groupEquipment`: `{ id, label, units, summary, onLoan, available, lines }`.
- `LOAN_SECTIONS`: Requests (`REQUESTED`), On loan (`BORROWED`, `RETURN_PENDING`), Returned (everything else).
- `loanActions(loan)` gives the row's buttons:

  | Loan | Buttons |
  |---|---|
  | `REQUESTED` | Approve (main) and Reject |
  | `BORROWED` or `RETURN_PENDING` | Mark returned (main) |
  | anything else | none |

- `loanStatusText(loan)`:

  | Loan | Text |
  |---|---|
  | overdue `BORROWED` | Overdue |
  | `REQUESTED` | Requested |
  | `BORROWED` | On loan |
  | `RETURN_PENDING` | Return to confirm |
  | `RETURNED` | Returned |
  | `REJECTED` | Rejected |
  | `CANCELLED` | Cancelled |

- `sortLoans(rows)`: within a section, overdue first, then the newest.

- [ ] **Test first** (`tests/orgEquipment.test.mjs`):
  - one loan per state, plus an overdue one;
  - the rows from a two-condition sample (4 Good, 1 on loan, 2 Broken);
  - the sort.

  Source checks:
  - `MyOrgEquipmentPage.jsx` holds `TabBar`, `RecordList`, `EquipmentGroupBody`, `LendEquipmentForm`, `AddEquipmentModal`, `ImportFileModal`, `RejectDialog`, `ReturnDialog`, `/approve/`, `ChangeConditionDialog`, `RepairDialog`, `LendDialog`, `EquipmentHistoryDialog` and `ConfirmDialog` (for Remove).
- [ ] **Implement.**
  - `AccountPage title="Equipment"` with the helper "What your organization owns and lends."
  - Header buttons: Add equipment (main), Import, Lend equipment.
  - Two tabs: Items and Loans. The Loans tab shows the number of open requests, as Borrowed does today.
  - Items columns:
    - Equipment (title)
    - Units (right)
    - Condition (the summary)
    - On loan (right, hidden on a phone)
    - Available (right)
  - The row button is Details: a window holding `EquipmentGroupBody`, whose actions open the existing dialogs.
  - Loans columns:
    - Equipment (title)
    - Borrower
    - Units (right, hidden on a phone)
    - Borrowed date
    - Return by
    - Status (badge)
  - Loads `/organizations/<type>/<id>/equipment-loans/`.
- [ ] **Run; `npm test`; commit.**

### Task 4: Officers

- [ ] **Test first.** Extend `myOrganization.test.mjs`:
  - `officerRows(org)` lists current officers by position order (`OFFICER_POSITIONS`);
  - `isMember` false shows "Not a member".

  Source checks: `MyOfficersPage.jsx` holds `RecordList`, `AssignOfficerModal`, `EndTermModal`, `OfficerHistoryModal`, `End term` and `Officer history`.
- [ ] **Implement.**
  - `AccountPage title="Officers"`.
  - Header buttons: Assign officer (main), Officer history.
  - Columns:
    - Name (title)
    - Position
    - Term start
    - Term end (hidden on a phone)
    - Member ("Yes", or an amber "Not a member" badge)
  - Row button: End term early.
- [ ] **Run; `npm test`; commit.**

### Task 5: Assistance

- [ ] **Test first** (`tests/myOrgAssistance.test.mjs`).

  Source checks:
  - `MyOrgAssistancePage.jsx` holds `TabBar`, `OrgDistributionHistory`, `useConfirmSelection`, `ConfirmActionBar`, `ConfirmMembersDialog`, `ConfirmedForMembersPanel`, `ChooseDistributeWindow`, `DistributeAssistanceModal`, `accountlessConfirmablesUrl`, `confirmOnBehalfBulkUrl`, `selectable=`, and the tabs `To do`, `History` and `Confirm for members`;
  - `ChooseDistributeWindow.jsx` holds `Give to one member` and `Give to all members`;
  - `CropAssistanceRoute` sends a farmers' organization to `<MyOrgAssistancePage kind="orgFarm" />`;
  - `FisheriesAssistanceRoute` sends a fisherfolk organization to `<MyOrgAssistancePage kind="orgFish" />`.
- [ ] **Implement.**
  - `AccountPage title="Assistance"`; helper "Assistance your organization gave to its members."; main button "Distribute assistance".
  - The `?tab=` value picks the tab: `history` → History, `confirm` → Confirm for members, anything else → To do. Changing tabs updates the address.
  - **To do and History** are the existing `OrgDistributionHistory` (group `current` / `history`).
  - **Confirm for members:**
    - a `RecordList` of the confirmable records with tick boxes;
    - columns Member (title), Assistance, Quantity, Date given, Status (Pending review / Rejected: reason / Needs confirmation);
    - a row whose request is pending review cannot be ticked;
    - row button "Confirm" (for that one);
    - `ConfirmActionBar` above for the ticked ones;
    - then a heading "Already confirmed" and `ConfirmedForMembersPanel`.
- [ ] **Run; `npm test`; commit.**

### Task 6: Verify

- [ ] `npm test`, lint and the build pass.
- [ ] **Browser, both organization accounts at 390px and 1440px:**
  - Members; Equipment, both tabs; Officers (from More); Assistance, all three tabs;
  - each old `?tab=` link.
- [ ] **The work still saves:**
  - Approve a borrow request (create one first, as the farmer, from Borrow equipment);
  - Mark a loan returned;
  - Change a condition;
  - Confirm one member's assistance (create an awaiting record for an accountless member first).
- [ ] **These windows open, without saving:** Add member, Assign officer, Distribute → each choice.
- [ ] **Failure state:** block the organization request; each page says it could not load, and Try again recovers.
- [ ] **Others unchanged:** the Admin's organization page (`/organizations/farmers/<id>`), and the farmer's and fisherfolk's pages.
- [ ] Review the whole branch, then ask the owner before pushing.
