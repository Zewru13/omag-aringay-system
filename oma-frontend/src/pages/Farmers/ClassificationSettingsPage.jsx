import { useEffect, useState } from 'react'
import { ListChecks, Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { AddRowFooter, DraftActions, DraftInput, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import { newestFirst } from '../../utils/listOrder.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { SettingsFields, SettingsField } from '../../components/UI/SettingsFormTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { resetParcelClassifications } from './useParcelClassifications.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Classification Settings: the list of "check all that apply" classifications every farm parcel form offers. Adding one offers it
// straight away; renaming or deleting never changes parcels that already have it (a parcel keeps the name it was saved with). New ones are
// added in the table itself (the Add button under it); Edit renames one.

const COLUMNS = [
  { key: 'name', label: 'CLASSIFICATION' },
  { key: 'actions', label: 'ACTIONS' },
]

function ClassificationModal({ classification, onClose, onSaved }) {
  const { showToast } = useToast()
  const original = { name: classification.name }
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`parcel-classification-edit:${classification?.id}`)
  const [form, setForm] = useDraftField(draft, 'form', original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = JSON.stringify(form) !== JSON.stringify(original)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Enter the classification name.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/farmers/parcel-classifications/${classification.id}/`, form)
      showToast('Classification updated.', 'success')
      draft.clear()
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save the classification.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Classification"
      subtitle={`Update ${classification.name}`}
      icon={ListChecks}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="parcel-classification-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            Update Classification
          </Button>
        </>
      )}
    >
      <form id="parcel-classification-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <SettingsFields title="Classification">
        <SettingsField label="Classification Name" required>
          <input className={baseInputClasses} value={form.name} autoFocus placeholder="e.g. Irrigated by NIA"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

export default function ClassificationSettingsPage() {
  const { showToast } = useToast()
  const [classifications, setClassifications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const add = useAddRow({ name: '' }, 'farmer-classification')
  const [deleting, setDeleting] = useState(null)

  // `version` bumps after a save or delete, which loads the list again.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    api.get('/farmers/parcel-classifications/')
      .then((r) => { if (alive) { setClassifications(Array.isArray(r.data) ? r.data : (r.data.results || [])); setError('') } })
      .catch(() => { if (alive) setError('Failed to load the classifications.') })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [version])

  const refresh = () => { resetParcelClassifications(); setVersion((v) => v + 1) }

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast('Type the classification name first.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/farmers/parcel-classifications/', { name })
      showToast('Classification added.', 'success')
      add.close(); refresh()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save the classification.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const rows = newestFirst(classifications).map((c) => ({
    ...c,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(c) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(c), tone: 'rose' },
      ]} />
    ),
  }))
  if (add.isOpen) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} aria-label="New classification" placeholder="e.g. Irrigated by NIA"
        onChange={(e) => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  return (
    <PageLayout title="Classification Settings" subtitle="The classifications offered when a farm parcel is added.">
      <div className="space-y-4">
        {error && <ErrorMessage message={error} />}
        <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader title="Parcel Classifications" count={classifications.length} />
          <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
          {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label="Add Classification" />}
        </div>
      </div>

      {editing && <ClassificationModal classification={editing} onClose={() => setEditing(null)} onSaved={refresh} />}

      {deleting && (
        <ConfirmDialog
          title="Delete Classification"
          message={`Delete "${deleting.name}" from the list? Parcels that already have it keep it.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/farmers/parcel-classifications/${deleting.id}/`)
              showToast(`"${deleting.name}" deleted.`, 'success')
              setDeleting(null); refresh()
            } catch {
              showToast('Failed to delete the classification.', 'error')
              setDeleting(null)
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageLayout>
  )
}
