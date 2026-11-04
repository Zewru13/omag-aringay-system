import { useCallback, useEffect, useMemo, useState } from 'react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { ChevronLeft, ChevronRight, ListChecks, Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { AddRowFooter, DraftActions, DraftInput, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import { newestFirst } from '../../utils/listOrder.js'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'name',    label: 'ACTIVITY TYPE NAME' },
  { key: 'actions', label: 'ACTIONS' },
]

// Edit Activity Type. New types are added in the table itself (the Add button under it).
function ActivityTypeModal({ endpoint, activityType, onClose, onSaved }) {
  const { showToast } = useToast()
  const original = { name: activityType.name }
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`activity-type-edit:${endpoint}:${activityType?.id}`)
  const [form, setForm] = useDraftField(draft, 'form', original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState('')
  const hasChanges = JSON.stringify(form) !== JSON.stringify(original)

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'name') setNameError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Activity type name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`${endpoint}${activityType.id}/`, form)
      showToast('Activity type updated.', 'success')
      draft.clear()
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
      title="Edit Activity Type"
      subtitle={`Update details for ${activityType.name}`}
      icon={ListChecks}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="activity-type-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            Update Type
          </Button>
        </>
      }
    >
      <form id="activity-type-form" onSubmit={handleSubmit} className="space-y-4">
        <DraftBanner draft={draft} />
        <FormField label="Activity Type Name" required error={nameError}>
          <input
            className={baseInputClasses}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            placeholder="e.g. Soil Testing"
          />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function ActivityTypePageBase({ asTab = false, endpoint, dropdownLabel, builtInNames }) {
  const { showToast } = useToast()
  const [types,        setTypes]        = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [editType,     setEditType]     = useState(null)
  const add = useAddRow({ name: '' }, `activity-type:${endpoint}`)
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
    () => newestFirst(types).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [types, page],
  )

  const builtInSet = useMemo(() => new Set(builtInNames), [builtInNames])

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast('Type the activity type name first.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post(endpoint, { name })
      showToast('Activity type added.', 'success')
      add.close()
      await fetchAll()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

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
          { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditType(t) },
          { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingType({ id: t.id, name: t.name }), tone: 'rose' },
        ]} />
      ),
    }
  })

  // The new row sits at the top of the table, on the first page (newest first).
  if (add.isOpen && page === 1) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} aria-label="New activity type" placeholder="e.g. Soil Testing"
        onChange={e => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }
  const startRow = () => { setPage(1); add.open() }

  const innerContent = (
    <div className="space-y-4">

      <p className="text-[12px] text-[#7A8E7A] bg-[#F9FAF9] border border-[#E2E8E2] rounded-lg px-3 py-2">
        Custom types use a general-purpose logging form (date, notes, and condition only) — bespoke fields
        (e.g. pest details, fertilizer amounts) exist only for the built-in types shown here without a "Custom" tag.
      </p>

      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Activity Types" count={types.length} />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
        {!isLoading && <AddRowFooter onClick={startRow} disabled={add.isOpen} label="Add Activity Type" />}
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#7A8E7A]">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, types.length)} of {types.length}
          </p>
          <div className="flex items-center gap-1">
            <button type="button"
              aria-label="Previous page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8E2] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="px-3 text-[13px] font-medium text-[#1A2B1A]">{page} / {totalPages}</span>
            <button type="button"
              aria-label="Next page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8E2] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {editType && (
        <ActivityTypeModal
          endpoint={endpoint}
          activityType={editType}
          onClose={() => setEditType(null)}
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
