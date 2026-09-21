import { useState } from 'react'
import { Building2, Pencil, Phone } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'

const labelCls = 'block text-[13px] font-medium text-[#4A5E4A] mb-1.5'

const validateContact = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return 'Contact number must be exactly 11 digits.'
  if (!digits.startsWith('09')) return 'Contact number must start with 09.'
  return ''
}

function splitContactPerson(contactPerson) {
  if (!contactPerson) return { last: '', first: '' }
  const parts = contactPerson.split(', ')
  return { last: parts[0] || '', first: parts[1] || '' }
}

export default function EditOrganizationModal({ organization, type, onClose, onSuccess }) {
  const { showToast } = useToast()
  const { last, first } = splitContactPerson(organization.contact_person)

  const originalForm = {
    name:                 organization.name || '',
    barangay:             organization.barangay || '',
    street_address:       organization.street_address || '',
    date_organized:       organization.date_organized || '',
    date_registered:      organization.date_registered || '',
    registration_number:  organization.registration_number || '',
    registration_agency:  organization.registration_agency || '',
    email_address:        organization.email_address || '',
    contact_person_last:  last,
    contact_person_first: first,
    contact_number:       organization.contact_number || '',
  }

  const [form, setForm] = useState(originalForm)

  const [error,        setError]        = useState('')
  const [formErrors,   setFormErrors]   = useState({})
  const [contactError, setContactError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)

  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm)

  const typeLabel = type === 'farmers' ? "Farmers' Organization" : 'Fisherfolk Organization'

  const set = (field, value) => {
    if (field === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      setForm(f => ({ ...f, contact_number: digits }))
      setContactError(validateContact(digits))
      setFormErrors(e => { const n = { ...e }; delete n.contact_number; return n })
      return
    }
    setForm(f => ({ ...f, [field]: value }))
    setFormErrors(e => { const n = { ...e }; delete n[field]; return n })
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim())   errs.name = 'Required'
    if (!form.barangay)      errs.barangay = 'Required'
    if (!form.contact_person_last.trim() && !form.contact_person_first.trim()) errs.contact_person_last = 'Required'
    if (!form.contact_number.trim()) errs.contact_number = 'Required'
    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr) }
    if (!form.date_organized)             errs.date_organized = 'Required'
    if (!form.date_registered)            errs.date_registered = 'Required'
    if (!form.registration_number.trim()) errs.registration_number = 'Required'
    if (!form.registration_agency)        errs.registration_agency = 'Required'
    if (!form.email_address.trim())       errs.email_address = 'Required'
    if (Object.keys(errs).length > 0 || contactErr) {
      setFormErrors(errs)
      setError('Please fill in all required fields.')
      return false
    }
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
      await api.patch(`/organizations/${type}/${organization.id}/`, {
        name:                form.name,
        barangay:            form.barangay,
        street_address:      form.street_address,
        date_organized:      form.date_organized || null,
        date_registered:     form.date_registered || null,
        registration_number: form.registration_number,
        registration_agency: form.registration_agency,
        email_address:       form.email_address,
        contact_person:      contactPerson,
        contact_number:      form.contact_number,
      })
      showToast(`${typeLabel} updated successfully.`, 'success')
      onSuccess()
    } catch (err) {
      const data = err.response?.data
      setError(data?.detail || data?.name?.[0] || 'Unable to update organization.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell
        title="Edit Organization"
        subtitle={organization.name}
        icon={Pencil}
        onClose={onClose}
        maxWidth="max-w-lg"
        footer={
          <>
            <Button onClick={onClose} type="button" variant="secondary">Cancel</Button>
            <Button isLoading={isSubmitting} disabled={isSubmitting || !hasChanges} type="submit" form="edit-organization-form">Update Organization</Button>
          </>
        }
      >
        <form id="edit-organization-form" className="space-y-4" onSubmit={handleSubmitClick}>
          {/* Organization Name */}
          <div>
            <label className={labelCls}>
              <Building2 size={12} className="inline mr-1 text-[#7A8E7A]" />
              Organization Name <span className="text-rose-500">*</span>
            </label>
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
            <label className={labelCls}>
              Street Address <span className="font-normal text-[#7A8E7A] text-[12px]">(optional)</span>
            </label>
            <input className={baseInputClasses} placeholder="e.g. Purok 3, San Antonio St."
              value={form.street_address} onChange={e => set('street_address', e.target.value)} />
          </div>

          {/* Date Organized + Date Registered */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date Organized <span className="text-rose-500">*</span></label>
              <input type="date" className={`${baseInputClasses}${formErrors.date_organized ? ' border-rose-400' : ''}`} value={form.date_organized}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => set('date_organized', e.target.value)} />
              {formErrors.date_organized && <p className="mt-1 text-[12px] text-rose-600">{formErrors.date_organized}</p>}
            </div>
            <div>
              <label className={labelCls}>Date Registered <span className="text-rose-500">*</span></label>
              <input type="date" className={`${baseInputClasses}${formErrors.date_registered ? ' border-rose-400' : ''}`} value={form.date_registered}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => set('date_registered', e.target.value)} />
              {formErrors.date_registered && <p className="mt-1 text-[12px] text-rose-600">{formErrors.date_registered}</p>}
            </div>
          </div>

          {/* Registration Number */}
          <div>
            <label className={labelCls}>Registration Number <span className="text-rose-500">*</span></label>
            <input className={`${baseInputClasses}${formErrors.registration_number ? ' border-rose-400' : ''}`} placeholder="e.g. CN200626622"
              value={form.registration_number}
              onChange={e => set('registration_number', e.target.value.toUpperCase())} />
            {formErrors.registration_number
              ? <p className="mt-1 text-[12px] text-rose-600">{formErrors.registration_number}</p>
              : (
                <div className="mt-1.5 bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Format: <span className="font-mono text-slate-700">CN200626622</span>
                    <span className="text-slate-400 ml-1">— CN = prefix · 2006 = year · 26622 = unique identifier</span>
                  </p>
                </div>
              )
            }
          </div>

          {/* Registration Agency */}
          <div>
            <label className={labelCls}>Registration Agency <span className="text-rose-500">*</span></label>
            <select className={`${baseInputClasses}${formErrors.registration_agency ? ' border-rose-400' : ''}`} value={form.registration_agency}
              onChange={e => set('registration_agency', e.target.value)}>
              <option value="">Select agency</option>
              <option value="SEC">SEC — Securities and Exchange Commission</option>
              <option value="CDA">CDA — Cooperative Development Authority</option>
              <option value="DOLE">DOLE — Department of Labor and Employment</option>
            </select>
            {formErrors.registration_agency && <p className="mt-1 text-[12px] text-rose-600">{formErrors.registration_agency}</p>}
          </div>

          {/* Email Address */}
          <div>
            <label className={labelCls}>Email Address <span className="text-rose-500">*</span></label>
            <input type="email" className={`${baseInputClasses}${formErrors.email_address ? ' border-rose-400' : ''}`} placeholder="e.g. organization@email.com"
              value={form.email_address} onChange={e => set('email_address', e.target.value)} />
            {formErrors.email_address && <p className="mt-1 text-[12px] text-rose-600">{formErrors.email_address}</p>}
          </div>

          {/* Contact Person */}
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
            <label className={labelCls}>
              <Phone size={12} className="inline mr-1 text-[#7A8E7A]" />
              Contact Number <span className="text-rose-500">*</span>
            </label>
            <input className={baseInputClasses} required type="tel" inputMode="numeric" maxLength={11}
              placeholder="09XXXXXXXXX"
              onKeyPress={e => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
              value={form.contact_number} onChange={e => set('contact_number', e.target.value)} />
            {contactError && <p className="mt-1 text-[12px] text-rose-600">{contactError}</p>}
          </div>

          <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12px] text-[#7A8E7A]">
            Officers are managed from the organization's detail page, not here.
          </p>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
              {error}
            </p>
          )}

        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Action"
          message={`Save changes to "${form.name}"?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
