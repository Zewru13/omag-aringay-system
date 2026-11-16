# Account redesign, step 5: profile, Help and the User Manual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last step of the account redesign.
- One profile layout for farmer, fisherfolk and organization accounts.
- Help answers that describe the new pages.
- The User Manual (its guides, the explanations under each picture, and the pictures) matches what these accounts now see.

**Architecture:**
- **Profile:** a new `AccountProfilePage` built from a small `ProfileRow`. The farmer / fisherfolk fields and the organization fields come from a pure, tested `profileFields.js`.
- **Profile saves:** the same endpoints as today:
  - `/profile/image/`
  - `/profile/contact-number/`
  - `/profile/change-requests/`
  - `/accounts/change-password/`
  - `/accounts/me/`
- **Help:** one shared answers file per account kind, read by the existing `CitizenHelpScreen`.
- **User Manual:**
  - the screen lists `scripts/manual/parts/citizen.mjs` and `phone.mjs` are rewritten for the new screens;
  - the guide steps for these accounts in `manualContent.js` are rewritten;
  - only these accounts' pictures are re-shot with `scripts/manual/shoot.mjs`.

**Tech Stack:** React 19, Vite, Tailwind v4. Tests: `node --test "tests/*.test.mjs"`. Pictures: `node scripts/manual/shoot.mjs <tokens> farmer fisherfolk org`.

**Spec:** `docs/superpowers/specs/2026-11-16-account-redesign-design.md` (Profile, Format rules, Build order step 5).

## Global Constraints

- Same as steps 2 to 4.
- Frontend only. Office pages unchanged, and so are the staff guides and pictures of the User Manual.
- Every profile save keeps working exactly as today:
  - instant photo / logo and contact number;
  - name, barangay and the organization's details go to the office as a change request;
  - an organization's request needs two approvals, and each approval is shown;
  - Change password.
- Plain English, sentence case, no "please" or "successfully".
- Phone buttons at least 44px; no text under 13px in what this step adds.
- Branch `account-redesign-step5`; push only after the owner says yes.

## Rulings made while planning

- **Log out stays on the profile as well as on More.** Today it is at the bottom of the profile, and people who learned that should still find it.
- **The "key to the icons" bar is removed.** Each row says in words what its button does: Edit (saves at once), Request change (the office approves; the row then shows "Waiting for approval"), or a padlock with "Fixed".
- **The office's contact details in Help are still placeholders today.** They stay placeholders, now clearly marked "To be confirmed by the office". Real numbers need the owner.
- **The tidy-up of now-unused code is not in this step.** These are:
  - the office pages' `isFarmer` / `isFisherfolk` / `own` branches;
  - the old Home chart files;
  - the routed parts of `FarmerDisasterPage` / `FisherfolkDisasterPage`.

  They are harmless, and removing them touches the office pages, so they get their own small change afterwards, with the owner's yes.

## Review Focus

1. A change request already waiting: the row shows "Waiting for approval" and its Request change button is replaced, so a second request cannot be sent. Pinned in Task 1.
2. An organization request approved by only one of the two roles: both lines show (who approved, and when; who is still to approve). Pinned in Task 1.
3. A person with no contact number, no photo, or "Unspecified" reference fields: the row shows "—" or is left out, as today's hide-empty rule says. Pinned in Task 1.
4. A User Manual picture's numbered boxes all land on something on the new screens: `shoot.mjs` reports boxes it could not find, and none may be missing. Checked in Task 4.
5. The manual's search finds the new words (Cycles, Loans, Confirm for members, Distribute assistance). Pinned in Task 3.

---

### Task 1: One profile for all three accounts

**Files:**
- Create: `Account/profileFields.js`, `Account/ProfileRow.jsx`, `Account/AccountProfilePage.jsx`.
- Modify: `Citizen/OwnAccountPages.jsx` (`OwnProfilePage` renders `AccountProfilePage`).
- Test: `tests/accountProfile.test.mjs`.

**Interfaces — Produces:**
- `profileSections(kind, record, pending)` gives `[{ title, rows: [{ key, label, value, mode: 'edit' | 'request' | 'fixed', field?, pending? }] }]`.
- **Farmer and fisherfolk:**
  - *About you:* Full name (request; fields first, middle and last name), Barangay (request), Contact number (edit).
  - *Your record:* RSBSA number (fixed), Date of birth, Civil status, Education, PWD, 4Ps (fixed, each only when it has a value), Organization (fixed).
- **Organization:**
  - *Organization details:* Name, Barangay, Street address, Email, Contact person (request), Contact number (edit).
  - *Registration:* Registration number, Agency, Date organized, Date registered (fixed).
- `pending` is `{ [field]: request }` from `/profile/change-requests/`. A row with a pending request shows its value, then "Waiting for approval".
- `approvalText(request)` gives the existing `approvalLines` as words: "Admin approved Nov 7 (Ana)", "Focal Person: still to approve".

- [ ] **Test first.**
  - The sections and rows for a farmer, a fisherfolk and an organization sample.
  - Hide-empty: `''` and `'Unspecified'` leave the row out; a contact number left blank stays, shown as "—".
  - Pending.
  - `approvalText`.

  Source checks: the page holds `/profile/image/`, `/profile/contact-number/`, `/profile/change-requests/`, `/accounts/change-password/`, `PasswordRequirementChecklist`, `Waiting for approval`, `Request change`, `Log out`, and has no `EditLegend`.
- [ ] **Implement.**
  - Header: the photo or logo with a 44px Change photo button, then the name, the account type and the RSBSA or registration number.
  - The two sections, then Change password (opens a window with the existing rules checklist), then Log out (asks first).
  - The request window: one field, or the three name fields for Full name.
  - On a phone, rows stack the label above the value, with the button full width under them.
- [ ] **Run; `npm test`; commit.**

### Task 2: Help answers for the new pages

**Files:**
- Create: `Account/helpAnswers.js`, which exports `HELP` keyed `farmer | fisherfolk | org`, in the shape `CitizenHelpScreen` reads.
- Modify: `FarmerAccountPages.jsx`, `FisherfolkAccountPages.jsx`, `OrgAccountPages.jsx` (their Help pages read it); drop the three inline answer lists.
- Test: `tests/helpAnswers.test.mjs`.

- [ ] **Test first.** Every answer names only pages and buttons that exist now.

  | Account | Must mention | Must not mention |
  |---|---|---|
  | Farmer | Crops, Log activity, Record harvest, Report a disaster, Received, Not received, More | "Crop Monitoring", "Open crop" |
  | Fisherfolk | Cycles, Log activity, Feeding Log, Health Log, Start a cycle, Details | "Fisheries Monitoring > Aquaculture", "View Cycle" |
  | Organization | Members, Equipment, Loans, Officers (under More), Distribute assistance, Confirm for members | "My Organization", "Borrowed tab", "Distribute to Individual" |

  Contact rows say "To be confirmed by the office".
- [ ] **Implement:** short answers, verb first, one action per sentence.
- [ ] **Run; `npm test`; commit.**

### Task 3: The User Manual's guides and screen lists for these accounts

**Files:**
- Modify:
  - `scripts/manual/parts/citizen.mjs` and `scripts/manual/parts/phone.mjs` (the screens, their sizes and the numbered callouts);
  - `src/pages/Manual/manualContent.js` (the farmer, fisherfolk and organization guides: steps and screen ids).
- Test: `tests/manualAccounts.test.mjs`.

- [ ] **Test first.**
  - Every screen id a farmer, fisherfolk or org guide lists exists in `screens.mjs`.
  - No guide step for these accounts names a page that is gone: "My Organization", "Crop Monitoring", "Fisheries Monitoring", "Borrowed History", "Confirmed for Members tab".
  - The guides mention More, Home's "To do today", Loans and Distribute assistance.
  - The manual search finds "Loans" and "Cycles" for those accounts (through `searchManual`).
- [ ] **Implement.**

  Screens:

  | Account | Computer | Phone |
  |---|---|---|
  | Farmer | Home, Crops (and Details), Forecast, Disasters (and Report a disaster), Assistance, Borrow equipment, More, Profile | Home, Crops, Assistance, More |
  | Fisherfolk | Home, Cycles (and Details, Log activity choice), Forecast, Disasters, Assistance, Profile | Home, Cycles, Disasters |
  | Organization | Home, Members, Equipment Items (and item Details), Loans, Officers, Assistance (and Confirm for members, Distribute choice), Profile | Home, Members, Equipment |

  Each callout names one control and says what it does in one sentence.
- [ ] **Run; `npm test`; commit.**

### Task 4: Re-shoot these accounts' pictures

- [ ] **Set up:** scratch stack running; tokens minted with a 6-hour life.
- [ ] **Shoot:** `node scripts/manual/shoot.mjs <tokens> farmer fisherfolk org`. It writes `public/manual/{farmer,fisherfolk,org}/*.png` and updates `src/pages/Manual/manualScreens.js`.
- [ ] **Check the report:** every screen saved, no callout missing. Fix a callout's `find` and re-shoot that screen until none is missing.
- [ ] **Look at three pictures by eye** (one per account) to check the boxes sit on the right things.
- [ ] **Delete picture files no screen uses any more** (the old Home charts, Borrowed History, Confirmed for Members), and their entries in `manualScreens.js`.
- [ ] `npm test`; commit (pictures and manifest).

### Task 5: Verify

- [ ] `npm test`, lint and the build pass.
- [ ] **Browser, the scratch stack:**
  - The profile for the farmer, the fisherfolk and both organizations, at 390px and 1440px.
  - **Saves (scratch database only):**
    - change a contact number;
    - send a barangay change request (the row then waits);
    - open Change password (do not change it).
  - **Help** for each account.
  - **User Manual** for each account: the guides, the pictures, and the search for "Loans".
- [ ] **Staff unchanged:** the Admin's own profile, Help and User Manual.
- [ ] **Review:** the whole branch; then ask the owner before pushing.
