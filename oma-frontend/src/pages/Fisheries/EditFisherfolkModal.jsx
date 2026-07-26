import { useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses, FormLabel } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import SegmentedIdInput from '../../components/UI/SegmentedIdInput.jsx'
import { BARANGAY_RSBSA_CODES } from '../../constants/barangays.js'
import { getPrefixOptions, isPrefixValidForGender } from '../../utils/prefixOptions.js'

const labelCls = 'block text-xs font-medium text-slate-600'
const currentYear = String(new Date().getFullYear())

const validateContact = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return 'Contact number must be exactly 11 digits.'
  if (!digits.startsWith('09')) return 'Contact number must start with 09.'
  return ''
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

function EditFisherfolkModal({ fisherfolk, onClose, onSuccess }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()

  const [form, setForm] = useState({
    prefix: fisherfolk.prefix || '',
    first_name: fisherfolk.first_name || '',
    middle_name: fisherfolk.middle_name || '',
    last_name: fisherfolk.last_name || '',
    gender: fisherfolk.gender || 'Male',
    birthdate: fisherfolk.birthdate || '',
    contact_number: fisherfolk.contact_number || '',
    barangay: fisherfolk.barangay || '',
    is_active: fisherfolk.is_active,
    fishr_number: fisherfolk.fishr_number || '',
    rsbsa_number: fisherfolk.rsbsa_number || '',
    is_aquaculture: fisherfolk.is_aquaculture ?? true,
    is_capture_fishery: fisherfolk.is_capture_fishery ?? false,
    is_mariculture: fisherfolk.is_mariculture ?? false,
    is_inland_fishery: fisherfolk.is_inland_fishery ?? false,
    is_fish_vendor: fisherfolk.is_fish_vendor ?? false,
  })

  const [prefixResetNote, setPrefixResetNote] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [contactError, setContactError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (field, value) => {
    if (field === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      setForm((prev) => ({ ...prev, contact_number: digits }))
      setContactError(validateContact(digits))
      return
    }
    if (field === 'gender') {
      setForm((prev) => {
        if (prev.prefix && !isPrefixValidForGender(prev.prefix, value)) {
          setPrefixResetNote('Prefix reset — please reselect.')
          return { ...prev, gender: value, prefix: '' }
        }
        setPrefixResetNote('')
        return { ...prev, gender: value }
      })
      return
    }
    if (field === 'prefix') {
      setPrefixResetNote('')
    }
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === 'birthdate') setBirthdateError(validateAge(value) || '')
  }

  const age = (() => {
    if (!form.birthdate) return null
    const birth = new Date(form.birthdate)
    const today = new Date()
    const a = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    return (m < 0 || (m === 0 && today.getDate() < birth.getDate())) ? a - 1 : a
  })()
  const isSenior = age !== null && age >= 60
  const barangayCode = BARANGAY_RSBSA_CODES[form.barangay] || '000'

  const fishrParts = [
    { type: 'text', value: '01-33-02-' },
    { type: 'input', key: 'year', length: 4, placeholder: currentYear },
    { type: 'text', value: '-' },
    { type: 'input', key: 'seq', length: 4, placeholder: '0000' },
  ]
  const rsbsaParts = [
    { type: 'text', value: '01-33-02-' },
    { type: 'text', value: `${barangayCode}-` },
    { type: 'input', key: 'seq', length: 6, placeholder: '000000' },
  ]

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setFieldErrors({})

    const ageError = validateAge(form.birthdate)
    if (ageError) {
      setBirthdateError(ageError)
      return
    }

    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr); return }

    setIsSubmitting(true)

    try {
      // is_active is admin-only server-side; omit it entirely for evaluators
      // so their save isn't rejected just for carrying an unchanged field.
      const { is_active, ...rest } = form
      const payload = isAdmin ? form : rest
      await api.patch(`/fisheries/fisherfolk/${fisherfolk.id}/`, payload)
      showToast('Fisherfolk profile updated successfully.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const data = err.response?.data
      if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
      } else if (data && typeof data === 'object' && !data.detail) {
        const fieldErrs = {}
        Object.entries(data).forEach(([k, v]) => { fieldErrs[k] = Array.isArray(v) ? v[0] : v })
        setFieldErrors(fieldErrs)
        setError('Please correct the errors below.')
      } else {
        setError(data?.detail || 'Unable to update profile. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell title="Edit Fisherfolk" subtitle="Update the fisherfolk's profile information" icon={Fish} onClose={onClose} maxWidth="max-w-2xl">
        <p className="mb-4 text-sm text-slate-500">{fisherfolk.lgu_registration_number || 'No LGU number assigned'}</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel className={labelCls}>Prefix</FormLabel>
              <select className={baseInputClasses} id="edit_prefix" value={form.prefix} onChange={(e) => updateField('prefix', e.target.value)}>
                {getPrefixOptions(form.gender).map((p) => (
                  <option key={p || 'none'} value={p}>{p || '(None)'}</option>
                ))}
              </select>
              {prefixResetNote && <p className="mt-1 text-xs text-amber-600">{prefixResetNote}</p>}
            </div>

            <div>
              <FormLabel className={labelCls} required>First Name</FormLabel>
              <input className={baseInputClasses} id="edit_first_name" required value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
            </div>

            <div>
              <FormLabel className={labelCls}>Middle Name</FormLabel>
              <input className={baseInputClasses} id="edit_middle_name" value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
            </div>

            <div>
              <FormLabel className={labelCls} required>Last Name</FormLabel>
              <input className={baseInputClasses} id="edit_last_name" required value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
            </div>

            <div>
              <FormLabel className={labelCls} required>Sex</FormLabel>
              <select className={baseInputClasses} id="edit_gender" value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div>
              <FormLabel className={labelCls} required>Birthdate</FormLabel>
              <input
                className={baseInputClasses}
                id="edit_birthdate"
                max={getMaxBirthdate()}
                required
                type="date"
                value={form.birthdate}
                onChange={(e) => updateField('birthdate', e.target.value)}
              />
              {birthdateError && (
                <p className="mt-1 text-xs text-rose-600">{birthdateError}</p>
              )}
            </div>

            <div>
              <FormLabel className={labelCls}>Contact Number</FormLabel>
              <input
                className={baseInputClasses}
                id="edit_contact_number"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                placeholder="09XXXXXXXXX"
                onKeyPress={(e) => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
                value={form.contact_number}
                onChange={(e) => updateField('contact_number', e.target.value)}
              />
              {contactError && <p className="mt-1 text-xs text-rose-600">{contactError}</p>}
            </div>

            <BarangaySelect
              id="edit_barangay"
              label="Barangay"
              value={form.barangay}
              onChange={(e) => updateField('barangay', e.target.value)}
              required
            />

            <div>
              <FormLabel className={labelCls}>FishR Number</FormLabel>
              <SegmentedIdInput
                parts={fishrParts}
                value={form.fishr_number}
                onChange={(v) => setForm((c) => ({ ...c, fishr_number: v }))}
              />
              {fieldErrors.fishr_number && <p className="mt-1 text-xs text-rose-600">{fieldErrors.fishr_number}</p>}
            </div>

            <div>
              <FormLabel className={labelCls}>RSBSA Number</FormLabel>
              <SegmentedIdInput
                parts={rsbsaParts}
                value={form.rsbsa_number}
                onChange={(v) => setForm((c) => ({ ...c, rsbsa_number: v }))}
              />
              {fieldErrors.rsbsa_number && <p className="mt-1 text-xs text-rose-600">{fieldErrors.rsbsa_number}</p>}
            </div>


            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Type of Fishery Activity</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {[
                  ['is_aquaculture',     'Aquaculture'],
                  ['is_capture_fishery', 'Capture Fishery'],
                  ['is_mariculture',     'Mariculture'],
                  ['is_inland_fishery',  'Inland Fishery'],
                  ['is_fish_vendor',     'Fish Vendor'],
                ].map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1E4620]"
                      checked={form[field]}
                      onChange={(e) => updateField(field, e.target.checked)}
                    />
                    <span className="text-[13px] text-slate-700">{label}</span>
                  </label>
                ))}
                <label
                  className="flex items-center gap-2 cursor-not-allowed opacity-70"
                  title={isSenior ? 'Automatically set — age is 60 or above.' : 'Automatically determined from birthdate.'}
                >
                  <input type="checkbox" className="h-4 w-4 accent-[#1E4620]" checked={isSenior} disabled readOnly />
                  <span className="text-[13px] text-slate-700">Senior Citizen</span>
                </label>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Profile classification only; production monitoring covers aquaculture.
              </p>
            </div>

            {isAdmin && (
              <div className="md:col-span-2">
                <FormLabel className={labelCls} hideIndicator>Status</FormLabel>
                <div className="mt-2 flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                    <input type="radio" name="is_active" value="true" checked={form.is_active === true} onChange={() => updateField('is_active', true)} className="accent-green-600" />
                    Active
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                    <input type="radio" name="is_active" value="false" checked={form.is_active === false} onChange={() => updateField('is_active', false)} className="accent-green-600" />
                    Inactive
                  </label>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
            <Button isLoading={isSubmitting} type="submit" variant="primary">Save Changes</Button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

export default EditFisherfolkModal
