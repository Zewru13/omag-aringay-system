import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, Pencil, Plus, Upload, UserCheck, Users, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
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
import ListPrintButton from '../../components/ListPrintButton.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { DetailTable, FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AssistanceEditSections, { DangerZone } from './AssistanceEditSections.jsx'
import { MarkResolvedModal, ReportNotReceivedModal } from './AssistanceFollowUpModals.jsx'
import { extractErrorMessage } from './assistanceFollowUp.js'
import AssistanceViewDialog from './AssistanceViewDialog.jsx'
import ConfirmMembersDialog from './ConfirmMembersDialog.jsx'
import ConfirmedReportModal from './ConfirmedReportModal.jsx'
import { buildAssistanceReportSpec } from './assistanceReport.js'
import { buildStaffHistoryReport } from './assistanceHistoryReport.js'
import { ConfirmActionBar, SelectCell, SelectHeader } from './OrgConfirmControls.jsx'
import useConfirmSelection from './useConfirmSelection.js'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import useDistributeLink from './useDistributeLink.js'
import DistributionsTable from './DistributionsTable.jsx'
import AssistanceTabs from './AssistanceTabs.jsx'
import { emptyAssistanceText, inGroup, tabFromParam } from './assistanceGroups.js'
import OrgDistributionHistory from './OrgDistributionHistory.jsx'
import CompactExpandList from '../../components/UI/CompactExpandList.jsx'
import { FARMERS_ORG_DOMAIN } from '../Citizen/orgDomainConfig.js'
import { FARMER_DISTRIBUTION_DOMAIN } from './distributionDomains.js'
import { EMPTY_OTHER_AGENCY, otherAgencyProblem, sourceAgencies } from './distributeFlow.js'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration, isTrainingType,
  isCashType, cashAmountError, cashAmountFrom, formatAssistanceQuantity, assistanceDateProblem,
} from './assistanceFieldHelpers.js'
import { todayISO } from '../../utils/localDate.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

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

// Must match interventions.models.BeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from production.models.CropAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const COLUMNS = [
  { key: 'date_received_fmt',             label: 'Date Received' },
  { key: 'farmer_full_name',              label: 'Farmer' },
  { key: 'attributed_organization_name',  label: 'Organization' },
  { key: 'assistance_type',               label: 'Assistance Type' },
  { key: 'source_agency',                 label: 'Source Agency' },
  { key: 'quantity',                      label: 'Quantity' },
  { key: 'year_cell',                     label: 'Year' },
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

// ── Edit Modal ───────────────────────────────────────────────────────────────

function EditAssistanceModal({ record, onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const originalData = {
    assistance_type: record.assistance_type || '',
    description: record.remarks || '',
    quantity: isCashType(record.assistance_type) ? cashAmountFrom(record.quantity) : (record.quantity || ''),
    date_received: record.date_given || '',
    source_agencies: record.source_agencies || [],
    ...EMPTY_OTHER_AGENCY,   // "Others": an agency that is not in the list, typed here
    year: record.year,
    training_duration_days: record.training_duration_days != null ? String(record.training_duration_days) : '',
    equipment_type: record.equipment_type || '',
    seed_type: record.seed_type || '',
    fertilizer_type: record.fertilizer_type || '',
  }
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`crop-assistance-edit:${record.id}`)
  const [form, setForm] = useDraftField(draft, 'form', originalData)
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
    const dateError = assistanceDateProblem(form.date_received, { today: todayISO(), original: originalData.date_received })
    if (dateError) { showToast(dateError, 'error'); return }
    const trainingError = validateTrainingDuration(form.assistance_type, form)
    if (trainingError) { showToast(trainingError, 'error'); return }
    const cashError = cashAmountError(form.assistance_type, form.quantity)
    if (cashError) { showToast(cashError, 'error'); return }
    if (otherAgencyProblem(form)) { showToast(otherAgencyProblem(form), 'error'); return }
    setError(''); setIsSubmitting(true)
    try {
      // eslint-disable-next-line no-unused-vars -- the two "Others" fields are form-only: the typed agency travels inside source_agencies
      const { description, date_received, quantity, source_other_on, source_other, ...rest } = form
      await api.patch(`/interventions/beneficiaries/adhoc/${record.id}/`, {
        ...rest,
        source_agencies: sourceAgencies(form),
        quantity: isTraining ? '' : quantity,
        remarks: description,
        date_given: date_received,
        ...buildTypeConditionalPayload(form.assistance_type, form),
      })
      showToast('Assistance record updated.', 'success')
      draft.clear()
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
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="edit-assistance-form" isLoading={isSubmitting} disabled={!isDirty}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-assistance-form" onSubmit={handleSubmit} className="space-y-3">
          <DraftBanner draft={draft} />
          <AssistanceEditSections
            domain="crop" form={form} set={set} setAssistanceType={setAssistanceType} typeOptions={ASSISTANCE_TYPE_OPTIONS}
            today={todayISO()} originalDate={originalData.date_received} years={YEARS}
          />

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <DangerZone isAdmin={isAdmin} description="Permanently delete this assistance record." onDeleteClick={() => setShowDeleteConfirm(true)} />
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

// ── Main Page ────────────────────────────────────────────────────────────────

function ConfirmReceivedModal({ record, onClose, onDone }) {
  const { showToast } = useToast()
  const photosState = usePhotoList()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`crop-assistance-received:${record.id}`)
  const [note, setNote] = useDraftField(draft, 'note', '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const body = new FormData()
      photosState.photos.forEach(p => body.append('confirmation_photos', p.file))
      if (note.trim()) body.append('confirmation_note', note.trim())
      await api.post(`/interventions/beneficiaries/${record.id}/confirm-received/`, body)
      showToast('Confirmed as received.', 'success')
      draft.clear()
      setDone(true)
    } catch (err) {
      const d = err?.response?.data
      const photoError = d?.confirmation_photos && [].concat(d.confirmation_photos).join(' ')
      showToast(photoError || extractErrorMessage(err, 'Failed to confirm.'), 'error')
    } finally { setIsSubmitting(false) }
  }
  if (done) {
    const spec = buildAssistanceReportSpec({ domain: 'crop', records: [record], confirmedOn: new Date().toISOString(), organizationName: record.attributed_organization_name || '' })
    return <ConfirmedReportModal message="Marked as received." spec={spec} onClose={onDone} />
  }
  return (
    <ModalShell title="Confirm Received" subtitle={`${record.assistance_type || 'Assistance'} · ${formatDate(record.date_given)}`} onClose={onClose} maxWidth="max-w-2xl"
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="farmer-confirm-received" isLoading={isSubmitting}>Confirm</Button>
      </>}>
      <form id="farmer-confirm-received" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <DetailTable
          title="Assistance"
          fields={[
            { label: 'Assistance', value: record.assistance_type },
            { label: 'Date Given', value: formatDate(record.date_given) },
          ]}
        />
        <FormSection title="Proof of Receipt">
          <FormRows label="Proof of receipt">
            <FormRow>
              <FormCell label="Proof Photos" wide hint={<p className="mt-1 text-[11.5px] text-[#7A8E7A]">Optional. Up to 10 photos.</p>}>
                <PhotoListField photosState={photosState} title="" hint="" altPrefix="Proof photo" />
              </FormCell>
            </FormRow>
            <FormRow>
              <FormCell label="Note" wide>
                <textarea rows={3} className={`${baseInputClasses} h-auto resize-none py-2`} aria-label="Note" value={note}
                  onChange={(e) => setNote(e.target.value)} placeholder="Anything the office should know about what you received" />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
      </form>
    </ModalShell>
  )
}

export default function CropAssistancePage({ asTab = false }) {
  // A farmer account reuses this page for its own assistance only: the list is the caller's own history, and
  // they confirm or report receipt. Logging, importing, distributing, editing and resolving stay staff tools.
  const { isFarmer, isOrg, user } = useAuth()
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
  // Current | History on every account (an organization's Confirm for Members list is part of Current).
  const [view, setView] = useState(tabFromParam(initialTab, { allowConfirm: isOrg }))
  // The members picked on the organization's Confirm for Members list.
  const selection = useConfirmSelection(isOrg && view === 'confirm' ? records : NO_RECORDS)
  const [showAdd, setShowAdd] = useState(false)   // an organization account: distribute to chosen members
  const [showPeople, setShowPeople] = useState(false)   // staff: distribute to chosen farmers
  const [tableVersion, setTableVersion] = useState(0)   // bumps to read the staff distributions table again
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const distributeLink = useDistributeLink('farmers')   // ?distribute=<id> from an organization's menu: Distribute opens with it chosen
  const [editing, setEditing] = useState(null)
  const [resolving, setResolving] = useState(null)
  const [viewing, setViewing] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      if (isOrg && view !== 'confirm') {
        // The organization's Current and History are OrgDistributionHistory, which loads its own distributions.
        return
      }
      if (isOrg) {
        // The members' awaiting records this organization may confirm for (year narrows them).
        const r = await api.get(FARMERS_ORG_DOMAIN.accountlessConfirmablesUrl)
        let mine = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (year) mine = mine.filter((x) => String(x.date_given || '').startsWith(String(year)))
        setRecords(mine)
        return
      }
      if (isFarmer) {
        // Own assistance (not filterable on the server): the tab (Current or History) and the year narrow it here.
        const r = await api.get('/interventions/my-beneficiary-history/')
        let mine = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (year) mine = mine.filter((x) => String(x.date_given || '').startsWith(String(year)))
        mine = mine.filter((x) => inGroup(x.status, view))
        setRecords(mine)
        return
      }
      // Staff: the distributions table (DistributionsTable) loads itself.
    } catch {
      setError('Failed to load crop assistance records.')
    } finally {
      setIsLoading(false)
    }
  }, [year, view, isFarmer, isOrg])

  useEffect(() => { fetchAll() }, [fetchAll])

  // After a save: read what this account sees again (staff: the distributions table).
  const refreshAll = useCallback(() => { setTableVersion((v) => v + 1); return fetchAll() }, [fetchAll])

  // A member of a distribution in the staff table: fetch the whole record, then open the window for it.
  const memberAction = async (kind, member) => {
    try {
      const { data } = await api.get(`/interventions/beneficiaries/adhoc/${member.record_id}/`)
      if (kind === 'view') setViewing(data)
      else if (kind === 'edit') setEditing(data)
      else setResolving(data)
    } catch {
      showToast('Unable to open this record. Please try again.', 'error')
    }
  }

  const changeView = (next) => {
    setView(next)
    const params = new URLSearchParams(searchParams)
    if (next !== 'current') params.set('tab', next); else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const rows = useMemo(() => records.map((r) => ({
    ...r,
    select_cell: <SelectCell record={r} name={r.farmer_full_name} selection={selection} />,
    source_agency: (r.source_agencies || []).join(', '),
    date_received_fmt: formatDate(r.date_given),
    quantity: formatAssistanceQuantity(r.assistance_type, r.quantity),
    year_cell: r.year || '',
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
      <AssistanceTabs active={view} onChange={changeView} />

      {isOrg && view === 'confirm' && (
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => changeView('current')}>Back to Current</Button>
      )}
      {isOrg && view === 'current' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => changeView('confirm')}>
            <UserCheck size={15} className="mr-1" /> Confirm for Members
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowDistribute(true)}>
            <Users size={15} className="mr-1" /> Distribute to All Members
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setShowAdd(true)}>
            <Plus size={15} className="mr-1" /> Distribute to Individual
          </Button>
        </div>
      )}
      {!isFarmer && !isOrg && <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end [&>*]:w-full [&>*]:justify-center sm:[&>*]:w-auto">
        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload size={15} className="mr-1" /> Import File
        </Button>
        <Button variant="outline" onClick={() => setShowDistribute(true)}>
          <Users size={15} className="mr-1" /> Distribute to Organizations
        </Button>
        <Button onClick={() => setShowPeople(true)}>
          <Plus size={15} className="mr-1" /> Distribute Farmer Assistance
        </Button>
      </div>}

      {isOrg && view !== 'confirm' ? (
        <OrgDistributionHistory key={view} domain="crop" group={view} refreshKey={historyKey} organizationName={orgRecord?.label || ''} />
      ) : (
      <>
      <FilterPanel
        activeCount={[(isFarmer || isOrg) ? '' : barangay, year].filter(Boolean).length}
        actions={!isFarmer && !isOrg && view === 'history' ? <ListPrintButton build={() => buildStaffHistoryReport({ get: api.get, url: '/interventions/beneficiaries/distributions/', filters: { year, barangay, status: view }, noun: 'farmers' })} /> : null}
      >
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
      {error ? <ErrorMessage message={error} /> : isFarmer ? (
        // A farmer account sees each assistance as its name and date; tapping it shows the rest and the confirm actions.
        <CompactExpandList
          isLoading={isLoading}
          emptyText={emptyAssistanceText(view)}
          items={rows.map(r => ({
            id: r.id,
            title: r.assistance_type || 'Assistance',
            subtitle: r.date_received_fmt,
            details: [['Quantity', r.quantity], ['Source agency', r.source_agency], ['Year', r.year], ['Status', r.status_cell], ['Logged by', r.recorded_by_name]],
            actions: r.actions_cell && r.actions_cell !== '—' ? r.actions_cell : null,
          }))}
        />
      ) : isOrg ? <DataTable columns={tableColumns} data={rows} isLoading={isLoading} cardColumns={2} /> : (
        <DistributionsTable
          url="/interventions/beneficiaries/distributions/"
          noun="farmers"
          filters={{ year, barangay, status: view }}
          version={tableVersion}
          onMemberAction={memberAction}
          emptyText={emptyAssistanceText(view)}
          reportDomain={view === 'history' ? 'crop' : ''}
        />
      )}
      </>
      )}

      {showAdd && isOrg && (
        <DistributeAssistanceModal
          domain={FARMER_DISTRIBUTION_DOMAIN}
          mode="people"
          memberUrl={FARMERS_ORG_DOMAIN.memberSearchUrl(orgId)}
          onClose={() => setShowAdd(false)}
          onSuccess={() => { refreshAll(); setHistoryKey((k) => k + 1) }}
        />
      )}
      {showPeople && !isFarmer && !isOrg && (
        <DistributeAssistanceModal
          domain={FARMER_DISTRIBUTION_DOMAIN}
          mode="people"
          onClose={() => setShowPeople(false)}
          onSuccess={refreshAll}
        />
      )}
      {showImport && !isFarmer && !isOrg && (
        <ImportFileModal
          title="Import Crop Assistance"
          subtitle="Upload a spreadsheet to log assistance given to many farmers at once."
          importUrl="/interventions/beneficiaries/adhoc/import/"
          templateUrl="/interventions/beneficiaries/adhoc/import/template/"
          templateFilename="crop_assistance_import_template.xlsx"
          undoType="crop_assistance"
          helpText="Each row logs one assistance-given event, matched to a farmer by RSBSA number."
          onClose={() => setShowImport(false)}
          onImported={refreshAll}
        />
      )}
      {(showDistribute || distributeLink.org) && !isFarmer && (
        <DistributeAssistanceModal
          domain={FARMER_DISTRIBUTION_DOMAIN}
          fixedOrg={isOrg ? { id: orgId, name: orgRecord?.label, barangay: orgRecord?.barangay } : null}
          initialOrg={distributeLink.org}
          onClose={() => { setShowDistribute(false); distributeLink.done() }}
          onSuccess={() => { refreshAll(); setHistoryKey((k) => k + 1) }}
        />
      )}
      {editing && !isFarmer && (
        <EditAssistanceModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refreshAll() }}
        />
      )}
      {confirmingReceived && (
        <ConfirmReceivedModal
          record={confirmingReceived}
          onClose={() => setConfirmingReceived(null)}
          onDone={() => { setConfirmingReceived(null); refreshAll() }}
        />
      )}
      {reportingNotReceived && (
        <ReportNotReceivedModal
          record={reportingNotReceived}
          onClose={() => setReportingNotReceived(null)}
          onDone={() => { setReportingNotReceived(null); refreshAll() }}
        />
      )}
      {confirmingOnBehalf && (
        <ConfirmMembersDialog
          url={FARMERS_ORG_DOMAIN.confirmOnBehalfBulkUrl}
          domain="crop"
          records={confirmingOnBehalf}
          nameOf={(r) => r.farmer_full_name}
          onClose={() => setConfirmingOnBehalf(null)}
          onDone={() => { setConfirmingOnBehalf(null); selection.clear(); refreshAll() }}
        />
      )}
      {viewing && !isFarmer && !isOrg && (
        <AssistanceViewDialog
          title={viewing.assistance_type || 'Assistance'} subtitle={viewing.farmer_full_name}
          onClose={() => setViewing(null)}
          details={[
            { label: 'Farmer', value: viewing.farmer_full_name },
            { label: 'Organization', value: viewing.attributed_organization_name },
            { label: 'Assistance Type', value: viewing.assistance_type },
            { label: 'Source Agency', value: (viewing.source_agencies || []).join(', ') },
            { label: isCashType(viewing.assistance_type) ? 'Amount' : 'Quantity', value: formatAssistanceQuantity(viewing.assistance_type, viewing.quantity) },
            { label: 'Date Received', value: formatDate(viewing.date_given) },
            { label: 'Year', value: viewing.year || '' },
            { label: 'Status', value: STATUS_LABELS[viewing.status] || viewing.status },
            { label: 'Logged By', value: viewing.recorded_by_name },
            { label: 'Remarks', value: viewing.remarks },
          ]}
        />
      )}
      {resolving && !isFarmer && !isOrg && (
        <MarkResolvedModal
          record={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); refreshAll() }}
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
