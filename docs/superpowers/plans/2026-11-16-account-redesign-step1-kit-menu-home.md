# Account redesign, step 1: kit, menu and Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Farmer, fisherfolk and organization accounts get one shared kit, one five-entry menu (identical on phone and computer, with More) and a task-first Home.

**Architecture:** A new folder `oma-frontend/src/pages/Account/` holds pure rule modules (menu, to-do, tones, list shaping, load state) and the thin React pieces that draw them. Home reads the same own-record endpoints the current Homes read; its buttons are links to the existing pages, so no form or window is touched. Phone tabs and the sidebar both read `accountNav.js`.

**Tech Stack:** React 19, Vite, Tailwind v4, lucide-react, react-router. Tests: `node --test "tests/*.test.mjs"` (pure-module tests and source-reading tests that strip CR).

**Spec:** `docs/superpowers/specs/2026-11-16-account-redesign-design.md`

## Global Constraints

- Frontend only. No backend change, no migration, no SQL.
- Office (Admin, Focal Person) screens must look and behave exactly as before.
- Every existing address keeps working.
- English, short plain words, sentence case, verb-first buttons.
- Phone: buttons at least 44px tall; no text under 13px in anything this step adds or restyles.
- Four badge tones only: green, amber, red, grey.
- A failed request is shown as failed, never as zero or empty.
- Never commit `package-lock.json`. Never run `git stash`. Commit on the feature branch only; push only after the owner says yes.
- Browser checks run on the scratch stack (MariaDB 3307, Django 8001, Vite 5174), never the live database.

## Review Focus

1. One Home source fails (for example the assistance request returns 500): that part shows "Couldn't load. Try again", the other parts still show, no figure reads 0 because of it. Pinned in Task 2 (`settleAll`) and Task 5 (`homeSummary`).
2. Nothing to show: a farmer with no crops, an organization with no members, a fisherfolk with no cycles. Each gets the empty line, not a blank screen. Pinned in Task 4 (`todos` returns `[]`) and Task 5.
3. A farmer or fisherfolk who belongs to no organization: no Borrow equipment entry, and `/organizations/my-equipment/` is not requested. Pinned in Task 1 and Task 5 (`homeSources`).
4. Many to-do items (30 overdue activities): Home shows the first 6 and a line "and 24 more". Pinned in Task 4 (`capTodos`).
5. A status the tone map does not know: grey badge, text shown as given. Pinned in Task 2.

---

## File Structure

New, in `oma-frontend/src/pages/Account/`:

| File | Responsibility |
|---|---|
| `accountNav.js` | Pure. The menu of each account kind and which entry a location belongs to. |
| `statusTone.js` | Pure. Status string to one of four tones. |
| `loadState.js` | Pure. Settle several named requests; report which failed. |
| `recordList.js` | Pure. Split a column definition into phone parts; group rows into sections. |
| `todoRules.js` | Pure. Fetched records in, ordered to-do items out. |
| `homeData.js` | Pure. Which sources a kind loads; the summary strip and active list. |
| `AccountIcon.jsx` | Icon name to lucide component. |
| `StatusBadge.jsx` | Badge in one of the four tones. |
| `ListStates.jsx` | `LoadingRows`, `LoadFailed`, `EmptyNote`. |
| `RecordList.jsx` | Phone rows or computer table from one column definition. |
| `AccountPage.jsx` | `PageLayout` plus a visible heading, helper line and main button. |
| `TodoCard.jsx` | One to-do item. |
| `AccountHome.jsx` | Home for all four kinds. |
| `MoreScreen.jsx` | The More page (phone and computer). |

Modified: `pages/Citizen/CitizenHomePage.jsx`, `pages/Citizen/CitizenPhoneShell.jsx`, `pages/Citizen/FarmerChrome.jsx`, `components/Layout/Sidebar.jsx`, `App.jsx`, `tests/helpManualSplit.test.mjs`, `tests/lookDates.test.mjs`.

Deleted: `pages/Citizen/FarmerPhoneHome.jsx`, `FisherfolkPhoneHome.jsx`, `OrgPhoneHome.jsx`. `HomeChartCards.jsx`, `homeCharts.js` and `tests/homeCharts.test.mjs` stay untouched (step 2 decides where the charts go).

---

### Task 1: The menu definition

**Files:**
- Create: `oma-frontend/src/pages/Account/accountNav.js`
- Test: `oma-frontend/tests/accountNav.test.mjs`

**Interfaces:**
- Produces:
  - `accountKind({ isFarmer, isFisherfolk, isOrg, orgType }) -> 'farmer' | 'fisherfolk' | 'orgFarm' | 'orgFish' | null`
  - `accountNav(kind, { isMember = false } = {}) -> { main: Entry[], more: Entry[] }`, `Entry = { key, to, label, icon }` (`icon` is a name string)
  - `activeNavKey(nav, pathname, search = '') -> string | null` (a `main` key; an address that belongs to a `more` entry returns `'more'`)
  - `accountTheme(kind) -> 'crop' | 'fish'`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
const { accountKind, accountNav, activeNavKey, accountTheme } = await import(new URL('../src/pages/Account/accountNav.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const pairs = (list) => list.map((e) => [e.label, e.to])

eq(accountKind({ isFarmer: true }), 'farmer', 'farmer')
eq(accountKind({ isFisherfolk: true }), 'fisherfolk', 'fisherfolk')
eq(accountKind({ isOrg: true, orgType: 'FARMERS_ORG' }), 'orgFarm', 'farmers organization')
eq(accountKind({ isOrg: true, orgType: 'FISHERFOLK_ORG' }), 'orgFish', 'fisherfolk organization')
eq(accountKind({}), null, 'staff has no account menu')

eq(pairs(accountNav('farmer').main), [['Home', '/my-account'], ['Crops', '/crop-monitoring'], ['Assistance', '/crop-assistance'], ['Disasters', '/disaster'], ['More', '/more']], 'farmer menu')
eq(pairs(accountNav('farmer').more), [['Forecast', '/forecasting'], ['My profile', '/my-profile'], ['User Manual', '/manual']], 'farmer More, not a member')
eq(pairs(accountNav('farmer', { isMember: true }).more), [['Forecast', '/forecasting'], ['Borrow equipment', '/my-equipment'], ['My profile', '/my-profile'], ['User Manual', '/manual']], 'a member can borrow')
eq(pairs(accountNav('fisherfolk').main), [['Home', '/my-account'], ['Cycles', '/fisheries-monitoring'], ['Assistance', '/fisheries-assistance'], ['Disasters', '/disaster'], ['More', '/more']], 'fisherfolk menu')
eq(pairs(accountNav('fisherfolk').more)[0], ['Forecast', '/fisheries-forecasting'], 'fisherfolk forecast')
eq(pairs(accountNav('orgFarm').main), [['Home', '/my-account'], ['Members', '/my-organization'], ['Assistance', '/crop-assistance'], ['Equipment', '/my-organization?tab=equipment'], ['More', '/more']], 'farmers organization menu')
eq(pairs(accountNav('orgFish').main)[2], ['Assistance', '/fisheries-assistance'], 'fisherfolk organization assistance')
eq(pairs(accountNav('orgFarm').more), [['Officers', '/my-organization?tab=officers'], ['Organization profile', '/my-profile'], ['User Manual', '/manual']], 'organization More')
for (const kind of ['farmer', 'fisherfolk', 'orgFarm', 'orgFish']) {
  const nav = accountNav(kind, { isMember: true })
  eq(nav.main.length, 5, `${kind}: five entries`)
  assert.ok([...nav.main, ...nav.more].every((e) => e.key && e.icon && e.label && e.to.startsWith('/'))); n++
}

const farmer = accountNav('farmer', { isMember: true })
eq(activeNavKey(farmer, '/my-account'), 'home', 'home')
eq(activeNavKey(farmer, '/crop-monitoring', '?record=4'), 'crops', 'a deep link stays on Crops')
eq(activeNavKey(farmer, '/forecasting'), 'more', 'a More page lights More')
eq(activeNavKey(farmer, '/my-equipment'), 'more', 'borrow equipment is under More')
eq(activeNavKey(farmer, '/more'), 'more', 'More itself')
eq(activeNavKey(farmer, '/users'), null, 'an address outside the menu lights nothing')
const org = accountNav('orgFarm')
eq(activeNavKey(org, '/my-organization'), 'members', 'members is the default tab')
eq(activeNavKey(org, '/my-organization', '?tab=equipment'), 'equipment', 'equipment tab')
eq(activeNavKey(org, '/my-organization', '?tab=borrowed'), 'equipment', 'loans belong to Equipment')
eq(activeNavKey(org, '/my-organization', '?tab=borrowed-history'), 'equipment', 'loan history too')
eq(activeNavKey(org, '/my-organization', '?tab=officers'), 'more', 'officers is under More')
eq(activeNavKey(org, '/my-organization', '?tab=confirmed'), 'members', 'the old confirmed tab stays with Members for now')

eq(accountTheme('farmer'), 'crop', 'green'); eq(accountTheme('orgFarm'), 'crop', 'green')
eq(accountTheme('fisherfolk'), 'fish', 'blue'); eq(accountTheme('orgFish'), 'fish', 'blue')
console.log(`ok - ${n} assertions`)
```

- [ ] **Step 2: Run it** — `cd oma-frontend && node --test tests/accountNav.test.mjs`. Expected: FAIL, cannot find `accountNav.js`.
- [ ] **Step 3: Implement `accountNav.js`** with the four exports above. Keys: `home`, `crops` | `cycles` | `members`, `assistance`, `disasters` | `equipment`, `more`; More keys `forecast`, `borrow`, `officers`, `profile`, `manual`. Icon names: `home`, `crop`, `cycle`, `members`, `assistance`, `disaster`, `equipment`, `more`, `forecast`, `borrow`, `officers`, `profile`, `manual`.
- [ ] **Step 4: Run it** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add` the two files; `git commit -m "Account kit: one menu definition for farmer, fisherfolk and organization accounts"`.

---

### Task 2: Tones and load state

**Files:**
- Create: `src/pages/Account/statusTone.js`, `src/pages/Account/loadState.js`
- Test: `tests/accountKitRules.test.mjs`

**Interfaces:**
- Produces:
  - `toneOf(status) -> 'green' | 'amber' | 'red' | 'grey'`; `TONES = ['green', 'amber', 'red', 'grey']`
  - `settleAll(sources: { [name]: () => Promise }) -> Promise<{ data: { [name]: value | null }, failed: string[] }>` (never rejects; a source that throws is `null` and named in `failed`)
  - `listOf(response) -> array` (`response.data` when it is an array, else `response.data.results`, else `[]`)

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
const { toneOf, TONES } = await import(new URL('../src/pages/Account/statusTone.js', import.meta.url).href)
const { settleAll, listOf } = await import(new URL('../src/pages/Account/loadState.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }

eq(TONES, ['green', 'amber', 'red', 'grey'], 'four tones only')
for (const s of ['Planted', 'Stocked', 'Active', 'CONFIRMED', 'RESOLVED', 'BORROWED', 'Good']) eq(toneOf(s), 'green', `${s} is fine or done`)
for (const s of ['Near Harvest', 'AWAITING_CONFIRMATION', 'REQUESTED', 'RETURN_PENDING', 'Needs Repair', 'Late']) eq(toneOf(s), 'amber', `${s} waits on someone`)
for (const s of ['Overdue', 'NOT_RECEIVED', 'Total Loss', 'REJECTED', 'Broken', 'Lost', 'Not Operational']) eq(toneOf(s), 'red', `${s} is a problem`)
for (const s of ['Harvested', 'RETURNED', 'CANCELLED', 'PENDING', 'Inactive']) eq(toneOf(s), 'grey', `${s} is finished or not started`)
eq(toneOf('Something new'), 'grey', 'an unknown status is grey')
eq(toneOf(''), 'grey', 'no status is grey'); eq(toneOf(undefined), 'grey', 'missing status is grey')
eq(toneOf('near harvest'), 'amber', 'case does not matter')

const out = await settleAll({ crops: async () => ({ data: [1, 2] }), parcels: async () => { throw new Error('500') }, none: async () => ({ data: { results: [] } }) })
eq(out.failed, ['parcels'], 'the failed source is named')
eq(out.data.parcels, null, 'a failed source is null, not an empty list')
eq(listOf(out.data.crops), [1, 2], 'a plain array'); eq(listOf(out.data.none), [], 'a paged answer')
eq(listOf(null), [], 'nothing'); eq(listOf({ data: { results: [3] } }), [3], 'results')
eq((await settleAll({})).failed, [], 'no sources, nothing failed')
console.log(`ok - ${n} assertions`)
```

- [ ] **Step 2: Run it** — `node --test tests/accountKitRules.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both modules.** `toneOf` compares on the upper-cased status with spaces and underscores treated alike.
- [ ] **Step 4: Run it** — Expected: PASS.
- [ ] **Step 5: Commit** — `"Account kit: four status tones, and requests that report which part failed"`.

---

### Task 3: The record list

**Files:**
- Create: `src/pages/Account/recordList.js`, `RecordList.jsx`, `StatusBadge.jsx`, `ListStates.jsx`, `AccountPage.jsx`, `AccountIcon.jsx`
- Test: `tests/recordList.test.mjs`

**Interfaces:**
- Consumes: `toneOf` (Task 2); `TABLE_HEAD_ROW`, `TABLE_HEAD_CELL` from `components/UI/tableStyles.js`; `PageLayout`.
- Produces:
  - Column: `{ key, label, phone?: 'title' | 'line' | 'badge' | 'hide', align?: 'right', render?: (row) => node }` (default `phone` is `'line'`; value is `render(row)` or `row[key]`, and a blank value is `'—'`)
  - `phoneParts(columns) -> { title: Column, badge: Column | null, lines: Column[] }` (first column is the title when none is marked; at most two lines, the rest are dropped on a phone)
  - `groupRows(rows, sections) -> [{ key, label, rows }]` (`sections = [{ key, label, match(row) }]`; empty sections are left out; a row goes to the first section that matches; with no `sections` one unnamed group)
  - `cellText(column, row) -> string | node`
  - `<RecordList columns rows sections? state onRetry empty={{ title, hint }} actions?={(row) => [{ label, primary?, to?, onClick? }]} />` with `state: 'loading' | 'failed' | 'ready'`
  - `<StatusBadge status>text</StatusBadge>`, `<LoadingRows count? />`, `<LoadFailed onRetry what? />`, `<EmptyNote title hint />`
  - `<AccountPage title helper action? theme>children</AccountPage>`
  - `<AccountIcon name size? className? />`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
const { phoneParts, groupRows, cellText } = await import(new URL('../src/pages/Account/recordList.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const columns = [
  { key: 'crop', label: 'Crop', phone: 'title' }, { key: 'area', label: 'Area (ha)', align: 'right' }, { key: 'place', label: 'Location' },
  { key: 'planted', label: 'Date planted' }, { key: 'status', label: 'Status', phone: 'badge' }, { key: 'note', label: 'Note', phone: 'hide' },
]
const parts = phoneParts(columns)
eq(parts.title.key, 'crop', 'the title column'); eq(parts.badge.key, 'status', 'the badge column')
eq(parts.lines.map((c) => c.key), ['area', 'place'], 'two detail lines at most, hidden ones never')
eq(phoneParts([{ key: 'name', label: 'Name' }, { key: 'x', label: 'X' }]).title.key, 'name', 'the first column is the title by default')
eq(phoneParts([{ key: 'name', label: 'Name' }]).badge, null, 'no badge column')

const rows = [{ id: 1, status: 'Planted' }, { id: 2, status: 'Harvested' }, { id: 3, status: 'Planted' }, { id: 4, status: 'Odd' }]
const sections = [{ key: 'growing', label: 'Growing', match: (r) => r.status === 'Planted' }, { key: 'ready', label: 'Ready to harvest', match: (r) => r.status === 'Near Harvest' }, { key: 'done', label: 'Harvested', match: (r) => r.status === 'Harvested' }]
eq(groupRows(rows, sections).map((g) => [g.label, g.rows.map((r) => r.id)]), [['Growing', [1, 3]], ['Harvested', [2]]], 'empty sections are left out; an unmatched row is not listed')
eq(groupRows(rows).map((g) => [g.label, g.rows.length]), [[null, 4]], 'no sections: one group')
eq(groupRows([], sections), [], 'no rows, no groups')

eq(cellText({ key: 'area' }, { area: 0 }), 0, 'zero is a value'); eq(cellText({ key: 'area' }, { area: '' }), '—', 'blank is a dash')
eq(cellText({ key: 'area' }, {}), '—', 'missing is a dash'); eq(cellText({ key: 'x', render: (r) => `${r.a} ha` }, { a: 2 }), '2 ha', 'render wins')

const list = read('../src/pages/Account/RecordList.jsx')
ok(list.includes('TABLE_HEAD_ROW') && list.includes('TABLE_HEAD_CELL'), 'the computer table uses the office table header')
ok(list.includes('LoadingRows') && list.includes('LoadFailed') && list.includes('EmptyNote'), 'loading, failed and empty are three different things')
ok(list.includes('md:hidden') && list.includes('hidden md:block'), 'rows on a phone, a table on a computer')
ok(list.includes('min-h-[44px]'), 'phone buttons are 44px tall')
ok(!/text-\[(9|10|11|12)(\.\d+)?px\]/.test(list.split('hidden md:block')[0]), 'no phone text under 13px')
const states = read('../src/pages/Account/ListStates.jsx')
ok(states.includes("Couldn't load") && states.includes('Try again'), 'a failure says so and offers a retry')
ok(read('../src/pages/Account/StatusBadge.jsx').includes('toneOf'), 'the badge tone comes from the one map')
ok(read('../src/pages/Account/AccountPage.jsx').includes('<h1'), 'the page has a visible heading')
console.log(`ok - ${n} assertions`)
```

- [ ] **Step 2: Run it** — `node --test tests/recordList.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** `recordList.js` pure. `RecordList.jsx`: phone block `md:hidden` (section label, then a bordered row per record: title 15px semibold, lines 13px, badge at the right, buttons in a row, primary one filled in the theme colour via `bg-primary`), computer block `hidden md:block` (one `<table>`; section label as a full-width subheader row; `align: 'right'` gives `text-right tabular-nums`; a last Action column when `actions` is given). `StatusBadge` reuses `components/UI/StatusPill` tones: green→`green`, amber→`amber`, red→`rose`, grey→`slate`. `AccountPage` passes no `title` to `PageLayout` and draws its own `<h1>` (18px), helper (13px, secondary text) and `action` (right on `md+`, full-width under the heading on a phone). `AccountIcon` maps the Task 1 icon names to lucide icons (`Home, Sprout, Waves, Users, HandHeart, AlertTriangle, Package, Menu, TrendingUp, HandHelping, UserCog, User, BookOpen`).
- [ ] **Step 4: Run it** — Expected: PASS.
- [ ] **Step 5: Commit** — `"Account kit: one record list (rows on a phone, a table on a computer), badge, page heading and the three list states"`.

---

### Task 4: To-do rules

**Files:**
- Create: `src/pages/Account/todoRules.js`
- Test: `tests/todoRules.test.mjs`

**Interfaces:**
- Consumes: record shapes as the current pages read them: assistance `{ id, status, assistance_type, quantity, date_given }`; crop `{ id, status, crop_type_name }`; suggestions `{ [cropId]: [{ activity_name, status: 'overdue' | 'due_now' | 'upcoming', day_after_planting }] }`; cycle `{ id, production_cycle, status, species_name, is_near_harvest, force_harvest }`; member loan `{ id, status, overdue, equipment_name, due_date }`; organization confirmable `{ latest_request_status }`; organization loan `{ status, overdue }`.
- Produces:
  - `Todo = { key, tone: 'red' | 'amber', title, detail, action: { label, to } }`
  - `farmerTodos({ assistance, crops, suggestions, loans }) -> Todo[]`
  - `fisherfolkTodos({ assistance, cycles, loans }) -> Todo[]`
  - `orgTodos({ confirmables, loans }, { assistancePath }) -> Todo[]`
  - `capTodos(todos, limit = 6) -> { shown: Todo[], more: number }`
  - Any source may be `null` (it failed) or missing; it contributes nothing. Red items come before amber; inside a tone the order is: assistance, activities, harvest, loans.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
const { farmerTodos, fisherfolkTodos, orgTodos, capTodos } = await import(new URL('../src/pages/Account/todoRules.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const brief = (t) => [t.tone, t.title, t.action.label, t.action.to]

const assistance = [
  { id: 7, status: 'AWAITING_CONFIRMATION', assistance_type: 'Fertilizer', quantity: '5 bags', date_given: '2026-11-14' },
  { id: 8, status: 'CONFIRMED', assistance_type: 'Seeds', quantity: '', date_given: '2026-10-01' },
  { id: 9, status: 'AWAITING_CONFIRMATION', assistance_type: 'Training', quantity: '', date_given: '2026-11-10' },
]
const crops = [{ id: 1, status: 'Planted', crop_type_name: 'Ginger' }, { id: 2, status: 'Near Harvest', crop_type_name: 'Rice' }, { id: 3, status: 'Harvested', crop_type_name: 'Corn' }]
const suggestions = { 1: [{ activity_name: 'Weeding', status: 'overdue', day_after_planting: 30 }, { activity_name: 'Fertilizing', status: 'due_now', day_after_planting: 45 }, { activity_name: 'Spraying', status: 'upcoming', day_after_planting: 60 }], 3: [{ activity_name: 'Old', status: 'overdue', day_after_planting: 5 }] }
const loans = [{ id: 4, status: 'BORROWED', overdue: true, equipment_name: 'Hand Tractor', due_date: '2026-11-01' }, { id: 5, status: 'BORROWED', overdue: false, equipment_name: 'Sprayer' }, { id: 6, status: 'RETURNED', overdue: true, equipment_name: 'Plow' }]

eq(farmerTodos({ assistance, crops, suggestions, loans }).map(brief), [
  ['red', 'Ginger: Weeding', 'Log activity', '/crop-monitoring?record=1'],
  ['red', 'Hand Tractor is due back', 'View loan', '/my-equipment'],
  ['amber', 'Fertilizer, 5 bags', 'Confirm', '/crop-assistance'],
  ['amber', 'Training', 'Confirm', '/crop-assistance'],
  ['amber', 'Ginger: Fertilizing', 'Log activity', '/crop-monitoring?record=1'],
  ['amber', 'Rice is ready to harvest', 'Record harvest', '/crop-monitoring?record=2'],
], 'a farmer: problems first, then what waits; harvested crops and returned loans never appear')
eq(farmerTodos({ assistance, crops, suggestions, loans })[0].detail, 'Overdue', 'the overdue line')
eq(farmerTodos({ assistance, crops, suggestions, loans })[2].detail, 'Given Nov 14, 2026', 'when it was given')
eq(farmerTodos({ assistance: null, crops: null, suggestions: null, loans: null }), [], 'failed sources add nothing')
eq(farmerTodos({}), [], 'nothing loaded, nothing to do')
eq(farmerTodos({ crops, suggestions: {} }).map((t) => t.title), ['Rice is ready to harvest'], 'no suggestions still shows the harvest')

const cycles = [{ id: 11, production_cycle: 3, status: 'Stocked', species_name: 'Tilapia' }, { id: 12, production_cycle: 4, status: 'Near Harvest', species_name: 'Bangus' }, { id: 13, production_cycle: 5, status: 'Stocked', species_name: 'Shrimp', force_harvest: true }, { id: 14, production_cycle: 6, status: 'Stocked', species_name: 'Carp', is_near_harvest: true }]
eq(fisherfolkTodos({ assistance, cycles, loans }).map(brief), [
  ['red', 'Hand Tractor is due back', 'View loan', '/my-equipment'],
  ['amber', 'Fertilizer, 5 bags', 'Confirm', '/fisheries-assistance'],
  ['amber', 'Training', 'Confirm', '/fisheries-assistance'],
  ['amber', 'Bangus is ready to harvest', 'Record harvest', '/fisheries-monitoring?cycle=4'],
  ['amber', 'Shrimp is ready to harvest', 'Record harvest', '/fisheries-monitoring?cycle=5'],
  ['amber', 'Carp is ready to harvest', 'Record harvest', '/fisheries-monitoring?cycle=6'],
], 'a fisherfolk')

const confirmables = [{ latest_request_status: null }, { latest_request_status: 'PENDING' }, { latest_request_status: 'REJECTED' }]
const orgLoans = [{ status: 'REQUESTED' }, { status: 'REQUESTED' }, { status: 'BORROWED', overdue: true }, { status: 'RETURNED', overdue: true }]
eq(orgTodos({ confirmables, loans: orgLoans }, { assistancePath: '/crop-assistance' }).map(brief), [
  ['red', '1 loan is overdue', 'View loans', '/my-organization?tab=borrowed'],
  ['amber', '2 members are waiting for a confirmation', 'Confirm for members', '/crop-assistance?tab=confirm'],
  ['amber', '2 borrow requests to review', 'Review requests', '/my-organization?tab=borrowed'],
], 'an organization: one line per kind, with a count')
eq(orgTodos({ confirmables: [{ latest_request_status: null }], loans: [{ status: 'REQUESTED' }] }, { assistancePath: '/fisheries-assistance' }).map((t) => t.title), ['1 member is waiting for a confirmation', '1 borrow request to review'], 'singular wording')
eq(orgTodos({ confirmables: null, loans: null }, { assistancePath: '/crop-assistance' }), [], 'failed sources add nothing')

const many = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}` }))
eq([capTodos(many).shown.length, capTodos(many).more], [6, 24], 'six shown, the rest counted')
eq([capTodos(many.slice(0, 6)).shown.length, capTodos(many.slice(0, 6)).more], [6, 0], 'exactly six: nothing hidden')
eq(capTodos([]), { shown: [], more: 0 }, 'none')
const keys = farmerTodos({ assistance, crops, suggestions, loans }).map((t) => t.key)
eq(new Set(keys).size, keys.length, 'every item has its own key')
console.log(`ok - ${n} assertions`)
```

- [ ] **Step 2: Run it** — `node --test tests/todoRules.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `todoRules.js`.** Dates through `utils/dateFormat.js` `formatDate`. Suggestions count only for crops whose status is `Planted` or `Near Harvest`. A loan counts only when `status === 'BORROWED' && overdue`.
- [ ] **Step 4: Run it** — Expected: PASS.
- [ ] **Step 5: Commit** — `"Account Home: the rules that turn a person's records into a to-do list"`.

---

### Task 5: Home

**Files:**
- Create: `src/pages/Account/homeData.js`, `TodoCard.jsx`, `AccountHome.jsx`
- Modify: `src/pages/Citizen/CitizenHomePage.jsx` (render `<AccountHome />` for the four kinds; keep the not-linked fallback)
- Delete: `src/pages/Citizen/FarmerPhoneHome.jsx`, `FisherfolkPhoneHome.jsx`, `OrgPhoneHome.jsx`
- Modify: `tests/helpManualSplit.test.mjs`, `tests/lookDates.test.mjs` (only the assertions that read the deleted files; point them at `AccountHome.jsx` or drop a check that no longer has a subject)
- Test: `tests/accountHome.test.mjs`

**Interfaces:**
- Consumes: `settleAll`, `listOf` (Task 2); `farmerTodos`, `fisherfolkTodos`, `orgTodos`, `capTodos` (Task 4); `RecordList`, `AccountPage`, `LoadFailed`, `EmptyNote`, `LoadingRows` (Task 3); `accountKind`, `accountTheme` (Task 1); `FARMERS_ORG_DOMAIN`, `FISHERFOLK_ORG_DOMAIN`; `fetchAllPages`.
- Produces:
  - `homeSources(kind, { isMember, orgId }) -> string[]`:
    - farmer: `['assistance', 'crops', 'parcels']`, plus `'loans'` when a member
    - fisherfolk: `['assistance', 'cycles']`, plus `'loans'` when a member
    - orgFarm / orgFish: `['members', 'confirmables', 'loans']`
  - `homeSummary(kind, data, { isActive } = {}) -> [{ label, value }]` where a figure whose source is `null` has `value: null` (drawn as "—", never 0); `isActive(member)` is the organization domain's `rowIsActive`:
    - farmer: Active crops, Total area (the active crops' area, `"1.6 ha"`), Farm parcels
    - fisherfolk: Active cycles, Ponds and cages, Harvested cycles
    - organization: Active members, Equipment on loan, Borrow requests
  - `homeActive(kind, data) -> rows` (farmer: crops that are Planted or Near Harvest; fisherfolk: cycles that are not Harvested or Total Loss; organization: `[]`)
  - `greeting(kind, label) -> { title, line }` (`title: 'Hello, Lourdes Villanueva'`; `line: 'Farmer account'` | `'Fisherfolk account'` | `'Farmers organization account'` | `'Fisherfolk organization account'`)
- Endpoints (all existing): farmer assistance `/interventions/my-beneficiary-history/`; fisherfolk assistance `/interventions/my-fisherfolk-beneficiary-history/`; crops `fetchAllPages('/production/monitoring/', { status: 'Planted,Near Harvest,Harvested,Total Loss' })`; suggestions `/production/monitoring/<id>/suggestions/` per active crop; parcels `/farmers/me/parcels/`; cycles `fetchAllPages('/fisheries/stocking/', { status: 'Stocked,Near Harvest,Late,Harvested,Total Loss' })`; member loans `/organizations/my-equipment/` (flatten every group's `loans`); organization members `domain.membersUrl(orgId)`; confirmables `domain.accountlessConfirmablesUrl`; organization loans `/organizations/<farmers|fisherfolk>/<orgId>/equipment-loans/`.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
const { homeSources, homeSummary, homeActive, greeting } = await import(new URL('../src/pages/Account/homeData.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(homeSources('farmer', { isMember: false }), ['assistance', 'crops', 'parcels'], 'a farmer outside any organization asks for no loans')
eq(homeSources('farmer', { isMember: true }), ['assistance', 'crops', 'parcels', 'loans'], 'a member also loads loans')
eq(homeSources('fisherfolk', { isMember: false }), ['assistance', 'cycles'], 'fisherfolk')
eq(homeSources('orgFish', { orgId: 3 }), ['members', 'confirmables', 'loans'], 'organization')

const crops = [{ id: 1, status: 'Planted', area_planted_ha: '1.56' }, { id: 2, status: 'Near Harvest', area_planted_ha: '0.04' }, { id: 3, status: 'Harvested', area_planted_ha: '2' }]
eq(homeSummary('farmer', { crops, parcels: [{}, {}] }), [{ label: 'Active crops', value: 2 }, { label: 'Total area', value: '1.6 ha' }, { label: 'Farm parcels', value: 2 }], 'a farmer')
eq(homeSummary('farmer', { crops, parcels: null })[2], { label: 'Farm parcels', value: null }, 'a failed source is unknown, not zero')
eq(homeSummary('farmer', { crops: null, parcels: [] }).map((f) => f.value), [null, null, 0], 'unknown crops, a real zero for parcels')
eq(homeActive('farmer', { crops }).map((r) => r.id), [1, 2], 'the active crops')
eq(homeActive('farmer', { crops: null }), [], 'nothing when the crops failed')

const cycles = [{ id: 1, status: 'Stocked', number_of_units: 2 }, { id: 2, status: 'Harvested', number_of_units: 1 }, { id: 3, status: 'Late', number_of_units: 1 }]
eq(homeSummary('fisherfolk', { cycles }), [{ label: 'Active cycles', value: 2 }, { label: 'Ponds and cages', value: 3 }, { label: 'Harvested cycles', value: 1 }], 'a fisherfolk')
eq(homeActive('fisherfolk', { cycles }).map((r) => r.id), [1, 3], 'the active cycles')

const members = [{ is_active: true }, { is_active: true }, { is_active: false }]
const loans = [{ status: 'BORROWED' }, { status: 'REQUESTED' }, { status: 'RETURNED' }, { status: 'RETURN_PENDING' }]
eq(homeSummary('orgFarm', { members, loans }, { isActive: (m) => m.is_active }), [{ label: 'Active members', value: 2 }, { label: 'Equipment on loan', value: 2 }, { label: 'Borrow requests', value: 1 }], 'an organization')
eq(homeActive('orgFarm', { members }), [], 'an organization has no active list on Home')

eq(greeting('farmer', 'Lourdes Villanueva'), { title: 'Hello, Lourdes Villanueva', line: 'Farmer account' }, 'farmer greeting')
eq(greeting('orgFish', 'Dulao Fishers').line, 'Fisherfolk organization account', 'organization greeting')
eq(greeting('fisherfolk', '').title, 'Hello', 'no name')

const home = read('../src/pages/Account/AccountHome.jsx')
ok(home.includes('settleAll') && home.includes('LoadFailed'), 'each part can fail on its own and says so')
ok(home.includes('capTodos') && home.includes('TodoCard'), 'the to-do list, capped')
ok(home.includes('Nothing needs you today'), 'the all-clear line')
ok(!/DonutCard|HarvestBarsCard|MonthlyBarsCard/.test(home), 'no charts on Home')
ok(home.indexOf('To do') < home.indexOf('Summary'), 'to-do comes before the summary')
const page = read('../src/pages/Citizen/CitizenHomePage.jsx')
ok(page.includes('AccountHome') && !/FarmerPhoneHome|FisherfolkPhoneHome|OrgPhoneHome/.test(page), 'one Home for every kind')
for (const gone of ['FarmerPhoneHome', 'FisherfolkPhoneHome', 'OrgPhoneHome']) ok(!fs.existsSync(new URL(`../src/pages/Citizen/${gone}.jsx`, import.meta.url)), `${gone} is removed`)
const card = read('../src/pages/Account/TodoCard.jsx')
ok(card.includes('min-h-[44px]') && !/text-\[(9|10|11|12)(\.\d+)?px\]/.test(card), 'a to-do button is 44px and no text is under 13px')
console.log(`ok - ${n} assertions`)
```

- [ ] **Step 2: Run it** — `node --test tests/accountHome.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** `AccountHome`: `AccountPage` with the greeting as heading; while loading, `LoadingRows`; then a "To do" heading with the count, `TodoCard`s from `capTodos`, "and N more" when hidden, or "Nothing needs you today." when the list is empty and no to-do source failed; one `LoadFailed` naming the failed parts (retry reloads everything); the active list as a `RecordList` (farmer columns: Crop, Area (ha), Location, Harvest date, Status, with a Details button to `/crop-monitoring?record=ID`; fisherfolk: Species, Ponds and cages, Location, Harvest date, Status, Details to `/fisheries-monitoring?cycle=N`; its empty note: farmer "No crops yet. Your crops appear here once the office registers them.", fisherfolk "No cycles yet." with a "Start a cycle" link to `/fisheries-monitoring`); an organization instead gets one row "Members" with the active count and a "View members" link; last a "Summary" strip. `TodoCard`: title 15px semibold, detail 13px, badge "Overdue" (red) or "Waiting" (amber), one button that is a `Link`.
- [ ] **Step 4: Run it, then the whole suite** — `node --test tests/accountHome.test.mjs` Expected: PASS. `npm test` Expected: the only failures are assertions in `helpManualSplit.test.mjs` / `lookDates.test.mjs` that read the deleted files.
- [ ] **Step 5: Update those two tests**, run `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** — `"Account Home: a to-do list first, for farmer, fisherfolk and organization accounts"`.

---

### Task 6: The menu on phone and computer, and More

**Files:**
- Create: `src/pages/Account/MoreScreen.jsx`
- Modify: `src/pages/Citizen/CitizenPhoneShell.jsx`, `src/pages/Citizen/FarmerChrome.jsx` (`FarmerHeader` gets `showMenu`; tab label 13px), `src/components/Layout/Sidebar.jsx`, `src/App.jsx`
- Test: `tests/accountMenu.test.mjs`

**Interfaces:**
- Consumes: `accountKind`, `accountNav`, `activeNavKey`, `accountTheme` (Task 1); `AccountIcon`, `AccountPage` (Task 3).
- Produces: route `/more` (`ProtectedRoute allowedRoles={["CITIZEN"]}`, lazy `MoreScreen`); `FarmerHeader` prop `showMenu` (default `true`).

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
let n = 0
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const shell = read('../src/pages/Citizen/CitizenPhoneShell.jsx')
ok(shell.includes('accountNav(') && shell.includes('activeNavKey('), 'the phone tabs come from the one menu definition')
ok(!shell.includes('TABS_BY_ROLE'), 'no second list of tabs')
ok(shell.includes('showMenu={false}'), 'no initials menu in the phone header')
const sidebar = read('../src/components/Layout/Sidebar.jsx')
ok(sidebar.includes('accountNav(') && !/FARMER_NAV|FISHERFOLK_NAV|orgNav\b/.test(sidebar), 'the sidebar reads the same definition')
ok(sidebar.includes('GROUPS') && sidebar.includes('ADMIN_GROUP'), 'the office menu is still there')
const chrome = read('../src/pages/Citizen/FarmerChrome.jsx')
ok(/showMenu/.test(chrome), 'the header can hide its menu')
ok(!chrome.includes('text-[9.5px]'), 'tab labels are no longer 9.5px')
const more = read('../src/pages/Account/MoreScreen.jsx')
ok(more.includes('accountNav(') && more.includes('.more'), 'More lists the More entries')
ok(more.includes('Log out') && more.includes('ConfirmDialog'), 'Log out is on More and asks first')
ok(more.includes('min-h-[52px]'), 'More rows are easy to tap')
const app = read('../src/App.jsx')
ok(app.includes('path="/more"') && app.includes('MoreScreen'), 'the More route')
console.log(`ok - ${n} assertions`)
```

- [ ] **Step 2: Run it** — `node --test tests/accountMenu.test.mjs`. Expected: FAIL (`accountNav(` not found in the shell).
- [ ] **Step 3: Implement.**
  - `CitizenPhoneShell`: tabs from `accountNav(kind, { isMember }).main`; active key from `activeNavKey(nav, pathname, search)`; header with `showMenu={false}` (bell only). `isMember` is `(user.linked_record.organization_names?.length || 0) > 0`, as the sidebar computes it today.
  - `Sidebar`: for an account, the four non-More `main` entries as `LeafItem`s, then More as a `NavGroup` whose items are the `more` entries plus nothing else (it opens in place; collapsed sidebar shows the More items as icons). `isItemActive` already handles `?tab=`; add `/my-organization: 'members'` to `DEFAULT_TAB_BY_PATH`. Staff branch untouched.
  - `MoreScreen`: `AccountPage title="More"`; one bordered list of rows (icon, label, chevron) linking to each `more` entry; a last row "Log out" in the danger colour that opens the existing `ConfirmDialog`, then `logout()` and `navigate('/login', { replace: true })`.
  - `App.jsx`: lazy import and the `/more` route beside `/my-account`.
- [ ] **Step 4: Run it, then the whole suite** — Expected: PASS; `npm test` all pass.
- [ ] **Step 5: Commit** — `"Account menu: the same five entries on phone and computer, with More"`.

---

### Task 7: Verify

- [ ] **Step 1:** `cd oma-frontend && npm test`. Expected: every test passes; the count is the pre-change count plus the five new files.
- [ ] **Step 2:** `npx eslint src/pages/Account src/pages/Citizen src/components/Layout/Sidebar.jsx src/App.jsx`. Expected: no problems in the new files, and no more problems in the modified files than `master` has for them (compare with a `git worktree` of `master`; never `git stash`).
- [ ] **Step 3:** `npx vite build`. Expected: builds.
- [ ] **Step 4: Browser, scratch stack.** For `CITIZEN:FARMER`, `CITIZEN:FISHERFOLK`, `CITIZEN:FARMERS_ORG`, `CITIZEN:FISHERFOLK_ORG` at 390 and 1440: `/my-account` (to-do first, no charts, summary last), `/more` (entries, Log out asks first), every menu entry opens its page and lights the right entry, `/my-organization?tab=borrowed` lights Equipment. At 360 wide the five tab labels fit on one line. Expected: no console errors.
- [ ] **Step 5: Failure and empty states.** With CDP `Fetch.enable`, fail `/farmers/me/parcels/` for the farmer: Home shows the failed notice, Farm parcels reads "—", the to-do list still shows; Try again recovers. Fail every source: no zero anywhere. Open an account with nothing active (or fail-free empty data): the empty lines show.
- [ ] **Step 6: Office unchanged.** `ADMIN` at 1440 and 390: the sidebar groups, `/dashboard` and `/crop-monitoring` look as before; `/more` sends an Admin away (ProtectedRoute).
- [ ] **Step 7:** Final whole-branch review, fixes if any, then ask the owner before pushing.
