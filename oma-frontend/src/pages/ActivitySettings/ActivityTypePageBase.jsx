import { useCallback, useEffect, useMemo, useState } from 'react'
import AddButton from '../../components/UI/AddButton.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { ChevronLeft, ChevronRight, ListChecks, Pencil, Trash2 } from 'lucide-react'
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
  { key: 'actions', label: 'ACTIONS' },
]

function ActivityTypeModal({ endpoint, activityType, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(activityType)
  const original = { name: activityType?.name || '' }
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
  const [deletingType, setDeletingType] = useState(null)
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
      actions: (
        <RowActions actions={[
          { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditType(t); setShowModal(true) } },
          { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingType({ id: t.id, name: t.name }), tone: 'rose' },
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
          activityType={editType}
          onClose={() => { setShowModal(false); setEditType(null) }}
          onSaved={fetchAll}
        />
      )}

      {deletingType && (
        <ConfirmDialog
          title="Delete Activity Type"
          message={`Delete "${deletingType.name}"? It will disappear from the ${dropdownLabel} dropdown, but existing logs that reference it are unaffected.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`${endpoint}${deletingType.id}/`)
              showToast(`"${deletingType.name}" deleted.`, 'success')
              setDeletingType(null)
              fetchAll()
            } catch {
              showToast('Failed to delete the activity type.', 'error')
              setDeletingType(null)
            }
          }}
          onCancel={() => setDeletingType(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Activity Type Management"
      subtitle="Add, edit, or delete activity types used in monitoring logs."
    >
      {innerContent}
    </PageLayout>
  )
}
