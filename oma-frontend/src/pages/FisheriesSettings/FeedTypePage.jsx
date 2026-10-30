import { useCallback, useEffect, useState } from 'react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Pencil, Trash2, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { AddRowFooter, DraftActions, DraftInput, DraftSelect, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import { newestFirst } from '../../utils/listOrder.js'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const GROWTH_STAGE_OPTIONS = ['Fry', 'Fingerling', 'Juvenile', 'Adult']

const COLUMNS = [
  { key: 'name',            label: 'FEED TYPE' },
  { key: 'growth_stage_cell', label: 'GROWTH STAGE' },
  { key: 'actions',         label: 'ACTIONS' },
]

// Edit Feed Type. New feed types are added in the table itself (the Add button under it).
function FeedTypeModal({ feedType, onClose, onSaved }) {
  const { showToast } = useToast()
  const [name,        setName]        = useState(feedType.name || '')
  const [description, setDescription] = useState(feedType.description || '')
  const [growthStage, setGrowthStage] = useState(feedType.growth_stage || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Feed type name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      const payload = { name, description, growth_stage: growthStage }
      await api.patch(`/fisheries/feed-types/${feedType.id}/`, payload)
      showToast('Feed type updated.', 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Feed Type"
      subtitle="Generic feed category — not a per-species formulation."
      icon={Wheat}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="feed-type-form" isLoading={isSubmitting}>Save Changes</Button>
        </>
      }
    >
      <form id="feed-type-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name *">
          <input className={baseInputClasses} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description (optional)">
          <textarea rows={2} className={`${baseInputClasses} resize-none`} value={description} onChange={e => setDescription(e.target.value)} />
        </FormField>
        <FormField label="Growth Stage (optional)">
          <select className={baseInputClasses} value={growthStage} onChange={e => setGrowthStage(e.target.value)}>
            <option value="">Any stage</option>
            {GROWTH_STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            Narrows this feed type to a specific growth stage for the automatic feed recommendation. Leave as "Any stage" for a general-purpose feed.
          </p>
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function FeedTypePage({ asTab = false }) {
  const { showToast } = useToast()
  const [feedTypes, setFeedTypes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState('')
  const [editing,   setEditing]   = useState(null)
  const add = useAddRow({ name: '', growth_stage: '' })
  const [deleting,  setDeleting]  = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/fisheries/feed-types/')
      setFeedTypes(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load feed types.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast('Type the feed type name first.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/fisheries/feed-types/', { name, description: '', growth_stage: add.draft.growth_stage })
      showToast('Feed type added.', 'success')
      add.close()
      await fetchAll()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const rows = newestFirst(feedTypes).map(ft => ({
    ...ft,
    growth_stage_cell: ft.growth_stage
      ? <StatusPill tone="slate">{ft.growth_stage}</StatusPill>
      : <span className="text-[12px] text-slate-400">Any stage</span>,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(ft) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(ft), tone: 'rose' },
      ]} />
    ),
  }))
  if (add.isOpen) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} aria-label="New feed type" placeholder="e.g. Starter feed"
        onChange={e => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      growth_stage_cell: (
        <DraftSelect value={add.draft.growth_stage} aria-label="Growth stage" onChange={e => add.change({ growth_stage: e.target.value })}>
          <option value="">Any stage</option>
          {GROWTH_STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </DraftSelect>
      ),
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Feed Types" count={feedTypes.length} markerClass="bg-[#1B4D2E]" />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
        {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label="Add Feed Type" />}
      </div>

      {editing && (
        <FeedTypeModal feedType={editing} onClose={() => setEditing(null)} onSaved={fetchAll} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete Feed Type"
          message={`Delete "${deleting.name}"? This may affect activity logs referencing it.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/fisheries/feed-types/${deleting.id}/`)
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
    <PageLayout title="Feed Type Management" subtitle="Manage feed type reference data used in activity logs.">
      {innerContent}
    </PageLayout>
  )
}
