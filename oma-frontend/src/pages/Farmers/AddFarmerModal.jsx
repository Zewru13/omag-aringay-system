import { useState, useEffect } from 'react'
import { UserPlus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

const initialForm = {
  prefix: '',
  rsbsa_number: '',
  first_name: '',
  last_name: '',
  middle_name: '',
  gender: 'Male',
  birthdate: '',
  contact_number: '',
  barangay: '',
  civil_status: 'Single',
  highest_education: '',
  philsys_number: '',
  is_pwd: false,
  is_4ps_beneficiary: false,
  is_icc_ip_member: false,
  icc_ip_name: '',
  farmers_association: null,
}

const validateAge = (birthdate) => {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  const today = new Date()
  const age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()
  const exactAge = (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) ? age - 1 : age
  if (exactAge < 10) return 'Must be at least 10 years old to register.'
  return null
}

const formatRsbsa = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
}

const validateRsbsa = (value) => {
  if (!value) return ''
  if (!/^\d{2}-\d{4}-\d{7}$/.test(value)) return 'Format must be DD-DDDD-DDDDDDD (e.g. 01-0301-0000001).'
  return ''
}

const validateContact = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return 'Contact number must be exactly 11 digits.'
  if (!digits.startsWith('09')) return 'Contact number must start with 09.'
  return ''
}

const getMaxBirthdate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return d.toISOString().split('T')[0]
}

function AddFarmerModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [associations, setAssociations] = useState([])
  const [rsbsaError, setRsbsaError] = useState('')
  const [contactError, setContactError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    api.get('/associations/farmers/')
      .then(r => setAssociations(r.data.results || r.data))
      .catch(console.error)
  }, [])

  const updateField = (field, value) => {
    if (field === 'rsbsa_number') {
      const formatted = formatRsbsa(value)
      setForm((current) => ({ ...current, rsbsa_number: formatted }))
      setRsbsaError(validateRsbsa(formatted))
      return
    }
    if (field === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      setForm((current) => ({ ...current, contact_number: digits }))
      setContactError(validateContact(digits))
      return
    }
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'birthdate') setBirthdateError(validateAge(value) || '')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setRsbsaError('')
    setContactError('')
    setFormError('')

    const ageError = validateAge(form.birthdate)
    if (ageError) { setBirthdateError(ageError); return }

    const rsbsaErr = validateRsbsa(form.rsbsa_number)
    if (rsbsaErr) { setRsbsaError(rsbsaErr); return }

    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr); return }

    setIsSubmitting(true)

    try {
      await api.post('/farmers/', form)
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      const rsbsaMessage = data?.rsbsa_number?.[0] || data?.non_field_errors?.[0]
      if (rsbsaMessage) {
        setRsbsaError(rsbsaMessage)
      } else if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
      } else {
        setFormError('Unable to register farmer. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Register Farmer" subtitle="Fill in the farmer's details below" icon={UserPlus} onClose={onClose} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="prefix">Prefix</label>
            <select className={baseInputClasses} id="prefix" onChange={(e) => updateField('prefix', e.target.value)} value={form.prefix}>
              <option value="">(None)</option>
              <option value="Mr.">Mr.</option>
              <option value="Mrs.">Mrs.</option>
              <option value="Ms.">Ms.</option>
              <option value="Engr.">Engr.</option>
              <option value="Dr.">Dr.</option>
              <option value="Hon.">Hon.</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="rsbsa_number">RSBSA Number</label>
            <input className={baseInputClasses} id="rsbsa_number" onChange={(e) => updateField('rsbsa_number', e.target.value)} required value={form.rsbsa_number} />
            {rsbsaError && <p className="mt-1 text-[12px] font-medium text-red-600">{rsbsaError}</p>}
          </div>

          <div>
            <label className={labelCls} htmlFor="first_name">First Name</label>
            <input className={baseInputClasses} id="first_name" onChange={(e) => updateField('first_name', e.target.value)} required value={form.first_name} />
          </div>

          <div>
            <label className={labelCls} htmlFor="last_name">Last Name</label>
            <input className={baseInputClasses} id="last_name" onChange={(e) => updateField('last_name', e.target.value)} required value={form.last_name} />
          </div>

          <div>
            <label className={labelCls} htmlFor="middle_name">Middle Name</label>
            <input className={baseInputClasses} id="middle_name" onChange={(e) => updateField('middle_name', e.target.value)} value={form.middle_name} />
          </div>

          <div>
            <label className={labelCls} htmlFor="gender">Sex</label>
            <select className={baseInputClasses} id="gender" onChange={(e) => updateField('gender', e.target.value)} value={form.gender}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="birthdate">Birthdate</label>
            <input
              className={baseInputClasses}
              id="birthdate"
              max={getMaxBirthdate()}
              onChange={(e) => updateField('birthdate', e.target.value)}
              required
              type="date"
              value={form.birthdate}
            />
            {birthdateError && (
              <p className="mt-1 text-[12px] text-rose-600">{birthdateError}</p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="contact_number">Contact Number</label>
            <input
              className={baseInputClasses}
              id="contact_number"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              placeholder="09XXXXXXXXX"
              onKeyPress={(e) => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
              onChange={(e) => updateField('contact_number', e.target.value)}
              value={form.contact_number}
            />
            {contactError && <p className="mt-1 text-[12px] text-rose-600">{contactError}</p>}
          </div>

          <BarangaySelect
            id="barangay"
            label="Barangay"
            value={form.barangay}
            onChange={(e) => updateField('barangay', e.target.value)}
            required
          />

          <div>
            <label className={labelCls} htmlFor="civil_status">Civil Status</label>
            <select className={baseInputClasses} id="civil_status" onChange={(e) => updateField('civil_status', e.target.value)} value={form.civil_status}>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Separated">Separated</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="highest_education">Highest Education</label>
            <input className={baseInputClasses} id="highest_education" onChange={(e) => updateField('highest_education', e.target.value)} value={form.highest_education} />
          </div>

          <div>
            <label className={labelCls} htmlFor="philsys_number">PhilSys / National ID No.</label>
            <input className={baseInputClasses} id="philsys_number" onChange={(e) => updateField('philsys_number', e.target.value)} value={form.philsys_number} />
          </div>
        </div>

        {/* RSBSA Classification */}
        <div className="rounded-xl border border-[#E2E8E2] bg-[#EBF5EE]/30 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">RSBSA Classification</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['is_pwd', 'Person with Disability (PWD)'],
              ['is_4ps_beneficiary', '4Ps Beneficiary'],
              ['is_icc_ip_member', 'ICC/IP Member'],
            ].map(([field, label]) => (
              <label key={field} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1B4D2E]"
                  checked={form[field]}
                  onChange={(e) => updateField(field, e.target.checked)}
                />
                <span className="text-[13px] text-[#1A2B1A]">{label}</span>
              </label>
            ))}
            {form.is_icc_ip_member && (
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="icc_ip_name">ICC/IP Group Name</label>
                <input className={baseInputClasses} id="icc_ip_name" value={form.icc_ip_name} onChange={(e) => updateField('icc_ip_name', e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* Farmer Association */}
        <div>
          <label className={labelCls}>
            Farmer Association{' '}
            <span className="text-[#7A8E7A] font-normal">(optional)</span>
          </label>
          <select
            className={baseInputClasses}
            value={form.farmers_association || ''}
            onChange={e => updateField('farmers_association', e.target.value || null)}
          >
            <option value="">— Not a member of any association</option>
            {associations.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <p className="text-[12px] text-[#7A8E7A] mt-1">
            Leave blank if the farmer is not part of any association. This can be updated later by editing the farmer profile.
          </p>
        </div>

        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">Save Farmer</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default AddFarmerModal
