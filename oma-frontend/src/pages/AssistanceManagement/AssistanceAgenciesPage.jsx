import { useEffect, useState } from 'react'
import { HeartHandshake, Pencil, Trash2 } from 'lucide-react'
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
import AssistanceTypeUnitsCard from './AssistanceTypeUnitsCard.jsx'
import { resetAssistanceAgencies } from './useAssistanceAgencies.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Assistance Settings: the list of source agencies that every assistance form offers in its Source Agency dropdown. Renaming or
// deleting one never changes assistance that was already recorded (records keep the name they were saved with). New agencies are added in
// the table itself (the Add button under it); Edit renames one.

const COLUMNS = [
  { key: 'name', label: 'AGENCY' },
  { key: 'actions', label: 'ACTIONS' },
]

function AgencyModal({ agency, onClose, onSaved }) {
  const { showToast } = useToast()
  const original = { name: agency.name }
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`assistance-agency-edit:${agency?.id}`)
  const [form, setForm] = useDraftField(draft, 'form', original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = JSON.stringify(form) !== JSON.stringify(original)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Enter the agency name.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/interventions/agencies/${agency.id}/`, form)
      showToast('Agency updated.', 'success')
      draft.clear()
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save the agency.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Agency"
      subtitle={`Update ${agency.name}`}
      icon={HeartHandshake}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assistance-agency-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            Update Agency
          </Button>
        </>
      )}
    >
      <form id="assistance-agency-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <SettingsFields title="Agency">
        <SettingsField label="Agency Name" required>
          <input className={baseInputClasses} value={form.name} autoFocus placeholder="e.g. PCIC"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

export default function AssistanceAgenciesPage() {
  const { showToast } = useToast()
  const [agencies, setAgencies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const add = useAddRow({ name: '' }, 'assistance-agency')
  const [deleting, setDeleting] = useState(null)

  // `version` bumps after a save or delete, which loads the list again.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    api.get('/interventions/agencies/')
      .then((r) => { if (alive) { setAgencies(Array.isArray(r.data) ? r.data : (r.data.results || [])); setError('') } })
      .catch(() => { if (alive) setError('Failed to load the agencies.') })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [version])

  const refresh = () => { resetAssistanceAgencies(); setVersion((v) => v + 1) }

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast('Type the agency name first.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/interventions/agencies/', { name })
      showToast('Agency added.', 'success')
      add.close(); refresh()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save the agency.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const rows = newestFirst(agencies).map((a) => ({
    ...a,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(a) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(a), tone: 'rose' },
      ]} />
    ),
  }))
  if (add.isOpen) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} aria-label="New agency" placeholder="e.g. PCIC"
        onChange={(e) => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  return (
    <PageLayout title="Assistance Settings" subtitle="The source agencies and the units offered when assistance is recorded or distributed.">
      <div className="space-y-4">
        {error && <ErrorMessage message={error} />}
        <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader title="Source Agencies" count={agencies.length} />
          <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
          {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label="Add Agency" />}
        </div>
        <AssistanceTypeUnitsCard />
      </div>

      {editing && <AgencyModal agency={editing} onClose={() => setEditing(null)} onSaved={refresh} />}

      {deleting && (
        <ConfirmDialog
          title="Delete Agency"
          message={`Delete "${deleting.name}" from the list? Assistance already recorded with it keeps the name.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/interventions/agencies/${deleting.id}/`)
              showToast(`"${deleting.name}" deleted.`, 'success')
              setDeleting(null); refresh()
            } catch {
              showToast('Failed to delete the agency.', 'error')
              setDeleting(null)
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageLayout>
  )
}
