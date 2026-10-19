import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, CheckCircle2, Eye, Pencil, Plus, Trash2, Upload, UserCheck, Users, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AssistanceViewDialog from './AssistanceViewDialog.jsx'
import ConfirmMembersDialog from './ConfirmMembersDialog.jsx'
import { ConfirmActionBar, SelectCell, SelectHeader } from './OrgConfirmControls.jsx'
import useConfirmSelection from './useConfirmSelection.js'
import LogGovernmentAssistanceModal from './LogGovernmentAssistanceModal.jsx'
import { FISHERFOLK_ORG_DOMAIN } from '../Citizen/orgDomainConfig.js'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import OrgDistributionHistory from './OrgDistributionHistory.jsx'
import { FISHERFOLK_DISTRIBUTION_DOMAIN } from './distributionDomains.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration, isTrainingType,
  isCashType, cashAmountError, cashAmountFrom, formatAssistanceQuantity,
} from './assistanceFieldHelpers.js'

// interventions.models.DistributionStatus — see CropAssistancePage.jsx's
// identical comment; same lifecycle, fisherfolk domain.
const STATUS_LABELS = {
  PENDING: 'Pending',
  AWAITING_CONFIRMATION: 'Awaiting Confirmation',
  CONFIRMED: 'Confirmed',
  NOT_RECEIVED: 'Not Received',
  RESOLVED: 'Resolved',
}
// An organization reads the same plain lifecycle words as the farmers' side: a record the office logged or the
// recipient confirmed is simply Received.
const ORG_STATUS_LABELS = { ...STATUS_LABELS, CONFIRMED: 'Received' }
const EDITABLE_STATUSES = new Set(['PENDING', 'AWAITING_CONFIRMATION', 'CONFIRMED', undefined, ''])
// Assistance can be cancelled (taken off the list, kept for audit) until the recipient has confirmed or reported it.
const CANCELLABLE_STATUSES = new Set(['PENDING', 'AWAITING_CONFIRMATION'])

function extractErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (Array.isArray(data) && data.length) return String(data[0])
  if (data?.detail) return data.detail
  return fallback
}

// Must match interventions.models.FisherfolkBeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from fisheries.models.FisheriesAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Cash Assistance', 'Equipment', 'Training', 'Other']
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

const NO_RECORDS = []

const CONFIRM_COLUMNS = [
  { key: 'date_received_fmt',   label: 'Date Given' },
  { key: 'fisherfolk_full_name', label: 'Member' },
  { key: 'assistance_type',     label: 'Assistance Type' },
  { key: 'quantity',            label: 'Quantity' },
  { key: 'review_cell',         label: 'Status' },
  { key: 'actions_cell',        label: 'Actions' },
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
    source_agencies: record.source_agencies || [],
    date_received: record.date_given || '',
    quantity: isCashType(record.assistance_type) ? cashAmountFrom(record.quantity) : (record.quantity != null ? String(record.quantity) : ''),
    description: record.description || '',
    remarks: record.remarks || '',
    training_duration_days: record.training_duration_days != null ? String(record.training_duration_days) : '',
    equipment_type: record.equipment_type || '',
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
    const cashError = cashAmountError(form.assistance_type, form.quantity)
    if (cashError) { showToast(cashError, 'error'); return }
    setError(''); setIsSubmitting(true)
    try {
      const { date_received, quantity, ...rest } = form
      await api.patch(`/interventions/fisherfolk-beneficiaries/adhoc/${record.id}/`, {
        ...rest,
        date_given: date_received,
        quantity: isTraining ? null : (quantity !== '' ? parseFloat(quantity) : null),
        ...buildTypeConditionalPayload(form.assistance_type, form, { allowSeedFertilizer: false }),
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
      <ModalShell
        title="Edit Assistance Record"
        subtitle={record.fisherfolk_full_name}
        icon={Pencil}
        onClose={onClose}
        maxWidth="max-w-xl"
        footer={
          <>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
              Cancel
            </button>
            <button type="submit" form="edit-fisheries-assistance-form" disabled={isSubmitting || !isDirty}
              className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        <form id="edit-fisheries-assistance-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Date Received" required>
              <input type="date" className={baseInputClasses} value={form.date_received}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => set('date_received', e.target.value)} />
            </FormField>
            <FormField label="Assistance Type" required>
              <select className={baseInputClasses} value={form.assistance_type}
                onChange={(e) => setAssistanceType(e.target.value)}>
                <option value="">Select Assistance Type</option>
                {ASSISTANCE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>
            {!isTraining && (
              <FormField label={isCashType(form.assistance_type) ? 'Amount (₱)' : 'Quantity'} required>
                <DecimalInput decimals={2} className={baseInputClasses} value={form.quantity}
                  onChange={(v) => set('quantity', v)} />
              </FormField>
            )}
            <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} allowSeedFertilizer={false} />
          </div>
          <FormField label="Source of Assistance">
            <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)} />
          </FormField>
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
    <ModalShell
      title="Mark Resolved"
      subtitle={record.fisherfolk_full_name}
      icon={CheckCircle2}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="mark-resolved-fisherfolk-form" isLoading={isSubmitting}>Mark Resolved</Button>
        </>
      }
    >
      <form id="mark-resolved-fisherfolk-form" onSubmit={handleSubmit} className="space-y-4">
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
// Relocated from FisheriesMonitoringPage.jsx's "Assistance" tab (Batch 5).
// Batch 6: repointed to interventions.FisherfolkBeneficiaryRecord at
// /interventions/fisherfolk-beneficiaries/adhoc/ — fisheries.FisheriesAssistanceRecord
// and its endpoint were retired; this page's data was migrated, not lost.

// Fisherfolk accounts: "Report Not Received" on their own assistance (existing recipient endpoint, which
// checks the record is theirs). A reason is required, as on that endpoint.
function ReportNotReceivedModal({ record, onClose, onDone }) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) { showToast('A reason is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.post(`/interventions/fisherfolk-beneficiaries/${record.id}/report-not-received/`, { non_receipt_reason: reason.trim() })
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
        <Button type="submit" form="ff-report-not-received" isLoading={isSubmitting}>Submit</Button>
      </>}>
      <form id="ff-report-not-received" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Reason" required>
          <textarea rows={3} className={`${baseInputClasses} resize-none`} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="Why was this assistance not received?" />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function FisheriesAssistancePage({ asTab = false }) {
  // Fisherfolk accounts reuse this page read-only: the backend returns only their own assistance, and they
  // confirm or report receipt. Logging, importing, distributing, editing and resolving stay staff tools.
  const { isFisherfolk, isOrg, user } = useAuth()
  const { showToast } = useToast()
  // An organization account sees what it reported, reports assistance to its own members and confirms for members
  // without an account (organization mode, like the fisherfolk one above).
  const orgId = user?.linked_record?.id
  const orgRecord = user?.linked_record
  const [confirmingOnBehalf, setConfirmingOnBehalf] = useState(null)
  const [reportingNotReceived, setReportingNotReceived] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [assistance, setAssistance] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [source, setSource] = useState('')
  const [type, setType] = useState('')
  const [year, setYear] = useState('')
  const initialTab = searchParams.get('tab')
  const [view, setView] = useState((initialTab === 'needs-follow-up' && !isOrg) || (initialTab === 'confirm' && isOrg) ? initialTab : 'all')
  // The members picked on the organization's Confirm for Members list.
  const selection = useConfirmSelection(isOrg && view === 'confirm' ? assistance : NO_RECORDS)
  const [showLog, setShowLog] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resolving, setResolving] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [historyKey, setHistoryKey] = useState(0) // bumps to reload the organization's distribution history

  const fetchAssistance = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      if (isOrg && view === 'all') {
        // The organization's history is OrgDistributionHistory, which loads its own distributions.
        return
      }
      if (isOrg) {
        // The members' awaiting records this organization may confirm for (year narrows them).
        const r = await api.get(view === 'confirm' ? FISHERFOLK_ORG_DOMAIN.accountlessConfirmablesUrl : FISHERFOLK_ORG_DOMAIN.historyUrl)
        let mine = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (year) mine = mine.filter((x) => String(x.date_given || '').startsWith(String(year)))
        setAssistance(mine)
        return
      }
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
  }, [year, barangay, search, source, type, view, isOrg])

  useEffect(() => { fetchAssistance() }, [fetchAssistance])

  const changeView = (next) => {
    setView(next)
    const params = new URLSearchParams(searchParams)
    if (next !== 'all') params.set('tab', next); else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const confirmReceived = useCallback(async (a) => {
    try {
      await api.post(`/interventions/fisherfolk-beneficiaries/${a.id}/confirm-received/`)
      showToast('Confirmed as received.', 'success')
      fetchAssistance()
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to confirm.'), 'error')
    }
  }, [fetchAssistance, showToast])

  const rows = useMemo(() => assistance.map((a) => ({
    ...a,
    select_cell: <SelectCell record={a} name={a.fisherfolk_full_name} selection={selection} />,
    source_agency: (a.source_agencies || []).join(', '),
    quantity: formatAssistanceQuantity(a.assistance_type, a.quantity) || a.quantity || '—',
    date_received_fmt: formatDate(a.date_given),
    status_cell: a.status ? <StatusPill status={a.status}>{(isOrg ? ORG_STATUS_LABELS : STATUS_LABELS)[a.status] || a.status}</StatusPill> : '—',
    // Confirm for Members list: where the member's request to OMAg stands
    review_cell: a.latest_request_status === 'PENDING'
      ? <StatusPill tone="amber">Pending Review</StatusPill>
      : a.latest_request_status === 'REJECTED'
        ? <StatusPill tone="rose">{a.latest_request_reason ? `Rejected: ${a.latest_request_reason}` : 'Rejected'}</StatusPill>
        : <StatusPill tone="slate">Needs Confirmation</StatusPill>,
    // An organization's table is the "Confirm for Members" list only; its history is OrgDistributionHistory.
    actions_cell: isOrg ? (
      a.latest_request_status === 'PENDING' ? '—' : (
        <RowActions alwaysMenu actions={[
          { key: 'confirm', label: 'Confirm for Member', icon: UserCheck, onClick: () => setConfirmingOnBehalf([a]) },
        ]} />
      )
    ) : isFisherfolk ? (
      a.status === 'AWAITING_CONFIRMATION' ? (
        <RowActions actions={[
          { key: 'confirm', label: 'Confirm Received', icon: CheckCircle2, onClick: () => confirmReceived(a) },
          { key: 'not-received', label: 'Report Not Received', icon: XCircle, tone: 'rose', onClick: () => setReportingNotReceived(a) },
        ]} />
      ) : '—'
    ) : (
      <RowActions actions={[
        { key: 'view', label: 'View', icon: Eye, onClick: () => setViewing(a) },
        EDITABLE_STATUSES.has(a.status) && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(a) },
        CANCELLABLE_STATUSES.has(a.status) && { key: 'cancel', label: 'Cancel assistance', icon: Ban, tone: 'rose', onClick: () => setCancelling(a) },
        a.status === 'NOT_RECEIVED' && { key: 'resolve', label: 'Mark Resolved', icon: CheckCircle2, tone: 'default', onClick: () => setResolving(a) },
      ]} />
    ),
  })), [assistance, isFisherfolk, isOrg, confirmReceived, selection])

  const totalQuantity = useMemo(
    () => assistance.reduce((sum, a) => sum + (parseFloat(a.quantity) || 0), 0),
    [assistance],
  )

  const tableColumns = isOrg ? [{ key: 'select_cell', label: 'Select', headerNode: <SelectHeader selection={selection} records={assistance} /> }, ...CONFIRM_COLUMNS] : COLUMNS

  const innerContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full overflow-hidden rounded-xl border border-slate-300 sm:w-fit">
          {[
            { key: 'all', label: isOrg ? 'History' : 'All Records' },
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowDistribute(true)}>
              <Users size={15} className="mr-1" /> Distribute to All Members
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setShowLog(true)}>
              <Plus size={15} className="mr-1" /> Distribute to Individual
            </Button>
          </div>
        )}
        {!isFisherfolk && !isOrg && (
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end [&>*]:w-full [&>*]:justify-center sm:[&>*]:w-auto">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload size={15} className="mr-1" /> Import File
            </Button>
            <Button variant="outline" onClick={() => setShowDistribute(true)}>
              <Users size={15} className="mr-1" /> Distribute to Organization
            </Button>
            <Button onClick={() => setShowLog(true)}>
              <Plus size={15} className="mr-1" /> Log Individual Assistance
            </Button>
          </div>
        )}
      </div>

      {isOrg && view === 'all' ? (
        <OrgDistributionHistory domain="fisheries" refreshKey={historyKey} />
      ) : (
      <>
      <FilterPanel
        {...(isOrg ? {} : { search, onSearchChange: setSearch, searchPlaceholder: 'Search fisherfolk or LGU no.' })}
        activeCount={(isOrg ? [Boolean(year)] : [Boolean(barangay), Boolean(source), Boolean(type), Boolean(year)]).filter(Boolean).length}
      >
        {!isOrg && <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />}
        {!isOrg && (
          <input
            className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
            placeholder="Source of assistance"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        )}
        {!isOrg && (
          <input
            className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
            placeholder="Assistance type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        )}
        <select
          className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </FilterPanel>

      {assistance.length > 0 && !(isOrg && view === 'confirm') && (
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

      {isOrg && !error && !isLoading && (
        <ConfirmActionBar selection={selection} records={assistance} onConfirm={() => setConfirmingOnBehalf(selection.selectedRecords)} />
      )}
      {error ? <ErrorMessage message={error} /> : <DataTable columns={tableColumns} data={rows} isLoading={isLoading} cardColumns={2} />}
      </>
      )}

      {showLog && (
        <LogGovernmentAssistanceModal
          onClose={() => setShowLog(false)}
          onSuccess={() => { fetchAssistance(); setHistoryKey((k) => k + 1) }}
          memberUrl={isOrg ? FISHERFOLK_ORG_DOMAIN.memberSearchUrl(orgId) : null}
        />
      )}
      {showImport && !isOrg && (
        <ImportFileModal
          title="Import Fisheries Assistance"
          subtitle="Upload a spreadsheet to log assistance given to many fisherfolk at once."
          importUrl="/interventions/fisherfolk-beneficiaries/adhoc/import/"
          templateUrl="/interventions/fisherfolk-beneficiaries/adhoc/import/template/"
          templateFilename="fisheries_assistance_import_template.xlsx"
          undoType="fisheries_assistance"
          helpText="Each row logs one assistance-given event, matched to a fisherfolk by RSBSA number."
          onClose={() => setShowImport(false)}
          onImported={fetchAssistance}
        />
      )}
      {showDistribute && (
        <DistributeAssistanceModal
          domain={FISHERFOLK_DISTRIBUTION_DOMAIN}
          fixedOrg={isOrg ? { id: orgId, name: orgRecord?.label, barangay: orgRecord?.barangay } : null}
          onClose={() => setShowDistribute(false)}
          onSuccess={() => { fetchAssistance(); setHistoryKey((k) => k + 1) }}
        />
      )}
      {editing && (
        <EditAssistanceModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAssistance() }}
        />
      )}
      {confirmingOnBehalf && (
        <ConfirmMembersDialog
          url={FISHERFOLK_ORG_DOMAIN.confirmOnBehalfBulkUrl}
          records={confirmingOnBehalf}
          nameOf={(r) => r.fisherfolk_full_name}
          onClose={() => setConfirmingOnBehalf(null)}
          onDone={() => { setConfirmingOnBehalf(null); selection.clear(); fetchAssistance() }}
        />
      )}
      {viewing && !isOrg && !isFisherfolk && (
        <AssistanceViewDialog
          title={viewing.assistance_type || 'Assistance'} subtitle={viewing.fisherfolk_full_name}
          onClose={() => setViewing(null)}
          details={[
            { label: 'Fisherfolk', value: viewing.fisherfolk_full_name },
            { label: 'Type', value: viewing.fisherfolk_type },
            { label: 'Organization', value: viewing.attributed_fisherfolk_organization_name },
            { label: 'Assistance type', value: viewing.assistance_type },
            { label: 'Source of assistance', value: (viewing.source_agencies || []).join(', ') },
            { label: isCashType(viewing.assistance_type) ? 'Amount' : 'Quantity', value: formatAssistanceQuantity(viewing.assistance_type, viewing.quantity) },
            { label: 'Date received', value: formatDate(viewing.date_given) },
            { label: 'Status', value: STATUS_LABELS[viewing.status] || viewing.status },
            { label: 'Recorded by', value: viewing.recorded_by_name },
            { label: 'Description', value: viewing.description },
            { label: 'Remarks', value: viewing.remarks },
          ]}
        />
      )}
      {cancelling && !isOrg && !isFisherfolk && (
        <ConfirmDialog
          title="Cancel this assistance?"
          message={`${cancelling.assistance_type || 'This assistance'} for ${cancelling.fisherfolk_full_name} will be taken off the list and the fisherfolk will no longer be asked to confirm it. The record is kept for audit.`}
          confirmLabel={isCancelling ? 'Cancelling...' : 'Cancel assistance'}
          cancelLabel="Keep it"
          onConfirm={async () => {
            setIsCancelling(true)
            try {
              await api.post('/interventions/assistance-removals/', { domain: 'fisheries', record_ids: [cancelling.id] })
              showToast('Assistance cancelled.', 'success')
              setCancelling(null)
              fetchAssistance()
            } catch (err) {
              showToast(err?.response?.data?.detail || 'The assistance could not be cancelled.', 'error')
            } finally {
              setIsCancelling(false)
            }
          }}
          onCancel={() => { if (!isCancelling) setCancelling(null) }}
        />
      )}
      {resolving && !isOrg && (
        <MarkResolvedModal
          record={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); fetchAssistance() }}
        />
      )}
      {reportingNotReceived && (
        <ReportNotReceivedModal
          record={reportingNotReceived}
          onClose={() => setReportingNotReceived(null)}
          onDone={() => { setReportingNotReceived(null); fetchAssistance() }}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return isOrg ? (
    <PageLayout title="Assistance" subtitle="Assistance your organization distributed to its members.">
      {innerContent}
    </PageLayout>
  ) : isFisherfolk ? (
    <PageLayout title="Assistance Received" subtitle="Government and organization assistance recorded for you.">
      {innerContent}
    </PageLayout>
  ) : (
    <PageLayout title="Fisheries Assistance" subtitle="Government and organization assistance given to fisherfolk.">
      {innerContent}
    </PageLayout>
  )
}
