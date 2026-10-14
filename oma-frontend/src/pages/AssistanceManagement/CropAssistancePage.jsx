import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, CheckCircle2, Eye, Pencil, Plus, Search, Trash2, Upload, User, UserCheck, Users, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import useSuggestSearch from '../../hooks/useSuggestSearch.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import usePhotoList from '../../hooks/usePhotoList.js'
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
import AssistanceViewDialog from './AssistanceViewDialog.jsx'
import ConfirmMembersDialog from './ConfirmMembersDialog.jsx'
import { ConfirmActionBar, SelectCell, SelectHeader } from './OrgConfirmControls.jsx'
import useConfirmSelection from './useConfirmSelection.js'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import OrgDistributionHistory from './OrgDistributionHistory.jsx'
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
// Staff may edit a record until the recipient reports it or it is resolved (an organization only while it is Pending)
// (interventions.views.PendingOnlyEditMixin) — mirrored here so the row
// action doesn't offer something the backend will reject.
const EDITABLE_STATUSES = new Set(['PENDING', 'AWAITING_CONFIRMATION', 'CONFIRMED', undefined, ''])
// Assistance can be cancelled (taken off the list, kept for audit) until the recipient has confirmed or reported it.
const CANCELLABLE_STATUSES = new Set(['PENDING', 'AWAITING_CONFIRMATION'])

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

const NO_RECORDS = []

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
      title={memberUrl ? 'Distribute to an Individual' : 'Log Individual Assistance'}
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

function EditAssistanceModal({ record, onClose, onSaved }) {
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
      await api.patch(`/interventions/beneficiaries/adhoc/${record.id}/`, {
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
                max={new Date().toISOString().split('T')[0]}
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
  const photosState = usePhotoList()
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const body = new FormData()
      photosState.photos.forEach(p => body.append('confirmation_photos', p.file))
      if (note.trim()) body.append('confirmation_note', note.trim())
      await api.post(`/interventions/beneficiaries/${record.id}/confirm-received/`, body)
      showToast('Confirmed as received.', 'success')
      onDone()
    } catch (err) {
      const d = err?.response?.data
      const photoError = d?.confirmation_photos && [].concat(d.confirmation_photos).join(' ')
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
        <PhotoListField photosState={photosState} title="Proof Photos (optional)" hint="Up to 10 photos." altPrefix="Proof photo" />
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
  const { showToast } = useToast()
  // An organization account sees what it reported, reports assistance to its own members and confirms for members
  // without an account (organization mode, like the farmer one above).
  const orgId = user?.linked_record?.id
  const orgRecord = user?.linked_record
  const [confirmingOnBehalf, setConfirmingOnBehalf] = useState(null)
  const [reportingNotReceived, setReportingNotReceived] = useState(null)
  const [confirmingReceived, setConfirmingReceived] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState([])
  const [historyKey, setHistoryKey] = useState(0) // bumps to reload the organization's distribution history
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [barangay, setBarangay] = useState('')
  const [year, setYear] = useState('')
  const initialTab = searchParams.get('tab')
  const [view, setView] = useState(
    (initialTab === 'needs-follow-up' && !isOrg) || (initialTab === 'upcoming' && isFarmer) || (initialTab === 'confirm' && isOrg) ? initialTab : 'all',
  )
  // The members picked on the organization's Confirm for Members list.
  const selection = useConfirmSelection(isOrg && view === 'confirm' ? records : NO_RECORDS)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resolving, setResolving] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      if (isOrg && view === 'all') {
        // The organization's history is OrgDistributionHistory, which loads its own distributions.
        return
      }
      if (isOrg) {
        // The members' awaiting records this organization may confirm for (year narrows them).
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
    select_cell: <SelectCell record={r} name={r.farmer_full_name} selection={selection} />,
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
    // An organization's table is the "Confirm for Members" list only; its history is OrgDistributionHistory.
    actions_cell: isOrg ? (
      r.latest_request_status === 'PENDING' ? '—' : (
        <RowActions alwaysMenu actions={[
          { key: 'confirm', label: 'Confirm for Member', icon: UserCheck, onClick: () => setConfirmingOnBehalf([r]) },
        ]} />
      )
    ) : isFarmer ? (
      r.status === 'AWAITING_CONFIRMATION' ? (
        <RowActions actions={[
          { key: 'confirm', label: 'Confirm Received', icon: CheckCircle2, onClick: () => setConfirmingReceived(r) },
          { key: 'not-received', label: 'Report Not Received', icon: XCircle, tone: 'rose', onClick: () => setReportingNotReceived(r) },
        ]} />
      ) : '—'
    ) : (
      <RowActions actions={[
        { key: 'view', label: 'View', icon: Eye, onClick: () => setViewing(r) },
        EDITABLE_STATUSES.has(r.status) && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(r) },
        CANCELLABLE_STATUSES.has(r.status) && { key: 'cancel', label: 'Cancel assistance', icon: Ban, tone: 'rose', onClick: () => setCancelling(r) },
        r.status === 'NOT_RECEIVED' && { key: 'resolve', label: 'Mark Resolved', icon: CheckCircle2, tone: 'default', onClick: () => setResolving(r) },
      ]} />
    ),
  })), [records, isFarmer, isOrg, selection])

  const tableColumns = isOrg
    ? [{ key: 'select_cell', label: 'Select', headerNode: <SelectHeader selection={selection} records={records} /> }, ...CONFIRM_COLUMNS]
    : isFarmer
      ? COLUMNS.filter((c) => !['farmer_full_name', 'recorded_by_name'].includes(c.key))
      : COLUMNS

  const innerContent = (
    <div className="space-y-4">
      <div className="flex w-full overflow-hidden rounded-xl border border-slate-300 sm:w-fit">
        {[
          { key: 'all', label: (isFarmer || isOrg) ? 'History' : 'All Records' },
          isFarmer && { key: 'upcoming', label: 'Upcoming' },
          isOrg && { key: 'confirm', label: 'Confirm for Members' },
          !isOrg && { key: 'needs-follow-up', label: 'Needs Follow-up' },
        ].filter(Boolean).map((t) => (
          <button
            key={t.key} type="button" onClick={() => changeView(t.key)}
            className={`flex-1 whitespace-nowrap px-2 py-2 text-[12px] font-semibold transition-colors sm:flex-none sm:px-4 sm:text-[13px] ${
              view === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isOrg && view === 'all' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowDistribute(true)}>
            <Users size={15} className="mr-1" /> Distribute to All Members
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setShowAdd(true)}>
            <Plus size={15} className="mr-1" /> Distribute to Individual
          </Button>
        </div>
      )}
      {!isFarmer && !isOrg && <div className="flex flex-wrap justify-end gap-2">
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

      {isOrg && view === 'all' ? (
        <OrgDistributionHistory domain="crop" refreshKey={historyKey} />
      ) : (
      <>
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

      {isOrg && !error && !isLoading && (
        <ConfirmActionBar selection={selection} records={records} onConfirm={() => setConfirmingOnBehalf(selection.selectedRecords)} />
      )}
      {error ? <ErrorMessage message={error} /> : <DataTable columns={tableColumns} data={rows} isLoading={isLoading} cardColumns={2} />}
      </>
      )}

      {showAdd && !isFarmer && (
        <AddAssistanceModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { fetchAll(); setHistoryKey((k) => k + 1) }}
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
          onSuccess={() => { fetchAll(); setHistoryKey((k) => k + 1) }}
        />
      )}
      {editing && !isFarmer && (
        <EditAssistanceModal
          record={editing}
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
        <ConfirmMembersDialog
          url={FARMERS_ORG_DOMAIN.confirmOnBehalfBulkUrl}
          records={confirmingOnBehalf}
          nameOf={(r) => r.farmer_full_name}
          onClose={() => setConfirmingOnBehalf(null)}
          onDone={() => { setConfirmingOnBehalf(null); selection.clear(); fetchAll() }}
        />
      )}
      {viewing && !isFarmer && !isOrg && (
        <AssistanceViewDialog
          title={viewing.assistance_type || 'Assistance'} subtitle={viewing.farmer_full_name}
          onClose={() => setViewing(null)}
          details={[
            { label: 'Farmer', value: viewing.farmer_full_name },
            { label: 'Organization', value: viewing.attributed_organization_name },
            { label: 'Assistance type', value: viewing.assistance_type },
            { label: 'Source agency', value: (viewing.source_agencies || []).join(', ') },
            { label: 'Quantity', value: viewing.quantity },
            { label: 'Date received', value: formatDate(viewing.date_given) },
            { label: 'Season / year', value: [viewing.season, viewing.year].filter(Boolean).join(' ') },
            { label: 'Status', value: STATUS_LABELS[viewing.status] || viewing.status },
            { label: 'Logged by', value: viewing.recorded_by_name },
            { label: 'Remarks', value: viewing.remarks },
          ]}
        />
      )}
      {cancelling && !isFarmer && !isOrg && (
        <ConfirmDialog
          title="Cancel this assistance?"
          message={`${cancelling.assistance_type || 'This assistance'} for ${cancelling.farmer_full_name} will be taken off the list and the farmer will no longer be asked to confirm it. The record is kept for audit.`}
          confirmLabel={isCancelling ? 'Cancelling...' : 'Cancel assistance'}
          cancelLabel="Keep it"
          onConfirm={async () => {
            setIsCancelling(true)
            try {
              await api.post('/interventions/assistance-removals/', { domain: 'crop', record_ids: [cancelling.id] })
              showToast('Assistance cancelled.', 'success')
              setCancelling(null)
              fetchAll()
            } catch (err) {
              showToast(err?.response?.data?.detail || 'The assistance could not be cancelled.', 'error')
            } finally {
              setIsCancelling(false)
            }
          }}
          onCancel={() => { if (!isCancelling) setCancelling(null) }}
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
          ? 'Assistance your organization distributed to its members.'
          : 'Government and organization assistance given to farmers.'}
    >
      {innerContent}
    </PageLayout>
  )
}
