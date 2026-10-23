import { useState } from 'react'
import { MapPinned } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import BARANGAYS from '../../constants/barangays.js'
import Button from '../../components/UI/Button.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import IdNumberInput from '../../components/UI/IdNumberInput.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SegmentedIdInput from '../../components/UI/SegmentedIdInput.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { RSBSA_GROUPS } from '../../utils/idNumbers.js'
import {
  CROPPING_SCHEDULE_OPTIONS, FARM_TYPE_OPTIONS, LAND_OWNERSHIP_OPTIONS, PARCEL_NUMBER_PARTS, TAX_DECLARATION_DIGITS, TAX_DECLARATION_GROUPS,
  editPayload, editProblem, editServerErrors, isTenure, parcelSkipsSchedule, parcelToForm, toggleClassification,
} from './parcelRows.js'
import useParcelClassifications from './useParcelClassifications.js'

// Edit Parcel (farmer profile > a parcel's Edit button): change the details of one parcel that already exists. Its crops and
// machinery are not edited here. The server refuses an area or cropping schedule that no longer holds the crops declared on the
// parcel or the plantings growing on it, and says why under the field.
function EditParcelModal({ parcel, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [form, setForm] = useState(() => parcelToForm(parcel))
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const classifications = useParcelClassifications()
  // The classifications set up in Classification Settings, plus any the parcel already carries (so editing never loses one).
  const offered = [...new Set([...(classifications || []).map((c) => c.name), ...form.classifications])]
  const skipSchedule = parcelSkipsSchedule(parcel)
  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined, general: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const problem = editProblem(form)
    if (problem) {
      setErrors({ general: `${problem.charAt(0).toUpperCase()}${problem.slice(1)}.` })
      return
    }
    setIsSubmitting(true)
    try {
      await api.patch(`/farmers/parcels/${parcel.id}/`, editPayload(form, parcel))
      showToast('Farm parcel updated successfully.', 'success')
      onSuccess?.()
      onClose()
    } catch (error) {
      const found = editServerErrors(error.response?.data)
      setErrors(Object.keys(found).length ? found : { general: 'Unable to save the parcel. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Farm Parcel"
      subtitle={parcel.parcel_number ? `Parcel ${parcel.parcel_number}` : `Parcel #${parcel.id}`}
      icon={MapPinned}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={(
        <>
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} disabled={isSubmitting} type="submit" form="edit-parcel-form" variant="primary">Save Changes</Button>
        </>
      )}
    >
      <form id="edit-parcel-form" onSubmit={submit} className="space-y-4" noValidate>
        {errors.general && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{errors.general}</p>}

        <FormField label="Parcel number" error={errors.parcel_number}>
          <SegmentedIdInput parts={PARCEL_NUMBER_PARTS} value={form.parcel_number} onChange={(v) => set('parcel_number', v)} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Barangay" required error={errors.barangay}>
            <select className={baseInputClasses} value={form.barangay} onChange={(e) => set('barangay', e.target.value)}>
              <option value="" disabled>Select…</option>
              {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </FormField>
          <FormField label="Area (ha)" required error={errors.area_hectares}>
            <DecimalInput decimals={2} className={baseInputClasses} placeholder="0.00" value={form.area_hectares} onChange={(v) => set('area_hectares', v)} />
          </FormField>
          <FormField label="Land ownership" required error={errors.land_ownership}>
            <select className={baseInputClasses} value={form.land_ownership} onChange={(e) => set('land_ownership', e.target.value)}>
              {LAND_OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
          <FormField label="Tax declaration number" error={errors.tax_declaration_number}>
            <IdNumberInput groups={TAX_DECLARATION_GROUPS} maxDigits={TAX_DECLARATION_DIGITS} value={form.tax_declaration_number}
              placeholder="01-002-00005-2023-0142" onChange={(v) => set('tax_declaration_number', v)} />
          </FormField>
        </div>

        {isTenure(form.land_ownership) && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Land owner name" required error={errors.land_owner_name}>
              <input className={baseInputClasses} value={form.land_owner_name} placeholder="Full name of the land owner" onChange={(e) => set('land_owner_name', e.target.value)} />
            </FormField>
            <FormField label="Land owner RSBSA number" error={errors.land_owner_rsbsa_number}>
              <IdNumberInput groups={RSBSA_GROUPS} value={form.land_owner_rsbsa_number} placeholder="01-33-02-014-058212" onChange={(v) => set('land_owner_rsbsa_number', v)} />
            </FormField>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Farm type" error={errors.farm_type}>
            <select className={baseInputClasses} value={form.farm_type} onChange={(e) => set('farm_type', e.target.value)}>
              <option value="">Select type…</option>
              {FARM_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
          <FormField label="Cropping schedule" error={errors.cropping_schedule}>
            <select className={`${baseInputClasses} disabled:bg-[#F5F7F5]`} value={skipSchedule ? '' : form.cropping_schedule} disabled={skipSchedule}
              title={skipSchedule ? 'Not applicable: the main crop is a perennial (tree) crop' : undefined}
              onChange={(e) => set('cropping_schedule', e.target.value)}>
              <option value="">{skipSchedule ? 'Not applicable' : 'Select schedule…'}</option>
              {CROPPING_SCHEDULE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-[#4A5E4A]">Classifications <span className="text-xs font-normal text-slate-400">(optional)</span></p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {offered.map((name) => (
              <label key={name} className="flex min-h-[36px] cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={form.classifications.includes(name)}
                  onChange={(e) => set('classifications', toggleClassification(form.classifications, name, e.target.checked))} />
                <span className="text-[13px] text-[#1A2B1A]">{name}</span>
              </label>
            ))}
            {offered.length === 0 && <p className="text-[12px] text-[#7A8E7A]">None set up. An Admin can add them in Classification Settings.</p>}
          </div>
          {errors.classifications && <p className="mt-1 text-[12px] text-rose-600">{errors.classifications}</p>}
        </div>
      </form>
    </ModalShell>
  )
}

export default EditParcelModal
