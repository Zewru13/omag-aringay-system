# Design: Audit Log, Backup & Restore and User Manual, the BasaJuan way

Date: 2026-11-28. Status: approved by the user on 2026-11-28 ("proceed").

## Why

The user showed 18 screenshots of the BasaJuan library system and asked us to adopt their ideas and copy their logic for three
pages: Audit Trail, Backup & Restore, and Help (our User Manual). Our pages should work the way theirs do, with farm and
fisheries records in place of library records. The user approved "use your picks".

## Delivery

Three separate pull requests, in this order. Each is built, tested and checked on the throwaway test system, then we ask before
commit, before any live database change and before merge. The website preview must pass before every merge.

1. Audit Log (one live database change)
2. Backup & Restore (one live database change)
3. User Manual (no database change; last, so its pictures are taken once)

This is the go-ahead for the manual update that was set aside (steps 2 to 7 and the former-member change).

## For all three

- Keep our own colors, green theme, buttons and wording style ("Cooperative"). We copy how their pages work, not their look.
- Every page works on a phone.
- Never test against the live database. Sample records only, never real people in pictures.
- Not copied: chatbot, dark mode, their Guest History (our people without accounts are already registered farmers and
  fisherfolk), automatic scheduled jobs.

---

## Part 1: Audit Log

### What the page becomes

Tabs: **All Activity | Farmer History | Fisherfolk History | Cooperative History**. Admin only, as now.

**All Activity**

- Line under the title: "Every action in the system, newest first: who did it, what they did, and to whom."
- Filters: **Search** (words in any order, over the description, name and e-mail; use `core.utils.search_tokens` /
  `build_text_search_q`), **Module**, **Action** (kept from now), **From Date**, **To Date**, Reset Filters. They apply by themselves.
- Table: **Date & Time | Who | What Happened | Module**. Who shows the name with the kind of account under it (Admin, Focal
  Person, Farmer, Fisherfolk, Cooperative; "System" for scripts). Clicking a row opens the details window, as now; the window
  also shows the e-mail, action and module.
- The Action column leaves the table (their table has none; the sentence says it). The Action filter stays.
- A **View history** link on a row that is about exactly one farmer, fisherfolk or cooperative. It opens that history tab with
  the person picked. When a row is about several, the details window gives a link for each.
- Pages: 10 per page, "Showing 1 to 10 of N entries", Previous, numbered pages (1 2 3 4 … last), Next.

**Modules** (menu names): Registration, Cooperatives, Crop Management, Fisheries Management, Assistance, Disaster, Reports,
Crop Settings, Fisheries Settings, Activity Settings, Assistance Settings, Classification Settings, Harvest Unit Settings,
User Management, Signatories, Backup & Restore, Sign-in & Account (signing in and out, own password, photo and details,
change requests).

**History tabs.** A line saying what the tab shows, a search box (name, RSBSA number; cooperative name), and until one is
picked: "Pick a farmer above to see their history." After picking: name and basic facts, then **Date | What Happened |
Module**, newest first, 10 per page. It is built from the records themselves, so it covers the past too.

| History of | What it lists |
|---|---|
| Farmer | registration; crops planted; crop activities; harvests; disasters reported and recovered; assistance received and removed; farm visits; joining a cooperative and officer terms; equipment borrowed and returned; change requests |
| Fisherfolk | registration; ponds added; production cycles and stocking; feeding and health logs; harvests; fishing trips; disasters; assistance; membership and officer terms; equipment borrowed and returned; change requests |
| Cooperative | registration; members joining; officer terms; equipment acquired, lent, returned and repaired; assistance it gave to members |

Items that have no date (farm parcels, machinery) are counted at the top, not listed by date. A membership that ended has
no end date stored, so only the joining is listed, marked "(ended)".

### Behind the page

- **Module is saved on each entry**: new column `module` (text, database default empty). It is set when the entry is written,
  from the address of the action (`auditlog/catalog.py`); a test fails when a write or file address has no module. The same
  migration fills in older entries from their record type and action; those that cannot be told show "—".
- **Everyone's changes are recorded.** Today a staff action is one sentence, but for farmers, fisherfolk and cooperatives only
  seven kinds of record are noted, so their activity logs and disaster reports are missing. They now get the same one entry per
  successful action, with the details of what changed, and files they download are listed. It replaces the per-record notes for
  signed-in requests (scripts keep theirs), so nothing is listed twice. Their sign-ins and failed sign-ins stay unrecorded.
  A cooperative logging for a member then shows the cooperative as Who.
- **Who a row is about** is kept inside the entry's existing `details` (`people: [{kind, id, name}]`). So View history appears
  on entries made after this update; older rows have no link, but the history tabs still show their records.
- History comes from a new read-only Admin address, `GET /api/auditlog/history/<farmer|fisherfolk|cooperative>/<id>/`
  (a cooperative id also says farmers or fisherfolk).
- Recording must never stop the action being done (as now). Passwords and typed secrets are never stored (as now).
- Known limit, unchanged: the disaster report's browser Print button is not recorded.

### Approaches

- Module: **save it on each entry (picked)**, or work it out from the record type each time. The second needs no database
  change but cannot place downloads, sign-ins or actions that save several kinds of record.
- History: **build it from the records (picked)**, or filter the Audit Log by person. The second would be empty for everything
  before this update.

---

## Part 2: Backup & Restore

Two tabs at the top right: **Create backup | Restore**. Admin only, as now.

### Create backup

1. "Saves one file (.zip) holding every record below and every uploaded file. You choose where it goes. Keep it somewhere off
   this computer."
2. The group cards and the Audit Log tick, as now.
3. A yellow box, **"Two things this file cannot hold"**: *The system itself* (the program and the design of the database are in
   the project's code; this file holds records and uploaded files) and *Server settings and keys* (such as the e-mail and file
   storage keys, which are kept on the server).
4. **Download backup** opens our notes window (name, location, remarks). On **Start Backup**, a Save As window asks where to
   put the file. The suggested name is `omag-backup-YYYY-MM-DD-HHMM.zip`.
5. The lock window: "Creating backup… Please wait and don't close or leave this page."
6. The file is written to the chosen place, then: "Backup saved. N records and N files saved to your computer."
7. Backup history stays under these, as now (theirs has none; we keep it).

The Save As window must open at the moment of the click, before the backup starts, because a browser refuses it minutes later.
Cancelling it starts nothing. Where a browser has no such window (Firefox, Safari, phones, and some with it switched off), the
file downloads the usual way. If the page is reloaded during a backup, the history's Download button still works. The online
copy is removed only after the file is fully written.

### Restore (on the page, no longer a popup)

1. "Add a backup file to see what it would change. Nothing is written until you confirm."
2. Drop area: "Drag a backup file here, or browse for a .zip file saved from this page." After choosing: a file card with its
   name, "Taken (date and time) by (name)", **Change file** and **Remove**. Restore on a history row opens this tab.
3. **What to restore**, two choices; the safe one is preselected:
   - **Settings and lists**: the lists of the settings pages and the signatories. People, farms, ponds and their records are
     left alone.
   - **Everything** (in red): also replaces accounts, registrations and all records. Anything recorded since the backup was
     taken is lost.
4. "Checking what would change…", then a table **Records | In this backup | In the system now**. Settings and lists: one row
   per list (Crop types, Varieties, Species, …). Everything: one row per group, with the Audit Log marked "kept".
5. Red button **Restore settings** or **Restore everything**.
6. "Are you sure you want to restore?" with what will be replaced, **your password** (kept; theirs does not ask), **No** and
   **Yes, restore**.
7. A safety backup is made first (kept, both choices), then the lock window "Restoring data…".
8. **Restore complete**: large **Written | Removed | Skipped** numbers and a table with the same three per row. A failed
   restore says nothing was changed and why.

- Written: records put back from the file. Removed: records that were in the system and are not in the file. Skipped: list
  entries deliberately left as they are, each named with its reason.
- The Audit Log is never replaced (as now). Its entry says, for example, "Restore finished (settings and lists): 120 written,
  3 removed, 1 skipped".
- If an Everything restore removes the signed-in Admin's own account, they are signed out; the history and Audit Log still
  show the result.

### The Settings and lists rules

Included: crop categories, subcategories, types, varieties, input types, activity steps, harvest unit weights, seed sources
and crop activity types; species categories, species, species steps, feed types, disease types, fingerling sources and fisheries
activity types; assistance agencies, list entries, added types and type units; parcel classifications; report signatories.
Left out: the unused disaster response tables, saved remarks on crops, and everything else.

An entry is **in use** when a record outside these lists is linked to it (for example a crop record to its crop type, or
stocking to its species), directly or through an entry that would be removed with it.

| Case | Result |
|---|---|
| In the file, not in the system | added (Written) |
| In both, same name | set back to the file's values (Written) |
| In both, different name, not in use | set back (Written) |
| In both, different name, in use | **Skipped**: an entry in use is never renamed, because its id may now mean something else |
| Only in the system, not in use | removed (Removed) |
| Only in the system, in use | **Skipped**: kept |
| Cannot be added because another kept entry has that name | **Skipped** |

All of it succeeds or none of it does. Uploaded files are not touched. Records that copied a list's words (such as a seed source
or assistance type) keep their words.

### Behind the page

- `backups.BackupRecord` gets `scope` (text, database default `everything`) and `report` (JSON, may be empty) for the result.
  The history shows "Restore (settings and lists)" or "Restore (everything)".
- Preview and restore take `scope`. A request without it means everything, so the old website keeps working during the update.
- Old backup files can still be restored, both ways.

### Approaches for Settings and lists

- **Merge entry by entry and skip what is in use (picked)**: records stay correct; some entries may stay as they are, and the
  result names them.
- Empty the lists and refill them: simpler, but it breaks or relabels records linked to newer entries.
- Offer only Everything: no risk, but does not copy their logic.

---

## Part 3: User Manual

### What the page becomes

```
User Manual                                        N topics
+------------------------------------------+  [ Search the manual ]
| Farmers                                  |  ADMIN
| One line saying what this page is for.   |   Dashboard          >
| [ picture with numbered boxes ] [Enlarge]|   Farmers            >
|            < o O o >   2 of 6            |   Fisherfolk         >
| 1 ... what box 1 is                      |   ...
| 2 ... what box 2 is                      |  FOCAL PERSON
| How to use this page                     |   ...
|  - step                                  |  FARMER
| (bulb) Tip                               |   ...
+------------------------------------------+
```

- **One topic at a time**, with the topic list on the right, scrolling on its own, the open topic highlighted.
- Admin sees every group (Admin, Focal Person, Farmer, Fisherfolk, Cooperative); others see only their own, as now.
- **Topics follow the menu**: one per menu page (Dashboard, Farmers, …, each settings page, Audit Log, Backup & Restore),
  plus getting started, using it on a phone, common questions and About This System.
- A topic: title, one line, its pictures one at a time with arrows, dots and "2 of 6" (swipe on a phone), the numbered
  explanation matching the picture shown, "How to use this page" as unnumbered steps (so only one set of numbers), and one tip.
- **Enlarge** shows the picture over the whole screen, with zoom; Esc or the close button returns.
- Each topic has its own address, so Back and reload stay on it.
- Search stays and sits above the list; a result opens its topic on the right picture or question.
- On a phone the list opens from a **Topics** button.
- **Print / Save as PDF** stays and prints every topic of the chosen account type.
- Our orange numbered boxes stay (not their red circles and arrows): our pictures explain many more things, and arrows would
  crowd them.

### Content

Rewrite what changed: one manual page, the 3-step Add Farm Parcels window, no disaster response suggestions, "Cooperative",
assistance with schedule and place, notifications details and change requests in the bell, cooperative logging for members
without an activated account, the Audit Log, the former-member rule, and the new Audit Log and Backup & Restore pages. The
common questions get the same check. All pictures are retaken with `scripts/manual` on the throwaway system with sample records.

### Approaches

- **Rearrange our existing content into topics (picked)**: keeps the explanations of buttons and fields and the picture tool.
- Write a new, shorter manual like theirs: lighter to read, but loses most of that detail.

---

## Changes the user asked for after Part 2 went live (approved 2026-11-28, "proceed")

**Backup & Restore**

- **Download backup** opens Save As at once. The notes window (name, location, remarks) is gone.
- **Location** fills itself with the saved file's name (a browser never tells a website the folder).
- The history has **no Actions column** (so no Edit, View result or row Restore). The one exception is a **Download** link under
  *Waiting to be downloaded*, so a file whose save failed can still be had.

**Part 3 is now "Help", copied from theirs.** This replaces what the Part 3 section above says wherever they differ:

- The page, menu entry and address are **Help**.
- One topic at a time; title "Help" and the number of topics; the topic list on the right with **Search help**, grouped by
  account type, following the menu, with groups that open, and its own scrollbar.
- Pictures with **red** numbered circles, arrows and boxes (not our orange boxes), **Enlarge**, and for several pictures arrows,
  dots and "1 of 3". Under them one numbered list and one tip. No separate "How to use this page" section.
- Every explanation is kept; the numbers shown are those of the picture shown.
- Common questions and About This System stay, as topics.
- **Print / Save as PDF** and the introduction sections are removed.

---

## Checks for each part

- Server tests and website tests pass (the six known Python 3.14 errors aside); the website builds.
- Browser check on the throwaway system, computer and phone size.
- Audit Log: one entry per action for every kind of account; every write and file address has a module; each history lists only
  that person's records; only an Admin can read it.
- Backup: each row of the rules table has a test; a failed restore changes nothing; the Audit Log survives; the counts match
  what changed.
- Manual: every topic has its pictures; every account type sees only what it should.

## Constraints

- Live database changes are applied by hand and recorded in `django_migrations` **before** the code that needs them is merged,
  with database defaults so the running server keeps working. No new tables are planned.
- Do not commit data backups in `docs/`, demo import files or the existing `package-lock.json` change.

## Left to the builder

File layout, component names, the exact shape of addresses' answers, how the picture tool groups pictures by topic, and the
exact words of tips and steps, in the plain style of the system.
