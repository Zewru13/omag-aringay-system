# Account redesign, step 2: the farmer pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A farmer's Crops, Assistance, Disasters and Forecast pages are rebuilt on the account kit, and Home's to-do buttons act in place.

**Architecture:** Four new screens in `oma-frontend/src/pages/Account/` built from `AccountPage` and `RecordList`, each with a pure rules module that is tested on its own. A route that the office and a farmer share renders the farmer's screen for a farmer and the office page for staff (the pattern `DisasterPage.jsx` already uses), so no address changes. Every form and window is the existing one: three are exported from the files they live in, one is moved to its own file unchanged.

**Tech Stack:** React 19, Vite, Tailwind v4, react-router. Tests: `node --test "tests/*.test.mjs"`.

**Spec:** `docs/superpowers/specs/2026-11-16-account-redesign-design.md`

## Global Constraints

- Frontend only. No backend change, no migration, no SQL.
- Office (Admin, Focal Person) screens must look and behave exactly as before. Fisherfolk and organization accounts are untouched in this step.
- The existing windows are used as they are: Log Activity (`ViewLogsModal`), Record Harvest (`RecordHarvestFromMonitoringModal`), Crop Details (`CropDetailsModal`), Report Disaster (`DisasterReportModal`), the two Log Disaster steps (`ChooseCropsModal`, `MultiCropDisasterModal`), disaster details (`DisasterLogDetailsModal`), Confirm Received, Report Not Received, forecast details (`ForecastDetailModal`).
- Every existing address keeps working: `/crop-monitoring?record=ID`, `/disaster?crop=ID`, `/crop-assistance?tab=history`, `/forecasting`.
- A farmer keeps every action they have today. Nothing is removed without a ruling in this plan.
- English, short plain words, sentence case, verb-first buttons. Phone: buttons at least 44px, no text under 13px in what this step adds.
- A failed request is shown as failed, never as empty.
- Never commit `package-lock.json`. Never run `git stash`. Commit on the feature branch `account-redesign-step2`; push only after the owner says yes.
- Browser checks run on the scratch stack (MariaDB 3307, Django 8001, Vite 5174), never the live database.

## Rulings made while planning

- **Windows are exported in place, not moved** (the spec said moved). `ViewLogsModal` is 800 lines with helpers around it; adding `export` changes nothing for the office page, while moving it risks it. `ConfirmReceivedModal` (60 lines, self-contained) is moved to its own file. Cost if wrong: a later tidy-up moves the files.
- **Details is the existing Crop Details window**, not a new screen. It already shows the facts, the history and the action buttons. Cost if wrong: one new screen in a later step.
- **The office pages keep their `isFarmer` branches** in this step (the spec removes them only after the replacement is merged). They become unreachable for a farmer. A later tidy-up removes them.
- **Lost crops get their own section** ("Lost"), which the spec's list of sections left out. A record must never disappear.
- **Crops and Assistance keep a Year filter and a search.** The other office filters (crop, PCIC, season, date range, status) are replaced by the sections. A farmer's list is their own records only.
- **Forecast keeps its second tab, Yield analysis, as it is today.** It explains missed activities, which the new table does not. Rebuilding it is left for the wording and polish step.

## Review Focus

1. A farmer with many harvested crops (40 over several years): the Harvested section lists them newest first and the Year filter narrows them; nothing is cut off. Pinned in Task 2 (`cropSections`, `yearsOf`).
2. A crop whose harvest is not allowed yet (under half its growing time, or an estimated planting date): the main button stays "Log activity"; pressing Record harvest anywhere shows the reason and does not open the form. Pinned in Task 2 (`cropMainAction`) and Task 6.
3. Assistance in every status the server can send (`PENDING`, `AWAITING_CONFIRMATION`, `CONFIRMED`, `NOT_RECEIVED`, `RESOLVED`, and an unknown one): each lands in a section and only an awaiting one gets buttons. Pinned in Task 3.
4. A farmer with no active crop opens Disasters: the list of past reports still shows and "Report a disaster" explains why it cannot open. Pinned in Task 4.
5. After a window saves (activity logged, harvest recorded, assistance confirmed), the list and Home reload and the row moves to its new section without a page reload. Checked in the browser in Task 7.

---

## File Structure

New, in `oma-frontend/src/pages/Account/`:

| File | Responsibility |
|---|---|
| `accountSearch.js` | Pure. Filter rows by a word-by-word search over named fields; the years present in a list. |
| `ListTools.jsx` | The search box and an optional Year select above a list. |
| `myCrops.js` | Pure. Sections, status wording, the main button of a crop, its columns' values. |
| `MyCropsPage.jsx` | The farmer's Crops page. |
| `myAssistance.js` | Pure. Sections, title and status wording of an assistance record. |
| `MyAssistancePage.jsx` | The farmer's Assistance page. |
| `myDisasters.js` | Pure. Sections and status wording of a disaster report. |
| `MyDisastersPage.jsx` | The farmer's Disasters page. |
| `myForecast.js` | Pure. Sections, countdown and difference wording of the forecast. |
| `MyForecastPage.jsx` | The farmer's Forecast page. |
| `accountRoutes.jsx` | `CropsRoute`, `CropAssistanceRoute`, `ForecastRoute`: the farmer's screen for a farmer, the office page otherwise. |

New elsewhere: `pages/Monitoring/harvestGateInfo.js` (the function moved out of `CropMonitoringPage.jsx`), `pages/AssistanceManagement/ConfirmReceivedModal.jsx` (moved out of `CropAssistancePage.jsx`).

Modified: `pages/Monitoring/CropMonitoringPage.jsx` (three `export`s, one import), `pages/Forecasting/ForecastingPage.jsx` (two `export`s), `pages/AssistanceManagement/CropAssistancePage.jsx` (import the moved modal), `pages/Monitoring/DisasterPage.jsx`, `App.jsx`, `pages/Account/todoRules.js`, `TodoCard.jsx`, `AccountHome.jsx`.

---

### Task 1: Shared pieces: search, the list tools, and the windows made importable

**Files:**
- Create: `src/pages/Account/accountSearch.js`, `src/pages/Account/ListTools.jsx`, `src/pages/Monitoring/harvestGateInfo.js`, `src/pages/AssistanceManagement/ConfirmReceivedModal.jsx`
- Modify: `src/pages/Monitoring/CropMonitoringPage.jsx`, `src/pages/Forecasting/ForecastingPage.jsx`, `src/pages/AssistanceManagement/CropAssistancePage.jsx`
- Test: `tests/accountListTools.test.mjs`

**Interfaces:**
- Consumes: `matchesSearch(text, query)` from `utils/searchMatch.js`; `harvestGate` from `pages/Monitoring/harvestReport.js`.
- Produces:
  - `searchRows(rows, query, textOf: (row) => string) -> rows` (word by word, any order; an empty query returns every row)
  - `yearsOf(rows, dateOf: (row) => string | null) -> number[]` (distinct years, newest first; unreadable dates skipped)
  - `inYear(rows, year, dateOf) -> rows` (`year` `''` returns every row)
  - `<ListTools search onSearch placeholder years? year? onYear? />`
  - `harvestGateInfo(row, today = todayISO()) -> { gated: boolean, message: string | null }` (same body as today; `today` added for tests)
  - Named exports `ViewLogsModal`, `RecordHarvestFromMonitoringModal` from `CropMonitoringPage.jsx`; `ForecastDetailModal`, `YieldAnalysisTab` from `ForecastingPage.jsx`; default export `ConfirmReceivedModal({ record, onClose, onDone })`.

- [ ] **Step 1: Write the failing test** `tests/accountListTools.test.mjs`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
const { searchRows, yearsOf, inYear } = await import(new URL('../src/pages/Account/accountSearch.js', import.meta.url).href)
const { harvestGateInfo } = await import(new URL('../src/pages/Monitoring/harvestGateInfo.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const rows = [{ id: 1, crop: 'Ginger', place: 'Santa Cecilia', d: '2026-08-13' }, { id: 2, crop: 'Rice', place: 'Alaska', d: '2025-06-01' }, { id: 3, crop: 'Rice', place: 'Santa Cecilia', d: null }]
const textOf = (r) => `${r.crop} ${r.place}`
eq(searchRows(rows, '', textOf).length, 3, 'no search: every row')
eq(searchRows(rows, 'rice', textOf).map((r) => r.id), [2, 3], 'one word')
eq(searchRows(rows, 'cecilia rice', textOf).map((r) => r.id), [3], 'words in any order')
eq(searchRows(rows, 'corn', textOf), [], 'no match')
eq(yearsOf(rows, (r) => r.d), [2026, 2025], 'the years present, newest first')
eq(yearsOf([], (r) => r.d), [], 'no rows, no years')
eq(inYear(rows, '', (r) => r.d).length, 3, 'all years')
eq(inYear(rows, '2025', (r) => r.d).map((r) => r.id), [2], 'one year; a row with no date is left out')

const base = { date_planted: '2026-01-01', expected_harvest_date: '2026-04-11' }   // 100 days
eq(harvestGateInfo(base, '2026-01-20').gated, true, 'under half the growing time: not yet')
ok(harvestGateInfo(base, '2026-01-20').message, 'with the reason')
eq(harvestGateInfo(base, '2026-03-01'), { gated: false, message: null }, 'past half: allowed')
eq(harvestGateInfo({ ...base, date_planted_is_estimated: true }, '2026-03-01').gated, true, 'an estimated planting date blocks the harvest')

const monitoring = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
ok(/export function ViewLogsModal\(/.test(monitoring) && /export function RecordHarvestFromMonitoringModal\(/.test(monitoring), 'the two windows can be imported')
ok(monitoring.includes("from './harvestGateInfo.js'") && !/^function harvestGateInfo/m.test(monitoring), 'the gate lives in its own file')
const forecasting = read('../src/pages/Forecasting/ForecastingPage.jsx')
ok(/export function ForecastDetailModal\(/.test(forecasting) && /export function YieldAnalysisTab\(/.test(forecasting), 'the forecast window and the yield tab can be imported')
const assistance = read('../src/pages/AssistanceManagement/CropAssistancePage.jsx')
ok(assistance.includes("from './ConfirmReceivedModal.jsx'") && !/^function ConfirmReceivedModal/m.test(assistance), 'Confirm Received lives in its own file')
ok(read('../src/pages/Account/ListTools.jsx').includes('type="search"'), 'the list tools hold the search box')
console.log(`ok - ${n} assertions`)
```

- [ ] **Step 2: Run it** — `cd oma-frontend && node --test tests/accountListTools.test.mjs`. Expected: FAIL, cannot find `accountSearch.js`.
- [ ] **Step 3: Implement.** Move `harvestGateInfo` and `ConfirmReceivedModal` with their bodies unchanged (carry over exactly the imports each one uses). Add `export` to the four functions. `ListTools`: a bordered row holding a search input (15px text on a phone, 44px tall) and, when `years` has more than one entry, a Year `<select>` ("All years" first).
- [ ] **Step 4: Run it, then the whole suite and lint the touched files.** Expected: PASS; `npm test` all pass; ESLint shows no more problems in the three office files than on `master`.
- [ ] **Step 5: Commit** — `"Account kit: list search and year filter; the farmer's windows can be imported"`.

---

### Task 2: Crops

**Files:**
- Create: `src/pages/Account/myCrops.js`, `src/pages/Account/MyCropsPage.jsx`, `src/pages/Account/accountRoutes.jsx`
- Modify: `src/App.jsx` (the `/crop-monitoring` route renders `CropsRoute`)
- Test: `tests/myCrops.test.mjs`

**Interfaces:**
- Consumes: Task 1; `RecordList`, `AccountPage`, `StatusBadge`, `LoadFailed` (step 1); `harvestButton(rec, gate)` from `pages/Monitoring/cropHarvestButton.js`; `fetchAllPages`.
- Produces:
  - `CROP_SECTIONS`: `Growing` (status `Planted`), `Ready to harvest` (`Near Harvest`), `Harvested` (`Harvested`), `Lost` (`Total Loss`)
  - `cropStatusLabel(rec) -> 'Growing' | 'Ready to harvest' | 'Harvested' | 'Lost' | rec.status`
  - `cropMainAction(rec, gate) -> 'activity' | 'harvest' | null` (`null` for Harvested and Total Loss; `'harvest'` only for `Near Harvest` when `gate.gated` is false; otherwise `'activity'`)
  - `sortCrops(rows) -> rows` (active: soonest expected harvest first; Harvested: newest `actual_harvest_date` first; Lost: newest `date_planted` first)
  - `cropText(rec) -> string` (crop, variety, location, season, year; what the search reads)
  - `cropDate(rec)` (the date the Year filter reads: `date_planted`)
  - `CropsRoute` default-style component in `accountRoutes.jsx`

- [ ] **Step 1: Write the failing test** `tests/myCrops.test.mjs` asserting, with these exact cases:
  - `CROP_SECTIONS.map(s => s.label)` equals `['Growing', 'Ready to harvest', 'Harvested', 'Lost']`, and each section's `match` takes only its own status.
  - `cropStatusLabel` for the four statuses and for `'Odd'` (returns `'Odd'`).
  - `cropMainAction({ status: 'Planted' }, { gated: false })` is `'activity'`; `{ status: 'Near Harvest' }` with `{ gated: false }` is `'harvest'`; `{ status: 'Near Harvest' }` with `{ gated: true }` is `'activity'`; `Harvested` and `Total Loss` are `null`.
  - `sortCrops` on two Planted (harvest `2027-02-09`, `2026-12-01`), two Harvested (`actual_harvest_date` `2026-10-02`, `2025-10-02`) returns ids in the order: Dec 2026, Feb 2027, then Oct 2026, Oct 2025.
  - `cropText({ crop_type_name: 'Ginger', variety_used: 'Native', farm_location_barangay: 'Santa Cecilia', season: 'Wet', year: 2026 })` contains all five.
  - Source checks: `MyCropsPage.jsx` contains `RecordList`, `ViewLogsModal`, `RecordHarvestFromMonitoringModal`, `CropDetailsModal`, `DisasterReportModal`, `ListTools`, `searchParams.get('record')`; `accountRoutes.jsx` contains `isFarmer ? <MyCropsPage />` and `<CropMonitoringPage />`; `App.jsx` renders `<CropsRoute />` for `path="/crop-monitoring"`.
- [ ] **Step 2: Run it** — Expected: FAIL, cannot find `myCrops.js`.
- [ ] **Step 3: Implement.**
  - `MyCropsPage`: `AccountPage title="My crops" helper="Every crop the office has on record for you."`. Loads `fetchAllPages('/production/monitoring/', { status: 'Planted,Near Harvest,Harvested,Total Loss' })`; loading, failed (`what="your crops"`, retry) and empty (`No crops yet` / `Your crops appear here once the office registers them.`).
  - Columns: Crop (title; variety under it when present), Area (ha) (right, phone hidden), Location, Date planted (phone hidden), Harvest date (expected, or the actual date once harvested), Status (badge; `DisasterIndicator` beside it as today).
  - Row buttons: the main one from `cropMainAction` ("Log activity" or "Record harvest"), then "Details".
  - Details opens `CropDetailsModal`; its `onAction` handles `activity`, `harvest` (through `harvestGateInfo`: gated shows the message as a toast) and `disaster`, as the office page does.
  - After any window saves: reload the list.
  - `?record=ID`: fetch `/production/monitoring/ID/` and open its Details, as today.
- [ ] **Step 4: Run it, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** — `"Farmer account: My crops, in sections, with the main action on each row"`.

---

### Task 3: Assistance

**Files:**
- Create: `src/pages/Account/myAssistance.js`, `src/pages/Account/MyAssistancePage.jsx`
- Modify: `src/pages/Account/accountRoutes.jsx` (`CropAssistanceRoute`), `src/App.jsx`
- Test: `tests/myAssistance.test.mjs`

**Interfaces:**
- Consumes: Task 1; `ConfirmReceivedModal`; `ReportNotReceivedModal` from `AssistanceFollowUpModals.jsx`; `formatAssistanceQuantity` from `assistanceFieldHelpers.js`.
- Produces:
  - `ASSISTANCE_SECTIONS`: `Waiting for you` (`AWAITING_CONFIRMATION`), `Being followed up` (`NOT_RECEIVED`), `Scheduled` (`PENDING`), `History` (everything else, so an unknown status is still listed)
  - `assistanceStatusLabel(status)`: `AWAITING_CONFIRMATION` → `Confirm`, `NOT_RECEIVED` → `Not received`, `PENDING` → `Scheduled`, `CONFIRMED` → `Received`, `RESOLVED` → `Resolved`, else the status as given
  - `assistanceTone(status)`: amber, red, grey, green, green, grey in that order
  - `canConfirm(record) -> boolean` (only `AWAITING_CONFIRMATION`)
  - `assistanceText(record)`, `assistanceDate(record)` (`date_given`), `sortAssistance(rows)` (newest `date_given` first)

- [ ] **Step 1: Write the failing test** with one record per status plus `'ODD'`: each lands in exactly one section (the unknown one in History); labels and tones as listed; `canConfirm` true only for the awaiting one; sorted newest first. Source checks: `MyAssistancePage.jsx` contains `RecordList`, `ConfirmReceivedModal`, `ReportNotReceivedModal`, `'/interventions/my-beneficiary-history/'`, the labels `Received` and `Not received`; `accountRoutes.jsx` contains `isFarmer ? <MyAssistancePage />`.
- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: Implement.** `AccountPage title="Assistance" helper="Help recorded for you by the office or your organization."`. Columns: Assistance (title), Quantity, From (source agencies), Date given, Status. An awaiting row has two buttons: "Received" (main, opens `ConfirmReceivedModal`) and "Not received" (opens `ReportNotReceivedModal`). Year filter and search. Reload after either window is done. `CropAssistanceRoute`: farmer → `MyAssistancePage`, else `CropAssistancePage`.
- [ ] **Step 4: Run it, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** — `"Farmer account: Assistance, with Received and Not received on the row"`.

---

### Task 4: Disasters

**Files:**
- Create: `src/pages/Account/myDisasters.js`, `src/pages/Account/MyDisastersPage.jsx`
- Modify: `src/pages/Monitoring/DisasterPage.jsx` (a farmer gets `MyDisastersPage`)
- Test: `tests/myDisasters.test.mjs`

**Interfaces:**
- Consumes: `canRecoverDisaster`, `disasterStatusLabel` from `pages/Monitoring/disasterRecovery.js`; `ChooseCropsModal`, `MultiCropDisasterModal`; `DisasterLogDetailsModal`; the `MarkRecoveredModal` of `FarmerDisasterPage.jsx` (exported from there in this task).
- Produces:
  - `DISASTER_SECTIONS`: `Ongoing` (status `Active`), `Recovered` (everything else)
  - `disasterTone(row)`: amber when it can still be marked recovered, grey when Active but not recoverable, green when Recovered
  - `reportBlock(crops) -> string | null` (`null` when there is an active crop; otherwise `'You can only report a disaster on a crop you have on record.'`)
  - `disasterText(row)`, `sortDisasters(rows)` (newest `date_of_occurrence` first)

- [ ] **Step 1: Write the failing test** for the sections, tones, `reportBlock([])` and `reportBlock([{}])`, the sort, and source checks: `MyDisastersPage.jsx` contains `RecordList`, `ChooseCropsModal`, `MultiCropDisasterModal`, `DisasterLogDetailsModal`, `MarkRecoveredModal`, `searchParams.get('crop')`, the button text `Report a disaster`, and does not contain `inline`; `DisasterPage.jsx` renders `<MyDisastersPage />` for a farmer.
- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: Implement.** `AccountPage title="Disasters" helper="Damage you reported on your crops."` with the main button "Report a disaster". The page is the list of reports (columns: Disaster (type, title), Crop, Date, Area affected (right), Status). Row buttons: "Mark recovered" (main, only when `canRecoverDisaster`) and "Details" (opens `DisasterLogDetailsModal`, which already holds Print and Download). "Report a disaster" opens `ChooseCropsModal` as a window, then `MultiCropDisasterModal` as a window; with no active crop it shows the `reportBlock` line under the heading instead of opening. `?crop=ID` opens the second step on that crop straight away, then clears the parameter. `FarmerDisasterPage.jsx` stays in the project (its `MarkRecoveredModal` is used); it is no longer routed.
- [ ] **Step 4: Run it, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** — `"Farmer account: Disasters opens on the reports, with Report a disaster as a window"`.

---

### Task 5: Forecast

**Files:**
- Create: `src/pages/Account/myForecast.js`, `src/pages/Account/MyForecastPage.jsx`
- Modify: `src/pages/Account/accountRoutes.jsx` (`ForecastRoute`), `src/App.jsx`
- Test: `tests/myForecast.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`ForecastDetailModal`, `YieldAnalysisTab`); `PillTabs`.
- Produces:
  - `FORECAST_SECTIONS`: `Growing` (`Planted`, `Near Harvest`), `Harvested` (`Harvested`)
  - `countdown(expected, today) -> string` (`'in 85 days'`, `'tomorrow'`, `'today'`, `'12 days late'`; `''` when there is no date)
  - `yieldDifference(estimate, actual) -> { text: string, tone: 'green' | 'red' | 'grey' } | null` (`'+12%'` green, `'-8%'` red, `'0%'` grey; `null` when either number is missing or the estimate is 0)
  - `kg(value) -> string` (`'2,400 kg'`, or `null` when missing)

- [ ] **Step 1: Write the failing test** for the sections, `countdown` (the four wordings and the empty one, with `today = '2026-11-16'`), `yieldDifference(1000, 1120)`, `(1000, 920)`, `(1000, 1000)`, `(0, 5)`, `(null, 5)`, `kg(2400)`, `kg(null)`. Source checks: `MyForecastPage.jsx` contains `RecordList`, `ForecastDetailModal`, `YieldAnalysisTab`, `ordering: 'forecast'`; `accountRoutes.jsx` contains `isFarmer ? <MyForecastPage />`.
- [ ] **Step 2: Run it** — Expected: FAIL.
- [ ] **Step 3: Implement.** `AccountPage title="Forecast" helper="When each crop is expected to be harvested, and how past harvests compared."`. Two tabs as today (Forecast, Yield analysis); the second renders `YieldAnalysisTab` unchanged. The Forecast tab loads `fetchAllPages('/production/monitoring/', { status: 'Planted,Near Harvest,Harvested', ordering: 'forecast' })`. Columns: Crop (title), Area (ha) (right, phone hidden), Expected harvest (date and the countdown for a growing crop), Est. yield (right), Actual harvest (phone hidden), Actual yield (right, phone hidden), Difference (badge; phone badge for a harvested crop, the status badge for a growing one). Row button: "Details" (opens `ForecastDetailModal`). Search over crop and location.
- [ ] **Step 4: Run it, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** — `"Farmer account: Forecast as one list, growing crops then harvested ones"`.

---

### Task 6: Home's to-do buttons act in place

**Files:**
- Modify: `src/pages/Account/todoRules.js`, `src/pages/Account/TodoCard.jsx`, `src/pages/Account/AccountHome.jsx`, `tests/todoRules.test.mjs`, `tests/accountHome.test.mjs`

**Interfaces:**
- Produces: a farmer's to-do item becomes `{ key, tone, title, detail, actions: [{ label, primary?, to? , act?: { kind, record } }] }` with `kind` one of `'received'`, `'not-received'`, `'activity'`, `'harvest'`. An item for a fisherfolk or an organization keeps one link action (`to`), unchanged in behaviour.
  - Assistance awaiting: two actions, `Received` (primary, `received`) and `Not received` (`not-received`), both carrying the assistance record.
  - Activity due or overdue: `Log activity` (`activity`, the crop).
  - Ready to harvest: `Record harvest` (`harvest`, the crop).
  - Loan overdue: `View loan` (link, as now).

- [ ] **Step 1: Change the tests first.** In `todoRules.test.mjs` the farmer expectations become, per item, `[tone, title, actions.map(a => a.label), actions.map(a => a.act?.kind || a.to)]`: `Ginger: Weeding` → `['Log activity']`, `['activity']`; `Fertilizer, 5 bags` → `['Received', 'Not received']`, `['received', 'not-received']`; `Rice is ready to harvest` → `['Record harvest']`, `['harvest']`; `Hand Tractor is due back` → `['View loan']`, `['/my-equipment']`. The fisherfolk and organization expectations keep their links (read through the same `actions` shape). In `accountHome.test.mjs`: `AccountHome.jsx` contains `ViewLogsModal`, `RecordHarvestFromMonitoringModal`, `ConfirmReceivedModal`, `ReportNotReceivedModal`, `harvestGateInfo`; `TodoCard.jsx` contains `onAct`.
- [ ] **Step 2: Run them** — Expected: FAIL (items still carry `action`).
- [ ] **Step 3: Implement.** `TodoCard` draws each action: a `Link` for `to`, a button calling `onAct(action.act)` otherwise; two buttons sit side by side and each is at least 44px tall. `AccountHome` holds the open window, opens the matching one for `onAct`, runs `harvestGateInfo` before Record harvest (gated shows the message as a toast), and reloads Home when a window is done.
- [ ] **Step 4: Run them, then `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** — `"Account Home: a farmer's to-do buttons open the window in place"`.

---

### Task 7: Verify

- [ ] **Step 1:** `npm test` (all pass), ESLint on the touched files (no new problems), `npx vite build` (builds).
- [ ] **Step 2: Browser, scratch stack, farmer at 390 and 1440.** Each of `/crop-monitoring`, `/crop-assistance`, `/disaster`, `/forecasting`: heading, sections, badges, buttons. `/crop-monitoring?record=ID` opens Details. `/disaster?crop=ID` opens the report form on that crop.
- [ ] **Step 3: The work still saves.** On the scratch stack as the farmer: log an activity from a row, and the row's to-do disappears from Home; report a disaster and see it listed under Ongoing; mark it recovered and see it move. If the scratch data has an awaiting assistance record, confirm it from Home (create one as the Admin first if not).
- [ ] **Step 4: Failure state.** Block `production/monitoring` and open `/crop-monitoring`: "Couldn't load your crops" with Try again; unblock and retry.
- [ ] **Step 5: Others unchanged.** Admin: `/crop-monitoring`, `/crop-assistance`, `/disaster`, `/forecasting` at 1440 and 390 look as before. Fisherfolk and organization accounts: their pages open as before.
- [ ] **Step 6:** Whole-branch review, fixes if any, then ask the owner before pushing.
