import { useState, useEffect } from 'react'
import { UserCog } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { getPrefixOptions, isPrefixValidForGender } from '../../utils/prefixOptions.js'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

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

const computeAge = (birthdate) => {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  const today = new Date()
  const age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  return (m < 0 || (m === 0 && today.getDate() < birth.getDate())) ? age - 1 : age
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

function EditFarmerModal({ farmer, onClose, onSuccess }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [associations, setAssociations] = useState([])

  const original = {
    prefix: farmer.prefix || '',
    first_name: farmer.first_name || '',
    last_name: farmer.last_name || '',
    middle_name: farmer.middle_name || '',
    gender: farmer.gender || 'Male',
    birthdate: farmer.birthdate || '',
    contact_number: farmer.contact_number || '',
    barangay: farmer.barangay || '',
    civil_status: farmer.civil_status || 'Single',
    highest_education: farmer.highest_education || '',
    is_active: farmer.is_active,
    philsys_number: farmer.philsys_number || '',
    is_pwd: farmer.is_pwd || false,
    is_4ps_beneficiary: farmer.is_4ps_beneficiary || false,
    is_icc_ip_member: farmer.is_icc_ip_member || false,
    icc_ip_name: farmer.icc_ip_name || '',
    farmers_association: farmer.farmers_association || null,
  }

  const [form, setForm] = useState(original)
  const [prefixResetNote, setPrefixResetNote] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [contactError, setContactError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const normalize = (v) => (v === null || v === undefined ? '' : String(v))
  const isDirty = Object.keys(original).some(k => normalize(form[k]) !== normalize(original[k]))

  useEffect(() => {
    api.get('/associations/farmers/')
      .then(r => setAssociations(r.data.results || r.data))
      .catch(console.error)
  }, [])

  const updateField = (field, value) => {
    if (field === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      setForm((current) => ({ ...current, contact_number: digits }))
      setContactError(validateContact(digits))
      return
    }
    if (field === 'gender') {
      setForm((current) => {
        if (current.prefix && !isPrefixValidForGender(current.prefix, value)) {
          setPrefixResetNote('Prefix reset — please reselect.')
          return { ...current, gender: value, prefix: '' }
        }
        setPrefixResetNote('')
        return { ...current, gender: value }
      })
      return
    }
    if (field === 'prefix') {
      setPrefixResetNote('')
    }
    setForm((current) => {
      const next = { ...current, [field]: value }
      return next
    })
    if (field === 'birthdate') setBirthdateError(validateAge(value) || '')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')

    const ageError = validateAge(form.birthdate)
    if (ageError) { setBirthdateError(ageError); return }

    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr); return }

    setIsSubmitting(true)

    try {
      await api.patch(`/farmers/${farmer.id}/`, form)
      showToast('Farmer profile updated successfully.', 'success')
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
      } else {
        setFormError(
          data?.detail || data?.non_field_errors?.[0] || 'Unable to update farmer. Please check the form and try again.',
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Edit Farmer" subtitle="Update the farmer's profile information" icon={UserCog} onClose={onClose} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="prefix">Prefix</label>
            <select className={baseInputClasses} id="prefix" onChange={(e) => updateField('prefix', e.target.value)} value={form.prefix}>
              {getPrefixOptions(form.gender).map((p) => (
                <option key={p || 'none'} value={p}>{p || '(None)'}</option>
              ))}
            </select>
            {prefixResetNote && <p className="mt-1 text-[12px] text-amber-600">{prefixResetNote}</p>}
          </div>

          <div>
            <label className={labelCls} htmlFor="rsbsa_number">RSBSA Number</label>
            <input
              className="w-full h-[38px] px-3 border border-[#E2E8E2] rounded-lg text-[13px] text-[#7A8E7A] bg-[#F5F7F5] cursor-not-allowed"
              disabled
              id="rsbsa_number"
              value={farmer.rsbsa_number}
            />
            <p className="mt-1 text-[12px] text-[#7A8E7A]">RSBSA number cannot be edited here.</p>
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
            {form.birthdate && !birthdateError && (
              <p className="mt-1 text-[12px] text-[#4A5E4A]">
                Age: <strong>{computeAge(form.birthdate)}</strong> years old
                {computeAge(form.birthdate) >= 60 && (
                  <span className="ml-2 text-amber-600 font-medium">(Senior Citizen auto-detected)</span>
                )}
              </p>
            )}
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[
              ['is_pwd', 'Person with Disability (PWD)', false],
              ['is_4ps_beneficiary', '4Ps Beneficiary', false],
              ['is_icc_ip_member', 'ICC/IP Member', false],
            ].map(([field, label, autoLocked]) => (
              <label key={field} className={`flex items-center gap-2 ${autoLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1B4D2E]"
                  checked={form[field]}
                  disabled={autoLocked}
                  onChange={(e) => !autoLocked && updateField(field, e.target.checked)}
                />
                <span className="text-[13px] text-[#1A2B1A]">{label}</span>
              </label>
            ))}
          </div>
          {form.is_icc_ip_member && (
            <div className="mt-3">
              <label className={labelCls} htmlFor="icc_ip_name">ICC/IP Group Name</label>
              <input className={baseInputClasses} id="icc_ip_name" value={form.icc_ip_name} onChange={(e) => updateField('icc_ip_name', e.target.value)} />
            </div>
          )}
        </div>

        {/* Status (admin only) */}
        <div className="grid gap-4 md:grid-cols-2">
          {isAdmin && (
            <div>
              <label className={labelCls} htmlFor="is_active">Status</label>
              <select className={baseInputClasses} id="is_active" onChange={(e) => updateField('is_active', e.target.value === 'true')} value={form.is_active ? 'true' : 'false'}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          )}
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
          <Button isLoading={isSubmitting} disabled={isSubmitting || !isDirty} type="submit" variant="primary">Save Changes</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default EditFarmerModal
