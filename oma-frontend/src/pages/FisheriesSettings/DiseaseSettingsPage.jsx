import { useCallback, useEffect, useState } from 'react'
import { Bug, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

function DiseaseTypeModal({ diseaseType, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(diseaseType)
  const [name,        setName]        = useState(diseaseType?.name || '')
  const [description, setDescription] = useState(diseaseType?.description || '')
  const [isActive,    setIsActive]    = useState(diseaseType?.is_active ?? true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Disease name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      const payload = { name, description, is_active: isActive }
      if (isEdit) await api.patch(`/fisheries/disease-types/${diseaseType.id}/`, payload)
      else await api.post('/fisheries/disease-types/', payload)
      showToast(`Disease type ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title={isEdit ? 'Edit Disease Type' : 'Add Disease Type'} icon={Bug} onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name *">
          <input className={baseInputClasses} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description (optional)">
          <textarea rows={2} className={`${baseInputClasses} resize-none`} value={description} onChange={e => setDescription(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>{isEdit ? 'Save Changes' : '+ Add Disease Type'}</Button>
        </div>
      </form>
    </ModalShell>
  )
}

function ResponseGuideModal({ diseaseType, guide, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(guide)
  const [recommendedTreatment, setRecommendedTreatment] = useState(guide?.recommended_treatment || '')
  const [notes, setNotes] = useState(guide?.notes || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const payload = { disease_type: diseaseType.id, recommended_treatment: recommendedTreatment, notes }
      if (isEdit) await api.patch(`/fisheries/disease-response-guides/${guide.id}/`, payload)
      else await api.post('/fisheries/disease-response-guides/', payload)
      showToast('Response guide saved.', 'success')
      onSaved(); onClose()
    } catch {
      showToast('Failed to save response guide.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title={`Response Guide — ${diseaseType.name}`} subtitle="Shown as a suggestion when this disease is selected while logging an activity." icon={Bug} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Recommended Treatment (optional)">
          <textarea rows={4} className={`${baseInputClasses} resize-none`} value={recommendedTreatment}
            onChange={e => setRecommendedTreatment(e.target.value)}
            placeholder="Leave blank if there is no established recommendation yet." />
        </FormField>
        <FormField label="Notes (optional)">
          <textarea rows={2} className={`${baseInputClasses} resize-none`} value={notes} onChange={e => setNotes(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Save Guide</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default function DiseaseSettingsPage({ asTab = false }) {
  const { showToast } = useToast()
  const [diseaseTypes, setDiseaseTypes] = useState([])
  const [guides,        setGuides]      = useState([])
  const [isLoading,     setIsLoading]   = useState(true)
  const [error,         setError]       = useState('')
  const [expanded,      setExpanded]    = useState(new Set())
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editingType,   setEditingType]   = useState(null)
  const [deletingType,  setDeletingType]  = useState(null)
  const [guideModalFor, setGuideModalFor] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const [typesRes, guidesRes] = await Promise.all([
        api.get('/fisheries/disease-types/'),
        api.get('/fisheries/disease-response-guides/'),
      ])
      setDiseaseTypes(Array.isArray(typesRes.data) ? typesRes.data : (typesRes.data.results || []))
      setGuides(Array.isArray(guidesRes.data) ? guidesRes.data : (guidesRes.data.results || []))
    } catch {
      setError('Failed to load disease reference data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const guideFor = (diseaseTypeId) => guides.find(g => g.disease_type === diseaseTypeId)

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F0]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[#1B4D2E]" />
            <h2 className="text-[13px] font-semibold text-[#1A2B1A]">Disease Types & Response Guides</h2>
          </div>
          <button type="button" onClick={() => { setEditingType(null); setShowTypeModal(true) }}
            className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#235E38]">
            <Plus size={12} /> Add Disease Type
          </button>
        </div>

        {isLoading ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : diseaseTypes.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm italic text-slate-400">No disease types configured yet.</p>
        ) : (
          <div className="divide-y divide-[#F0F4F0]">
            {diseaseTypes.map(dt => {
              const guide = guideFor(dt.id)
              const isOpen = expanded.has(dt.id)
              return (
                <div key={dt.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <button type="button" className="flex items-center gap-2 text-left" onClick={() => toggle(dt.id)}>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="text-[13px] font-medium text-[#1A2B1A]">{dt.name}</span>
                      <StatusPill tone={dt.is_active ? 'green' : 'slate'}>{dt.is_active ? 'Active' : 'Inactive'}</StatusPill>
                      {!guide?.recommended_treatment && (
                        <span className="text-[11px] italic text-slate-400">No recommended treatment configured</span>
                      )}
                    </button>
                    <span className="flex items-center gap-1">
                      <button type="button" className="text-[#1B4D2E] p-1.5 rounded-lg hover:bg-[#EBF5EE]" onClick={() => { setEditingType(dt); setShowTypeModal(true) }} title="Edit disease type">
                        <Pencil size={14} />
                      </button>
                      <button type="button" className="text-rose-500 p-1.5 rounded-lg hover:bg-rose-50" onClick={() => setDeletingType(dt)} title="Delete disease type">
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="mt-2 ml-6 rounded-lg bg-[#F9FAF9] border border-[#E2E8E2] px-3 py-2">
                      {guide?.recommended_treatment ? (
                        <p className="text-[12px] text-slate-700">{guide.recommended_treatment}</p>
                      ) : (
                        <p className="text-[12px] italic text-slate-500">No recommended treatment configured.</p>
                      )}
                      <button type="button" className="mt-2 text-[11px] font-medium text-[#1B4D2E] hover:underline"
                        onClick={() => setGuideModalFor(dt)}>
                        {guide ? 'Edit response guide' : '+ Add response guide'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showTypeModal && (
        <DiseaseTypeModal diseaseType={editingType} onClose={() => { setShowTypeModal(false); setEditingType(null) }} onSaved={fetchAll} />
      )}

      {guideModalFor && (
        <ResponseGuideModal
          diseaseType={guideModalFor}
          guide={guideFor(guideModalFor.id)}
          onClose={() => setGuideModalFor(null)}
          onSaved={fetchAll}
        />
      )}

      {deletingType && (
        <ConfirmDialog
          title="Delete Disease Type"
          message={`Delete "${deletingType.name}"? Its response guide (if any) will also be removed.`}
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
    <PageLayout title="Disease Settings" subtitle="Manage disease types and their recommended-treatment response guides.">
      {innerContent}
    </PageLayout>
  )
}
