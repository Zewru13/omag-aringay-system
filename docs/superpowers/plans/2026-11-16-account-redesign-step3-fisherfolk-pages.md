# Account redesign, step 3: the fisherfolk pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fisherfolk's Cycles, Assistance, Disasters and Forecast pages are rebuilt on the account kit the same way the farmer's were, and Home's fisherfolk to-do buttons act in place.

**Architecture:** As in step 2: a screen in `oma-frontend/src/pages/Account/` per page, each with a pure, tested rules module; shared addresses render the fisherfolk's screen for a fisherfolk and the office page for everyone else; every form and window is the existing one, exported where it lives or moved to its own file unchanged.

**Tech Stack:** React 19, Vite, Tailwind v4, react-router. Tests: `node --test "tests/*.test.mjs"`.

**Spec:** `docs/superpowers/specs/2026-11-16-account-redesign-design.md`. Step 2 plan (the pattern this follows): `docs/superpowers/plans/2026-11-16-account-redesign-step2-farmer-pages.md`.

## Global Constraints

Same as step 2:

- Frontend only; no backend change, migration or SQL.
- Office, farmer and organization screens unchanged.
- Every address keeps working: `/fisheries-monitoring?cycle=ID`, `?record=ID`, `?forced=ID`, `/disaster?stock=ID`, `/fisheries-assistance`, `/fisheries-forecasting`.
- A fisherfolk keeps every action they have today.
- Plain English; phone buttons at least 44px; no text under 13px in what this step adds.
- A failed load shows as failed.
- Never commit `package-lock.json`, never `git stash`.
- Branch `account-redesign-step3`; push only after the owner says yes.
- Browser checks on the scratch stack only.

## Rulings made while planning

- **Opening a row to see its ponds and cages is replaced by Details.** Details opens a new window built from the existing `CycleInfoSummary`, which already lists the ponds and cages and their totals. Its footer holds the rest of today's row actions: Activity logs, Edit, Print, Force harvest (when allowed), Harvest details (once harvested). The office page keeps its expanding rows.
- **Log activity asks which log first.** Today it is a small drop-down (Feeding log, Health log). A row allows two buttons, so "Log activity" opens a small window with two large choices, then the existing Log Activity window.
- **Reporting a disaster stays one window for a fisherfolk** (the spec says two steps, as for a farmer). The existing form already starts with a table of every pond and cage to tick, so it is opened as a window rather than rebuilt. It is blocked with the server's own reason when the fisherfolk has no pond or cage on record (`/monitoring/fisherfolk-disasters/eligibility/`).
- **Yield analysis stays as it is**, as for the farmer. The office's fisheries forecast page holds both tabs in one component, so it gets one new optional prop `view="yield"` that draws only the yield tab. The office page, which passes no prop, is unchanged.
- **The farmer's Assistance page becomes the one Assistance page for both** (`domain="crop" | "fisheries"`). It picks the list endpoint and the windows by domain; the farmer's behaviour is unchanged and its tests stay green.

## Review Focus

1. A cycle whose status is one only the fisheries side has: `Late`, `In Progress` (some ponds force harvested), `Forced Harvested`. Each lands in a section and gets the right main button. Pinned in Task 2.
2. Force Harvest from a Health log lifts the harvest wait (`force_harvest: true`): Record harvest leads even before half the growing time. Pinned in Task 2 (`cycleMainAction`) with the fisheries gate.
3. A fisherfolk with no pond or cage opens Disasters: the reports still list, and "Report a disaster" shows the server's reason. Pinned in Task 4.
4. `?cycle=ID` for a cycle not on the loaded list (another account's, or deleted): nothing opens and nothing breaks. Pinned in Task 2.
5. After a save (activity, harvest, disaster, confirmation), the list and Home reload. Checked in the browser in Task 7.

---

## File Structure

New, in `oma-frontend/src/pages/Account/`:

| File | Responsibility |
|---|---|
| `myCycles.js` | Pure. Sections, status wording, main button, order, search text, forecast sections. |
| `MyCyclesPage.jsx` | The fisherfolk's Cycles page. |
| `CycleDetailsWindow.jsx` | Details of one cycle: `CycleInfoSummary` and the action buttons. |
| `ChooseLogWindow.jsx` | "Which log?" (Feeding log / Health log). |
| `MyFisheriesDisastersPage.jsx` | The fisherfolk's Disasters page. |
| `MyFisheriesForecastPage.jsx` | The fisherfolk's Forecast page. |

Moved out unchanged:
- `FisheriesRecords/stockingHarvestGate.js`: `harvestGateInfo` of `FisheriesRecordsPage.jsx`.

Exported where they are:
- `StockingDetailModal` from `FisheriesRecordsPage.jsx`.
- `MarkRecoveredModal` from `FisherfolkDisasterPage.jsx`.
- `StockingForecastDetailModal` from `FisheriesForecastingTab.jsx`.

Modified:
- `MyAssistancePage.jsx` (takes `domain`).
- `myDisasters.js` (`disasterText` reads a stock too).
- `accountRoutes.jsx` (`CyclesRoute`, `FisheriesAssistanceRoute`, `FisheriesForecastRoute`).
- `App.jsx`.
- `Monitoring/DisasterPage.jsx`.
- `Monitoring/FisheriesForecastingTab.jsx` (the `view` prop).
- `todoRules.js`, `HomeWindows.jsx`, `AccountHome.jsx`.

---

### Task 1: Shared pieces

**Files:**
- Create: `FisheriesRecords/stockingHarvestGate.js`
- Modify: `FisheriesRecords/FisheriesRecordsPage.jsx`, `Monitoring/FisherfolkDisasterPage.jsx`, `Monitoring/FisheriesForecastingTab.jsx`
- Test: `tests/fisherfolkShared.test.mjs`

**Interfaces — Produces:**
- `stockingHarvestGate(rec, today = todayISO()) -> { gated, message }`, the same rules as today:
  - an estimated stocking date blocks it;
  - `force_harvest` opens it;
  - otherwise it opens at half the time from stocking to the expected harvest.
- Named exports `StockingDetailModal`, `MarkRecoveredModal` (fisherfolk), `StockingForecastDetailModal`.
- `ForecastingTab({ asTab, view })`: with `view="yield"` it returns only the yield analysis and loads it at once.

- [ ] **Step 1: Write the failing test.** Gate cases:
  - stocked `2026-01-01`, expected `2026-04-11`, today `2026-01-20` → gated;
  - the same on `2026-03-01` → open;
  - `date_stocked_is_estimated` → gated;
  - `force_harvest` on `2026-01-20` → open.

  Source checks:
  - the three named exports exist;
  - `FisheriesRecordsPage.jsx` imports the gate and no longer defines it;
  - `FisheriesForecastingTab.jsx` contains `view === 'yield'`.
- [ ] **Step 2: Run it.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Move the gate's body unchanged; the `today` argument is passed through to `harvestGateStatus` if it takes one, otherwise a wrapper uses it. Add the exports and the `view` prop.
- [ ] **Step 4: Run it, `npm test`, and lint the three office files against `master`.** Expected: PASS, and no new lint problems.
- [ ] **Step 5: Commit** — `"Fisherfolk account: shared pieces; the harvest gate in its own file, the windows importable"`.

---

### Task 2: Cycles

**Files:**
- Create: `myCycles.js`, `MyCyclesPage.jsx`, `CycleDetailsWindow.jsx`, `ChooseLogWindow.jsx`
- Modify: `accountRoutes.jsx` (`CyclesRoute`), `App.jsx`
- Test: `tests/myCycles.test.mjs`

**Interfaces — Consumes:** `cycleStatusText`, `canForceHarvest` (`FisheriesRecords/emergencyForceHarvest.js`); `stockingHarvestGate`; `CycleInfoSummary`; `LogActivityModal`; `RecordStockingHarvestModal`; `ForceHarvestModal`; `EditStockingModal`; `CycleActivityLogsModal`; `StockingDetailModal`; `ForcedHarvestDetailsModal`; `StartProductionCycleModal`; `printSpec` + `cycleReport`.

**Interfaces — Produces:**
- `CYCLE_SECTIONS`: each cycle lands in one section, read through `cycleStatusText`.

  | Section | Takes |
  |---|---|
  | Growing | `Stocked`, `In Progress` |
  | Ready to harvest | `Near Harvest`, `Late`, or `force_harvest` / `is_near_harvest` |
  | Harvested | `Harvested`, `Forced Harvested` |
  | Lost | `Total Loss` |

- `cycleStatusLabel(rec)`:

  | Status | Label |
  |---|---|
  | `Stocked` | Growing |
  | `In Progress` | Partly harvested |
  | `Near Harvest` | Ready to harvest |
  | `Late` | Late |
  | `Harvested` | Harvested |
  | `Forced Harvested` | Force harvested |
  | `Total Loss` | Lost |
  | anything else | as given |

- `cycleMainAction(rec, gate)`: `'harvest'` when ready and the gate is open; `null` when harvested or lost; otherwise `'activity'`.
- `sortCycles(rows)`: active first (soonest expected harvest first), then harvested (newest `actual_harvest_date` first), then lost.
- `cycleText(rec)`: species, cycle number, culture type and place.
- `cycleDate(rec)`: `date_stocked`.
- `cycleTitle(rec)`: `'Tilapia, Cycle #1'`.

- [ ] **Step 1: Write the failing test.** One case per status in the two tables above. Plus:
  - the gate: `Near Harvest` with the gate shut → `'activity'`; `force_harvest` with the gate open → `'harvest'`;
  - the sort order;
  - `cycleTitle` with and without a cycle number.

  Source checks:
  - `MyCyclesPage.jsx` holds `RecordList`, `ListTools`, `CycleDetailsWindow`, `ChooseLogWindow`, `LogActivityModal`, `RecordStockingHarvestModal`, `StartProductionCycleModal`, `searchParams.get('cycle')`, `searchParams.get('forced')` and the button text `Start a cycle`;
  - `CycleDetailsWindow.jsx` holds `CycleInfoSummary`, `CycleActivityLogsModal` or an `onActivityLogs` callback, `EditStockingModal` or `onEdit`, `canForceHarvest`, `Print`;
  - `CyclesRoute` sends a fisherfolk to `MyCyclesPage` and everyone else to `FisheriesMonitoringPage`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **The page:** `AccountPage title="My cycles"` with the helper "Your fish production cycles, ponds and cages." and the main button "Start a cycle" (opens `StartProductionCycleModal`).
  - **Loading:** `fetchAllPages('/fisheries/stocking/', { status: 'Stocked,Near Harvest,Late,Harvested,Total Loss' })`.
  - **Columns:**
    - Species and cycle (title);
    - Ponds and cages (right, hidden on a phone);
    - Location (culture type and barangay);
    - Date stocked (hidden on a phone);
    - Harvest date (the expected date, or the actual one once harvested);
    - Status (badge, with the `DisasterIndicator`).
  - **Row buttons:**
    - "Record harvest" (main, through the gate) or "Log activity" (main; opens `ChooseLogWindow`, fetches the cycle, then `LogActivityModal`);
    - "Details" (opens `CycleDetailsWindow`, which fetches the cycle and shows `CycleInfoSummary`).
  - **Details footer:** Activity logs, Edit (not when harvested), Print, Force harvest (`canForceHarvest`), Harvest details (when `harvest_count > 0`).
  - **Links:**
    - `?cycle=ID` opens Details for the loaded row whose `production_cycle` matches, then leaves the address;
    - `?record=ID` the same by row id;
    - `?forced=ID` opens `ForcedHarvestDetailsModal`.
  - **After any save:** reload the list.
- [ ] **Step 4: Run it, then `npm test`.**
- [ ] **Step 5: Commit** — `"Fisherfolk account: My cycles, in sections, with Details holding the ponds and the rest of the actions"`.

---

### Task 3: Assistance for both

**Files:**
- Modify: `MyAssistancePage.jsx`, `accountRoutes.jsx` (`CropAssistanceRoute` passes `domain="crop"`; new `FisheriesAssistanceRoute`), `App.jsx`
- Test: `tests/myAssistance.test.mjs` (extend)

**Interfaces — Produces:** `MyAssistancePage({ domain })`:

| | Crop | Fisheries |
|---|---|---|
| List | `/interventions/my-beneficiary-history/` | `/interventions/my-fisherfolk-beneficiary-history/` |
| Received | `ConfirmReceivedModal` | `ConfirmReceivedDialog` with url `/interventions/fisherfolk-beneficiaries/<id>/confirm-received/` |
| Not received | `ReportNotReceivedModal domain="crop"` | `ReportNotReceivedModal domain="fisheries"` |

- [ ] **Step 1: Extend the test.** Source checks:
  - the page holds both endpoints, `ConfirmReceivedDialog`, `domain="fisheries"` (or `domain={domain}`) and `fisherfolk-beneficiaries`;
  - `FisheriesAssistanceRoute` sends a fisherfolk to `<MyAssistancePage domain="fisheries" />` and everyone else to `<FisheriesAssistancePage />`;
  - the `/fisheries-assistance` route still lets the fisherfolk organization in.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** The domain table lives at the top of the file; the rules module is unchanged.
- [ ] **Step 4: Run it, then `npm test`.**
- [ ] **Step 5: Commit** — `"Fisherfolk account: Assistance, the same page as the farmer's"`.

---

### Task 4: Disasters

**Files:**
- Create: `MyFisheriesDisastersPage.jsx`
- Modify: `myDisasters.js`, `Monitoring/DisasterPage.jsx`
- Test: `tests/myFisheriesDisasters.test.mjs`

**Interfaces — Produces:** `disasterText(row)` also reads `affected_stock`.

- [ ] **Step 1: Write the failing test.**
  - `disasterText({ disaster_type_label: 'Typhoon', affected_stock: 'Tilapia #1' })` holds both;
  - the farmer cases still pass.

  Source checks:
  - the page holds `RecordList`, `FisherfolkStockDisasterModal`, `DisasterLogDetailsModal`, `MarkRecoveredModal`, `'/fisheries/disaster-reports/'`, `'/monitoring/fisherfolk-disasters/eligibility/'`, `searchParams.get('stock')`, `Report a disaster` and `kind="fisheries"`, and does not contain `inline`;
  - `DisasterPage.jsx` sends a fisherfolk to `<MyFisheriesDisastersPage />`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **The page:** `AccountPage title="Disasters"` with the helper "Damage you reported on your ponds and cages." and the main button "Report a disaster".
  - **Loading:** `settleAll` over the reports, `fetchAllStocks({ status: 'Stocked,Near Harvest' })` and the eligibility endpoint.
  - **Columns:**
    - Disaster (title);
    - Stock (`affected_stock` or "Not linked to a stock");
    - Date;
    - Volume lost (right, hidden on a phone);
    - Status (badge from `disasterTone`).
  - **Row buttons:** Mark recovered (main, `canRecoverDisaster`) and Details.
  - **Report a disaster:** opens `FisherfolkStockDisasterModal` as a window.
  - **When reporting is blocked:** show `eligibility.message` under the heading instead.
  - **After saving a report:** reload, then open the saved report's Details (as today).
  - **`?stock=ID`:** opens the form with that stock ticked, then leaves the address.
- [ ] **Step 4: Run it, then `npm test`.**
- [ ] **Step 5: Commit** — `"Fisherfolk account: Disasters opens on the reports, with Report a disaster as a window"`.

---

### Task 5: Forecast

**Files:**
- Create: `MyFisheriesForecastPage.jsx`
- Modify: `myCycles.js`, `accountRoutes.jsx` (`FisheriesForecastRoute`), `App.jsx`
- Test: `tests/myCycles.test.mjs` (extend)

**Interfaces — Produces:** `CYCLE_FORECAST_SECTIONS`: Growing (`Stocked`, `Near Harvest`, `Late`), Harvested (`Harvested`). Reuses `countdown`, `yieldDifference` and `kg` from `myForecast.js`.

- [ ] **Step 1: Extend the test.**
  - The sections.

  Source checks:
  - the page holds `RecordList`, `StockingForecastDetailModal`, `view="yield"` and `'Stocked,Near Harvest,Harvested'`;
  - `FisheriesForecastRoute` sends a fisherfolk to `<MyFisheriesForecastPage />` and everyone else to the office forecast page.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Tabs:** Forecast and Yield analysis; the second renders `<ForecastingTab asTab view="yield" />`.
  - **Columns:**
    - Species and cycle (title);
    - Ponds and cages (right, hidden on a phone);
    - Expected harvest (the date and its countdown);
    - Est. harvest (`estimated_harvest_kg`, right);
    - Actual harvest (`actual_harvest_date`, hidden on a phone);
    - Harvested (`total_harvested_kg`, right, hidden on a phone);
    - Status (the difference badge once harvested, otherwise the status).
  - **Row button:** Details, which opens `StockingForecastDetailModal`.
  - **Search:** over species and place.
- [ ] **Step 4: Run it, then `npm test`.**
- [ ] **Step 5: Commit** — `"Fisherfolk account: Forecast as one list, growing cycles then harvested ones"`.

---

### Task 6: Home's fisherfolk buttons act in place

**Files:**
- Modify: `todoRules.js`, `HomeWindows.jsx`, `AccountHome.jsx`, `tests/todoRules.test.mjs`, `tests/accountHome.test.mjs`

**Interfaces — Produces:** a fisherfolk's to-do actions carry `act: { kind, record, domain: 'fisheries' }`:

| To-do | Buttons |
|---|---|
| Assistance waiting | Received (main) and Not received |
| Cycle ready to harvest | Record harvest |
| Loan overdue | View loan (a link, as now) |

`AccountHome` checks a cycle's harvest with `stockingHarvestGate`. `HomeWindows` opens `ConfirmReceivedDialog`, `ReportNotReceivedModal domain="fisheries"` or `RecordStockingHarvestModal`, chosen by `domain`.

- [ ] **Step 1: Change the tests first.**
  - The fisherfolk expectations in `todoRules.test.mjs` become `received / not-received` and `harvest`, each act carrying `domain: 'fisheries'`.
  - `accountHome.test.mjs` checks that `HomeWindows.jsx` holds `ConfirmReceivedDialog` and `RecordStockingHarvestModal`, and that `AccountHome.jsx` holds `stockingHarvestGate`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, then `npm test`.**
- [ ] **Step 5: Commit** — `"Account Home: a fisherfolk's to-do buttons open the window in place"`.

---

### Task 7: Verify

- [ ] **Step 1:** `npm test` passes, the touched files have no new lint problems, and `npx vite build` builds.
- [ ] **Step 2: Browser, the fisherfolk at 390px and 1440px.**
  - Pages: `/fisheries-monitoring`, `/fisheries-assistance`, `/disaster` and `/fisheries-forecasting` (both tabs).
  - Links: `?cycle=ID` and `?forced=ID` (when the test copy has one), `/disaster?stock=ID`.
- [ ] **Step 3: The work still saves.**
  - Log a feeding entry from a row.
  - Confirm a test assistance record from Home (add one to the scratch database first).
  - Mark a disaster recovered with a note.
  - Open Start a cycle and Report a disaster without saving.
- [ ] **Step 4: Failure state.** Block each page's list request: it shows "Couldn't load", and Try again recovers.
- [ ] **Step 5: Others unchanged.**
  - Admin: Aquaculture Monitoring, Fisheries Assistance, Fisheries Disaster and Fisheries Forecasting (both tabs).
  - Farmer: Assistance and Disasters.
  - Fisherfolk organization: Assistance.
- [ ] **Step 6:** Review the whole branch, fix what it finds, then ask the owner before pushing.
