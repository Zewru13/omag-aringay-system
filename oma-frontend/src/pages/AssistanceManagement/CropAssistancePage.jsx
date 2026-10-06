import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Pencil, Plus, Search, Trash2, Upload, User, UserCheck, Users, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import useSuggestSearch from '../../hooks/useSuggestSearch.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
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
import ConfirmOnBehalfDialog from './ConfirmOnBehalfDialog.jsx'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import { FARMERS_ORG_DOMAIN } from '../Citizen/orgDomainConfig.js'
import { FARMER_DISTRIBUTION_DOMAIN } from './distributionDomains.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration, isTrainingType,
} from './assistanceFieldHelpers.js'

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
// A farmer or an organization reads the same lifecycle as "Received" / "Not Received": a record the office logged
// or the recipient confirmed is simply Received.
const FARMER_STATUS_LABELS = { ...STATUS_LABELS, CONFIRMED: 'Received' }
// Editing is blocked once a record has entered a citizen-facing state
// (interventions.views.PendingOnlyEditMixin) — mirrored here so the row
// action doesn't offer something the backend will reject.
const EDITABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', undefined, ''])

// Must match interventions.models.BeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from production.models.CropAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other']
const SEASON_OPTIONS = ['Dry', 'Wet']
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

const CONFIRM_COLUMNS = [
  { key: 'date_received_fmt', label: 'Date Given' },
  { key: 'farmer_full_name',  label: 'Member' },
  { key: 'assistance_type',   label: 'Assistance Type' },
  { key: 'quantity',          label: 'Quantity' },
  { key: 'review_cell',       label: 'Status' },
  { key: 'actions_cell',      label: 'Actions' },
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

function FarmerSearchInput({ onSelect, selected, memberUrl = null }) {
  const [query,     setQuery]     = useState('')
  const [showDrop,  setShowDrop]  = useState(false)
  const wrapperRef  = useRef(null)

  // Shared search-as-you-type hook: an answer made stale by newer typing is
  // thrown away. The server can take seconds, so an older, slower answer used
  // to land after (and overwrite) the one the user was actually waiting for.
  const { results, isSearching: searching, failed, active } = useSuggestSearch(
    selected.id ? '' : query,
    (q) => (memberUrl
      // organization mode: the organization's own member rows, shaped like registry results
      ? api.get(memberUrl)
        .then((r) => {
          const words = q.toLowerCase().split(/\s+/).filter(Boolean)
          return (Array.isArray(r.data) ? r.data : (r.data.results || []))
            .filter((m) => {
              const hay = `${m.farmer_full_name || ''} ${m.farmer_rsbsa_number || ''} ${m.farmer_barangay || ''}`.toLowerCase()
              return words.every((w) => hay.includes(w))
            })
            .slice(0, 10)
            .map((m) => ({
              id: m.farmer, full_name: m.farmer_full_name, rsbsa_number: m.farmer_rsbsa_number, barangay: m.farmer_barangay,
            }))
        })
      : api.get('/farmers/', { params: { search: q } })
        .then((r) => (Array.isArray(r.data) ? r.data : (r.data.results || [])).slice(0, 10))),
  )

  const handleChange = (e) => {
    setQuery(e.target.value)
    setShowDrop(true)
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
  }

  const displayValue = selected.id ? selected.full_name : query

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[13px] font-medium text-[#4A5E4A]">
        {memberUrl ? 'Member' : 'Farmer'} <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
        <input
          type="text"
          placeholder={memberUrl ? 'Search your members…' : 'Search by name or RSBSA number…'}
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
        <div className={`absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto transition-opacity ${searching && results.length > 0 ? 'opacity-60' : ''}`}>
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">
              {!active ? 'Type at least 2 characters.' : searching ? 'Searching…' : failed ? 'Search failed — please try again.' : (memberUrl ? 'No members found.' : 'No farmers found.')}
            </p>
          ) : (
            results.map((f) => (
              <button key={f.id} type="button" onMouseDown={() => handleSelect(f)}
                className="flex items-start gap-3 w-full px-4 py-2.5 text-left hover:bg-[#F5F7F5] transition-colors">
                <User className="w-3.5 h-3.5 mt-0.5 text-[#A8BCA8] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[#1A2B1A]">{f.full_name}</p>
                  <p className="text-[11px] text-[#7A8E7A]">
                    {f.rsbsa_number && `${f.rsbsa_number} · `}{f.barangay || ''}
                  </p>
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

// memberUrl: an organization reports to one of its own members (the picker searches that list, and a future date
// schedules the assistance instead of being refused).
function AddAssistanceModal({ onClose, onSuccess, memberUrl = null }) {
  const { showToast } = useToast()
  const [farmer, setFarmer] = useState({ id: null, full_name: '', barangay: '' })
  const [form, setForm] = useState({
    assistance_type: '', description: '', quantity: '', date_received: '',
    source_agencies: [], season: '', year: CURRENT_YEAR,
    ...EMPTY_TYPE_CONDITIONAL_FIELDS,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  // Same reset-on-type-change guard as DistributeAssistanceModal.jsx — see
  // sharedAssistanceFields.jsx.
  const setAssistanceType = (v) => setForm((f) => ({ ...f, assistance_type: v, quantity: '', ...EMPTY_TYPE_CONDITIONAL_FIELDS }))
  const isTraining = isTrainingType(form.assistance_type)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!farmer.id) { showToast(memberUrl ? 'Select a member first.' : 'Select a farmer first.', 'error'); return }
    if (!form.assistance_type || !form.date_received) {
      showToast('Fill in all required fields.', 'error'); return
    }
    const trainingError = validateTrainingDuration(form.assistance_type, form)
    if (trainingError) { showToast(trainingError, 'error'); return }
    setError(''); setIsSubmitting(true)
    try {
      const { description, date_received, quantity, ...rest } = form
      await api.post('/interventions/beneficiaries/adhoc/', {
        ...rest,
        quantity: isTraining ? '' : quantity,
        remarks: description,
        date_given: date_received,
        farmer: farmer.id,
        ...buildTypeConditionalPayload(form.assistance_type, form),
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
    <ModalShell
      title={memberUrl ? 'Report Assistance to a Member' : 'Log Individual Assistance'}
      subtitle={memberUrl ? 'Record assistance your organization gave to one member.' : 'Record assistance given to a farmer.'}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-assistance-form" isLoading={isSubmitting}>Save Record</Button>
        </>
      }
    >
      <form id="add-assistance-form" onSubmit={handleSubmit} className="space-y-4">
        <FarmerSearchInput onSelect={setFarmer} selected={farmer} memberUrl={memberUrl} />
        {farmer.id && <p className="text-[11px] text-[#7A8E7A] -mt-2">Barangay: {farmer.barangay || '—'}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Assistance Type" required>
            <select className={baseInputClasses} value={form.assistance_type} onChange={(e) => setAssistanceType(e.target.value)}>
              <option value="">Select Assistance Type</option>
              {ASSISTANCE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
          <FormField label={memberUrl ? 'Date Given' : 'Date Received'} required>
            <input type="date" className={baseInputClasses} value={form.date_received}
              max={memberUrl ? undefined : new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                const v = e.target.value
                set('date_received', v)
                if (v) set('year', new Date(v).getFullYear())
              }} />
          </FormField>
          {!isTraining && (
            <FormField label="Quantity">
              <input className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="e.g. 2 bags" />
            </FormField>
          )}
          <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} />
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

        <FormField label="Source Agency">
          <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)} />
        </FormField>

        <FormField label="Description">
          <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </FormField>

        {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
      </form>
    </ModalShell>
  )
}

// ── Edit Modal ───────────────────────────────────────────────────────────────

function EditAssistanceModal({ record, onClose, onSaved, own = false }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const originalData = {
    assistance_type: record.assistance_type || '',
    description: record.remarks || '',
    quantity: record.quantity || '',
    date_received: record.date_given || '',
    source_agencies: record.source_agencies || [],
    season: record.season || '',
    year: record.year,
    training_duration_days: record.training_duration_days != null ? String(record.training_duration_days) : '',
    equipment_type: record.equipment_type || '',
    seed_type: record.seed_type || '',
    fertilizer_type: record.fertilizer_type || '',
  }
  const [form, setForm] = useState(originalData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setAssistanceType = (v) => setForm((f) => ({ ...f, assistance_type: v, quantity: '', ...EMPTY_TYPE_CONDITIONAL_FIELDS }))
  const isDirty = JSON.stringify(form) !== JSON.stringify(originalData)
  const isTraining = isTrainingType(form.assistance_type)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trainingError = validateTrainingDuration(form.assistance_type, form)
    if (trainingError) { showToast(trainingError, 'error'); return }
    setError(''); setIsSubmitting(true)
    try {
      const { description, date_received, quantity, ...rest } = form
      await api.patch(own ? `/interventions/beneficiaries/${record.id}/detail/` : `/interventions/beneficiaries/adhoc/${record.id}/`, {
        ...rest,
        quantity: isTraining ? '' : quantity,
        remarks: description,
        date_given: date_received,
        ...buildTypeConditionalPayload(form.assistance_type, form),
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
      <ModalShell
        title="Edit Assistance Record"
        subtitle={record.farmer_full_name}
        icon={Pencil}
        onClose={onClose}
        maxWidth="max-w-xl"
        footer={
          <>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
              Cancel
            </button>
            <button type="submit" form="edit-assistance-form" disabled={isSubmitting || !isDirty}
              className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        <form id="edit-assistance-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Assistance Type" required>
              <select className={baseInputClasses} value={form.assistance_type} onChange={(e) => setAssistanceType(e.target.value)}>
                {ASSISTANCE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>
            <FormField label="Date Received" required>
              <input type="date" className={baseInputClasses} value={form.date_received}
                max={own ? undefined : new Date().toISOString().split('T')[0]}
                onChange={(e) => set('date_received', e.target.value)} />
            </FormField>
            {!isTraining && (
              <FormField label="Quantity">
                <input className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
              </FormField>
            )}
            <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} />
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
          <FormField label="Source Agency">
            <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)} />
          </FormField>
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
    <ModalShell
      title="Mark Resolved"
      subtitle={record.farmer_full_name}
      icon={CheckCircle2}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="mark-resolved-form" isLoading={isSubmitting}>Mark Resolved</Button>
        </>
      }
    >
      <form id="mark-resolved-form" onSubmit={handleSubmit} className="space-y-4">
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
      </form>
    </ModalShell>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

function ConfirmReceivedModal({ record, onClose, onDone }) {
  const { showToast } = useToast()
  const [photo, setPhoto] = useState(null)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const body = new FormData()
      if (photo) body.append('confirmation_photo', photo)
      if (note.trim()) body.append('confirmation_note', note.trim())
      await api.post(`/interventions/beneficiaries/${record.id}/confirm-received/`, body)
      showToast('Confirmed as received.', 'success')
      onDone()
    } catch (err) {
      const d = err?.response?.data
      const photoError = d?.confirmation_photo && [].concat(d.confirmation_photo).join(' ')
      showToast(photoError || extractErrorMessage(err, 'Failed to confirm.'), 'error')
    } finally { setIsSubmitting(false) }
  }
  return (
    <ModalShell title="Confirm Received" subtitle={`${record.assistance_type || 'Assistance'} · ${formatDate(record.date_given)}`} onClose={onClose}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="farmer-confirm-received" isLoading={isSubmitting}>Confirm</Button>
      </>}>
      <form id="farmer-confirm-received" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Proof Photo (optional)">
          <input type="file" accept="image/jpeg,image/png,image/webp" className={baseInputClasses}
            onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        </FormField>
        <FormField label="Note (optional)">
          <textarea rows={3} className={`${baseInputClasses} resize-none`} value={note}
            onChange={(e) => setNote(e.target.value)} placeholder="Anything the office should know about what you received" />
        </FormField>
      </form>
    </ModalShell>
  )
}

function ReportNotReceivedModal({ record, onClose, onDone }) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) { showToast('A reason is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.post(`/interventions/beneficiaries/${record.id}/report-not-received/`, { non_receipt_reason: reason.trim() })
      showToast('Reported as not received.', 'success')
      onDone()
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to report.'), 'error')
    } finally { setIsSubmitting(false) }
  }
  return (
    <ModalShell title="Report Not Received" subtitle={`${record.assistance_type || 'Assistance'} · ${formatDate(record.date_given)}`} onClose={onClose}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="farmer-report-not-received" isLoading={isSubmitting}>Submit</Button>
      </>}>
      <form id="farmer-report-not-received" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Reason" required>
          <textarea rows={3} className={`${baseInputClasses} resize-none`} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="Why was this assistance not received?" />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function CropAssistancePage({ asTab = false }) {
  // A farmer account reuses this page for its own assistance only: the list is the caller's own history, and
  // they confirm or report receipt. Logging, importing, distributing, editing and resolving stay staff tools.
  const { isAdmin, isFarmer, isOrg, user } = useAuth()
  // An organization account sees what it reported, reports assistance to its own members and confirms for members
  // without an account (organization mode, like the farmer one above).
  const orgId = user?.linked_record?.id
  const orgRecord = user?.linked_record
  const [confirmingOnBehalf, setConfirmingOnBehalf] = useState(null)
  const [reportingNotReceived, setReportingNotReceived] = useState(null)
  const [confirmingReceived, setConfirmingReceived] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [barangay, setBarangay] = useState('')
  const [year, setYear] = useState('')
  const initialTab = searchParams.get('tab')
  const [view, setView] = useState(
    (initialTab === 'needs-follow-up' && !isOrg) || (initialTab === 'upcoming' && isFarmer) || (initialTab === 'confirm' && isOrg) ? initialTab : 'all',
  )
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resolving, setResolving] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      if (isOrg) {
        // What this organization reported, or the members' awaiting records it may confirm for (year narrows both).
        const r = await api.get(view === 'confirm' ? FARMERS_ORG_DOMAIN.accountlessConfirmablesUrl : FARMERS_ORG_DOMAIN.historyUrl)
        let mine = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (year) mine = mine.filter((x) => String(x.date_given || '').startsWith(String(year)))
        setRecords(mine)
        return
      }
      if (isFarmer) {
        // Own history (not filterable on the server): the year and Needs Follow-up views narrow it here.
        const r = await api.get('/interventions/my-beneficiary-history/')
        let mine = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (year) mine = mine.filter((x) => String(x.date_given || '').startsWith(String(year)))
        if (view === 'needs-follow-up') mine = mine.filter((x) => x.status === 'NOT_RECEIVED')
        if (view === 'upcoming') mine = mine.filter((x) => x.status === 'PENDING')
        setRecords(mine)
        return
      }
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
  }, [barangay, year, view, isFarmer, isOrg])

  useEffect(() => { fetchAll() }, [fetchAll])

  const changeView = (next) => {
    setView(next)
    const params = new URLSearchParams(searchParams)
    if (next !== 'all') params.set('tab', next); else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const rows = useMemo(() => records.map((r) => ({
    ...r,
    source_agency: (r.source_agencies || []).join(', '),
    date_received_fmt: formatDate(r.date_given),
    season_year_cell: [r.season, r.year].filter(Boolean).join(' '),
    status_cell: r.status ? <StatusPill status={r.status}>{((isFarmer || isOrg) ? FARMER_STATUS_LABELS : STATUS_LABELS)[r.status] || r.status}</StatusPill> : '—',
    // Confirm for Members list: where the member's request to OMAg stands
    review_cell: r.latest_request_status === 'PENDING'
      ? <StatusPill tone="amber">Pending Review</StatusPill>
      : r.latest_request_status === 'REJECTED'
        ? <StatusPill tone="rose">{r.latest_request_reason ? `Rejected: ${r.latest_request_reason}` : 'Rejected'}</StatusPill>
        : <StatusPill tone="slate">Needs Confirmation</StatusPill>,
    actions_cell: isOrg ? (
      view === 'confirm' ? (
        r.latest_request_status === 'PENDING' ? '—' : (
          <RowActions actions={[
            { key: 'confirm', label: 'Confirm for Member', icon: UserCheck, onClick: () => setConfirmingOnBehalf(r) },
          ]} />
        )
      ) : r.status === 'PENDING' ? (
        // an organization corrects only what has not reached the member yet (scheduled, not yet due)
        <RowActions actions={[{ key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(r) }]} />
      ) : '—'
    ) : isFarmer ? (
      r.status === 'AWAITING_CONFIRMATION' ? (
        <RowActions actions={[
          { key: 'confirm', label: 'Confirm Received', icon: CheckCircle2, onClick: () => setConfirmingReceived(r) },
          { key: 'not-received', label: 'Report Not Received', icon: XCircle, tone: 'rose', onClick: () => setReportingNotReceived(r) },
        ]} />
      ) : '—'
    ) : (
      <RowActions actions={[
        EDITABLE_STATUSES.has(r.status) && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(r) },
        r.status === 'NOT_RECEIVED' && { key: 'resolve', label: 'Mark Resolved', icon: CheckCircle2, tone: 'default', onClick: () => setResolving(r) },
      ]} />
    ),
  })), [records, isFarmer, isOrg, view])

  const tableColumns = isOrg
    ? (view === 'confirm'
      ? CONFIRM_COLUMNS
      : COLUMNS.filter((c) => !['attributed_organization_name', 'recorded_by_name'].includes(c.key))
        .map((c) => (c.key === 'farmer_full_name' ? { ...c, label: 'Member' } : c.key === 'date_received_fmt' ? { ...c, label: 'Date Given' } : c)))
    : isFarmer
      ? COLUMNS.filter((c) => !['farmer_full_name', 'recorded_by_name'].includes(c.key))
      : COLUMNS

  const innerContent = (
    <div className="space-y-4">
      <div className="flex overflow-hidden rounded-xl border border-slate-300 w-fit">
        {[
          { key: 'all', label: (isFarmer || isOrg) ? 'History' : 'All Records' },
          isFarmer && { key: 'upcoming', label: 'Upcoming' },
          isOrg && { key: 'confirm', label: 'Confirm for Members' },
          !isOrg && { key: 'needs-follow-up', label: 'Needs Follow-up' },
        ].filter(Boolean).map((t) => (
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

      {isOrg && view === 'all' && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setShowDistribute(true)}>
            <Users size={15} className="mr-1" /> Report to All Members
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={15} className="mr-1" /> Report to a Member
          </Button>
        </div>
      )}
      {!isFarmer && !isOrg && <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload size={15} className="mr-1" /> Import File
        </Button>
        <Button variant="outline" onClick={() => setShowDistribute(true)}>
          <Users size={15} className="mr-1" /> Distribute to Organization
        </Button>
        <Button onClick={() => setShowAdd(true)}>
          <Plus size={15} className="mr-1" /> Log Individual Assistance
        </Button>
      </div>}

      <FilterPanel activeCount={[(isFarmer || isOrg) ? '' : barangay, year].filter(Boolean).length}>
        {!isFarmer && !isOrg && <div className="w-48">
          <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
        </div>}
        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
          value={year} onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </FilterPanel>

      {error ? <ErrorMessage message={error} /> : <DataTable columns={tableColumns} data={rows} isLoading={isLoading} />}

      {showAdd && !isFarmer && (
        <AddAssistanceModal
          onClose={() => setShowAdd(false)}
          onSuccess={fetchAll}
          memberUrl={isOrg ? FARMERS_ORG_DOMAIN.memberSearchUrl(orgId) : null}
        />
      )}
      {showImport && !isFarmer && !isOrg && (
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
      {showDistribute && !isFarmer && (
        <DistributeAssistanceModal
          domain={FARMER_DISTRIBUTION_DOMAIN}
          fixedOrg={isOrg ? { id: orgId, name: orgRecord?.label, barangay: orgRecord?.barangay } : null}
          onClose={() => setShowDistribute(false)}
          onSuccess={fetchAll}
        />
      )}
      {editing && !isFarmer && (
        <EditAssistanceModal
          record={editing}
          own={isOrg}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAll() }}
        />
      )}
      {confirmingReceived && (
        <ConfirmReceivedModal
          record={confirmingReceived}
          onClose={() => setConfirmingReceived(null)}
          onDone={() => { setConfirmingReceived(null); fetchAll() }}
        />
      )}
      {reportingNotReceived && (
        <ReportNotReceivedModal
          record={reportingNotReceived}
          onClose={() => setReportingNotReceived(null)}
          onDone={() => { setReportingNotReceived(null); fetchAll() }}
        />
      )}
      {confirmingOnBehalf && (
        <ConfirmOnBehalfDialog
          url={FARMERS_ORG_DOMAIN.confirmOnBehalfUrl(confirmingOnBehalf.id)}
          memberName={confirmingOnBehalf.farmer_full_name}
          assistanceLabel={confirmingOnBehalf.assistance_type || 'Assistance'}
          onClose={() => setConfirmingOnBehalf(null)}
          onDone={() => { setConfirmingOnBehalf(null); fetchAll() }}
        />
      )}
      {resolving && !isFarmer && !isOrg && (
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
    <PageLayout
      title={isFarmer ? 'Assistance Received' : isOrg ? 'Assistance' : 'Crop Assistance'}
      subtitle={isFarmer
        ? 'Government and organization assistance recorded for you.'
        : isOrg
          ? 'Assistance your organization reported to its members.'
          : 'Government and organization assistance given to farmers.'}
    >
      {innerContent}
    </PageLayout>
  )
}
