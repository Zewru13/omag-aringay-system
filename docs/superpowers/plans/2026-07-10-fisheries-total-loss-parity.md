# Fisheries/Crops Total-Loss Parity & Frontend Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the frontend half of the crops/fisheries Total-Loss + activity-log rework. Backend (`oma_aringay/production`, `oma_aringay/fisheries`) is complete and must not be modified.

**Architecture:** Crops already have full View Logs / Suggestions / Disaster Report (with Total Loss) / Record Harvest UI in `CropMonitoringPage.jsx`. Fisheries do **not** — `FisheriesRecordsPage.jsx` only has Add/Edit/Delete for `StockingRecord`. This plan (a) closes two small remaining gaps on the crops side, (b) builds the missing fisheries modal suite from scratch in a new sibling file and wires it into `FisheriesRecordsPage.jsx`, and (c) adds a shared disaster-status "dot" indicator used by both domains.

**Tech Stack:** React (Vite), Tailwind utility classes, `lucide-react` icons, Axios (`api` instance), Django REST Framework backend (already complete).

## Global Constraints

- **Backend is complete.** Do not edit anything under `oma_aringay/` except to *read* it for field names. If a real backend bug is found, stop and report it — do not silently patch it.
- **No test runner exists** in `oma-frontend` (`package.json` scripts: `dev`, `build`, `lint`, `preview` only — no `test`/`vitest`/`jest`). Every task's "verify" step is therefore `npm run build` + `npx eslint <file>` (must be zero new errors) plus, where relevant, a manual `curl`/browser check — not an automated test. This replaces the Red/Green test steps that writing-plans normally requires.
- **`FisheriesMonitoringPage.jsx` and the legacy `oma_aringay/monitoring` Django app are OUT OF SCOPE.** They are a separate, unrelated system (Capture Fishing / Aquaculture Cycles / Disasters / Assistance, statuses `Active|Harvested|Failed|Abandoned`). Confirmed with the user — do not touch any file under that flow.
- **Exact field names — copied verbatim from the serializers, do not use the names in the original task brief where they differ:**
  - Crops (`oma_aringay/production/serializers.py`, `CropMonitoringRecordSerializer`): `disasters_count` (**plural**, counts `status='Active'` disaster reports), `has_resolved_disaster`, `area_planted_ha`, `status` (`'Planted'|'Near Harvest'|'Harvested'|'Total Loss'`). `is_total_loss` exists **only** on `CropDisasterReportSerializer`, never on the monitoring record itself.
  - Fisheries (`oma_aringay/fisheries/serializers.py`, `StockingRecordSerializer`): `disaster_count` (**singular**, counts `status='Active'`), `has_resolved_disaster`, `area_hectares`, `status` (`'Stocked'|'Near Harvest'|'Harvested'|'Total Loss'`). `is_total_loss` exists **only** on `FisheriesDisasterReportSerializer`.
  - Crop activity log field is `date_of_activity` (never `activity_date`) on both domains — already correct everywhere in the frontend (confirmed by sweep, see Task 8).
- **Component APIs already in the codebase (reuse, don't reinvent):**
  - `ModalShell({ title, subtitle, icon, iconBg, iconColor, onClose, maxWidth, children })` — `oma-frontend/src/components/UI/ModalShell.jsx`
  - `ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, variant })` — `oma-frontend/src/components/UI/ConfirmDialog.jsx`
  - `baseInputClasses` — `oma-frontend/src/components/UI/FormField.jsx`
  - `useAuth()` returns `{ user, isAdmin }` — `oma-frontend/src/context/AuthContext.jsx:77`
  - `useToast()` returns `{ showToast }` — `oma-frontend/src/context/ToastContext.jsx`
  - `api` — `oma-frontend/src/api/axiosInstance.js` (base path already includes `/api`, so calls are e.g. `api.get('/fisheries/stocking/...')`)

---

### Task 1: Crops — Total Loss lock banner + hide Record Harvest action

**Files:**
- Modify: `oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx`

**Interfaces:**
- Consumes: `record.status` (string, already returned by `/production/monitoring/`)
- Produces: no new exports; purely internal JSX/logic changes inside `ViewLogsModal` and the main table's `actions` cell.

**Context:** `ViewLogsModal` (starts at line 315) currently only branches on `isHarvested = record.status === 'Harvested'` (line 333). There is no handling at all for `status === 'Total Loss'` — the Add Log form and "🌿 Get Suggestions" button both render unconditionally for a Total Loss record today. Separately, the "Record Harvest" icon button in the main table (around line 1661-1672) has **no status guard at all** — it's clickable for every record including Total Loss ones (the API will correctly reject with 400, but the button shouldn't be offered).

- [ ] **Step 1: Add `isTotalLoss` and branch the header UI in `ViewLogsModal`**

In `oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx`, find line 333:

```jsx
  const isHarvested = record.status === 'Harvested'
```

Replace with:

```jsx
  const isHarvested = record.status === 'Harvested'
  const isTotalLoss = record.status === 'Total Loss'
```

Then find the block starting at line 460 (`{/* Post-harvest read-only banner */}`) through line 506 (the closing `)}` before `{/* Inline form — hidden for harvested crops */}`):

```jsx
        {/* Post-harvest read-only banner */}
        {isHarvested ? (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            ... (unchanged, lines 462-493)
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => { setShowForm(v => !v); if (showForm) resetForm() }}
              className="text-sm font-medium text-[#1B4D2E] hover:underline">
              {showForm ? '— Cancel' : '+ Add New Log'}
            </button>
            <button type="button" onClick={() => setShowSuggest(true)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              🌿 Get Suggestions
            </button>
          </div>
        )}
```

Replace the `else` branch (keep the `isHarvested` branch exactly as-is) with a three-way branch:

```jsx
        {/* Post-harvest / total-loss read-only banners */}
        {isHarvested ? (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Wheat className="w-4 h-4 flex-shrink-0" />
                Harvest Recorded
              </div>
              {isAdmin && record.harvest_record_id && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowHarvestEdit(true)}
                    className="flex items-center gap-1 rounded-lg bg-white border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button type="button" onClick={() => setHarvestDeleteConfirm(true)} disabled={isDeletingHarvest}
                    className="flex items-center gap-1 rounded-lg bg-white border border-rose-300 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
            <div className="text-xs text-emerald-700 space-y-0.5">
              {record.actual_yield_kg && (
                <p>Yield: <span className="font-medium">{Number(record.actual_yield_kg).toLocaleString()} kg</span></p>
              )}
              {record.actual_harvest_date && (
                <p>Date: <span className="font-medium">{fmtDate(record.actual_harvest_date)}</span></p>
              )}
            </div>
            {!isAdmin && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-500">
                <Lock className="w-3 h-3" /> Log history is read-only.
              </p>
            )}
          </div>
        ) : isTotalLoss ? (
          <>
            <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                <Lock className="w-4 h-4 flex-shrink-0" />
                Total Loss Recorded
              </div>
              <p className="mt-1 text-xs text-rose-600">
                This crop was recorded as a total loss. Activity logs are read-only.
              </p>
            </div>
            <div className="mb-4 flex items-center justify-end">
              <button type="button" onClick={() => setShowSuggest(true)}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
                🌿 Get Suggestions
              </button>
            </div>
          </>
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => { setShowForm(v => !v); if (showForm) resetForm() }}
              className="text-sm font-medium text-[#1B4D2E] hover:underline">
              {showForm ? '— Cancel' : '+ Add New Log'}
            </button>
            <button type="button" onClick={() => setShowSuggest(true)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              🌿 Get Suggestions
            </button>
          </div>
        )}
```

*(The Total Loss branch intentionally omits the "+ Add New Log" manual-entry toggle — the only way to open the form for a Total Loss record is via a disaster-response rule card inside the Suggestions modal, which still calls `handleApplySuggestion` → `setShowForm(true)`, so remediation logging keeps working. The inline form's existing render guard at line 509 (`{showForm && !isHarvested && (...)}`) does not need to change — it already renders whenever `showForm` is true and the record isn't harvested, which correctly covers the total-loss-via-disaster-route case.)*

- [ ] **Step 2: Hide the Record Harvest button for Total Loss rows in the main table**

Find the actions cell around line 1661-1672:

```jsx
        <button
          type="button"
          title="Record Harvest"
          onClick={() => setHarvestRecord(rec)}
          className={`p-1.5 rounded-lg transition-colors ${
            isNearHarvest(rec)
              ? 'text-amber-600 hover:bg-amber-50'
              : 'text-slate-500 hover:bg-slate-100 hover:text-amber-600'
          }`}
        >
          <Wheat className="w-4 h-4" />
        </button>
```

Wrap it in a status guard:

```jsx
        {rec.status !== 'Total Loss' && (
          <button
            type="button"
            title="Record Harvest"
            onClick={() => setHarvestRecord(rec)}
            className={`p-1.5 rounded-lg transition-colors ${
              isNearHarvest(rec)
                ? 'text-amber-600 hover:bg-amber-50'
                : 'text-slate-500 hover:bg-slate-100 hover:text-amber-600'
            }`}
          >
            <Wheat className="w-4 h-4" />
          </button>
        )}
```

- [ ] **Step 3: Verify**

Run:
```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/pages/Monitoring/CropMonitoringPage.jsx
```
Expected: no new errors (pre-existing warnings, if any, are fine).

Then run `npm run build` (full build is done once at the end of Task 10 — for this step, the eslint pass is sufficient to catch syntax errors quickly).

- [ ] **Step 4: Commit**

```bash
git add oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx
git commit -m "Crops: lock activity logging and hide Record Harvest for Total Loss records"
```

---

### Task 2: Shared `DisasterDot` component

**Files:**
- Create: `oma-frontend/src/components/UI/DisasterDot.jsx`

**Interfaces:**
- Produces: `export default function DisasterDot({ activeCount, hasResolved })` — renders a small colored dot or `null`. Used by Task 3 (crops) and Task 9 (fisheries).

- [ ] **Step 1: Create the component**

```jsx
function DisasterDot({ activeCount, hasResolved }) {
  if (activeCount > 0) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500"
        title={`${activeCount} active disaster report${activeCount > 1 ? 's' : ''}`}
      />
    )
  }
  if (activeCount === 0 && hasResolved) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300"
        title="Disaster resolved"
      />
    )
  }
  return null
}

export default DisasterDot
```

- [ ] **Step 2: Verify**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/components/UI/DisasterDot.jsx
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add oma-frontend/src/components/UI/DisasterDot.jsx
git commit -m "Add shared DisasterDot indicator component"
```

---

### Task 3: Crops — wire `DisasterDot` into CropMonitoringPage and CropInformationPage

**Files:**
- Modify: `oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx`
- Modify: `oma-frontend/src/pages/CropInformation/CropInformationPage.jsx`

**Interfaces:**
- Consumes: `DisasterDot` from Task 2, `rec.disasters_count` / `rec.has_resolved_disaster` (already present on every row from `/production/monitoring/`).

**Context:** `CropMonitoringPage.jsx` has no dedicated status-pill column (its `COLUMNS` array has no `status_cell`); disaster info is currently shown as text badges inline in `crop_cell` (lines 1615-1633). Per the spec, the dot goes "beside" the status indicator "never replacing it" — here that means adding the dot next to the existing badges, not removing them. `CropInformationPage.jsx` **does** have a real `status_cell` (renders `<StatusPill>`) and currently shows no disaster info at all.

- [ ] **Step 1: Add the dot in `CropMonitoringPage.jsx`'s `crop_cell`**

Add the import at the top of the file (near the other UI imports, e.g. after line 12):

```jsx
import DisasterDot from '../../components/UI/DisasterDot.jsx'
```

Find `crop_cell` (lines 1615-1633):

```jsx
    crop_cell: (
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{rec.crop_type_name}</span>
        {rec.disasters_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <AlertTriangle className="w-2.5 h-2.5" /> {rec.disasters_count > 1 ? rec.disasters_count : 'Disaster'}
          </span>
        )}
        {rec.disasters_count === 0 && rec.has_resolved_disaster && (
          <span className="text-xs text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 ml-2">
            Disaster resolved
          </span>
        )}
        {rec.status === 'Harvested' && (
          <span className="inline-flex text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            Harvested
          </span>
        )}
      </span>
    ),
```

Add the dot right after the crop name, before the existing badges:

```jsx
    crop_cell: (
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{rec.crop_type_name}</span>
        <DisasterDot activeCount={rec.disasters_count} hasResolved={rec.has_resolved_disaster} />
        {rec.disasters_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <AlertTriangle className="w-2.5 h-2.5" /> {rec.disasters_count > 1 ? rec.disasters_count : 'Disaster'}
          </span>
        )}
        {rec.disasters_count === 0 && rec.has_resolved_disaster && (
          <span className="text-xs text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 ml-2">
            Disaster resolved
          </span>
        )}
        {rec.status === 'Harvested' && (
          <span className="inline-flex text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            Harvested
          </span>
        )}
      </span>
    ),
```

- [ ] **Step 2: Add the dot in `CropInformationPage.jsx`'s `status_cell`**

Add the import near the top of the file:

```jsx
import DisasterDot from '../../components/UI/DisasterDot.jsx'
```

Find the `status_cell` render (around line 909-913 per audit — search for `StatusPill tone={STATUS_TONES[displayStatus]`):

```jsx
    status_cell: <StatusPill tone={STATUS_TONES[displayStatus] || "slate"}>{displayStatus}</StatusPill>,
```

Replace with:

```jsx
    status_cell: (
      <span className="flex items-center gap-1.5">
        <StatusPill tone={STATUS_TONES[displayStatus] || "slate"}>{displayStatus}</StatusPill>
        <DisasterDot activeCount={rec.disasters_count} hasResolved={rec.has_resolved_disaster} />
      </span>
    ),
```

*(Verify this exact line first with `Read` before editing — the audit reported it from a subagent's line-number estimate, which can drift. Use the surrounding `getDisplayStatus`/`displayStatus` variable names as the anchor for an exact-match `Edit`.)*

- [ ] **Step 3: Verify**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/pages/Monitoring/CropMonitoringPage.jsx src/pages/CropInformation/CropInformationPage.jsx
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx oma-frontend/src/pages/CropInformation/CropInformationPage.jsx
git commit -m "Crops: show active/resolved disaster dot on monitoring and records tables"
```

---

### Task 4: Crops — Suggestions panel loading-state compliance (audit finding, minimal change)

**Files:**
- Modify: `oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx`

**Context — audit finding, read before editing:** The brief describes a "double-log bug" where a just-logged suggestion still appears clickable because the panel keeps stale data after a successful log POST. Tracing the actual code: `SuggestionsModal` (line 64) is only ever rendered while `showSuggest` is `true` (line 768 `{showSuggest && <SuggestionsModal .../>}`), and **every** path that logs something (`handleLogClick` → `onApply(s); onClose()` at lines 89-91 for due/overdue items, the `earlyConfirm` `ConfirmDialog.onConfirm` at line 305, and the disaster-rule "Log" button at line 277) calls `onClose()` — which sets `showSuggest` to `false` — **before** the actual POST even happens (the POST only fires later, from `ViewLogsModal.handleConfirmed`, after the user fills in and confirms the separate Add Log form). Because React unmounts `SuggestionsModal` on close and remounts a fresh instance (with a fresh `fetchSuggestions()` call in its `useEffect`, line 81) the next time "🌿 Get Suggestions" is clicked, there is no code path today where stale `is_done`/status data can be shown to the user — every reopen is a guaranteed fresh fetch. The "Mark as Resolved" disaster action (line 97) also already calls `fetchSuggestions()` itself (line 99) before the user can interact again. Rule/occurrence "done" cards already render with **zero** `onClick` handler at all (see lines 185 and 275 — the `<button>` is only rendered `{!isDoneGroup && (...)}` / `{!rule.is_done && (...)}`), satisfying that part of the spec already.

**Conclusion: no functional bug exists in the current crops code to fix.** The one literal gap against the spec text is cosmetic: while `loading` is `true` the modal replaces its entire body with a spinner (lines 129-132) rather than dimming the previous content with `pointer-events-none`/reduced opacity. Since there's no previous content to dim in this modal's actual usage (fresh mount = no prior render), this is a no-op in practice, but this task adds it anyway for literal spec compliance and because it costs nothing.

- [ ] **Step 1: Add pointer-events/opacity compliance to the loading wrapper**

Find lines 127-134:

```jsx
  return (
    <ModalShell title={`Activity Suggestions — ${record.crop_type_name}`} onClose={onClose} maxWidth="max-w-lg">
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4D2E] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
```

Replace with:

```jsx
  return (
    <ModalShell title={`Activity Suggestions — ${record.crop_type_name}`} onClose={onClose} maxWidth="max-w-lg">
      <div className={loading ? 'pointer-events-none opacity-50' : ''}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4D2E] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
```

And find the closing of that same conditional block — lines 297-298 (immediately before `{earlyConfirm && (`):

```jsx
        </div>
      )}

      {earlyConfirm && (
```

Replace with:

```jsx
        </div>
      )}
      </div>

      {earlyConfirm && (
```

- [ ] **Step 2: Verify**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/pages/Monitoring/CropMonitoringPage.jsx
```
Expected: no new errors. Manually confirm in the browser: open a monitoring record's Suggestions modal — behavior should be visually identical to before (this is a no-op wrapper in the only reachable state).

- [ ] **Step 3: Commit**

```bash
git add oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx
git commit -m "Crops: add literal loading-disable wrapper to Suggestions modal (no functional bug found on audit)"
```

---

### Task 5: Fisheries — create `StockingSuggestionsModal`

**Files:**
- Create: `oma-frontend/src/pages/FisheriesRecords/StockingMonitoringModals.jsx`

**Interfaces:**
- Produces: `export function StockingSuggestionsModal({ record, onClose, onApply })` — first named export in this new shared file. Ported 1:1 from `CropMonitoringPage.jsx`'s `SuggestionsModal` (lines 64-311) with fisheries field names.
- Consumes: `GET /fisheries/stocking/{id}/suggestions/` → `{ days_elapsed, total_days, is_total_loss, suggestions: [{ id, occurrence_key, activity_name, day_after_stocking, recommendation, priority, window_days, status, is_completed, done_date, days_diff }], disaster_response: [{ disaster_id, disaster_type, date_of_occurrence, status, is_total_loss, all_rules_done, rules: [{ rule_id, disaster_type, title, action, activity_name, recommendation, priority, is_done }] }] }` (confirmed shape from `FisheriesActivitySuggestionsView` in `oma_aringay/fisheries/views.py:440-565`). `POST /fisheries/disasters/{disaster_id}/resolve/` to resolve.

This file will hold all four fisheries modals (`StockingSuggestionsModal`, `ViewStockingLogsModal`, `StockingDisasterReportModal`, `RecordStockingHarvestModal`) — Tasks 5-7 each append one to it, matching how the crops equivalents all live together in `CropMonitoringPage.jsx`.

- [ ] **Step 1: Create the file with shared helpers and `StockingSuggestionsModal`**

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bug, CheckCircle, CheckCircle2, FileText, Fish, Lock, Pencil, Trash2, Wheat,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const ACTIVITY_OPTIONS = [
  'Pond Preparation', 'Stocking', 'Feed Monitoring', 'Water Quality Check',
  'Sampling', 'Disease Control', 'Pre-Harvest Inspection', 'Harvesting', 'Other',
]

export function fmtDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

// ── Suggestions Modal ─────────────────────────────────────────────────────────

export function StockingSuggestionsModal({ record, onClose, onApply }) {
  const { showToast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [earlyConfirm, setEarlyConfirm] = useState(null)
  const [dismissedDisasters, setDismissedDisasters] = useState(new Set())
  const [resolving, setResolving] = useState(null)

  const fetchSuggestions = useCallback(() => {
    if (!record) return
    setLoading(true)
    api.get(`/fisheries/stocking/${record.id}/suggestions/`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [record])

  useEffect(() => { fetchSuggestions() }, [fetchSuggestions])

  if (!record) return null

  const handleLogClick = (s) => {
    if (s.status === 'upcoming') {
      setEarlyConfirm(s)
    } else {
      onApply(s)
      onClose()
    }
  }

  const handleMarkResolved = async (disasterId) => {
    setResolving(disasterId)
    try {
      await api.post(`/fisheries/disasters/${disasterId}/resolve/`)
      showToast('Disaster marked as resolved.', 'success')
      fetchSuggestions()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to resolve disaster.'
      showToast(msg, 'error')
    } finally {
      setResolving(null)
    }
  }

  const dismissPrompt = (disasterId) => {
    setDismissedDisasters(prev => { const next = new Set(prev); next.add(disasterId); return next })
  }

  const groups = {
    overdue: { label: 'Overdue', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
    due_now: { label: 'Due Now', color: 'text-[#1B4D2E]', bg: 'bg-[#EBF5EE]', border: 'border-[#C8E6D0]', badge: 'bg-[#1B4D2E] text-white' },
    upcoming: { label: 'Upcoming', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    done: { label: 'Done', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-200 text-slate-600' },
  }

  const groupOrder = ['overdue', 'due_now', 'upcoming', 'done']

  const suggestions   = data?.suggestions || []
  const disasterRules = data?.disaster_response || []
  const daysElapsed   = data?.days_elapsed ?? 0
  const totalDays     = data?.total_days ?? 0
  const progressPct   = totalDays > 0 ? Math.min(100, Math.round((daysElapsed / totalDays) * 100)) : 0

  return (
    <ModalShell title={`Activity Suggestions — ${record.species_name}`} onClose={onClose} maxWidth="max-w-lg">
      <div className={loading ? 'pointer-events-none opacity-50' : ''}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4D2E] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Progress bar */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Culture Progress</span>
              <span className="text-sm font-semibold text-[#1B4D2E]">Day {daysElapsed} of {totalDays} days</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1B4D2E] rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Grouped schedule suggestions */}
          {groupOrder.map(key => {
            const group = groups[key]
            const items = suggestions.filter(s => s.status === key)
            if (items.length === 0) return null
            const isDoneGroup = key === 'done'
            return (
              <div key={key}>
                <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${group.color}`}>
                  {group.label} ({items.length})
                </h4>
                <div className="space-y-2">
                  {items.map(s => (
                    <div
                      key={s.occurrence_key || s.id}
                      className={`rounded-xl border p-4 ${group.bg} ${group.border} ${isDoneGroup ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium text-slate-900">{s.activity_name}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${group.badge}`}>
                              Day {s.day_after_stocking}
                            </span>
                            <span className="text-xs text-slate-500 uppercase">{s.priority}</span>
                          </div>
                          {s.recommendation && (
                            <p className="text-xs text-slate-600 leading-relaxed">{s.recommendation}</p>
                          )}
                          {isDoneGroup && s.done_date && (
                            <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
                              <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                              Done on {fmtDate(s.done_date)}
                            </div>
                          )}
                        </div>
                        {!isDoneGroup && (
                          <button
                            onClick={() => handleLogClick(s)}
                            className="shrink-0 text-xs font-medium bg-[#1B4D2E] text-white px-3 py-1.5 rounded-lg hover:bg-[#235E38] transition"
                          >
                            {s.status === 'upcoming' ? 'Log Early' : 'Log'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Disaster response — grouped by active disaster */}
          {disasterRules.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 text-rose-700">
                Disaster Response ({disasterRules.length})
              </h4>
              <div className="space-y-3">
                {disasterRules.map((disaster) => {
                  if (disaster.all_rules_done && !dismissedDisasters.has(disaster.disaster_id)) {
                    return (
                      <div key={disaster.disaster_id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-2">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-emerald-800">
                              All recommended responses for this {disaster.disaster_type} have been completed.
                            </p>
                            <p className="text-xs text-emerald-600 mt-0.5">
                              If the stock has recovered, mark this disaster as resolved. You can leave it active if you're still monitoring recovery.
                            </p>
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => handleMarkResolved(disaster.disaster_id)}
                                disabled={resolving === disaster.disaster_id}
                                className="bg-[#1B4D2E] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#235E38] disabled:opacity-50"
                              >
                                Mark as Resolved
                              </button>
                              <button
                                onClick={() => dismissPrompt(disaster.disaster_id)}
                                className="text-xs text-slate-500 px-3 py-1.5 hover:text-slate-700"
                              >
                                Not Yet — Keep Monitoring
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  if (disaster.all_rules_done && dismissedDisasters.has(disaster.disaster_id)) {
                    return (
                      <div key={disaster.disaster_id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                        All responses for {disaster.disaster_type} completed — still monitoring recovery.
                      </div>
                    )
                  }
                  return (
                    <div key={disaster.disaster_id} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-sm font-semibold text-rose-800">{disaster.disaster_type}</span>
                        <span className="text-xs text-rose-400">{fmtDate(disaster.date_of_occurrence)}</span>
                      </div>
                      <div className="space-y-2">
                        {disaster.rules.map((rule, ri) => (
                          <div
                            key={ri}
                            className={`rounded-lg border p-3 ${rule.is_done ? 'border-slate-100 bg-slate-50 cursor-not-allowed' : 'border-rose-100 bg-white'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-sm font-medium ${rule.is_done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{rule.title}</span>
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{rule.priority}</span>
                                  {rule.is_done && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-[#1B4D2E]">Done</span>
                                  )}
                                </div>
                                {rule.action && (
                                  <p className={`text-xs leading-relaxed ${rule.is_done ? 'text-slate-400' : 'text-slate-600'}`}>{rule.action}</p>
                                )}
                              </div>
                              {!rule.is_done && (
                                <button
                                  onClick={() => { onApply({ activity_name: rule.activity_name || rule.title, recommendation: rule.recommendation || rule.action, status: 'disaster_rule', disaster_report_id: disaster.disaster_id, disaster_rule_id: rule.rule_id }); onClose() }}
                                  className="shrink-0 text-xs font-medium bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 transition"
                                >
                                  Log
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {suggestions.length === 0 && disasterRules.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No activity stages defined for this species.</p>
          )}
        </div>
      )}
      </div>

      {earlyConfirm && (
        <ConfirmDialog
          title="Log Activity Early?"
          message={`"${earlyConfirm.activity_name}" is scheduled for Day ${earlyConfirm.day_after_stocking}. It's ${Math.abs(earlyConfirm.days_diff)} day${Math.abs(earlyConfirm.days_diff) !== 1 ? 's' : ''} away. Log it now anyway?`}
          confirmLabel="Yes, Log Early"
          onConfirm={() => { setEarlyConfirm(null); onApply(earlyConfirm); onClose() }}
          onCancel={() => setEarlyConfirm(null)}
        />
      )}
    </ModalShell>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/pages/FisheriesRecords/StockingMonitoringModals.jsx
```
Expected: no errors (some imports like `Bug`, `Fish`, `Wheat`, `Pencil`, `Trash2`, `FileText`, `Lock`, `useAuth` are unused until Tasks 6-7 append to this file — eslint's `no-unused-vars` will flag them transiently; that's expected and resolves once Task 6 lands. If your eslint config errors instead of warns on unused vars, do Steps 1 of Tasks 5-7 as a single combined edit before running lint.)

- [ ] **Step 3: Commit**

```bash
git add oma-frontend/src/pages/FisheriesRecords/StockingMonitoringModals.jsx
git commit -m "Fisheries: add StockingSuggestionsModal (ports crops SuggestionsModal to fisheries fields)"
```

---

### Task 6: Fisheries — add `ViewStockingLogsModal`

**Files:**
- Modify: `oma-frontend/src/pages/FisheriesRecords/StockingMonitoringModals.jsx` (append)

**Interfaces:**
- Produces: `export function ViewStockingLogsModal({ record, onClose, onLogAdded })`.
- Consumes: `GET/POST /fisheries/stocking/{id}/logs/` (`FisheriesActivityLogSerializer` fields: `activity, date_of_activity, water_fish_condition, feed_type, feed_quantity_kg, feed_brand, observed_issue, severity, mortality_count, treatment_applied, outcome, recommendations, target_day, is_late [readonly], logged_by_name [readonly], date_logged [readonly, auto_now_add], disaster_report, disaster_rule`), `GET /fisheries/stocking/{id}/disasters/`, `StockingSuggestionsModal` from Task 5.

**Key differences from the crops `ViewLogsModal` this is ported from** (memorize before writing code):
| Crops field | Fisheries field |
|---|---|
| `activity_type` | `activity` |
| `plant_condition` | `water_fish_condition` (Good/Fair/Poor — same choices) |
| `fertilizer_type`/`quantity_applied`/`quantity_unit` (shown when `Fertilizer Application`) | `feed_type`/`feed_quantity_kg`/`feed_brand` (shown when `Feed Monitoring`) |
| `pest_disease_name`/`area_affected_ha`/`severity` (shown when `Pest Control`/`Disease Control`) | `observed_issue`/`severity`/`mortality_count`/`treatment_applied`/`outcome` (shown when `Disease Control`) |
| `notes` | `recommendations` |
| `record.crop_type_name`, `record.date_planted`, `record.area_planted_ha` | `record.species_name`, `record.date_stocked`, `record.area_hectares` |
| `record.actual_yield_kg`/`record.actual_harvest_date` (single harvest) | `record.total_harvested_kg`/`record.harvest_count` (multiple partial harvests supported by the model, but this UI only ever creates one `is_final=true` harvest — see Task 7) |

There is **no** pre-planting activity list to hide `water_fish_condition` for (fisheries has no "pre-stocking" activity analog) — the condition select is always shown.

- [ ] **Step 1: Append `ViewStockingLogsModal` to the file**

```jsx
// ── View Logs Modal ───────────────────────────────────────────────────────────

export function ViewStockingLogsModal({ record, onClose, onLogAdded }) {
  const { showToast } = useToast()
  const [logs,              setLogs]              = useState([])
  const [disasters,         setDisasters]         = useState([])
  const [isLoading,         setIsLoading]         = useState(true)
  const { isAdmin } = useAuth()
  const [showForm,          setShowForm]          = useState(false)
  const [showSuggest,       setShowSuggest]       = useState(false)
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [pendingSuggestion, setPendingSuggestion] = useState(null)
  const [pendingDisasterReport, setPendingDisasterReport] = useState(null)
  const [pendingDisasterRule, setPendingDisasterRule] = useState(null)
  const [expandedDisasters, setExpandedDisasters] = useState(new Set())

  const isHarvested  = record.status === 'Harvested'
  const isTotalLoss  = record.status === 'Total Loss'

  // Form state
  const [activityType,     setActivityType]     = useState('')
  const [activityDate,     setActivityDate]     = useState(todayISO())
  const [waterCondition,   setWaterCondition]   = useState('')
  const [feedType,         setFeedType]         = useState('')
  const [feedQuantityKg,   setFeedQuantityKg]   = useState('')
  const [feedBrand,        setFeedBrand]        = useState('')
  const [observedIssue,    setObservedIssue]    = useState('')
  const [severity,         setSeverity]         = useState('')
  const [mortalityCount,   setMortalityCount]   = useState('')
  const [treatmentApplied, setTreatmentApplied] = useState('')
  const [outcome,          setOutcome]          = useState('')
  const [recommendations,  setRecommendations]  = useState('')

  const showFeedFields  = activityType === 'Feed Monitoring'
  const showIssueFields = activityType === 'Disease Control'

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const [logsRes, disRes] = await Promise.all([
        api.get(`/fisheries/stocking/${record.id}/logs/`),
        api.get(`/fisheries/stocking/${record.id}/disasters/`),
      ])
      setLogs(Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data.results || []))
      setDisasters(Array.isArray(disRes.data) ? disRes.data : (disRes.data.results || []))
    } catch {
      showToast('Failed to load activity logs.', 'error')
    } finally { setIsLoading(false) }
  }, [record.id])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const allEvents = useMemo(() => {
    const logEvents = logs.map(l => ({ ...l, _type: 'log' }))
    const disEvents = disasters.map(d => ({ ...d, _type: 'disaster', _sortDate: d.date_of_occurrence }))
    return [...logEvents.map(l => ({ ...l, _sortDate: l.date_of_activity })), ...disEvents]
      .sort((a, b) => new Date(b._sortDate || 0) - new Date(a._sortDate || 0))
  }, [logs, disasters])

  const resetForm = () => {
    setActivityType(''); setActivityDate(todayISO()); setWaterCondition('')
    setFeedType(''); setFeedQuantityKg(''); setFeedBrand('')
    setObservedIssue(''); setSeverity(''); setMortalityCount(''); setTreatmentApplied(''); setOutcome('')
    setRecommendations('')
    setPendingSuggestion(null)
    setPendingDisasterReport(null)
    setPendingDisasterRule(null)
  }

  const handleSubmitClick = () => {
    if (!activityType) { showToast('Please select an activity.', 'error'); return }
    if (!activityDate) { showToast('Activity date is required.', 'error'); return }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false); setIsSubmitting(true)
    try {
      await api.post(`/fisheries/stocking/${record.id}/logs/`, {
        activity:            activityType,
        date_of_activity:    activityDate,
        water_fish_condition: waterCondition,
        feed_type:           showFeedFields ? feedType : '',
        feed_quantity_kg:    showFeedFields ? (feedQuantityKg || null) : null,
        feed_brand:          showFeedFields ? feedBrand : '',
        observed_issue:      showIssueFields ? observedIssue : '',
        severity:            showIssueFields ? severity : '',
        mortality_count:     showIssueFields ? (mortalityCount || null) : null,
        treatment_applied:   showIssueFields ? treatmentApplied : '',
        outcome:             showIssueFields ? outcome : '',
        recommendations,
        target_day: pendingSuggestion?.occurrence_day ?? null,
        disaster_report: pendingDisasterReport,
        disaster_rule:   pendingDisasterRule,
      })
      showToast('Activity log added.', 'success')
      resetForm(); setShowForm(false)
      await fetchLogs(); onLogAdded()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save log.', 'error')
    } finally { setIsSubmitting(false) }
  }

  const handleApplySuggestion = (s) => {
    setActivityType(s.activity_name || '')
    setRecommendations(s.recommendation || '')
    setPendingDisasterReport(s.disaster_report_id || null)
    setPendingDisasterRule(s.disaster_rule_id || null)
    setShowSuggest(false)
    setShowForm(true)
    if (s.status === 'overdue') {
      setPendingSuggestion({ occurrence_day: s.day_after_stocking, status: 'overdue' })
    } else {
      setPendingSuggestion(null)
    }
  }

  const assocLabel = record.fisherfolk_name || '—'

  return (
    <>
      <ModalShell
        title={record.species_name?.toUpperCase() ?? 'STOCKING RECORD'}
        subtitle={`${assocLabel} - Stocked: ${record.date_stocked || '—'}`}
        icon={Fish}
        onClose={onClose}
        maxWidth="max-w-sm"
      >
        {/* Post-harvest / total-loss read-only banners */}
        {isHarvested ? (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 mb-1">
              <Wheat className="w-4 h-4 flex-shrink-0" />
              Harvest Recorded
            </div>
            <div className="text-xs text-emerald-700 space-y-0.5">
              {record.total_harvested_kg > 0 && (
                <p>Total harvested: <span className="font-medium">{Number(record.total_harvested_kg).toLocaleString()} kg</span> across {record.harvest_count} harvest{record.harvest_count !== 1 ? 's' : ''}</p>
              )}
            </div>
            {!isAdmin && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-500">
                <Lock className="w-3 h-3" /> Log history is read-only.
              </p>
            )}
          </div>
        ) : isTotalLoss ? (
          <>
            <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                <Lock className="w-4 h-4 flex-shrink-0" />
                Total Loss Recorded
              </div>
              <p className="mt-1 text-xs text-rose-600">
                This stock was recorded as a total loss. Activity logs are read-only.
              </p>
            </div>
            <div className="mb-4 flex items-center justify-end">
              <button type="button" onClick={() => setShowSuggest(true)}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
                🌿 Get Suggestions
              </button>
            </div>
          </>
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => { setShowForm(v => !v); if (showForm) resetForm() }}
              className="text-sm font-medium text-[#1B4D2E] hover:underline">
              {showForm ? '— Cancel' : '+ Add New Log'}
            </button>
            <button type="button" onClick={() => setShowSuggest(true)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              🌿 Get Suggestions
            </button>
          </div>
        )}

        {/* Inline form — hidden for harvested stock */}
        {showForm && !isHarvested && (
          <div className="mb-4 space-y-3">
            {/* Late log note */}
            {pendingSuggestion?.status === 'overdue' && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Late log — this activity was scheduled for Day {pendingSuggestion.occurrence_day} and will be marked as late.
              </div>
            )}

            {/* Activity + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Activity *</label>
                <select className={baseInputClasses} value={activityType}
                  onChange={e => { setActivityType(e.target.value); setPendingSuggestion(null) }}>
                  <option value="">Select Activity</option>
                  {ACTIVITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Date of Activity *</label>
                <input type="date" className={baseInputClasses} value={activityDate}
                  max={todayISO()} min={record.date_stocked || undefined}
                  onChange={e => setActivityDate(e.target.value)} />
              </div>
            </div>

            {/* Date Logged — read-only display */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Date Logged</label>
              <input type="text" className={`${baseInputClasses} bg-slate-100 text-slate-400 cursor-not-allowed`}
                value={fmtDate(todayISO())} disabled readOnly />
              <p className="mt-1 text-xs text-slate-400">Automatically recorded when you save.</p>
            </div>

            {/* Water/Fish Condition */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Water / Fish Condition</label>
              <select className={baseInputClasses} value={waterCondition}
                onChange={e => setWaterCondition(e.target.value)}>
                <option value="">Select condition</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            {/* Feed fields */}
            {showFeedFields && (
              <div className="bg-[#EBF5EE] border border-[#C8E6D0] rounded-xl p-3">
                <p className="text-xs font-semibold text-[#1B4D2E] mb-2 flex items-center gap-1">
                  <Fish className="w-3.5 h-3.5" /> Feed Details
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Feed Type</label>
                  <input type="text" value={feedType} onChange={e => setFeedType(e.target.value)}
                    placeholder="e.g. Commercial Pellet, Trash Fish" className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Quantity (kg)</label>
                    <input type="number" step="0.01" value={feedQuantityKg}
                      onChange={e => setFeedQuantityKg(e.target.value)} placeholder="e.g. 25" className={baseInputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Brand</label>
                    <input type="text" value={feedBrand} onChange={e => setFeedBrand(e.target.value)}
                      placeholder="e.g. Sunrise" className={baseInputClasses} />
                  </div>
                </div>
              </div>
            )}

            {/* Issue/Disease fields */}
            {showIssueFields && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-rose-800 mb-2 flex items-center gap-1">
                  <Bug className="w-3.5 h-3.5" /> Observed Issue
                </p>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Observed Issue</label>
                  <input type="text" value={observedIssue} onChange={e => setObservedIssue(e.target.value)}
                    placeholder="e.g. White spot disease, Low DO" className={baseInputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Severity</label>
                    <select value={severity} onChange={e => setSeverity(e.target.value)} className={baseInputClasses}>
                      <option value="">Select</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Mortality Count</label>
                    <input type="number" value={mortalityCount}
                      onChange={e => setMortalityCount(e.target.value)} placeholder="e.g. 50" className={baseInputClasses} />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Treatment Applied</label>
                  <input type="text" value={treatmentApplied} onChange={e => setTreatmentApplied(e.target.value)}
                    placeholder="e.g. Salt bath, Antibiotic" className={baseInputClasses} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Outcome</label>
                  <select value={outcome} onChange={e => setOutcome(e.target.value)} className={baseInputClasses}>
                    <option value="">Select</option>
                    <option value="Recovered">Recovered</option>
                    <option value="Ongoing">Ongoing</option>
                    <option value="Losses Incurred">Losses Incurred</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Recommendations</label>
              <textarea rows={3} className={`${baseInputClasses} resize-none`}
                placeholder="Recommendations (optional)"
                value={recommendations} onChange={e => setRecommendations(e.target.value)} />
            </div>

            <button type="button" disabled={isSubmitting} onClick={handleSubmitClick}
              className="w-full rounded-xl bg-[#1B4D2E] py-2.5 text-sm font-medium text-white hover:bg-[#235E38] disabled:opacity-60">
              {isSubmitting ? 'Saving…' : 'Add Log'}
            </button>
          </div>
        )}

        {/* Activity Logs header */}
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2D7A4F]" />
          <span className="text-sm font-semibold text-slate-700">Activity History</span>
          {disasters.length > 1 && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
              <AlertTriangle className="w-3 h-3" /> {disasters.length} disaster reports
            </span>
          )}
        </div>

        {/* Unified timeline */}
        {isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : allEvents.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-slate-400">No logs yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {allEvents.map(event => {
              if (event._type === 'disaster') {
                const isExpanded = expandedDisasters.has(event.id)
                const hasDetails = event.area_affected_ha || event.estimated_damage || event.production_loss
                return (
                  <div key={`d-${event.id}`} className="py-3">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpandedDisasters(prev => {
                        const next = new Set(prev)
                        if (next.has(event.id)) next.delete(event.id)
                        else next.add(event.id)
                        return next
                      })}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {event.disaster_type} — Disaster Report
                          {event.status === 'Resolved' ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Resolved</span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Active</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-rose-400">{fmtDate(event.date_of_occurrence)}</span>
                          {hasDetails && (
                            <span className="text-xs text-rose-300">
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isExpanded && event.area_affected_ha && (
                        <p className="text-xs text-rose-500 mt-0.5">Area: {event.area_affected_ha} ha</p>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="mt-1.5 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 space-y-1">
                        {event.status === 'Resolved' && event.resolved_date && (
                          <p className="text-xs text-emerald-700"><span className="font-medium">Resolved on:</span> {fmtDate(event.resolved_date)}{event.resolved_by_name ? ` by ${event.resolved_by_name}` : ''}</p>
                        )}
                        {event.area_affected_ha && (
                          <p className="text-xs text-rose-700"><span className="font-medium">Area affected:</span> {event.area_affected_ha} ha</p>
                        )}
                        {event.estimated_damage && (
                          <p className="text-xs text-rose-700"><span className="font-medium">Damage:</span> {event.estimated_damage}</p>
                        )}
                        {event.production_loss && (
                          <p className="text-xs text-rose-700"><span className="font-medium">Production loss:</span> {event.production_loss}</p>
                        )}
                        {!hasDetails && (
                          <p className="text-xs text-rose-400 italic">No additional details recorded.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              }
              const log = event
              return (
                <div key={`l-${log.id}`} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{log.activity}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDate(log.date_of_activity)}</span>
                  </div>
                  {log.water_fish_condition && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                      log.water_fish_condition === 'Good' ? 'bg-green-100 text-green-700'
                      : log.water_fish_condition === 'Fair' ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-600'
                    }`}>
                      {log.water_fish_condition}
                    </span>
                  )}
                  {log.is_late && (
                    <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Logged late — target Day {log.target_day}
                    </span>
                  )}
                  {(log.feed_type || log.feed_quantity_kg) && (
                    <p className="text-xs text-slate-500 mt-1">
                      {[log.feed_type, log.feed_quantity_kg && `${log.feed_quantity_kg} kg`, log.feed_brand].filter(Boolean).join(' — ')}
                    </p>
                  )}
                  {log.observed_issue && (
                    <p className="text-xs text-slate-500 mt-1">
                      {log.observed_issue}
                      {log.severity && ` | Severity: ${log.severity}`}
                      {log.mortality_count != null && ` | Mortality: ${log.mortality_count}`}
                      {log.outcome && ` | ${log.outcome}`}
                    </p>
                  )}
                  {log.recommendations && <p className="mt-0.5 text-xs text-slate-500">{log.recommendations}</p>}
                  {log.logged_by_name && <p className="mt-0.5 text-xs text-slate-400">{log.logged_by_name}</p>}
                </div>
              )
            })}
          </div>
        )}
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Action"
          message="Are you sure you want to add this activity log?"
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {showSuggest && (
        <StockingSuggestionsModal
          record={record}
          onClose={() => setShowSuggest(false)}
          onApply={handleApplySuggestion}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/pages/FisheriesRecords/StockingMonitoringModals.jsx
```
Expected: `Pencil`, `Trash2`, `FileText` still unused until Task 7 — otherwise no new errors.

- [ ] **Step 3: Commit**

```bash
git add oma-frontend/src/pages/FisheriesRecords/StockingMonitoringModals.jsx
git commit -m "Fisheries: add ViewStockingLogsModal with Total Loss lock banner"
```

---

### Task 7: Fisheries — add `StockingDisasterReportModal` and `RecordStockingHarvestModal`

**Files:**
- Modify: `oma-frontend/src/pages/FisheriesRecords/StockingMonitoringModals.jsx` (append both)

**Interfaces:**
- Produces: `export function StockingDisasterReportModal({ record, onClose, onSuccess })`, `export function RecordStockingHarvestModal({ record, onClose, onSuccess })`.
- Consumes: `POST /fisheries/stocking/{id}/disasters/` (`FisheriesDisasterReportSerializer`: `disaster_type, date_of_occurrence, area_affected_ha, estimated_damage, production_loss, is_total_loss`), `POST /fisheries/stocking/{id}/harvests/` (`FisheriesHarvestRecordSerializer`: `harvest_date, quantity_kg, avg_body_weight_kg, area_or_units_harvested, is_final, notes`; the view returns 400 with `detail` if the record is already Total Loss — confirmed at `oma_aringay/fisheries/views.py:395-406`).

**Disaster type choices** (from `FisheriesDisasterReport.DISASTER_TYPE_CHOICES` in `oma_aringay/fisheries/models.py:441-450`): `Fish Kill, Disease Outbreak, Flood, Typhoon, Drought, Predator Attack, Pollution Incident, Other`.

- [ ] **Step 1: Append `StockingDisasterReportModal`**

```jsx
// ── Disaster Report Modal ─────────────────────────────────────────────────────

const DISASTER_TYPE_OPTIONS = [
  'Fish Kill', 'Disease Outbreak', 'Flood', 'Typhoon',
  'Drought', 'Predator Attack', 'Pollution Incident', 'Other',
]

export function StockingDisasterReportModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [disasterType,      setDisasterType]      = useState('')
  const [dateOfOccurrence,  setDateOfOccurrence]  = useState(todayISO())
  const [areaAffectedHa,    setAreaAffectedHa]    = useState('')
  const [estimatedDamage,   setEstimatedDamage]   = useState('')
  const [productionLoss,    setProductionLoss]    = useState('')
  const [isTotalLoss,       setIsTotalLoss]       = useState(false)
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [areaError,         setAreaError]         = useState('')
  const [dateError,         setDateError]         = useState('')

  const speciesName  = record.species_name || 'this stock'
  const maxArea       = record.area_hectares ? parseFloat(record.area_hectares) : null
  const dateStocked   = record.date_stocked || null

  const validateArea = (val) => {
    if (!val) return 'Area affected is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Area must be greater than 0.'
    if (maxArea !== null && n > maxArea) return `Cannot exceed area stocked (${maxArea} ha).`
    return ''
  }

  const validateDate = (val) => {
    if (!val) return 'Date of occurrence is required.'
    if (val > todayISO()) return 'Date cannot be in the future.'
    if (dateStocked && val < dateStocked) return `Date cannot be before date stocked (${dateStocked}).`
    return ''
  }

  const handleSubmitClick = () => {
    if (!disasterType) { showToast('Please select a disaster type.', 'error'); return }
    const aErr = validateArea(areaAffectedHa)
    const dErr = validateDate(dateOfOccurrence)
    setAreaError(aErr)
    setDateError(dErr)
    if (aErr || dErr) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post(`/fisheries/stocking/${record.id}/disasters/`, {
        disaster_type:      disasterType,
        date_of_occurrence: dateOfOccurrence,
        area_affected_ha:   parseFloat(isTotalLoss && maxArea ? maxArea : areaAffectedHa),
        estimated_damage:   estimatedDamage,
        production_loss:    productionLoss,
        is_total_loss:      isTotalLoss,
      })
      showToast('Disaster report recorded.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save disaster report.', 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <>
      <ModalShell
        title="Report Disaster / Damage"
        subtitle={`Report a disaster event for ${speciesName}`}
        icon={AlertTriangle}
        iconBg="bg-rose-100"
        iconColor="text-rose-600"
        onClose={onClose}
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Disaster Type *</label>
            <select className={baseInputClasses} value={disasterType}
              onChange={e => setDisasterType(e.target.value)}>
              <option value="">Select type</option>
              {DISASTER_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Date of Occurrence *</label>
            <input type="date" className={`${baseInputClasses} ${dateError ? 'border-rose-400' : ''}`}
              value={dateOfOccurrence}
              max={todayISO()}
              min={dateStocked || undefined}
              onChange={e => { setDateOfOccurrence(e.target.value); setDateError(validateDate(e.target.value)) }} />
            {dateError && <p className="mt-1 text-xs text-rose-600">{dateError}</p>}
            {dateStocked && !dateError && (
              <p className="mt-1 text-xs text-slate-400">Must be between {dateStocked} and today.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Area Affected (ha) *</label>
            <input type="number" step="0.0001"
              className={`${baseInputClasses} ${areaError ? 'border-rose-400' : ''} ${isTotalLoss ? 'bg-slate-100 cursor-not-allowed' : ''}`}
              value={isTotalLoss && maxArea ? maxArea : areaAffectedHa}
              onChange={e => { setAreaAffectedHa(e.target.value); setAreaError(validateArea(e.target.value)) }}
              disabled={isTotalLoss}
              placeholder={maxArea ? `0.01 – ${maxArea}` : 'e.g. 2.50'} />
            {areaError && <p className="mt-1 text-xs text-rose-600">{areaError}</p>}
            {!areaError && maxArea && !isTotalLoss && (
              <p className="mt-1 text-xs text-slate-400">Max: {maxArea} ha (total area stocked)</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Damage Description (optional)</label>
            <textarea rows={3} className={`${baseInputClasses} resize-none`} value={estimatedDamage}
              onChange={e => setEstimatedDamage(e.target.value)}
              placeholder="Describe the damage observed (stock, infrastructure, etc.)" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Estimated Production Loss (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`} value={productionLoss}
              onChange={e => setProductionLoss(e.target.value)}
              placeholder="Describe or estimate production loss" />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isTotalLoss}
              onChange={e => {
                setIsTotalLoss(e.target.checked)
                if (e.target.checked && maxArea) {
                  setAreaAffectedHa(String(maxArea))
                  setAreaError('')
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
            />
            <div>
              <span className="text-sm font-medium text-rose-800">Total loss — stock completely destroyed</span>
              <p className="text-xs text-rose-500 mt-0.5">This ends the production cycle. No harvest can be recorded.</p>
            </div>
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Report Disaster'}
            </button>
          </div>
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Disaster Report"
          message={`Are you sure you want to log this disaster event for ${speciesName}? This will be recorded in the monitoring history.`}
          confirmLabel="Yes, Report"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Append `RecordStockingHarvestModal`**

```jsx
// ── Record Harvest Modal ──────────────────────────────────────────────────────

export function RecordStockingHarvestModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [harvestDate,       setHarvestDate]       = useState(todayISO())
  const [quantityKg,        setQuantityKg]        = useState('')
  const [avgBodyWeightKg,   setAvgBodyWeightKg]   = useState('')
  const [areaOrUnits,       setAreaOrUnits]       = useState('')
  const [notes,             setNotes]             = useState('')
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [quantityError,     setQuantityError]     = useState('')

  const speciesName = record.species_name || 'this stock'
  const estYield     = record.estimated_harvest_kg ? parseFloat(record.estimated_harvest_kg) : null

  const validateQuantity = (val) => {
    if (!val) return 'Quantity harvested is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Quantity must be greater than 0.'
    return ''
  }

  const handleSubmitClick = () => {
    if (!harvestDate) { showToast('Harvest date is required.', 'error'); return }
    const qErr = validateQuantity(quantityKg)
    setQuantityError(qErr)
    if (qErr) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post(`/fisheries/stocking/${record.id}/harvests/`, {
        harvest_date:            harvestDate,
        quantity_kg:             parseFloat(quantityKg),
        avg_body_weight_kg:      avgBodyWeightKg !== '' ? parseFloat(avgBodyWeightKg) : null,
        area_or_units_harvested: areaOrUnits,
        is_final:                true,
        notes,
      })
      showToast('Harvest recorded successfully!', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to record harvest.', 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <>
      <ModalShell
        title="Record Harvest"
        subtitle={`Record harvest details for ${speciesName}`}
        icon={Wheat}
        iconBg="bg-amber-100"
        iconColor="text-amber-600"
        onClose={onClose}
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Harvest Date *</label>
            <input type="date" className={baseInputClasses} value={harvestDate}
              max={todayISO()}
              onChange={e => setHarvestDate(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Quantity Harvested (kg) *</label>
            <input type="number" step="0.01"
              className={`${baseInputClasses} ${quantityError ? 'border-rose-400' : ''}`}
              value={quantityKg}
              onChange={e => { setQuantityKg(e.target.value); setQuantityError(validateQuantity(e.target.value)) }}
              placeholder="e.g. 500" />
            {quantityError
              ? <p className="mt-1 text-xs text-rose-600">{quantityError}</p>
              : estYield && (
                <p className="mt-1 text-xs text-slate-400">
                  Estimated harvest: {Number(estYield).toLocaleString()} kg
                </p>
              )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Avg Body Weight (kg)</label>
              <input type="number" step="0.001" className={baseInputClasses}
                value={avgBodyWeightKg}
                onChange={e => setAvgBodyWeightKg(e.target.value)}
                placeholder="e.g. 0.250" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Area / Units Harvested</label>
              <input type="text" className={baseInputClasses}
                value={areaOrUnits}
                onChange={e => setAreaOrUnits(e.target.value)}
                placeholder="e.g. Pond 2, 3 cages" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Notes (optional)</label>
            <textarea rows={2} className={`${baseInputClasses} resize-none`} value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional harvest notes or observations" />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmitClick} disabled={isSubmitting}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
              {isSubmitting ? 'Saving…' : 'Save Harvest Record'}
            </button>
          </div>
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Harvest Record"
          message={`Are you sure you want to record the harvest for ${speciesName}? This will mark the cycle as Harvested.`}
          confirmLabel="Yes, Record Harvest"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
```

*(`Pencil`, `Trash2`, `FileText` imported at the top of the file remain unused — they were included preemptively for parity with the crops file but nothing in this plan's scope needs an Edit/Delete-harvest UI for fisheries. Remove those three from the `lucide-react` import line now to keep `eslint` clean.)*

- [ ] **Step 3: Remove unused icon imports**

At the top of the file, change:

```jsx
import {
  AlertTriangle, Bug, CheckCircle, CheckCircle2, FileText, Fish, Lock, Pencil, Trash2, Wheat,
} from 'lucide-react'
```

to:

```jsx
import {
  AlertTriangle, Bug, CheckCircle, CheckCircle2, Fish, Lock, Wheat,
} from 'lucide-react'
```

- [ ] **Step 4: Verify**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/pages/FisheriesRecords/StockingMonitoringModals.jsx
```
Expected: zero errors, zero unused-import warnings.

- [ ] **Step 5: Commit**

```bash
git add oma-frontend/src/pages/FisheriesRecords/StockingMonitoringModals.jsx
git commit -m "Fisheries: add StockingDisasterReportModal (Total Loss checkbox) and RecordStockingHarvestModal"
```

---

### Task 8: Wire the fisheries modals + damage dot into `FisheriesRecordsPage.jsx`

**Files:**
- Modify: `oma-frontend/src/pages/FisheriesRecords/FisheriesRecordsPage.jsx`

**Interfaces:**
- Consumes: `ViewStockingLogsModal`, `StockingDisasterReportModal`, `RecordStockingHarvestModal` from Tasks 6-7; `DisasterDot` from Task 2.

- [ ] **Step 1: Add imports**

At the top of `FisheriesRecordsPage.jsx`, change:

```jsx
import { AlertTriangle, Fish, Pencil, Plus, Search, Trash2, User } from 'lucide-react'
```

to:

```jsx
import { AlertTriangle, Eye, Fish, Pencil, Plus, Search, Trash2, User, Wheat } from 'lucide-react'
```

Add, near the other component imports (after the `StatusPill` import):

```jsx
import DisasterDot from '../../components/UI/DisasterDot.jsx'
import {
  RecordStockingHarvestModal,
  StockingDisasterReportModal,
  ViewStockingLogsModal,
} from './StockingMonitoringModals.jsx'
```

- [ ] **Step 2: Add modal-open state in `FisheriesRecordsPage`**

Find the state block (around line 893-905):

```jsx
  const [showAdd,      setShowAdd]      = useState(false)
  const [editingRec,   setEditingRec]   = useState(null)
  const [deletingRec,  setDeletingRec]  = useState(null)
  const [speciesList,  setSpeciesList]  = useState([])
```

Replace with:

```jsx
  const [showAdd,      setShowAdd]      = useState(false)
  const [editingRec,   setEditingRec]   = useState(null)
  const [deletingRec,  setDeletingRec]  = useState(null)
  const [speciesList,  setSpeciesList]  = useState([])
  const [viewLogsRec,  setViewLogsRec]  = useState(null)
  const [disasterRec,  setDisasterRec]  = useState(null)
  const [harvestRec,   setHarvestRec]   = useState(null)
```

- [ ] **Step 3: Add the dot and action buttons to `rows`**

Find `species_name_cell` inside the `rows` map (around line 954-963):

```jsx
    species_name_cell: (
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{rec.species_name}</span>
        {rec.disaster_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <AlertTriangle className="w-2.5 h-2.5" /> Disaster
          </span>
        )}
      </span>
    ),
```

Replace with:

```jsx
    species_name_cell: (
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{rec.species_name}</span>
        {rec.disaster_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <AlertTriangle className="w-2.5 h-2.5" /> Disaster
          </span>
        )}
      </span>
    ),
```

*(unchanged — the disaster badge already exists here; leave it as-is)*

Find `status_cell` (around line 975-977):

```jsx
    status_cell: (
      <StatusPill tone={STATUS_TONES[rec.status] || 'slate'}>{rec.status}</StatusPill>
    ),
```

Replace with:

```jsx
    status_cell: (
      <span className="flex items-center gap-1.5">
        <StatusPill tone={STATUS_TONES[rec.status] || 'slate'}>{rec.status}</StatusPill>
        <DisasterDot activeCount={rec.disaster_count} hasResolved={rec.has_resolved_disaster} />
      </span>
    ),
```

Find `actions_cell` (around line 978-1001):

```jsx
    actions_cell: (
      <div className="flex items-center gap-1">
        {rec.status !== 'Harvested' && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
            onClick={(e) => { e.stopPropagation(); setEditingRec(rec) }}
            title="Edit"
          >
            <Pencil size={14} />
          </button>
        )}
        {user?.role === 'ADMIN' && rec.status !== 'Harvested' && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setDeletingRec(rec) }}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    ),
```

Replace with:

```jsx
    actions_cell: (
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-[#1B4D2E] transition-colors"
          onClick={(e) => { e.stopPropagation(); setViewLogsRec(rec) }}
          title="View Logs"
        >
          <Eye size={14} />
        </button>
        {rec.status !== 'Total Loss' && rec.status !== 'Harvested' && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors"
            onClick={(e) => { e.stopPropagation(); setHarvestRec(rec) }}
            title="Record Harvest"
          >
            <Wheat size={14} />
          </button>
        )}
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          onClick={(e) => { e.stopPropagation(); setDisasterRec(rec) }}
          title="Report Disaster"
        >
          <AlertTriangle size={14} />
        </button>
        {rec.status !== 'Harvested' && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
            onClick={(e) => { e.stopPropagation(); setEditingRec(rec) }}
            title="Edit"
          >
            <Pencil size={14} />
          </button>
        )}
        {user?.role === 'ADMIN' && rec.status !== 'Harvested' && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setDeletingRec(rec) }}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    ),
```

- [ ] **Step 4: Render the three new modals**

Find the modal-render block at the end of the component (around line 1133-1158):

```jsx
      {showAdd && (
        <AddStockingModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); setPage(1); fetchRecords(1) }}
        />
      )}

      {editingRec && (
        <EditStockingModal
          record={editingRec}
          speciesList={speciesList}
          onClose={() => setEditingRec(null)}
          onSaved={() => { setEditingRec(null); fetchRecords(page) }}
        />
      )}

      {deletingRec && (
        <ConfirmDialog
          title="Delete Stocking Record"
          message={`Delete stocking record for "${deletingRec.species_name}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeletingRec(null)}
        />
      )}
    </PageLayout>
  )
}
```

Replace with:

```jsx
      {showAdd && (
        <AddStockingModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); setPage(1); fetchRecords(1) }}
        />
      )}

      {editingRec && (
        <EditStockingModal
          record={editingRec}
          speciesList={speciesList}
          onClose={() => setEditingRec(null)}
          onSaved={() => { setEditingRec(null); fetchRecords(page) }}
        />
      )}

      {deletingRec && (
        <ConfirmDialog
          title="Delete Stocking Record"
          message={`Delete stocking record for "${deletingRec.species_name}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeletingRec(null)}
        />
      )}

      {viewLogsRec && (
        <ViewStockingLogsModal
          record={viewLogsRec}
          onClose={() => setViewLogsRec(null)}
          onLogAdded={() => fetchRecords(page)}
        />
      )}

      {disasterRec && (
        <StockingDisasterReportModal
          record={disasterRec}
          onClose={() => setDisasterRec(null)}
          onSuccess={() => fetchRecords(page)}
        />
      )}

      {harvestRec && (
        <RecordStockingHarvestModal
          record={harvestRec}
          onClose={() => setHarvestRec(null)}
          onSuccess={() => { setHarvestRec(null); fetchRecords(page) }}
        />
      )}
    </PageLayout>
  )
}
```

- [ ] **Step 5: Verify**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npx eslint src/pages/FisheriesRecords/FisheriesRecordsPage.jsx
```
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add oma-frontend/src/pages/FisheriesRecords/FisheriesRecordsPage.jsx
git commit -m "Fisheries: wire View Logs / Report Disaster / Record Harvest actions and disaster dot into FisheriesRecordsPage"
```

---

### Task 9: Sweep verification report (no code changes)

**Context:** The Explore-agent audit already ran this sweep across all of `oma-frontend/src` with these results — this task is to **re-run and confirm** them after Tasks 1-8 land (in case any new code accidentally reintroduces a stale string), then produce the final report line the user asked for.

- [ ] **Step 1: Re-run the sweep**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && grep -rn '"Damaged"\|'"'"'Damaged'"'"'\|"For Harvest"\|'"'"'For Harvest'"'"'\|activity_date' src/
```

- [ ] **Step 2: Triage each match**

Expected (from the pre-implementation audit — confirm nothing new appeared):
- `"Damaged"` matches: only `LogFisheriesDisasterModal.jsx` (legacy `monitoring` app, "Equipment Damaged" field label — out of scope, correct as-is) and `LogDamageReportModal.jsx` (a `Production` page — "Crops Damaged" field labels, unrelated to the crop/fisheries `status` value — correct as-is). **No status-pill or status-filter usage of "Damaged" exists anywhere.**
- `"For Harvest"`: **zero matches** — already clean, nothing to fix.
- `activity_date`: **zero matches** — already clean, everything uses `date_of_activity`.

If Tasks 1-8 introduced no new hits beyond these expected/pre-existing ones, this task requires no code changes — just report the raw grep output with a one-line resolution note per match (as the user's FINAL VERIFICATION checklist requires).

---

### Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Frontend build**

```bash
cd "D:\CAPSTONE SYSTEM\oma-frontend" && npm run build
```
Expected: exits 0, no errors.

- [ ] **Step 2: Backend check**

```bash
cd "D:\CAPSTONE SYSTEM\oma_aringay" && python manage.py check
```
Expected: `System check identified no issues`.

- [ ] **Step 3: Manual API verification — crops Total Loss**

Using an authenticated session (browser devtools or `curl` with a saved auth token), on a test crop monitoring record:
```bash
curl -X POST http://localhost:8000/api/production/monitoring/<id>/disasters/ \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"disaster_type":"Flood","date_of_occurrence":"2026-07-05","area_affected_ha":1.0,"is_total_loss":true}'
```
Paste the response, then:
```bash
curl http://localhost:8000/api/production/monitoring/?status=Total%20Loss -H "Authorization: Bearer <token>"
```
Confirm the record appears with `"status": "Total Loss"`.

- [ ] **Step 4: Manual API verification — Record Harvest blocked**

```bash
curl -X POST http://localhost:8000/api/production/create/ \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"monitoring_record":<id>, ...}'
```
Confirm 400 response. In the browser, open the Crop Monitoring table row for that record and confirm the Wheat/Record Harvest icon button (Task 1) is no longer rendered.

- [ ] **Step 5: Manual verification — suggestions refetch + disaster_rule FK**

In the browser: open View Logs on an active record with an active disaster, click "🌿 Get Suggestions", note a disaster rule card's `is_done: false`. Click "Log" on it, fill the form, confirm. Reopen "🌿 Get Suggestions" and confirm that same rule now shows `is_done: true` with a checkmark and no click handler (inspect the DOM — the card should have no `onClick`-bearing `<button>` at all, matching the "Done" render branch). Cross-check via:
```bash
curl http://localhost:8000/api/production/monitoring/<id>/logs/ -H "Authorization: Bearer <token>"
```
and confirm the newly created log has `disaster_report` and `disaster_rule` set to the expected IDs (non-null).

- [ ] **Step 6: Confirm Total Loss excluded from Forecasting and dashboard active counts**

```bash
curl http://localhost:8000/api/production/monitoring/ -H "Authorization: Bearer <token>"
```
(default, unfiltered call used by `useDashboardData.js`'s `fetchActiveMonitoring` — confirm the Total Loss record from Step 3 is excluded from `count`, matching `StockingListCreateView`'s crops-equivalent default-exclude-Total-Loss-and-Harvested behavior.) Then load `/forecasting` in the browser and confirm the Total Loss record does not appear in the table (it's excluded by the `status: 'Planted,Near Harvest'` param already in `ForecastingPage.jsx:188`).

- [ ] **Step 7: Repeat Steps 3-6 for fisheries** using `/api/fisheries/stocking/<id>/disasters/`, `/api/fisheries/stocking/<id>/harvests/` (expect 400), `/api/fisheries/stocking/<id>/logs/`, `/api/fisheries/stocking/<id>/suggestions/`, and the new View Logs / Report Disaster / Record Harvest buttons in `FisheriesRecordsPage.jsx`.

- [ ] **Step 8: Report**

Compile all raw command output from Steps 1-7 plus the Task 9 grep output into the final response to the user, per their FINAL VERIFICATION checklist. Do not summarize away the raw output — paste it verbatim as requested.
