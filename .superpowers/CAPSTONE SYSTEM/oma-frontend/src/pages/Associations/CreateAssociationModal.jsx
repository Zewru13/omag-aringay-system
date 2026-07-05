import { useState } from 'react'
import { Building2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'

const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

const initialForm = {
  type: 'farmers',
  name: '',
  barangay: '',
  street_address: '',
  registration_number: '',
  date_established: '',
  contact_person_last: '',
  contact_person_first: '',
  contact_number: '',
  dole_registration_number: '',
  bir_number: '',
}

function CreateAssociationModal({ type: initialType, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({ ...initialForm, type: initialType || 'farmers' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const assocType = form.type
  const typeLabel = assocType === 'farmers' ? "Farmers' Association" : 'Fisherfolk Association'

  const validate = () => {
    if (!form.name.trim()) { setError('Association name is required.'); return false }
    if (!form.barangay)    { setError('Barangay is required.'); return false }
    if (!form.contact_person_last.trim() && !form.contact_person_first.trim()) {
      setError('Contact person name is required.'); return false
    }
    if (!form.contact_number.trim()) { setError('Contact number is required.'); return false }
    return true
  }

  const handleSubmitClick = (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      const contactPerson = [form.contact_person_last, form.contact_person_first]
        .filter(Boolean).join(', ')
      const payload = {
        name: form.name,
        barangay: form.barangay,
        street_address: form.street_address,
        contact_person: contactPerson,
        contact_number: form.contact_number,
      }
      if (form.registration_number) payload.registration_number = form.registration_number
      if (form.date_established)    payload.date_established    = form.date_established
      if (assocType === 'farmers') {
        if (form.dole_registration_number) payload.dole_registration_number = form.dole_registration_number
        if (form.bir_number)               payload.bir_number               = form.bir_number
      }
      await api.post(`/associations/${assocType}/`, payload)
      showToast(`${typeLabel} created successfully.`, 'success')
      onSuccess()
    } catch (err) {
      const data = err.response?.data
      setError(data?.detail || data?.name?.[0] || 'Unable to create association. Please check the form.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell
        title="Create Association"
        subtitle="Fill in the association's details"
        icon={Building2}
        onClose={onClose}
        maxWidth="max-w-2xl"
      >
        <form className="space-y-5" onSubmit={handleSubmitClick}>
          {/* Association Type — dropdown */}
          <div>
            <label className={labelCls}>Association Type <span className="text-rose-500">*</span></label>
            <select
              className={baseInputClasses}
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            >
              <option value="farmers">Farmers' Association</option>
              <option value="fisherfolk">Fisherfolk Association</option>
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Name */}
            <div className="md:col-span-2">
              <label className={labelCls}>Association Name <span className="text-rose-500">*</span></label>
              <input
                className={baseInputClasses}
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            {/* Barangay */}
            <BarangaySelect
              label="Barangay"
              value={form.barangay}
              onChange={(e) => set('barangay', e.target.value)}
              required
            />

            {/* Street Address */}
            <div>
              <label className={labelCls}>Street Address <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                className={baseInputClasses}
                placeholder="e.g. Purok 3, San Antonio St."
                value={form.street_address}
                onChange={(e) => set('street_address', e.target.value)}
              />
            </div>

            {/* Contact Person — Last & First */}
            <div>
              <label className={labelCls}>Contact Person — Last Name <span className="text-rose-500">*</span></label>
              <input
                className={baseInputClasses}
                value={form.contact_person_last}
                onChange={(e) => set('contact_person_last', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Contact Person — First Name</label>
              <input
                className={baseInputClasses}
                value={form.contact_person_first}
                onChange={(e) => set('contact_person_first', e.target.value)}
              />
            </div>

            {/* Contact Number */}
            <div>
              <label className={labelCls}>Contact Number <span className="text-rose-500">*</span></label>
              <input
                className={baseInputClasses}
                required
                value={form.contact_number}
                onChange={(e) => set('contact_number', e.target.value)}
              />
            </div>

            {/* DOLE & BIR (farmers only) */}
            {assocType === 'farmers' && (
              <>
                <div>
                  <label className={labelCls}>DOLE Registration No. <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    className={baseInputClasses}
                    value={form.dole_registration_number}
                    onChange={(e) => set('dole_registration_number', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>BIR Number <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    className={baseInputClasses}
                    value={form.bir_number}
                    onChange={(e) => set('bir_number', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Registration Number & Date Established */}
            <div>
              <label className={labelCls}>Registration Number <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                className={baseInputClasses}
                value={form.registration_number}
                onChange={(e) => set('registration_number', e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls}>Date Established <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                className={baseInputClasses}
                type="date"
                value={form.date_established}
                onChange={(e) => set('date_established', e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
            <Button isLoading={isSubmitting} type="submit">Create Association</Button>
          </div>
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Create Association"
          message={`Create new ${typeLabel} "${form.name}"?`}
          confirmLabel="Create"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

export default CreateAssociationModal
