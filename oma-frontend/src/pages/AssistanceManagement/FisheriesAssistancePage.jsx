import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Upload, Users } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import ListPrintButton from '../../components/ListPrintButton.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AssistanceEditSections, { DangerZone } from './AssistanceEditSections.jsx'
import AssistanceViewDialog from './AssistanceViewDialog.jsx'
import { STATUS_LABELS, extractErrorMessage, timeText } from './assistanceStatus.js'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import useDistributeLink from './useDistributeLink.js'
import DistributionsTable from './DistributionsTable.jsx'
import { buildStaffHistoryReport } from './assistanceHistoryReport.js'
import AssistanceTabs from './AssistanceTabs.jsx'
import { emptyAssistanceText, tabFromParam } from './assistanceGroups.js'
import { FISHERFOLK_DISTRIBUTION_DOMAIN } from './distributionDomains.js'
import { EMPTY_OTHER_AGENCY, otherAgencyProblem, sourceAgencies } from './distributeFlow.js'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration, isTrainingType,
  isCashType, cashAmountError, cashAmountFrom, formatAssistanceQuantity, assistanceDateProblem,
} from './assistanceFieldHelpers.js'
import { todayISO } from '../../utils/localDate.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Must match interventions.models.FisherfolkBeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from fisheries.models.FisheriesAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Cash Assistance', 'Equipment', 'Training', 'Other']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

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
    distribution_time: (record.distribution_time || '').slice(0, 5),
    distribution_place: record.distribution_place || '',
    quantity: isCashType(record.assistance_type) ? cashAmountFrom(record.quantity) : (record.quantity != null ? String(record.quantity) : ''),
    description: record.description || '',
    remarks: record.remarks || '',
    training_duration_days: record.training_duration_days != null ? String(record.training_duration_days) : '',
    training_type: record.training_type || '',
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
        distribution_time: form.distribution_time || null,
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

export default function FisheriesAssistancePage() {
  // The office's page. Fisherfolk and cooperative accounts have their own Assistance pages (pages/Account/accountRoutes.jsx).
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [source, setSource] = useState('')
  const [type, setType] = useState('')
  const [year, setYear] = useState('')
  const [view, setView] = useState(tabFromParam(searchParams.get('tab')))
  const [showPeople, setShowPeople] = useState(false)   // distribute to chosen fisherfolk
  const [tableVersion, setTableVersion] = useState(0)   // bumps to read the distributions table again
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const distributeLink = useDistributeLink('fisherfolk')   // ?distribute=<id> from a cooperative's menu: Distribute opens with it chosen
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  const refreshAll = () => setTableVersion((v) => v + 1)

  // A member of a distribution in the table: fetch the whole record, then open the window for it.
  const memberAction = async (kind, member) => {
    try {
      const { data } = await api.get(`/interventions/fisherfolk-beneficiaries/adhoc/${member.record_id}/`)
      if (kind === 'view') setViewing(data)
      else setEditing(data)
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

  const innerContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AssistanceTabs active={view} onChange={changeView} />
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end [&>*]:w-full [&>*]:justify-center sm:[&>*]:w-auto">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload size={15} className="mr-1" /> Import File
          </Button>
          <Button variant="outline" onClick={() => setShowDistribute(true)}>
            <Users size={15} className="mr-1" /> Distribute to Cooperatives
          </Button>
          <Button onClick={() => setShowPeople(true)}>
            <Plus size={15} className="mr-1" /> Distribute Fisherfolk Assistance
          </Button>
        </div>
      </div>

      <FilterPanel
        search={search} onSearchChange={setSearch} searchPlaceholder="Search fisherfolk or RSBSA no."
        activeCount={[barangay, source, type, year].filter(Boolean).length}
        actions={view === 'history' ? <ListPrintButton build={() => buildStaffHistoryReport({ get: api.get, url: '/interventions/fisherfolk-beneficiaries/distributions/', filters: { year, barangay, member: search, source_agency: source, assistance_type: type, status: view }, noun: 'fisherfolk' })} /> : null}
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

      <DistributionsTable
        url="/interventions/fisherfolk-beneficiaries/distributions/"
        noun="fisherfolk"
        filters={{ year, barangay, member: search, source_agency: source, assistance_type: type, status: view }}
        version={tableVersion}
        onMemberAction={memberAction}
        emptyText={emptyAssistanceText(view)}
        reportDomain={view === 'history' ? 'fisheries' : ''}
      />

      {showPeople && (
        <DistributeAssistanceModal
          domain={FISHERFOLK_DISTRIBUTION_DOMAIN}
          mode="people"
          onClose={() => setShowPeople(false)}
          onSuccess={refreshAll}
        />
      )}
      {showImport && (
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
          initialOrg={distributeLink.org}
          onClose={() => { setShowDistribute(false); distributeLink.done() }}
          onSuccess={refreshAll}
        />
      )}
      {editing && (
        <EditAssistanceModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refreshAll() }}
        />
      )}
      {viewing && (
        <AssistanceViewDialog
          title={viewing.assistance_type || 'Assistance'} subtitle={viewing.fisherfolk_full_name}
          onClose={() => setViewing(null)}
          details={[
            { label: 'Fisherfolk', value: viewing.fisherfolk_full_name },
            { label: 'Fisherfolk Type', value: viewing.fisherfolk_type },
            { label: 'Cooperative', value: viewing.attributed_fisherfolk_organization_name },
            { label: 'Assistance Type', value: viewing.assistance_type },
            { label: 'Item Type', value: viewing.item_type || viewing.equipment_type },
            ...(viewing.assistance_type === 'Training' ? [{ label: 'Type of Training', value: viewing.training_type }] : []),
            { label: 'Source Agency', value: (viewing.source_agencies || []).join(', ') },
            { label: isCashType(viewing.assistance_type) ? 'Amount' : 'Quantity', value: formatAssistanceQuantity(viewing.assistance_type, viewing.quantity) },
            { label: 'Distribution Date', value: formatDate(viewing.date_given) },
            { label: 'Time', value: timeText(viewing.distribution_time) },
            { label: 'Place', value: viewing.distribution_place },
            { label: 'Status', value: STATUS_LABELS[viewing.status] || viewing.status },
            { label: 'Recorded By', value: viewing.recorded_by_name },
            { label: 'Description', value: viewing.description },
            { label: 'Remarks', value: viewing.remarks },
          ]}
        />
      )}
    </div>
  )

  return (
    <PageLayout title="Fisheries Assistance" subtitle="Government and cooperative assistance given to fisherfolk.">
      {innerContent}
    </PageLayout>
  )
}
