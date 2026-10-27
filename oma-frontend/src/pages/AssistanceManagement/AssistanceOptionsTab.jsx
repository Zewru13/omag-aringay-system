import { useEffect, useState } from 'react'
import { ListPlus, Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AddButton from '../../components/UI/AddButton.jsx'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { resetAssistanceChoices } from './useAssistanceChoices.js'

// One of the lists behind the assistance forms' dropdowns, as a tab of Crop Settings or Fisheries Settings: the types of equipment, the
// units, and (fisheries) the types of fishing gear. `domain` is crop | fisheries, `kind` equipment | unit | gear. Renaming or deleting a
// name never changes assistance already recorded (records keep the name they were saved with).
const COLUMNS = [
  { key: 'name', label: 'NAME' },
  { key: 'actions', label: 'ACTIONS' },
]

function NameModal({ domain, kind, singular, example, option, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(option)
  const [name, setName] = useState(option?.name || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast(`Enter the ${singular.toLowerCase()} name.`, 'error'); return }
    setIsSubmitting(true)
    try {
      if (isEdit) await api.patch(`/interventions/options/${option.id}/`, { name })
      else await api.post('/interventions/options/', { domain, kind, name })
      showToast(`${singular} ${isEdit ? 'updated' : 'added'}.`, 'success')
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
      title={isEdit ? `Edit ${singular}` : `Add ${singular}`}
      subtitle={isEdit ? `Update ${option.name}` : 'It appears in the dropdown of the assistance forms'}
      icon={ListPlus}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assistance-option-form" isLoading={isSubmitting} disabled={isSubmitting || (isEdit && name === option.name)}>
            {isEdit ? `Update ${singular}` : `Add ${singular}`}
          </Button>
        </>
      )}
    >
      <form id="assistance-option-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label={`${singular} Name`} required>
          <input className={baseInputClasses} value={name} autoFocus placeholder={`e.g. ${example}`} onChange={(e) => setName(e.target.value)} />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function AssistanceOptionsTab({ domain, kind, title, singular, example }) {
  const { showToast } = useToast()
  const [options, setOptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(undefined)   // undefined = closed, null = adding, object = editing
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

  const rows = options.map((o) => ({
    ...o,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(o) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(o), tone: 'rose' },
      ]} />
    ),
  }))

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader title={title} count={options.length} action={<AddButton onClick={() => setEditing(null)}>{`Add ${singular}`}</AddButton>} />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {editing !== undefined && (
        <NameModal domain={domain} kind={kind} singular={singular} example={example} option={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />
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
