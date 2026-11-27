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
import { buildStaffHistoryReport } from './assistanceHistoryReport.js'
import DistributeAssistanceModal from './DistributeAssistanceModal.jsx'
import useDistributeLink from './useDistributeLink.js'
import DistributionsTable from './DistributionsTable.jsx'
import AssistanceTabs from './AssistanceTabs.jsx'
import { emptyAssistanceText, tabFromParam } from './assistanceGroups.js'
import { FARMER_DISTRIBUTION_DOMAIN } from './distributionDomains.js'
import { EMPTY_OTHER_AGENCY, otherAgencyProblem, sourceAgencies } from './distributeFlow.js'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration, isTrainingType,
  isCashType, cashAmountError, cashAmountFrom, formatAssistanceQuantity, assistanceDateProblem,
} from './assistanceFieldHelpers.js'
import { todayISO } from '../../utils/localDate.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Must match interventions.models.BeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from production.models.CropAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

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
    distribution_time: (record.distribution_time || '').slice(0, 5),
    distribution_place: record.distribution_place || '',
    source_agencies: record.source_agencies || [],
    ...EMPTY_OTHER_AGENCY,   // "Others": an agency that is not in the list, typed here
    year: record.year,
    training_duration_days: record.training_duration_days != null ? String(record.training_duration_days) : '',
    training_type: record.training_type || '',
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
        distribution_time: form.distribution_time || null,
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

export default function CropAssistancePage() {
  // The office's page. Farmer and cooperative accounts have their own Assistance pages (pages/Account/accountRoutes.jsx).
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [barangay, setBarangay] = useState('')
  const [year, setYear] = useState('')
  const [view, setView] = useState(tabFromParam(searchParams.get('tab')))
  const [showPeople, setShowPeople] = useState(false)   // distribute to chosen farmers
  const [tableVersion, setTableVersion] = useState(0)   // bumps to read the distributions table again
  const [showImport, setShowImport] = useState(false)
  const [showDistribute, setShowDistribute] = useState(false)
  const distributeLink = useDistributeLink('farmers')   // ?distribute=<id> from a cooperative's menu: Distribute opens with it chosen
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  const refreshAll = () => setTableVersion((v) => v + 1)

  // A member of a distribution in the table: fetch the whole record, then open the window for it.
  const memberAction = async (kind, member) => {
    try {
      const { data } = await api.get(`/interventions/beneficiaries/adhoc/${member.record_id}/`)
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
      <AssistanceTabs active={view} onChange={changeView} />

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end [&>*]:w-full [&>*]:justify-center sm:[&>*]:w-auto">
        <Button variant="outline" onClick={() => setShowImport(true)}>
          <Upload size={15} className="mr-1" /> Import File
        </Button>
        <Button variant="outline" onClick={() => setShowDistribute(true)}>
          <Users size={15} className="mr-1" /> Distribute to Cooperatives
        </Button>
        <Button onClick={() => setShowPeople(true)}>
          <Plus size={15} className="mr-1" /> Distribute Farmer Assistance
        </Button>
      </div>

      <FilterPanel
        activeCount={[barangay, year].filter(Boolean).length}
        actions={view === 'history' ? <ListPrintButton build={() => buildStaffHistoryReport({ get: api.get, url: '/interventions/beneficiaries/distributions/', filters: { year, barangay, status: view }, noun: 'farmers' })} /> : null}
      >
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

      <DistributionsTable
        url="/interventions/beneficiaries/distributions/"
        noun="farmers"
        filters={{ year, barangay, status: view }}
        version={tableVersion}
        onMemberAction={memberAction}
        emptyText={emptyAssistanceText(view)}
        reportDomain={view === 'history' ? 'crop' : ''}
      />

      {showPeople && (
        <DistributeAssistanceModal
          domain={FARMER_DISTRIBUTION_DOMAIN}
          mode="people"
          onClose={() => setShowPeople(false)}
          onSuccess={refreshAll}
        />
      )}
      {showImport && (
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
      {(showDistribute || distributeLink.org) && (
        <DistributeAssistanceModal
          domain={FARMER_DISTRIBUTION_DOMAIN}
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
          title={viewing.assistance_type || 'Assistance'} subtitle={viewing.farmer_full_name}
          onClose={() => setViewing(null)}
          details={[
            { label: 'Farmer', value: viewing.farmer_full_name },
            { label: 'Cooperative', value: viewing.attributed_organization_name },
            { label: 'Assistance Type', value: viewing.assistance_type },
            ...(viewing.assistance_type === 'Training' ? [{ label: 'Type of Training', value: viewing.training_type }] : []),
            { label: 'Source Agency', value: (viewing.source_agencies || []).join(', ') },
            { label: isCashType(viewing.assistance_type) ? 'Amount' : 'Quantity', value: formatAssistanceQuantity(viewing.assistance_type, viewing.quantity) },
            { label: 'Distribution Date', value: formatDate(viewing.date_given) },
            { label: 'Time', value: timeText(viewing.distribution_time) },
            { label: 'Place', value: viewing.distribution_place },
            { label: 'Year', value: viewing.year || '' },
            { label: 'Status', value: STATUS_LABELS[viewing.status] || viewing.status },
            { label: 'Logged By', value: viewing.recorded_by_name },
            { label: 'Remarks', value: viewing.remarks },
          ]}
        />
      )}
    </div>
  )

  return (
    <PageLayout title="Crop Assistance" subtitle="Government and cooperative assistance given to farmers.">
      {innerContent}
    </PageLayout>
  )
}
