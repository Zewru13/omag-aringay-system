import { useCallback, useEffect, useMemo, useState } from 'react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Check, ChevronLeft, ChevronRight, Droplets, Pencil, Plus, Trash2, X } from 'lucide-react'
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
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'

const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'name',        label: 'SEED SOURCE NAME' },
  { key: 'actions',     label: 'ACTIONS' },
]

// Renaming one seed source. New ones are added in the table itself (the Add button under it).
function SeedSourceModal({ source, onClose, onSaved }) {
  const { showToast } = useToast()
  const original = { name: source.name, is_active: source.is_active ?? true }
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`seed-source-edit:${source?.id}`)
  const [form, setForm] = useDraftField(draft, 'form', original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = JSON.stringify(form) !== JSON.stringify(original)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Seed source name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/production/seed-sources/${source.id}/`, form)
      showToast('Seed source updated.', 'success')
      draft.clear()
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Seed Source"
      subtitle={`Update details for ${source.name}`}
      icon={Droplets}
      onClose={onClose}
      maxWidth="max-w-xs"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="seed-source-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            Update Source
          </Button>
        </>
      }
    >
      <form id="seed-source-form" onSubmit={handleSubmit} className="space-y-4">
        <DraftBanner draft={draft} />
        <FormField label="Seed Source Name" required>
          <input
            className={baseInputClasses}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            placeholder="e.g. DA, Local Market"
          />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function SeedSourcePage({ asTab = false }) {
  const { showToast } = useToast()
  const [sources,      setSources]      = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [editSource,   setEditSource]   = useState(null)
  // The name typed in the new row is kept while the page is left: it is still there, in an open row, when the page is opened again.
  const rowDraft = useDraftForm('seed-source-row')
  const [draft,        setDraft]        = useDraftField(rowDraft, 'row', null)   // the name typed in the new row, or null when there is no new row
  const [isAdding,     setIsAdding]     = useState(false)
  const [deletingSource, setDeletingSource] = useState(null)
  const [page,         setPage]         = useState(1)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/production/seed-sources/')
      setSources(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load seed sources.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // The table also draws a phone layout, so the new row's box exists twice: focus the one that is on screen.
  const draftOpen = draft !== null
  useEffect(() => {
    if (!draftOpen) return
    const visible = [...document.querySelectorAll('input[data-seed-draft]')].find((el) => el.offsetParent !== null)
    if (visible) visible.focus()
  }, [draftOpen])

  const totalPages = Math.max(1, Math.ceil(sources.length / PAGE_SIZE))
  const paginated = useMemo(
    () => sources.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sources, page],
  )

  const saveDraft = async () => {
    const name = (draft || '').trim()
    if (!name) { showToast('Type the seed source name first.', 'error'); return }
    setIsAdding(true)
    try {
      await api.post('/production/seed-sources/', { name, is_active: true })
      showToast('Seed source added.', 'success')
      setDraft(null)
      await fetchAll()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsAdding(false)
    }
  }

  const rows = paginated.map(s => ({
    ...s,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditSource(s) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingSource(s), tone: 'rose' },
      ]} />
    ),
  }))

  // The new row sits at the end of the table, on the last page.
  if (draft !== null && page === totalPages) {
    rows.push({
      id: 'new',
      name: (
        <input
          className={baseInputClasses}
          value={draft}
          data-seed-draft
          aria-label="New seed source name"
          placeholder="e.g. DA, Local Market"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); saveDraft() }
            if (e.key === 'Escape') setDraft(null)
          }}
        />
      ),
      actions: (
        <div className="flex items-center gap-2">
          <Button type="button" onClick={saveDraft} isLoading={isAdding} disabled={isAdding}><Check size={14} aria-hidden="true" /> Save</Button>
          <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={isAdding}><X size={14} aria-hidden="true" /> Cancel</Button>
        </div>
      ),
    })
  }

  const startRow = () => {
    setPage(totalPages)   // the new row goes at the end, on the last page
    setDraft('')
  }

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Seed Sources" count={sources.length} />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
        {!isLoading && (
          <div className="border-t border-[#E2E8E2] px-4 py-3">
            <button
              type="button"
              onClick={startRow}
              disabled={draft !== null}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3.5 text-[13px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} aria-hidden="true" /> Add Seed Source
            </button>
          </div>
        )}
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#7A8E7A]">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, sources.length)} of {sources.length}
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

      {editSource && (
        <SeedSourceModal
          source={editSource}
          onClose={() => setEditSource(null)}
          onSaved={fetchAll}
        />
      )}

      {deletingSource && (
        <ConfirmDialog
          title="Delete Seed Source"
          message={`Delete "${deletingSource.name}"? This will remove it from the Add Crop dropdown.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/production/seed-sources/${deletingSource.id}/`)
              showToast(`"${deletingSource.name}" deleted.`, 'success')
              setDeletingSource(null); fetchAll()
            } catch {
              showToast('Failed to delete seed source.', 'error')
              setDeletingSource(null)
            }
          }}
          onCancel={() => setDeletingSource(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Seed Source Management"
      subtitle="Manage seed source options used across the system."
    >
      {innerContent}
    </PageLayout>
  )
}
