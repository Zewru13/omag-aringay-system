import { useState } from 'react'
import { HeartHandshake } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const todayISO = () => new Date().toISOString().split('T')[0]

// Batch 12: ORGANIZATION citizen's "Report Assistance" form — create AND
// edit, ad-hoc (program=null), following LogGovernmentAssistanceModal's
// field set but much simpler: the member is already picked (passed in as
// `member`, sourced from this org's own member-search endpoint — see
// MyOrgReportingSection), so there's no cross-org farmer/fisherfolk search
// here the way the staff-facing modal has. Attribution
// (attributed_organization/attributed_fisherfolk_organization) is computed
// server-side from the member's own real organization membership, NOT from
// which org submitted this — editing here never touches that field.
export default function CitizenReportAssistanceModal({ domain, member, entry, onClose, onSuccess }) {
  const { showToast } = useToast()
  const isEdit = Boolean(entry)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [form, setForm] = useState({
    assistance_type: entry?.assistance_type || domain.assistanceTypeOptions[0],
    source_agency: entry?.source_agency || '',
    quantity: entry?.quantity || '',
    date_given: entry?.date_given || todayISO(),
    season: entry?.season || (domain.seasonOptions ? domain.seasonOptions[0] : ''),
    remarks: entry?.remarks || '',
  })

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    if (!form.assistance_type || !form.quantity.toString().trim() || !form.date_given) {
      setErrorMessage('Assistance type, quantity, and date are required.')
      return
    }
    setIsSubmitting(true)
    try {
      const year = new Date(form.date_given).getFullYear()
      if (isEdit) {
        await api.patch(domain.detailUrl(entry.id), { ...form, year })
        showToast('Assistance report updated.', 'success')
      } else {
        await api.post(domain.createUrl, {
          ...form,
          [domain.personField]: domain.memberIdOf(member),
          year,
        })
        showToast('Assistance reported.', 'success')
      }
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setErrorMessage(firstError || data?.detail || 'Failed to save.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Assistance Report' : 'Report Assistance'}
      subtitle={isEdit ? undefined : domain.memberLabel(member)}
      icon={HeartHandshake}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Assistance Type" required>
            <select className={baseInputClasses} value={form.assistance_type} onChange={(e) => set('assistance_type', e.target.value)}>
              {domain.assistanceTypeOptions.map((t) => <option key={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Date Given" required>
            <input type="date" max={todayISO()} className={baseInputClasses} value={form.date_given} onChange={(e) => set('date_given', e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Quantity / Amount" required>
            <input type="text" className={baseInputClasses} placeholder="e.g. 2 bags, 1 unit" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </FormField>
          <FormField label="Source Agency">
            <input type="text" className={baseInputClasses} value={form.source_agency} onChange={(e) => set('source_agency', e.target.value)} />
          </FormField>
        </div>
        {domain.seasonOptions ? (
          <FormField label="Season">
            <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
              {domain.seasonOptions.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormField>
        ) : (
          <FormField label="Season">
            <input type="text" className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)} />
          </FormField>
        )}
        <FormField label="Remarks">
          <textarea rows={2} className={baseInputClasses} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </FormField>

        {errorMessage && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            {isEdit ? 'Save Changes' : 'Report Assistance'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
