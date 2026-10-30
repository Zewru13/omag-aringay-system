import { useCallback, useEffect, useState } from 'react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Fish, Pencil, Trash2 } from 'lucide-react'
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

// Fingerling sources (Fisheries Settings): where fingerlings come from (BFAR, a private hatchery, own production, ...). This is the
// list Start Production Cycle offers. A stocking keeps the NAME it was saved with, so renaming or deleting a source here never
// changes records that already used it. New sources are added in the table itself (the Add row button under it); Edit renames one.

const COLUMNS = [
  { key: 'name',    label: 'FINGERLING SOURCE' },
  { key: 'actions', label: 'ACTIONS' },
]

function SourceModal({ source, onClose, onSaved }) {
  const { showToast } = useToast()
  const originalName = source.name
  const [name, setName] = useState(originalName)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = name.trim() !== originalName

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Fingerling source name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/fisheries/fingerling-sources/${source.id}/`, { name })
      showToast('Fingerling source updated.', 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Fingerling Source"
      subtitle={`Update ${source.name}`}
      icon={Fish}
      onClose={onClose}
      maxWidth="max-w-xs"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="fingerling-source-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            Update Source
          </Button>
        </>
      }
    >
      <form id="fingerling-source-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Fingerling Source" required>
          <input
            className={baseInputClasses}
            value={name}
            maxLength={100}
            onChange={e => setName(e.target.value)}
            autoFocus
            placeholder="e.g. BFAR Regional Hatchery"
          />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function FingerlingSourcePage({ asTab = false }) {
  const { showToast } = useToast()
  const [sources,   setSources]   = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState('')
  const [editing,   setEditing]   = useState(null)
  const add = useAddRow({ name: '' })
  const [deleting,  setDeleting]  = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/fisheries/fingerling-sources/')
      setSources(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load fingerling sources.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast('Type the fingerling source name first.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/fisheries/fingerling-sources/', { name })
      showToast('Fingerling source added.', 'success')
      add.close()
      await fetchAll()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const rows = newestFirst(sources).map(s => ({
    ...s,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(s) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(s), tone: 'rose' },
      ]} />
    ),
  }))
  if (add.isOpen) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} maxLength={100} aria-label="New fingerling source" placeholder="e.g. BFAR Regional Hatchery"
        onChange={e => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Fingerling Sources" count={sources.length} markerClass="bg-[#1B4D2E]" />
        <DataTable
          bare columns={COLUMNS} data={rows} isLoading={isLoading}
          emptyState={<p className="px-4 py-8 text-center text-sm text-slate-500">No fingerling sources yet. Add one so it can be chosen when a production cycle starts.</p>}
        />
        {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} />}
      </div>

      {editing && (
        <SourceModal
          source={editing}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete Fingerling Source"
          message={`Delete "${deleting.name}"? Production cycles that already used it keep it; it just stops being offered for new ones.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/fisheries/fingerling-sources/${deleting.id}/`)
              showToast(`"${deleting.name}" deleted.`, 'success')
              setDeleting(null); fetchAll()
            } catch {
              showToast('Failed to delete.', 'error')
              setDeleting(null)
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Fingerling Source Management"
      subtitle="Manage where fingerlings come from, as offered when a production cycle starts."
    >
      {innerContent}
    </PageLayout>
  )
}
