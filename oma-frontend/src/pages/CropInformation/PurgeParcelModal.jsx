import { useState } from 'react'
import { Archive } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import { OTHER_REASON, PURGE_NOTE_MAX, PURGE_OTHER_MAX, PURGE_REASONS, parcelLabel, purgePayload, purgeProblem, purgeServerMessage } from './parcelRecords.js'

// Purge Parcel (Crop Records > a parcel's ⋮ menu): the parcel was sold, transferred or otherwise left the farmer's records, so it leaves
// Crop Records and Crop Monitoring and moves to the Purged Parcels table. The reason is a dropdown; Others asks for it in words.
// The server refuses while a crop is still growing on it.
export default function PurgeParcelModal({ parcel, onClose, onDone }) {
  const { showToast } = useToast()
  const today = todayISO()
  const [form, setForm] = useState({ reason: '', reasonOther: '', date: today, note: '' })
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
          <Button isLoading={isSubmitting} disabled={isSubmitting || !form.reason || (form.reason === OTHER_REASON && !form.reasonOther.trim())} type="submit" form="purge-parcel-form" variant="danger">Purge Parcel</Button>
        </>
      )}
    >
      <form id="purge-parcel-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          Purge a parcel only when it has been <span className="font-semibold">sold, transferred or otherwise left</span> the farmer&apos;s records. It
          leaves Crop Records and Crop Monitoring and moves to the Purged Parcels table. A parcel with crops still growing cannot be purged.
        </p>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}

        <FormField label="Reason" required>
          <select className={baseInputClasses} value={form.reason} onChange={(e) => set('reason', e.target.value)}>
            <option value="">Select a reason</option>
            {PURGE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </FormField>

        {form.reason === OTHER_REASON && (
          <FormField label="Type the reason" required>
            <input type="text" autoFocus maxLength={PURGE_OTHER_MAX} className={baseInputClasses} value={form.reasonOther}
              placeholder="e.g. Taken by the road project" onChange={(e) => set('reasonOther', e.target.value)} />
          </FormField>
        )}

        <FormField label="Date of occurrence">
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
