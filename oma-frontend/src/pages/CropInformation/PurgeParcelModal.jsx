import { useState } from 'react'
import { Archive } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import { PURGE_NOTE_MAX, PURGE_REASONS, parcelLabel, purgePayload, purgeProblem, purgeServerMessage } from './parcelRecords.js'

// Purge Parcel (Crop Records > a parcel's ⋮ menu): the parcel was sold or transferred to someone else, so it leaves Crop Records
// and Crop Monitoring and moves to the Purged Parcels table. The server refuses while a crop is still growing on it.
export default function PurgeParcelModal({ parcel, onClose, onDone }) {
  const { showToast } = useToast()
  const today = todayISO()
  const [form, setForm] = useState({ reason: '', date: today, note: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const title = parcelLabel(parcel)
  const set = (field, value) => { setForm((f) => ({ ...f, [field]: value })); setError('') }

  const submit = async (event) => {
    event.preventDefault()
    const problem = purgeProblem(form, today)
    if (problem) { setError(problem); return }
    setIsSubmitting(true)
    try {
      await api.post(`/farmers/parcels/${parcel.id}/purge/`, purgePayload(form))
      showToast(`Parcel ${title} was purged.`, 'success')
      onDone()
    } catch (err) {
      setError(purgeServerMessage(err.response?.data))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Purge Parcel"
      subtitle={`${title} · ${parcel.farmer_name} · ${Number(parcel.area_hectares).toFixed(2)} ha`}
      icon={Archive}
      iconBg="bg-rose-100"
      iconColor="text-rose-600"
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={(
        <>
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} disabled={isSubmitting || !form.reason} type="submit" form="purge-parcel-form" variant="danger">Purge Parcel</Button>
        </>
      )}
    >
      <form id="purge-parcel-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          Purge a parcel only when it has been <span className="font-semibold">sold or transferred</span> to someone else. It leaves Crop Records and
          Crop Monitoring and moves to the Purged Parcels table. A parcel with crops still growing cannot be purged.
        </p>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-[#4A5E4A]">Reason <span className="ml-1 text-rose-500">*</span></legend>
          <div className="space-y-1">
            {PURGE_REASONS.map((r) => (
              <label key={r.value} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg border border-[#E2E8E2] px-3 text-[13px] text-[#1A2B1A] has-[:checked]:border-[#1B4D2E] has-[:checked]:bg-[#EBF5EE]">
                <input type="radio" name="purge-reason" className="h-4 w-4 accent-[#1B4D2E]" checked={form.reason === r.value} onChange={() => set('reason', r.value)} />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <FormField label="Date it was sold or transferred">
          <input type="date" className={baseInputClasses} value={form.date} max={today} onChange={(e) => set('date', e.target.value)} />
        </FormField>

        <FormField label="Note">
          <textarea rows={3} maxLength={PURGE_NOTE_MAX} className={`${baseInputClasses} h-auto resize-none py-2`} value={form.note}
            placeholder="e.g. Sold to the neighbouring farmer, deed of sale on file" onChange={(e) => set('note', e.target.value)} />
        </FormField>
      </form>
    </ModalShell>
  )
}
