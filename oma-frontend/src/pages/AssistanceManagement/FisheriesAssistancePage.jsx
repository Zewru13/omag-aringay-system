import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import LogGovernmentAssistanceModal from './LogGovernmentAssistanceModal.jsx'

// Must match interventions.models.FisherfolkBeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from fisheries.models.FisheriesAssistanceRecord).
const ASSISTANCE_TYPE_OPTIONS = ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Cash Assistance', 'Equipment', 'Training', 'Other']
const SOURCE_OPTIONS = ['LGU', 'MAO', 'BFAR', 'DA', 'NGO', 'Private Donor', 'Others']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const COLUMNS = [
  { key: 'date_received_fmt',                 label: 'Date Received' },
  { key: 'fisherfolk_full_name',               label: 'Fisherfolk Name' },
  { key: 'fisherfolk_type',                   label: 'Type' },
  { key: 'assistance_type',                   label: 'Assistance Type' },
  { key: 'source_agency',                     label: 'Source of Assistance' },
  { key: 'quantity',                          label: 'Quantity / Amount' },
  { key: 'remarks',                           label: 'Remarks' },
  { key: 'recorded_by_name',                  label: 'Recorded By' },
  { key: 'actions_cell',                      label: 'Actions' },
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
    setError(''); setIsSubmitting(true)
    try {
      const { date_received, ...rest } = form
      await api.patch(`/interventions/fisherfolk-beneficiaries/adhoc/${record.id}/`, {
        ...rest,
        date_given: date_received,
        quantity: form.quantity !== '' ? parseFloat(form.quantity) : null,
      })
      showToast('Assistance record updated.', 'success')
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update assistance record.')
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
              <select className={baseInputClasses} value={form.source_agency}
                onChange={(e) => set('source_agency', e.target.value)}>
                <option value="">Select Source</option>
                {SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
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

// ── Main Page ────────────────────────────────────────────────────────────────
// Relocated from FisheriesMonitoringPage.jsx's "Assistance" tab (Batch 5).
// Batch 6: repointed to interventions.FisherfolkBeneficiaryRecord (program=null)
// at /interventions/fisherfolk-beneficiaries/adhoc/ — fisheries.FisheriesAssistanceRecord
// and its endpoint were retired; this page's data was migrated, not lost.

export default function FisheriesAssistancePage({ asTab = false }) {
  const [assistance, setAssistance] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [source, setSource] = useState('')
  const [type, setType] = useState('')
  const [year, setYear] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [editing, setEditing] = useState(null)

  const fetchAssistance = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (year) params.set('year', year)
      if (barangay) params.set('barangay', barangay)
      if (search) params.set('search', search)
      if (source) params.set('source_of_assistance', source)
      if (type) params.set('assistance_type', type)
      const r = await api.get(`/interventions/fisherfolk-beneficiaries/adhoc/?${params}`)
      setAssistance(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setError('Failed to load assistance records.') }
    finally { setIsLoading(false) }
  }, [year, barangay, search, source, type])

  useEffect(() => { fetchAssistance() }, [fetchAssistance])

  const rows = useMemo(() => assistance.map((a) => ({
    ...a,
    quantity: a.quantity || '—',
    date_received_fmt: formatDate(a.date_given),
    actions_cell: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(a) },
      ]} />
    ),
  })), [assistance])

  const totalQuantity = useMemo(
    () => assistance.reduce((sum, a) => sum + (parseFloat(a.quantity) || 0), 0),
    [assistance],
  )

  const innerContent = (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <input
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
          placeholder="Search fisherfolk or LGU no."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
        <input
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
          placeholder="Source of assistance"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
          placeholder="Assistance type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <select
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowLog(true)}>
          <Plus size={15} className="mr-1" /> Log Government Assistance
        </Button>
      </div>

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
      {editing && (
        <EditAssistanceModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAssistance() }}
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
