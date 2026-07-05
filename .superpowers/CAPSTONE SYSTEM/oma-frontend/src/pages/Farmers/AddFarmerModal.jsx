import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'

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

const getMaxBirthdate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return d.toISOString().split('T')[0]
}

function AddFarmerModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [rsbsaError, setRsbsaError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'rsbsa_number') setRsbsaError('')
    if (field === 'birthdate') setBirthdateError(validateAge(value) || '')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setRsbsaError('')
    setFormError('')

    const ageError = validateAge(form.birthdate)
    if (ageError) {
      setBirthdateError(ageError)
      return
    }

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
            {rsbsaError && <p className="mt-1 text-sm font-medium text-red-600">{rsbsaError}</p>}
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
              <p className="mt-1 text-xs text-rose-600">{birthdateError}</p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="contact_number">Contact Number</label>
            <input className={baseInputClasses} id="contact_number" onChange={(e) => updateField('contact_number', e.target.value)} value={form.contact_number} />
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
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">RSBSA Classification</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['is_pwd', 'Person with Disability (PWD)'],
              ['is_4ps_beneficiary', '4Ps Beneficiary'],
              ['is_icc_ip_member', 'ICC/IP Member'],
            ].map(([field, label]) => (
              <label key={field} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-green-600"
                  checked={form[field]}
                  onChange={(e) => updateField(field, e.target.checked)}
                />
                <span className="text-sm text-slate-700">{label}</span>
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

        {formError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">Save Farmer</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default AddFarmerModal
