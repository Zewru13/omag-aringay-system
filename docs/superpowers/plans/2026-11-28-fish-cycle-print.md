# Print One Fish Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A computer user can print one production cycle from Aquaculture Monitoring.

**Architecture:** The report (`cycleReport`) and the print function (`printCycle`) already exist for the phone card; the row menu gets an item that calls it. Website only.

**Tech Stack:** React, Vite, `node --test` through `npm test`, `scripts/manual/shoot.mjs` for Help pictures.

**Spec:** `docs/superpowers/specs/2026-11-28-fish-cycle-print-design.md`

## Global Constraints

- No server or database change.
- Never run browser checks against live Supabase; use the throwaway stack, with `EMAIL_HOST_USER=` and `EMAIL_HOST_PASSWORD=` blank.
- No commit, push or merge until the user says so (this replaces the plan template's commit steps).
- Menu label, exactly: `Print Report`. Position: after `Activity Logs`, in the `crud` group.

## Review Focus

- Choosing Print Report must not also open or close the row's ponds and cages (Task 3 browser check).
- A harvested cycle has no Edit, and still has Print Report (Task 3 browser check).
- A record with no production cycle prints its details only (already pinned in `tests/listReports.test.mjs`).
- The menu of the last row is one line longer and must stay fully on screen (Task 3 browser check).
- When the cycle cannot be read from the server, the user sees `Failed to print the report.` (existing `printCycle`; unchanged).

---

### Task 1: The menu item

**Files:**
- Modify: `oma-frontend/src/pages/FisheriesRecords/FisheriesRecordsPage.jsx` (`StockingRowActions`, its comment, and the table row that uses it)
- Test: `oma-frontend/tests/cycleLogForms.test.mjs`

**Interfaces:**
- Consumes: `printCycle(rec)`, already in `FisheriesRecordsPage`; the `Printer` icon, already imported.
- Produces: `StockingRowActions` prop `onPrint: () => void`.

- [ ] **Step 1: Failing test.** Replace the `Print Report is not in the ⋮ menu` assertion with:

```js
eq(menu.includes("{ key: 'print', label: 'Print Report', icon: Printer, onClick: onPrint, group: 'crud' }"), true, 'Print Report is in the ⋮ menu')
eq(menu.indexOf("label: 'Activity Logs'") < menu.indexOf("label: 'Print Report'") && menu.indexOf("label: 'Print Report'") < menu.indexOf("label: 'Force Harvest'"), true, 'after Activity Logs, before Force Harvest')
eq((page.match(/onPrint=\{\(\) => printCycle\((row\._rec|rec)\)\}/g) || []).length, 2, 'the table menu and the phone card print the same report')
```

- [ ] **Step 2:** Run `node tests/cycleLogForms.test.mjs` in `oma-frontend`. Expected: FAIL, `Print Report is in the ⋮ menu`.
- [ ] **Step 3:** Add the `onPrint` prop and the action; pass `onPrint={() => printCycle(rec)}` from the row; make the comment above `StockingRowActions` true.
- [ ] **Step 4:** Run the same command. Expected: `ok - N assertions`.

### Task 2: Help text

**Files:**
- Modify: `oma-frontend/src/pages/Help/helpContent.js` (the questions "Can I print one parcel or one production cycle?" and "Can I print or download the crop and fisheries tables?")
- Test: `oma-frontend/tests/helpContent.test.mjs`

- [ ] **Step 1: Failing test.** Add to the "explains" list `['printing one production cycle', 'in Aquaculture Monitoring, open the cycle’s ⋮ menu and choose Print Report']` (straight apostrophe in the file), and to the "gone" list `'no print button for one cycle'`.
- [ ] **Step 2:** Run `node tests/helpContent.test.mjs`. Expected: FAIL, `should explain printing one production cycle`.
- [ ] **Step 3:** First answer: "A parcel: yes. On Crop Records, open its ⋮ menu and choose Print report; it prints the details of that parcel and its crop records. A production cycle: yes. On a computer, in Aquaculture Monitoring, open the cycle's ⋮ menu and choose Print Report; on a phone, press Print on its card. It prints the cycle's details and its ponds or cages." (The needle must appear word for word; adjust the sentence order to it.) Second answer: replace "(one parcel still prints from its three-dot menu)" with "(one parcel and one production cycle still print from their three-dot menus)".
- [ ] **Step 4:** Run `npm test`. Expected: all pass.

### Task 3: Picture and proof

**Files:**
- Modify: `oma-frontend/scripts/manual/parts/staff4.mjs` (`admin-aquaculture-menu` callouts)
- Regenerate: `oma-frontend/public/manual/admin/aquaculture-menu.png`, `oma-frontend/src/pages/Manual/manualScreens.js`

- [ ] **Step 1:** Add a callout between Activity Logs and Force Harvest: `{ find: { text: 'Print Report', tag: 'button' }, label: 'Print Report', desc: 'Prints a report of this one cycle: its details and its ponds or cages. Feeding and health logs are not in it.' }`.
- [ ] **Step 2:** Start the throwaway stack and run `node scripts/manual/shoot.mjs <tokens> admin-aquaculture-menu`. Expected: one picture, five numbers, five legend lines.
- [ ] **Step 3:** Browser check on the test copy at computer width: the menu on an unharvested and a harvested row; Print Report produces the report with that cycle's species, fisherfolk and ponds; the row's open or closed state does not change; the last row's menu is fully visible; no console errors.
- [ ] **Step 4:** Run `npm test`, `npm run build` and eslint on the changed files. Expected: all clean. Shut the throwaway stack down.
