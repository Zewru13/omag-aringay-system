import { useState } from 'react'
import { UserCog } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses, FormLabel } from '../../components/UI/FormField.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import { guardPhilsys as formatPhilsys, tidyPhone } from '../../utils/inputGuards.js'
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

const validatePhilsys = (value) => {
  if (!value) return ''
  if (!/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(value)) return 'Format must be NNNN-NNNN-NNNN-NNNN (e.g. 8419-5032-7741-3096).'
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

function EditFarmerModal({ farmer, onClose, onSuccess }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()

  const original = {
    prefix: farmer.prefix || '',
    first_name: farmer.first_name || '',
    last_name: farmer.last_name || '',
    middle_name: farmer.middle_name || '',
    gender: farmer.gender || 'Male',
    birthdate: farmer.birthdate || '',
    contact_number: tidyPhone(farmer.contact_number || ''),   // an older number with dashes opens in the plain format
    barangay: farmer.barangay || '',
    civil_status: farmer.civil_status || 'Single',
    highest_education: farmer.highest_education || '',
    philsys_number: farmer.philsys_number || '',
    is_active: farmer.is_active,
    is_pwd: farmer.is_pwd || false,
    is_4ps_beneficiary: farmer.is_4ps_beneficiary || false,
    is_icc_ip_member: farmer.is_icc_ip_member || false,
    icc_ip_name: farmer.icc_ip_name || '',
  }

  const [form, setForm] = useState(original)
  const [prefixResetNote, setPrefixResetNote] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [philsysError, setPhilsysError] = useState('')
  const [contactError, setContactError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const normalize = (v) => (v === null || v === undefined ? '' : String(v))
  const isDirty = Object.keys(original).some(k => normalize(form[k]) !== normalize(original[k]))

  const updateField = (field, value) => {
    if (field === 'philsys_number') {
      const formatted = formatPhilsys(value)
      setForm((current) => ({ ...current, philsys_number: formatted }))
      setPhilsysError(validatePhilsys(formatted))
      return
    }
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

  const age = computeAge(form.birthdate)
  const isSenior = age !== null && age >= 60

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')

    const ageError = validateAge(form.birthdate)
    if (ageError) { setBirthdateError(ageError); return }

    const philsysErr = validatePhilsys(form.philsys_number)
    if (philsysErr) { setPhilsysError(philsysErr); return }

    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr); return }

    setIsSubmitting(true)

    try {
      // is_active is admin-only server-side; omit it entirely for evaluators
      // so their save isn't rejected just for carrying an unchanged field.
      const { is_active, ...rest } = form
      const payload = isAdmin ? { ...form, is_senior_citizen: isSenior } : { ...rest, is_senior_citizen: isSenior }
      await api.patch(`/farmers/${farmer.id}/`, payload)
      showToast('Farmer profile updated successfully.', 'success')
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
      } else if (data?.philsys_number?.[0]) {
        setPhilsysError(data.philsys_number[0])
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
    <ModalShell
      title="Edit Farmer"
      subtitle="Update the farmer's profile information"
      icon={UserCog}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} disabled={isSubmitting || !isDirty} type="submit" form="edit-farmer-form" variant="primary">Save Changes</Button>
        </>
      }
    >
      <form id="edit-farmer-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FormLabel>Prefix</FormLabel>
            <select className={baseInputClasses} id="prefix" onChange={(e) => updateField('prefix', e.target.value)} value={form.prefix}>
              {getPrefixOptions(form.gender).map((p) => (
                <option key={p || 'none'} value={p}>{p || '(None)'}</option>
              ))}
            </select>
            {prefixResetNote && <p className="mt-1 text-[12px] text-amber-600">{prefixResetNote}</p>}
          </div>

          <div>
            <FormLabel hideIndicator>RSBSA Number</FormLabel>
            <input
              className="w-full h-[38px] px-3 border border-[#E2E8E2] rounded-lg text-[13px] text-[#7A8E7A] bg-[#F5F7F5] cursor-not-allowed"
              disabled
              id="rsbsa_number"
              value={farmer.rsbsa_number}
            />
            <p className="mt-1 text-[12px] text-[#7A8E7A]">RSBSA number cannot be edited here.</p>
          </div>

          <div>
            <FormLabel>PhilSys / National ID No.</FormLabel>
            <input className={baseInputClasses} id="philsys_number" onChange={(e) => updateField('philsys_number', e.target.value)}
              value={form.philsys_number} placeholder="8419-5032-7741-3096" />
            {philsysError && <p className="mt-1 text-[12px] font-medium text-red-600">{philsysError}</p>}
          </div>

          <div>
            <FormLabel required>First Name</FormLabel>
            <input className={baseInputClasses} id="first_name" onChange={(e) => updateField('first_name', e.target.value)} required value={form.first_name} />
          </div>

          <div>
            <FormLabel required>Last Name</FormLabel>
            <input className={baseInputClasses} id="last_name" onChange={(e) => updateField('last_name', e.target.value)} required value={form.last_name} />
          </div>

          <div>
            <FormLabel>Middle Name</FormLabel>
            <input className={baseInputClasses} id="middle_name" onChange={(e) => updateField('middle_name', e.target.value)} value={form.middle_name} />
          </div>

          <div>
            <FormLabel required>Sex</FormLabel>
            <select className={baseInputClasses} id="gender" onChange={(e) => updateField('gender', e.target.value)} value={form.gender}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <FormLabel required>Birthdate</FormLabel>
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
                {isSenior && (
                  <span className="ml-2 text-amber-600 font-medium">(Senior Citizen auto-detected)</span>
                )}
              </p>
            )}
            {birthdateError && (
              <p className="mt-1 text-[12px] text-rose-600">{birthdateError}</p>
            )}
          </div>

          <div>
            <FormLabel>Contact Number</FormLabel>
            <PhoneInput className={baseInputClasses} id="contact_number" value={form.contact_number} onChange={(v) => updateField('contact_number', v)} />
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
            <FormLabel required>Civil Status</FormLabel>
            <select className={baseInputClasses} id="civil_status" onChange={(e) => updateField('civil_status', e.target.value)} value={form.civil_status}>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Separated">Separated</option>
            </select>
          </div>

          <div>
            <FormLabel>Highest Education</FormLabel>
            <input className={baseInputClasses} id="highest_education" onChange={(e) => updateField('highest_education', e.target.value)} value={form.highest_education} />
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
            <label
              className="flex items-center gap-2 cursor-not-allowed opacity-70"
              title={isSenior ? 'Automatically set — age is 60 or above.' : 'Automatically determined from birthdate.'}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1B4D2E]"
                checked={isSenior}
                disabled
                readOnly
              />
              <span className="text-[13px] text-[#1A2B1A]">Senior Citizen</span>
            </label>
          </div>
          {form.is_icc_ip_member && (
            <div className="mt-3">
              <FormLabel>ICC/IP Group Name</FormLabel>
              <input className={baseInputClasses} id="icc_ip_name" value={form.icc_ip_name} onChange={(e) => updateField('icc_ip_name', e.target.value)} />
            </div>
          )}
        </div>

        {/* Status (admin only) */}
        <div className="grid gap-4 md:grid-cols-2">
          {isAdmin && (
            <div>
              <FormLabel hideIndicator>Status</FormLabel>
              <select className={baseInputClasses} id="is_active" onChange={(e) => updateField('is_active', e.target.value === 'true')} value={form.is_active ? 'true' : 'false'}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          )}
        </div>

        {/* Farmer Organization — Batch (Phase B): a farmer can belong to
            several organizations now, managed from each organization's own
            Members tab (Add Member / Deactivate / Set Main), not from this
            form — this is a read-only summary only. */}
        <div>
          <FormLabel hideIndicator>Organizations</FormLabel>
          {(farmer.organizations || []).length === 0 ? (
            <p className="text-[13px] text-[#7A8E7A]">Not a member of any organization.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {farmer.organizations.map(o => (
                <span
                  key={o.membership_id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${
                    o.is_active ? 'bg-[#EBF5EE] text-[#1B4D2E]' : 'bg-[#F0F4F0] text-[#7A8E7A] line-through'
                  }`}
                >
                  {o.organization_name}
                  {o.is_main && o.is_active && <span className="font-semibold">· Main</span>}
                </span>
              ))}
            </div>
          )}
          <p className="text-[12px] text-[#7A8E7A] mt-1">
            Manage this farmer's organization memberships from each organization's own Members tab.
          </p>
        </div>

        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
            {formError}
          </p>
        )}

      </form>
    </ModalShell>
  )
}

export default EditFarmerModal
