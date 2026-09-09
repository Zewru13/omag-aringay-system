import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Pencil, Plus, Search, Trash2, Upload, User, Users } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import { FARMER_DISTRIBUTION_DOMAIN } from './distributionDomains.js'

// interventions.models.DistributionStatus — the scheduled distribution +
// confirmation lifecycle. Records created the old way (today/past-dated)
// still land on CONFIRMED immediately, so most rows show that.
const STATUS_LABELS = {
  PENDING: 'Pending',
  AWAITING_CONFIRMATION: 'Awaiting Confirmation',
  CONFIRMED: 'Confirmed',
  NOT_RECEIVED: 'Not Received',
  RESOLVED: 'Resolved',
}
// Editing is blocked once a record has entered a citizen-facing state
// (interventions.views.PendingOnlyEditMixin) — mirrored here so the row
// action doesn't offer something the backend will reject.
const EDITABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', undefined, ''])

// Must match interventions.models.BeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from production.models.CropAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other']
const SEASON_OPTIONS = ['Dry', 'Wet']
// Batch C — a shared, reconciled choice set (minus its own 'Other', appended
// by ComboboxWithOther). This field was a plain free-text input before;
// source_agency itself is still a free CharField on the backend, so this
// is a frontend-only UX reconciliation.
const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const COLUMNS = [
  { key: 'date_received_fmt',             label: 'Date Received' },
  { key: 'farmer_full_name',              label: 'Farmer' },
  { key: 'attributed_organization_name',  label: 'Organization' },
  { key: 'assistance_type',               label: 'Assistance Type' },
  { key: 'source_agency',                 label: 'Source Agency' },
  { key: 'quantity',                      label: 'Quantity' },
  { key: 'season_year_cell',              label: 'Season / Year' },
  { key: 'recorded_by_name',              label: 'Logged By' },
  { key: 'status_cell',                   label: 'Status' },
  { key: 'actions_cell',                  label: 'Actions' },
]

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

// PendingOnlyEditMixin raises a plain ValidationError(str), which DRF
// serializes as a bare array — not {detail: ...} — so that shape needs
// handling too, or the specific "cannot be edited" reason silently
// collapses into a generic fallback message.
function extractErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (Array.isArray(data) && data.length) return String(data[0])
  if (data?.detail) return data.detail
  return fallback
}

// ── Farmer Search — same pattern as AddCropMonitoringPage.jsx's FarmerSearchInput ──

function FarmerSearchInput({ onSelect, selected }) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [showDrop,  setShowDrop]  = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef  = useRef(null)

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const r = await api.get('/farmers/', { params: { search: q } })
      const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
      setResults(list.slice(0, 8))
    } catch { setResults([]) }
    finally { setSearching(false) }
  }, [])

  const handleChange = (e) => {
    const v = e.target.value
    setQuery(v)
    setShowDrop(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(v), 300)
  }

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (farmer) => {
    onSelect({ id: farmer.id, full_name: farmer.full_name, barangay: farmer.barangay || '' })
    setQuery(farmer.full_name)
    setShowDrop(false)
  }

  const handleClear = () => {
    setQuery('')
    onSelect({ id: null, full_name: '', barangay: '' })
    setResults([])
  }

  const displayValue = selected.id ? selected.full_name : query

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[13px] font-medium text-[#4A5E4A]">
        Farmer <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name or RSBSA number…"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
          className={`${baseInputClasses} pl-8 ${selected.id ? 'pr-16' : ''}`}
        />
        {selected.id && (
          <button type="button" onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-rose-500 hover:text-rose-700 px-1">
            Clear
          </button>
        )}
      </div>
      {showDrop && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto">
          {searching ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">{query.trim() ? 'No farmers found.' : 'Type to search farmers.'}</p>
          ) : (
            results.map((f) => (
              <button key={f.id} type="button" onMouseDown={() => handleSelect(f)}
                className="flex items-start gap-3 w-full px-4 py-2.5 text-left hover:bg-[#F5F7F5] transition-colors">
                <User className="w-3.5 h-3.5 mt-0.5 text-[#A8BCA8] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[#1A2B1A]">{f.full_name}</p>
                  <p className="text-[11px] text-[#7A8E7A]">{f.barangay || ''}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Modal ────────────────────────────────────────────────────────────────

function AddAssistanceModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [farmer, setFarmer] = useState({ id: null, full_name: '', barangay: '' })
  const [form, setForm] = useState({
    assistance_type: '', description: '', quantity: '', date_received: '',
    source_agency: '', source_agency_other: '', season: '', year: CURRENT_YEAR,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!farmer.id) { showToast('Select a farmer first.', 'error'); return }
    if (!form.assistance_type || !form.date_received || !form.source_agency) {
      showToast('Fill in all required fields.', 'error'); return
    }
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) {
      showToast('Please specify the source agency.', 'error'); return
    }
    setError(''); setIsSubmitting(true)
    try {
      const { description, date_received, source_agency_other, ...rest } = form
      const sourceAgency = form.source_agency === 'Other' ? source_agency_other.trim() : form.source_agency
      await api.post('/interventions/beneficiaries/adhoc/', {
        ...rest,
        source_agency: sourceAgency,
        remarks: description,
        date_given: date_received,
        farmer: farmer.id,
      })
      showToast('Crop assistance record added.', 'success')
      onSuccess(); onClose()
    } catch (err) {
      const data = err?.response?.data
      setError((data && typeof data === 'object' && Object.values(data)[0]?.[0]) || 'Failed to save record.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Log Crop Assistance" subtitle="Record assistance given to a farmer." onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FarmerSearchInput onSelect={setFarmer} selected={farmer} />
        {farmer.id && <p className="text-[11px] text-[#7A8E7A] -mt-2">Barangay: {farmer.barangay || '—'}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Assistance Type" required>
            <select className={baseInputClasses} value={form.assistance_type} onChange={(e) => set('assistance_type', e.target.value)}>
              <option value="">Select Assistance Type</option>
              {ASSISTANCE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
          <FormField label="Source Agency" required>
            <ComboboxWithOther
              options={SOURCE_AGENCY_OPTIONS}
              value={form.source_agency}
              otherValue={form.source_agency_other}
              onChange={(v) => set('source_agency', v)}
              onOtherChange={(v) => set('source_agency_other', v)}
              placeholder="Select source agency…"
            />
          </FormField>
          <FormField label="Date Received" required>
            <input type="date" className={baseInputClasses} value={form.date_received}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                const v = e.target.value
                set('date_received', v)
                if (v) set('year', new Date(v).getFullYear())
              }} />
          </FormField>
          <FormField label="Quantity">
            <input className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="e.g. 2 bags" />
          </FormField>
          <FormField label="Season">
            <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
              <option value="">Select…</option>
              {SEASON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
          <FormField label="Year" required>
            <select className={baseInputClasses} value={form.year} onChange={(e) => set('year', e.target.value)}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="Description">
          <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </FormField>

        {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Save Record</Button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Edit Modal ───────────────────────────────────────────────────────────────

function EditAssistanceModal({ record, onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const originalData = {
    assistance_type: record.assistance_type || '',
    description: record.remarks || '',
    quantity: record.quantity || '',
    date_received: record.date_given || '',
    source_agency: record.source_agency || '',
    source_agency_other: '',
    season: record.season || '',
    year: record.year,
  }
  const [form, setForm] = useState(originalData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isDirty = JSON.stringify(form) !== JSON.stringify(originalData)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) {
      showToast('Please specify the source agency.', 'error'); return
    }
    setError(''); setIsSubmitting(true)
    try {
      const { description, date_received, source_agency_other, ...rest } = form
      const sourceAgency = form.source_agency === 'Other' ? source_agency_other.trim() : form.source_agency
      await api.patch(`/interventions/beneficiaries/adhoc/${record.id}/`, {
        ...rest, source_agency: sourceAgency, remarks: description, date_given: date_received,
      })
      showToast('Assistance record updated.', 'success')
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update record.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/interventions/beneficiaries/adhoc/${record.id}/`)
      showToast('Assistance record deleted.', 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete record.', 'error')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalShell title="Edit Assistance Record" subtitle={record.farmer_full_name} icon={Pencil} onClose={onClose} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Assistance Type" required>
              <select className={baseInputClasses} value={form.assistance_type} onChange={(e) => set('assistance_type', e.target.value)}>
                {ASSISTANCE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>
            <FormField label="Source Agency" required>
              <ComboboxWithOther
                options={SOURCE_AGENCY_OPTIONS}
                value={form.source_agency}
                otherValue={form.source_agency_other}
                onChange={(v) => set('source_agency', v)}
                onOtherChange={(v) => set('source_agency_other', v)}
              />
            </FormField>
            <FormField label="Date Received" required>
              <input type="date" className={baseInputClasses} value={form.date_received}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => set('date_received', e.target.value)} />
            </FormField>
            <FormField label="Quantity">
              <input className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
            </FormField>
            <FormField label="Season">
              <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
                <option value="">Select…</option>
                {SEASON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>
            <FormField label="Year" required>
              <select className={baseInputClasses} value={form.year} onChange={(e) => set('year', e.target.value)}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Description">
            <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          {isAdmin && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-[12px] font-semibold text-rose-700 mb-1">Danger Zone</p>
              <p className="text-[11px] text-rose-600 mb-2">Permanently delete this assistance record.</p>
              <button type="button" onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-100 transition-colors">
                <Trash2 size={13} /> Delete this record
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || !isDirty}
              className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </ModalShell>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Assistance Record?"
          message="This action cannot be undone."
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete Record'}
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}

// ── Mark Resolved Modal ─────────────────────────────────────────────────────
// Manual-with-note discipline mirroring disaster recovery: NOT_RECEIVED ->
// RESOLVED requires a non-empty follow_up_notes.

function MarkResolvedModal({ record, onClose, onResolved }) {
  const { showToast } = useToast()
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!notes.trim()) { setError('Follow-up notes are required.'); return }
    setError(''); setIsSubmitting(true)
    try {
      await api.post(`/interventions/beneficiaries/${record.id}/mark-resolved/`, { follow_up_notes: notes.trim() })
      showToast('Case marked resolved.', 'success')
      onResolved()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to mark this case resolved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Mark Resolved" subtitle={record.farmer_full_name} icon={CheckCircle2} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-[#FBE3E0] bg-[#FDF3F2] px-4 py-3 text-[13px] text-[#8A1F16]">
          <p className="font-semibold">Reason recipient gave: </p>
          <p className="mt-0.5">{record.non_receipt_reason || '—'}</p>
        </div>
        <FormField label="Follow-up Notes" required>
          <textarea
            rows={3}
            className={baseInputClasses}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was done to resolve this — e.g. redelivered, coordinated with organization…"
          />
        </FormField>
        {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Mark Resolved</Button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CropAssistancePage({ asTab = false }) {
  const { isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [barangay, setBarangay] = useState('')
  const [year, setYear] = useState('')
  const [view, setView] = useState(searchParams.get('tab') === 'needs-follow-up' ? 'needs-follow-up' : 'all')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resolving, setResolving] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      if (view === 'needs-follow-up') params.set('status', 'NOT_RECEIVED')
      const r = await api.get(`/interventions/beneficiaries/adhoc/?${params}`)
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load crop assistance records.')
    } finally {
      setIsLoading(false)
    }
  }, [barangay, year, view])

  useEffect(() => { fetchAll() }, [fetchAll])

  const changeView = (next) => {
    setView(next)
    const params = new URLSearchParams(searchParams)
    if (next === 'needs-follow-up') params.set('tab', next); else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const rows = useMemo(() => records.map((r) => ({
    ...r,
    date_received_fmt: formatDate(r.date_given),
    season_year_cell: [r.season, r.year].filter(Boolean).join(' '),
    status_cell: r.status ? <StatusPill status={r.status}>{STATUS_LABELS[r.status] || r.status}</StatusPill> : '—',
    actions_cell: (
      <RowActions actions={[
        EDITABLE_STATUSES.has(r.status) && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(r) },
        r.status === 'NOT_RECEIVED' && { key: 'resolve', label: 'Mark Resolved', icon: CheckCircle2, tone: 'default', onClick: () => setResolving(r) },
      ]} />
    ),
  })), [records])

  const innerContent = (
    <div className="space-y-4">
      <div className="flex overflow-hidden rounded-xl border border-slate-300 w-fit">
        {[
          { key: 'all', label: 'All Records' },
          { key: 'needs-follow-up', label: 'Needs Follow-up' },
        ].map((t) => (
          <button
            key={t.key} type="button" onClick={() => changeView(t.key)}
            className={`px-4 py-2 text-[13px] font-semibold transition-colors ${
              view === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload size={15} className="mr-1" /> Import File
        </Button>
        <Button variant="outline" onClick={() => setShowDistribute(true)}>
          <Users size={15} className="mr-1" /> Distribute to Organization
        </Button>
        <Button onClick={() => setShowAdd(true)}>
          <Plus size={15} className="mr-1" /> Log Crop Assistance
        </Button>
      </div>

      <FilterPanel activeCount={[barangay, year].filter(Boolean).length}>
        <div className="w-48">
          <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
        </div>
        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
          value={year} onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </FilterPanel>

      {error ? <ErrorMessage message={error} /> : <DataTable columns={COLUMNS} data={rows} isLoading={isLoading} />}

      {showAdd && <AddAssistanceModal onClose={() => setShowAdd(false)} onSuccess={fetchAll} />}
      {showImport && (
        <ImportFileModal
          title="Import Crop Assistance"
          subtitle="Upload a spreadsheet to log assistance given to many farmers at once."
          importUrl="/interventions/beneficiaries/adhoc/import/"
          templateUrl="/interventions/beneficiaries/adhoc/import/template/"
          templateFilename="crop_assistance_import_template.xlsx"
          helpText="Each row logs one assistance-given event, matched to a farmer by RSBSA number."
          onClose={() => setShowImport(false)}
          onImported={fetchAll}
        />
      )}
      {showDistribute && (
        <DistributeAssistanceModal
          domain={FARMER_DISTRIBUTION_DOMAIN}
          onClose={() => setShowDistribute(false)}
          onSuccess={fetchAll}
        />
      )}
      {editing && (
        <EditAssistanceModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAll() }}
        />
      )}
      {resolving && (
        <MarkResolvedModal
          record={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); fetchAll() }}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout title="Crop Assistance" subtitle="Government and organization assistance given to farmers.">
      {innerContent}
    </PageLayout>
  )
}
