import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, Pencil, Plus, Upload, UserCheck, Users, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import ListPrintButton from '../../components/ListPrintButton.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AssistanceEditSections, { DangerZone } from './AssistanceEditSections.jsx'
import { MarkResolvedModal, ReportNotReceivedModal } from './AssistanceFollowUpModals.jsx'
import AssistanceViewDialog from './AssistanceViewDialog.jsx'
import ConfirmMembersDialog from './ConfirmMembersDialog.jsx'
import ConfirmReceivedDialog from './ConfirmReceivedDialog.jsx'
import { ConfirmActionBar, SelectCell, SelectHeader } from './OrgConfirmControls.jsx'
import useConfirmSelection from './useConfirmSelection.js'
import { FISHERFOLK_ORG_DOMAIN } from '../Citizen/orgDomainConfig.js'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import useDistributeLink from './useDistributeLink.js'
import DistributionsTable from './DistributionsTable.jsx'
import OrgDistributionHistory from './OrgDistributionHistory.jsx'
import { buildStaffHistoryReport } from './assistanceHistoryReport.js'
import AssistanceTabs from './AssistanceTabs.jsx'
import { emptyAssistanceText, inGroup, tabFromParam } from './assistanceGroups.js'
import CompactExpandList from '../../components/UI/CompactExpandList.jsx'
import { FISHERFOLK_DISTRIBUTION_DOMAIN } from './distributionDomains.js'
import { EMPTY_OTHER_AGENCY, otherAgencyProblem, sourceAgencies } from './distributeFlow.js'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration, isTrainingType,
  isCashType, cashAmountError, cashAmountFrom, formatAssistanceQuantity, assistanceDateProblem,
} from './assistanceFieldHelpers.js'
import { todayISO } from '../../utils/localDate.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

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

// ── Edit Modal — relocated from FisheriesMonitoringPage.jsx unchanged ────────

function EditAssistanceModal({ record, onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const originalData = {
    assistance_type: record.assistance_type || '',
    source_agencies: record.source_agencies || [],
    ...EMPTY_OTHER_AGENCY,   // "Others": an agency that is not in the list, typed here
    date_received: record.date_given || '',
    quantity: isCashType(record.assistance_type) ? cashAmountFrom(record.quantity) : (record.quantity != null ? String(record.quantity) : ''),
    description: record.description || '',
    remarks: record.remarks || '',
    training_duration_days: record.training_duration_days != null ? String(record.training_duration_days) : '',
    equipment_type: record.equipment_type || '',
    item_type: record.item_type || '',
  }
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`fisheries-assistance-edit:${record.id}`)
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
      const { date_received, quantity, source_other_on, source_other, ...rest } = form
      await api.patch(`/interventions/fisherfolk-beneficiaries/adhoc/${record.id}/`, {
        ...rest,
        source_agencies: sourceAgencies(form),
        date_given: date_received,
        quantity: isTraining ? null : (quantity !== '' ? parseFloat(quantity) : null),
        ...buildTypeConditionalPayload(form.assistance_type, form, { allowSeedFertilizer: false }),
      })
      showToast('Assistance record updated.', 'success')
      draft.clear()
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
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="edit-fisheries-assistance-form" isLoading={isSubmitting} disabled={!isDirty}>Save Changes</Button>
          </>
        }
      >
        <form id="edit-fisheries-assistance-form" onSubmit={handleSubmit} className="space-y-3">
          <DraftBanner draft={draft} />
          <AssistanceEditSections
            domain="fisheries" form={form} set={set} setAssistanceType={setAssistanceType} typeOptions={ASSISTANCE_TYPE_OPTIONS}
            today={todayISO()} originalDate={originalData.date_received}
          />

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

// ── Main Page ────────────────────────────────────────────────────────────────
// Relocated from FisheriesMonitoringPage.jsx's "Assistance" tab (Batch 5).
// Batch 6: repointed to interventions.FisherfolkBeneficiaryRecord at
// /interventions/fisherfolk-beneficiaries/adhoc/ — fisheries.FisheriesAssistanceRecord
// and its endpoint were retired; this page's data was migrated, not lost.

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
  // Current | History on every account (an organization's Confirm for Members list is part of Current).
  const [view, setView] = useState(tabFromParam(initialTab, { allowConfirm: isOrg }))
  // The members picked on the organization's Confirm for Members list.
  const selection = useConfirmSelection(isOrg && view === 'confirm' ? assistance : NO_RECORDS)
  const [showLog, setShowLog] = useState(false)   // an organization account: distribute to chosen members
  const [showPeople, setShowPeople] = useState(false)   // staff: distribute to chosen fisherfolk
  const [tableVersion, setTableVersion] = useState(0)   // bumps to read the staff distributions table again
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const distributeLink = useDistributeLink('fisherfolk')   // ?distribute=<id> from an organization's menu: Distribute opens with it chosen
  const [editing, setEditing] = useState(null)
  const [resolving, setResolving] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [historyKey, setHistoryKey] = useState(0) // bumps to reload the organization's distribution history

  const fetchAssistance = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      if (isOrg && view !== 'confirm') {
        // The organization's Current and History are OrgDistributionHistory, which loads its own distributions.
        return
      }
      if (isOrg) {
        // The members' awaiting records this organization may confirm for (year narrows them).
        const r = await api.get(FISHERFOLK_ORG_DOMAIN.accountlessConfirmablesUrl)
        let mine = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (year) mine = mine.filter((x) => String(x.date_given || '').startsWith(String(year)))
        setAssistance(mine)
        return
      }
      if (isFisherfolk) {
        // A fisherfolk account's own assistance (not filterable on the server): the tab (Current or History) and the year narrow it here.
        const r = await api.get('/interventions/my-fisherfolk-beneficiary-history/')
        let mine = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (year) mine = mine.filter((x) => String(x.date_given || '').startsWith(String(year)))
        setAssistance(mine.filter((x) => inGroup(x.status, view)))
        return
      }
      // Staff: the distributions table (DistributionsTable) loads itself.
    } catch { setError('Failed to load assistance records.') }
    finally { setIsLoading(false) }
  }, [year, view, isOrg, isFisherfolk])

  useEffect(() => { fetchAssistance() }, [fetchAssistance])

  // After a save: read what this account sees again (staff: the distributions table).
  const refreshAll = useCallback(() => { setTableVersion((v) => v + 1); return fetchAssistance() }, [fetchAssistance])

  // A member of a distribution in the staff table: fetch the whole record, then open the window for it.
  const memberAction = async (kind, member) => {
    try {
      const { data } = await api.get(`/interventions/fisherfolk-beneficiaries/adhoc/${member.record_id}/`)
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

  const [confirmingReceived, setConfirmingReceived] = useState(null)   // the record whose Confirm Received window is open
  const confirmReceived = useCallback((a) => setConfirmingReceived(a), [])

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
        <AssistanceTabs active={view} onChange={changeView} />
        {isOrg && view === 'confirm' && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => changeView('current')}>Back to Current</Button>
        )}
        {isOrg && view === 'current' && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => changeView('confirm')}>
              <UserCheck size={15} className="mr-1" /> Confirm for Members
            </Button>
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
              <Users size={15} className="mr-1" /> Distribute to Organizations
            </Button>
            <Button onClick={() => setShowPeople(true)}>
              <Plus size={15} className="mr-1" /> Distribute Fisherfolk Assistance
            </Button>
          </div>
        )}
      </div>

      {isOrg && view !== 'confirm' ? (
        <OrgDistributionHistory key={view} domain="fisheries" group={view} refreshKey={historyKey} organizationName={orgRecord?.label || ''} />
      ) : (
      <>
      <FilterPanel
        {...(isOrg ? {} : { search, onSearchChange: setSearch, searchPlaceholder: 'Search fisherfolk or RSBSA no.' })}
        activeCount={(isOrg ? [Boolean(year)] : [Boolean(barangay), Boolean(source), Boolean(type), Boolean(year)]).filter(Boolean).length}
        actions={!isFisherfolk && !isOrg && view === 'history' ? <ListPrintButton build={() => buildStaffHistoryReport({ get: api.get, url: '/interventions/fisherfolk-beneficiaries/distributions/', filters: { year, barangay, member: search, source_agency: source, assistance_type: type, status: view }, noun: 'fisherfolk' })} /> : null}
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

      {isOrg && assistance.length > 0 && view !== 'confirm' && (
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
      {error ? <ErrorMessage message={error} /> : isFisherfolk ? (
        // A fisherfolk account sees each assistance as its name and date; tapping it shows the rest and the confirm actions.
        <CompactExpandList
          isLoading={isLoading}
          emptyText={emptyAssistanceText(view)}
          items={rows.map(r => ({
            id: r.id,
            title: r.assistance_type || 'Assistance',
            subtitle: r.date_received_fmt,
            details: [['Quantity', r.quantity], ['Source of assistance', r.source_agency], ['Year', r.year], ['Status', r.status_cell], ['Logged by', r.recorded_by_name]],
            actions: r.actions_cell && r.actions_cell !== '—' ? r.actions_cell : null,
          }))}
        />
      ) : isOrg ? <DataTable columns={tableColumns} data={rows} isLoading={isLoading} cardColumns={2} /> : (
        <DistributionsTable
          url="/interventions/fisherfolk-beneficiaries/distributions/"
          noun="fisherfolk"
          filters={{ year, barangay, member: search, source_agency: source, assistance_type: type, status: view }}
          version={tableVersion}
          onMemberAction={memberAction}
          emptyText={emptyAssistanceText(view)}
          reportDomain={view === 'history' ? 'fisheries' : ''}
        />
      )}
      </>
      )}

      {showLog && isOrg && (
        <DistributeAssistanceModal
          domain={FISHERFOLK_DISTRIBUTION_DOMAIN}
          mode="people"
          memberUrl={FISHERFOLK_ORG_DOMAIN.memberSearchUrl(orgId)}
          onClose={() => setShowLog(false)}
          onSuccess={() => { refreshAll(); setHistoryKey((k) => k + 1) }}
        />
      )}
      {showPeople && !isOrg && !isFisherfolk && (
        <DistributeAssistanceModal
          domain={FISHERFOLK_DISTRIBUTION_DOMAIN}
          mode="people"
          onClose={() => setShowPeople(false)}
          onSuccess={refreshAll}
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
          onImported={refreshAll}
        />
      )}
      {(showDistribute || distributeLink.org) && (
        <DistributeAssistanceModal
          domain={FISHERFOLK_DISTRIBUTION_DOMAIN}
          fixedOrg={isOrg ? { id: orgId, name: orgRecord?.label, barangay: orgRecord?.barangay } : null}
          initialOrg={distributeLink.org}
          onClose={() => { setShowDistribute(false); distributeLink.done() }}
          onSuccess={() => { refreshAll(); setHistoryKey((k) => k + 1) }}
        />
      )}
      {editing && (
        <EditAssistanceModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refreshAll() }}
        />
      )}
      {confirmingOnBehalf && (
        <ConfirmMembersDialog
          url={FISHERFOLK_ORG_DOMAIN.confirmOnBehalfBulkUrl}
          domain="fisheries"
          records={confirmingOnBehalf}
          nameOf={(r) => r.fisherfolk_full_name}
          onClose={() => setConfirmingOnBehalf(null)}
          onDone={() => { setConfirmingOnBehalf(null); selection.clear(); refreshAll() }}
        />
      )}
      {confirmingReceived && (
        <ConfirmReceivedDialog
          record={confirmingReceived}
          url={`/interventions/fisherfolk-beneficiaries/${confirmingReceived.id}/confirm-received/`}
          domain="fisheries"
          onClose={() => setConfirmingReceived(null)}
          onDone={() => { setConfirmingReceived(null); refreshAll() }}
        />
      )}
      {viewing && !isOrg && !isFisherfolk && (
        <AssistanceViewDialog
          title={viewing.assistance_type || 'Assistance'} subtitle={viewing.fisherfolk_full_name}
          onClose={() => setViewing(null)}
          details={[
            { label: 'Fisherfolk', value: viewing.fisherfolk_full_name },
            { label: 'Fisherfolk Type', value: viewing.fisherfolk_type },
            { label: 'Organization', value: viewing.attributed_fisherfolk_organization_name },
            { label: 'Assistance Type', value: viewing.assistance_type },
            { label: 'Item Type', value: viewing.item_type || viewing.equipment_type },
            { label: 'Source Agency', value: (viewing.source_agencies || []).join(', ') },
            { label: isCashType(viewing.assistance_type) ? 'Amount' : 'Quantity', value: formatAssistanceQuantity(viewing.assistance_type, viewing.quantity) },
            { label: 'Date Received', value: formatDate(viewing.date_given) },
            { label: 'Status', value: STATUS_LABELS[viewing.status] || viewing.status },
            { label: 'Recorded By', value: viewing.recorded_by_name },
            { label: 'Description', value: viewing.description },
            { label: 'Remarks', value: viewing.remarks },
          ]}
        />
      )}
      {resolving && !isOrg && (
        <MarkResolvedModal
          domain="fisheries"
          record={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); refreshAll() }}
        />
      )}
      {reportingNotReceived && (
        <ReportNotReceivedModal
          domain="fisheries"
          record={reportingNotReceived}
          onClose={() => setReportingNotReceived(null)}
          onDone={() => { setReportingNotReceived(null); refreshAll() }}
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
