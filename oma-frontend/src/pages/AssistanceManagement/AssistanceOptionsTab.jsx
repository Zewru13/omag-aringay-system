import { useEffect, useState } from 'react'
import { ListPlus, Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
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
import { resetAssistanceChoices } from './useAssistanceChoices.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// One of the lists behind the assistance forms' dropdowns, as a tab of Crop Settings or Fisheries Settings: the types of equipment, the
// units, and (fisheries) the types of fishing gear. `domain` is crop | fisheries, `kind` equipment | unit | gear. Renaming or deleting a
// name never changes assistance already recorded (records keep the name they were saved with). New names are added in the table itself
// (the Add button under it); Edit renames one.
const COLUMNS = [
  { key: 'name', label: 'NAME' },
  { key: 'actions', label: 'ACTIONS' },
]

function NameModal({ singular, option, onClose, onSaved }) {
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`assistance-option-edit:${singular}:${option?.id}`)
  const [name, setName] = useDraftField(draft, 'name', option.name)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast(`Enter the ${singular.toLowerCase()} name.`, 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/interventions/options/${option.id}/`, { name })
      showToast(`${singular} updated.`, 'success')
      draft.clear()
      onSaved(); onClose()
    } catch (err) {
      const data = err?.response?.data
      showToast(data?.name?.[0] || data?.non_field_errors?.[0] || `Failed to save the ${singular.toLowerCase()}.`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={`Edit ${singular}`}
      subtitle={`Update ${option.name}`}
      icon={ListPlus}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assistance-option-form" isLoading={isSubmitting} disabled={isSubmitting || name === option.name}>
            Update {singular}
          </Button>
        </>
      )}
    >
      <form id="assistance-option-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <SettingsFields title="Option">
        <SettingsField label={`${singular} Name`} required>
          <input className={baseInputClasses} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

export default function AssistanceOptionsTab({ domain, kind, title, singular, example }) {
  const { showToast } = useToast()
  const [options, setOptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const add = useAddRow({ name: '' }, `assistance-option:${domain}:${kind}`)
  const [deleting, setDeleting] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    api.get('/interventions/options/', { params: { domain, kind } })
      .then((r) => { if (alive) { setOptions(Array.isArray(r.data) ? r.data : (r.data.results || [])); setError('') } })
      .catch(() => { if (alive) setError(`Failed to load the ${title.toLowerCase()}.`) })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [domain, kind, title, version])

  const refresh = () => { resetAssistanceChoices(); setVersion((v) => v + 1) }

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast(`Type the ${singular.toLowerCase()} name first.`, 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/interventions/options/', { domain, kind, name })
      showToast(`${singular} added.`, 'success')
      add.close(); refresh()
    } catch (err) {
      const data = err?.response?.data
      showToast(data?.name?.[0] || data?.non_field_errors?.[0] || `Failed to save the ${singular.toLowerCase()}.`, 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const rows = newestFirst(options).map((o) => ({
    ...o,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(o) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(o), tone: 'rose' },
      ]} />
    ),
  }))
  if (add.isOpen) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} maxLength={100} aria-label={`New ${singular.toLowerCase()}`} placeholder={`e.g. ${example}`}
        onChange={(e) => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader title={title} count={options.length} />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
        {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label={`Add ${singular}`} />}
      </div>

      {editing && (
        <NameModal singular={singular} option={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${singular}`}
          message={`Delete "${deleting.name}" from the list? Assistance already recorded with it keeps the name.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/interventions/options/${deleting.id}/`)
              showToast(`"${deleting.name}" deleted.`, 'success')
              setDeleting(null); refresh()
            } catch {
              showToast(`Failed to delete the ${singular.toLowerCase()}.`, 'error')
              setDeleting(null)
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
