import { useState } from 'react'
import { Building2, Phone } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'

const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

const validateContact = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return 'Contact number must be exactly 11 digits.'
  if (!digits.startsWith('09')) return 'Contact number must start with 09.'
  return ''
}

const initialForm = {
  name: '',
  barangay: '',
  street_address: '',
  contact_person_last: '',
  contact_person_first: '',
  contact_number: '',
}

export default function CreateAssociationModal({ type: assocType = 'farmers', onClose, onSuccess }) {
  const { showToast } = useToast()
  const [form,         setForm]         = useState(initialForm)
  const [error,        setError]        = useState('')
  const [contactError, setContactError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)

  const typeLabel = assocType === 'farmers' ? "Farmers' Association" : 'Fisherfolk Association'

  const set = (field, value) => {
    if (field === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      setForm(f => ({ ...f, contact_number: digits }))
      setContactError(validateContact(digits))
      return
    }
    setForm(f => ({ ...f, [field]: value }))
  }

  const validate = () => {
    if (!form.name.trim())              { setError('Association name is required.'); return false }
    if (!form.barangay)                 { setError('Barangay is required.'); return false }
    if (!form.contact_person_last.trim() && !form.contact_person_first.trim()) {
      setError('Contact person name is required.'); return false
    }
    if (!form.contact_number.trim())    { setError('Contact number is required.'); return false }
    const contactErr = validateContact(form.contact_number)
    if (contactErr)                     { setContactError(contactErr); return false }
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
      await api.post(`/associations/${assocType}/`, {
        name:           form.name,
        barangay:       form.barangay,
        street_address: form.street_address,
        contact_person: contactPerson,
        contact_number: form.contact_number,
      })
      showToast(`${typeLabel} created successfully.`, 'success')
      onSuccess()
    } catch (err) {
      const data = err.response?.data
      setError(data?.detail || data?.name?.[0] || 'Unable to create association.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell
        title="Add New Association"
        subtitle="Create a new farmer association in Aringay."
        icon={Building2}
        onClose={onClose}
        maxWidth="max-w-lg"
      >
        <form className="space-y-4" onSubmit={handleSubmitClick}>
          {/* Association Name */}
          <div>
            <label className={labelCls}><Building2 size={12} className="inline mr-1 text-slate-500" />Association Name <span className="text-rose-500">*</span></label>
            <input className={baseInputClasses} required value={form.name}
              onChange={e => set('name', e.target.value)} />
          </div>

          {/* Barangay */}
          <BarangaySelect
            label="Barangay"
            value={form.barangay}
            onChange={e => set('barangay', e.target.value)}
            required
          />

          {/* Street Address */}
          <div>
            <label className={labelCls}>Street Address <span className="font-normal text-slate-400">(optional)</span></label>
            <input className={baseInputClasses} placeholder="e.g. Purok 3, San Antonio St."
              value={form.street_address} onChange={e => set('street_address', e.target.value)} />
          </div>

          {/* Contact Person — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Contact Person — Last Name <span className="text-rose-500">*</span></label>
              <input className={baseInputClasses} value={form.contact_person_last}
                onChange={e => set('contact_person_last', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>First Name</label>
              <input className={baseInputClasses} value={form.contact_person_first}
                onChange={e => set('contact_person_first', e.target.value)} />
            </div>
          </div>

          {/* Contact Number */}
          <div>
            <label className={labelCls}><Phone size={12} className="inline mr-1 text-slate-500" />Contact Number <span className="text-rose-500">*</span></label>
            <input className={baseInputClasses} required type="tel" inputMode="numeric" maxLength={11}
              placeholder="09XXXXXXXXX"
              onKeyPress={e => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
              value={form.contact_number} onChange={e => set('contact_number', e.target.value)} />
            {contactError && <p className="mt-1 text-xs text-rose-600">{contactError}</p>}
          </div>

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
            <Button isLoading={isSubmitting} type="submit">+ Add Association</Button>
          </div>
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Action"
          message={`Add new ${typeLabel} "${form.name}"?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
