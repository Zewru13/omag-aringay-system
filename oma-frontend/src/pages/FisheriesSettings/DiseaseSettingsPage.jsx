import { useCallback, useEffect, useState } from 'react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Bug, Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { AddRowFooter, DraftActions, DraftInput, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import { newestFirst } from '../../utils/listOrder.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { SettingsFields, SettingsField } from '../../components/UI/SettingsFormTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Edit Disease Type. New disease types are added in the list itself (the Add button under it).
function DiseaseTypeModal({ diseaseType, onClose, onSaved }) {
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`disease-type-edit:${diseaseType?.id}`)
  const [name,        setName]        = useDraftField(draft, 'name', diseaseType.name || '')
  const [description, setDescription] = useDraftField(draft, 'description', diseaseType.description || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Disease name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      const payload = { name, description }
      await api.patch(`/fisheries/disease-types/${diseaseType.id}/`, payload)
      showToast('Disease type updated.', 'success')
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
      title="Edit Disease Type"
      icon={Bug}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="disease-type-form" isLoading={isSubmitting}>Save Changes</Button>
        </>
      }
    >
      <form id="disease-type-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <SettingsFields title="Disease Type">
        <SettingsField label="Name *">
          <input className={baseInputClasses} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </SettingsField>
        <SettingsField label="Description (optional)">
          <textarea rows={2} className={`${baseInputClasses} resize-none`} value={description} onChange={e => setDescription(e.target.value)} />
        </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

export default function DiseaseSettingsPage({ asTab = false }) {
  const { showToast } = useToast()
  const [diseaseTypes, setDiseaseTypes] = useState([])
  const [isLoading,     setIsLoading]   = useState(true)
  const [error,         setError]       = useState('')
  const [editingType,   setEditingType]   = useState(null)
  const add = useAddRow({ name: '' }, 'disease-type')
  const [deletingType,  setDeletingType]  = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const typesRes = await api.get('/fisheries/disease-types/')
      setDiseaseTypes(Array.isArray(typesRes.data) ? typesRes.data : (typesRes.data.results || []))
    } catch {
      setError('Failed to load disease reference data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast('Type the disease name first.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/fisheries/disease-types/', { name, description: '' })
      showToast('Disease type added.', 'success')
      add.close()
      await fetchAll()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Disease Types" count={diseaseTypes.length} markerClass="bg-[#1B4D2E]" />

        {isLoading ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : diseaseTypes.length === 0 && !add.isOpen ? (
          <p className="px-5 py-6 text-center text-sm italic text-slate-400">No disease types configured yet.</p>
        ) : (
          <div className="divide-y divide-[#F0F4F0]">
            {add.isOpen && (
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-[220px] flex-1">
                  <DraftInput value={add.draft.name} aria-label="New disease type" placeholder="e.g. White spot syndrome"
                    onChange={e => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />
                </div>
                <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />
              </div>
            )}
            {newestFirst(diseaseTypes).map(dt => (
              <div key={dt.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-[13px] font-medium text-[#1A2B1A]">{dt.name}</span>
                <RowActions actions={[
                  { key: 'edit', label: 'Edit disease type', icon: Pencil, onClick: () => setEditingType(dt) },
                  { key: 'delete', label: 'Delete disease type', icon: Trash2, onClick: () => setDeletingType(dt), tone: 'rose' },
                ]} />
              </div>
            ))}
          </div>
        )}
        {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label="Add Disease Type" />}
      </div>

      {editingType && (
        <DiseaseTypeModal diseaseType={editingType} onClose={() => setEditingType(null)} onSaved={fetchAll} />
      )}

      {deletingType && (
        <ConfirmDialog
          title="Delete Disease Type"
          message={`Delete "${deletingType.name}"?`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/fisheries/disease-types/${deletingType.id}/`)
              showToast(`"${deletingType.name}" deleted.`, 'success')
              setDeletingType(null); fetchAll()
            } catch {
              showToast('Failed to delete.', 'error')
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
    <PageLayout title="Disease Settings" subtitle="Manage the disease types used in health logs.">
      {innerContent}
    </PageLayout>
  )
}
