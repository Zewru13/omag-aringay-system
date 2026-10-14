import { useCallback, useEffect, useMemo, useState } from 'react'
import AddButton from '../../components/UI/AddButton.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { ChevronLeft, ChevronRight, ListChecks, Pencil, Power } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'name',    label: 'ACTIVITY TYPE NAME' },
  { key: 'status',  label: 'STATUS' },
  { key: 'actions', label: 'ACTIONS' },
]

function ActivityTypeModal({ endpoint, dropdownLabel, activityType, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(activityType)
  const original = { name: activityType?.name || '', is_active: activityType?.is_active ?? true }
  const [form, setForm] = useState(original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState('')
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(original)

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'name') setNameError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Activity type name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(`${endpoint}${activityType.id}/`, form)
      } else {
        await api.post(endpoint, form)
      }
      showToast(`Activity type ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      const nameErr = err?.response?.data?.name?.[0]
      if (nameErr) { setNameError(nameErr) } else { showToast('Failed to save.', 'error') }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Activity Type' : 'Add New Activity Type'}
      subtitle={isEdit ? `Update details for ${activityType.name}` : 'Enter activity type information below'}
      icon={ListChecks}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="activity-type-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? 'Update Type' : '+ Add Type'}
          </Button>
        </>
      }
    >
      <form id="activity-type-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Activity Type Name" required error={nameError}>
          <input
            className={baseInputClasses}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            placeholder="e.g. Soil Testing"
          />
        </FormField>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#1B4D2E]"
            checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)}
          />
          <span className="text-[13px] text-[#1A2B1A]">Active (visible in {dropdownLabel} dropdown)</span>
        </label>
        {!isEdit && (
          <p className="text-[11px] text-[#7A8E7A] bg-[#F9FAF9] border border-[#E2E8E2] rounded-lg px-3 py-2">
            Custom activity types use a general-purpose logging form (date, notes, condition). Only the
            built-in types listed below have specialized fields.
          </p>
        )}
      </form>
    </ModalShell>
  )
}

export default function ActivityTypePageBase({ asTab = false, endpoint, dropdownLabel, builtInNames }) {
  const { showToast } = useToast()
  const [types,        setTypes]        = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editType,     setEditType]     = useState(null)
  const [togglingType, setTogglingType] = useState(null)
  const [page,         setPage]         = useState(1)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get(endpoint)
      setTypes(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load activity types.')
    } finally {
      setIsLoading(false)
    }
  }, [endpoint])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalPages = Math.max(1, Math.ceil(types.length / PAGE_SIZE))
  const paginated = useMemo(
    () => types.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [types, page],
  )

  const builtInSet = useMemo(() => new Set(builtInNames), [builtInNames])

  const rows = paginated.map(t => {
    const isActive = t.is_active !== false
    const isBuiltIn = builtInSet.has(t.name)
    return {
      ...t,
      name: (
        <span className="inline-flex items-center gap-2">
          {t.name}
          {!isBuiltIn && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#EBF5EE] text-[#1B4D2E]">
              Custom
            </span>
          )}
        </span>
      ),
      status: (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
          isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {isActive ? 'Active' : 'Inactive'}
        </span>
      ),
      actions: (
        <RowActions actions={[
          { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditType(t); setShowModal(true) } },
          {
            key: 'toggle', label: isActive ? 'Deactivate' : 'Activate', icon: Power,
            onClick: () => setTogglingType({ id: t.id, name: t.name, targetActive: !isActive }),
            tone: isActive ? 'rose' : 'default',
          },
        ]} />
      ),
    }
  })

  const actionBtn = <AddButton onClick={() => { setEditType(null); setShowModal(true) }}>Add Activity Type</AddButton>

  const innerContent = (
    <div className="space-y-4">

      <p className="text-[12px] text-[#7A8E7A] bg-[#F9FAF9] border border-[#E2E8E2] rounded-lg px-3 py-2">
        Custom types use a general-purpose logging form (date, notes, and condition only) — bespoke fields
        (e.g. pest details, fertilizer amounts) exist only for the built-in types shown here without a "Custom" tag.
      </p>

      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Activity Types" count={types.length} action={actionBtn} />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#7A8E7A]">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, types.length)} of {types.length}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-[13px] font-medium text-[#1A2B1A]">{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <ActivityTypeModal
          endpoint={endpoint}
          dropdownLabel={dropdownLabel}
          activityType={editType}
          onClose={() => { setShowModal(false); setEditType(null) }}
          onSaved={fetchAll}
        />
      )}

      {togglingType && (
        <ConfirmDialog
          title={togglingType.targetActive ? 'Activate Activity Type' : 'Deactivate Activity Type'}
          message={
            togglingType.targetActive
              ? `Reactivate "${togglingType.name}"? It will reappear in the ${dropdownLabel} dropdown.`
              : `Deactivate "${togglingType.name}"? It will disappear from the ${dropdownLabel} dropdown, but existing logs that reference it are unaffected.`
          }
          confirmLabel={togglingType.targetActive ? 'Activate' : 'Deactivate'}
          variant={togglingType.targetActive ? 'default' : 'danger'}
          onConfirm={async () => {
            try {
              await api.patch(`${endpoint}${togglingType.id}/`, { is_active: togglingType.targetActive })
              showToast(`"${togglingType.name}" ${togglingType.targetActive ? 'activated' : 'deactivated'}.`, 'success')
              setTogglingType(null)
              fetchAll()
            } catch {
              showToast('Failed to update activity type status.', 'error')
              setTogglingType(null)
            }
          }}
          onCancel={() => setTogglingType(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Activity Type Management"
      subtitle="Add, edit, or deactivate activity types used in monitoring logs."
    >
      {innerContent}
    </PageLayout>
  )
}
