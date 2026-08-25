import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import LogGovernmentAssistanceModal from './LogGovernmentAssistanceModal.jsx'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import { FISHERFOLK_DISTRIBUTION_DOMAIN } from './distributionDomains.js'

// interventions.models.DistributionStatus — see CropAssistancePage.jsx's
// identical comment; same lifecycle, fisherfolk domain.
const STATUS_LABELS = {
  PENDING: 'Pending',
  AWAITING_CONFIRMATION: 'Awaiting Confirmation',
  CONFIRMED: 'Confirmed',
  NOT_RECEIVED: 'Not Received',
  RESOLVED: 'Resolved',
}
const EDITABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', undefined, ''])

function extractErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (Array.isArray(data) && data.length) return String(data[0])
  if (data?.detail) return data.detail
  return fallback
}

// Must match interventions.models.FisherfolkBeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from fisheries.models.FisheriesAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Cash Assistance', 'Equipment', 'Training', 'Other']
// Batch C — reconciled to a shared, real choice set (was a bare select with
// a dead 'Others' sentinel — no companion field ever existed for it, so
// picking it silently did nothing; see Batch B's audit). Now a proper
// ComboboxWithOther like every other source_agency field.
const SOURCE_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const COLUMNS = [
  { key: 'date_received_fmt',                          label: 'Date Received' },
  { key: 'fisherfolk_full_name',                       label: 'Fisherfolk Name' },
  { key: 'fisherfolk_type',                            label: 'Type' },
  { key: 'attributed_fisherfolk_organization_name',    label: 'Organization' },
  { key: 'assistance_type',                            label: 'Assistance Type' },
  { key: 'source_agency',                              label: 'Source of Assistance' },
  { key: 'quantity',                                   label: 'Quantity / Amount' },
  { key: 'remarks',                                    label: 'Remarks' },
  { key: 'recorded_by_name',                           label: 'Recorded By' },
  { key: 'status_cell',                                label: 'Status' },
  { key: 'actions_cell',                               label: 'Actions' },
]

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

function DangerZone({ isAdmin, description, onDeleteClick }) {
  if (!isAdmin) return null
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
      <p className="text-[12px] font-semibold text-rose-700 mb-1">Danger Zone</p>
      <p className="text-[11px] text-rose-600 mb-2">{description}</p>
      <button type="button" onClick={onDeleteClick}
        className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-100 transition-colors">
        <Trash2 size={13} /> Delete this record
      </button>
    </div>
  )
}

// ── Edit Modal — relocated from FisheriesMonitoringPage.jsx unchanged ────────

function EditAssistanceModal({ record, onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const originalData = {
    assistance_type: record.assistance_type || '',
    source_agency: record.source_agency || '',
    source_agency_other: '',
    date_received: record.date_given || '',
    quantity: record.quantity != null ? String(record.quantity) : '',
    description: record.description || '',
    remarks: record.remarks || '',
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
      showToast('Please specify the source of assistance.', 'error'); return
    }
    setError(''); setIsSubmitting(true)
    try {
      const { date_received, source_agency_other, ...rest } = form
      const sourceAgency = form.source_agency === 'Other' ? source_agency_other.trim() : form.source_agency
      await api.patch(`/interventions/fisherfolk-beneficiaries/adhoc/${record.id}/`, {
        ...rest,
        source_agency: sourceAgency,
        date_given: date_received,
        quantity: form.quantity !== '' ? parseFloat(form.quantity) : null,
      })
      showToast('Assistance record updated.', 'success')
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update assistance record.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/interventions/fisherfolk-beneficiaries/adhoc/${record.id}/`)
      showToast('Assistance record deleted.', 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete assistance record.', 'error')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalShell title="Edit Assistance Record" subtitle={record.fisherfolk_full_name} icon={Pencil} onClose={onClose} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Date Received" required>
              <input type="date" className={baseInputClasses} value={form.date_received}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => set('date_received', e.target.value)} />
            </FormField>
            <FormField label="Assistance Type" required>
              <select className={baseInputClasses} value={form.assistance_type}
                onChange={(e) => set('assistance_type', e.target.value)}>
                <option value="">Select Assistance Type</option>
                {ASSISTANCE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>
            <FormField label="Source of Assistance" required>
              <ComboboxWithOther
                options={SOURCE_OPTIONS}
                value={form.source_agency}
                otherValue={form.source_agency_other}
                onChange={(v) => set('source_agency', v)}
                onOtherChange={(v) => set('source_agency_other', v)}
                placeholder="Select Source"
              />
            </FormField>
            <FormField label="Quantity / Amount" required>
              <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea className={baseInputClasses} rows={2} value={form.description}
              onChange={(e) => set('description', e.target.value)} />
          </FormField>
          <FormField label="Remarks">
            <textarea className={baseInputClasses} rows={2} value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)} />
          </FormField>

          {error && (
            <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>
          )}

          <DangerZone
            isAdmin={isAdmin}
            description="Permanently delete this assistance record."
            onDeleteClick={() => setShowDeleteConfirm(true)}
          />

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
      await api.post(`/interventions/fisherfolk-beneficiaries/${record.id}/mark-resolved/`, { follow_up_notes: notes.trim() })
      showToast('Case marked resolved.', 'success')
      onResolved()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to mark this case resolved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Mark Resolved" subtitle={record.fisherfolk_full_name} icon={CheckCircle2} onClose={onClose} maxWidth="max-w-lg">
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
// Relocated from FisheriesMonitoringPage.jsx's "Assistance" tab (Batch 5).
// Batch 6: repointed to interventions.FisherfolkBeneficiaryRecord at
// /interventions/fisherfolk-beneficiaries/adhoc/ — fisheries.FisheriesAssistanceRecord
// and its endpoint were retired; this page's data was migrated, not lost.

export default function FisheriesAssistancePage({ asTab = false }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [assistance, setAssistance] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [source, setSource] = useState('')
  const [type, setType] = useState('')
  const [year, setYear] = useState('')
  const [view, setView] = useState(searchParams.get('tab') === 'needs-follow-up' ? 'needs-follow-up' : 'all')
  const [showLog, setShowLog] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resolving, setResolving] = useState(null)

  const fetchAssistance = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (year) params.set('year', year)
      if (barangay) params.set('barangay', barangay)
      if (search) params.set('search', search)
      if (source) params.set('source_of_assistance', source)
      if (type) params.set('assistance_type', type)
      if (view === 'needs-follow-up') params.set('status', 'NOT_RECEIVED')
      const r = await api.get(`/interventions/fisherfolk-beneficiaries/adhoc/?${params}`)
      setAssistance(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setError('Failed to load assistance records.') }
    finally { setIsLoading(false) }
  }, [year, barangay, search, source, type, view])

  useEffect(() => { fetchAssistance() }, [fetchAssistance])

  const changeView = (next) => {
    setView(next)
    const params = new URLSearchParams(searchParams)
    if (next === 'needs-follow-up') params.set('tab', next); else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const rows = useMemo(() => assistance.map((a) => ({
    ...a,
    quantity: a.quantity || '—',
    date_received_fmt: formatDate(a.date_given),
    status_cell: a.status ? <StatusPill status={a.status}>{STATUS_LABELS[a.status] || a.status}</StatusPill> : '—',
    actions_cell: (
      <RowActions actions={[
        EDITABLE_STATUSES.has(a.status) && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(a) },
        a.status === 'NOT_RECEIVED' && { key: 'resolve', label: 'Mark Resolved', icon: CheckCircle2, tone: 'default', onClick: () => setResolving(a) },
      ]} />
    ),
  })), [assistance])

  const totalQuantity = useMemo(
    () => assistance.reduce((sum, a) => sum + (parseFloat(a.quantity) || 0), 0),
    [assistance],
  )

  const innerContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowDistribute(true)}>
            <Users size={15} className="mr-1" /> Distribute to Organization
          </Button>
          <Button onClick={() => setShowLog(true)}>
            <Plus size={15} className="mr-1" /> Log Government Assistance
          </Button>
        </div>
      </div>

      <FilterPanel
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search fisherfolk or LGU no."
        activeCount={[Boolean(barangay), Boolean(source), Boolean(type), Boolean(year)].filter(Boolean).length}
      >
        <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
        <input
          className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
          placeholder="Source of assistance"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <input
          className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
          placeholder="Assistance type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <select
          className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </FilterPanel>

      {assistance.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total Records</p>
            <p className="text-lg font-semibold text-slate-800">{assistance.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total Quantity Distributed</p>
            <p className="text-lg font-semibold text-slate-800">{totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {error ? <ErrorMessage message={error} /> : <DataTable columns={COLUMNS} data={rows} isLoading={isLoading} />}

      {showLog && (
        <LogGovernmentAssistanceModal onClose={() => setShowLog(false)} onSuccess={fetchAssistance} />
      )}
      {showDistribute && (
        <DistributeAssistanceModal
          domain={FISHERFOLK_DISTRIBUTION_DOMAIN}
          onClose={() => setShowDistribute(false)}
          onSuccess={fetchAssistance}
        />
      )}
      {editing && (
        <EditAssistanceModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAssistance() }}
        />
      )}
      {resolving && (
        <MarkResolvedModal
          record={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); fetchAssistance() }}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout title="Fisheries Assistance" subtitle="Government and organization assistance given to fisherfolk.">
      {innerContent}
    </PageLayout>
  )
}
