import { useState, useEffect, useRef } from 'react'
import { UserPlus, AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses, FormLabel } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import SegmentedIdInput from '../../components/UI/SegmentedIdInput.jsx'
import { BARANGAY_RSBSA_CODES } from '../../constants/barangays.js'
import { getPrefixOptions, isPrefixValidForGender } from '../../utils/prefixOptions.js'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

// Section heading — a real divider + title, not just a faint uppercase
// label buried inside a field's own FormLabel. Groups the form into the
// same named sections a staff member would recognize from a paper form:
// Personal, Contact, Government, then Account setup at the end.
function Section({ title, description, children }) {
  return (
    <div className="border-t border-[#F0F4F0] pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#1B4D2E]">{title}</h3>
      {description && <p className="mt-0.5 mb-3 text-[12px] text-[#7A8E7A]">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}

const initialForm = {
  prefix: '',
  rsbsa_number: '',
  philsys_number: '',
  first_name: '',
  last_name: '',
  middle_name: '',
  gender: 'Male',
  birthdate: '',
  contact_number: '',
  email: '',
  barangay: '',
  civil_status: 'Single',
  highest_education: '',
  is_pwd: false,
  is_4ps_beneficiary: false,
  is_icc_ip_member: false,
  icc_ip_name: '',
  farmers_organization: null,
}

const computeAge = (birthdate) => {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  const today = new Date()
  const age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  return (m < 0 || (m === 0 && today.getDate() < birth.getDate())) ? age - 1 : age
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

const formatPhilsys = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 16)
  return digits.match(/.{1,4}/g)?.join('-') || digits
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

function AddFarmerModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [organizations, setOrganizations] = useState([])
  const [prefixResetNote, setPrefixResetNote] = useState('')
  const [rsbsaTouched, setRsbsaTouched] = useState(false)
  const [philsysError, setPhilsysError] = useState('')
  const [contactError, setContactError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [duplicates, setDuplicates] = useState([])
  const [dupChecking, setDupChecking] = useState(false)
  const dupTimer = useRef(null)

  useEffect(() => {
    api.get('/organizations/farmers/')
      .then(r => setOrganizations(r.data.results || r.data))
      .catch(console.error)
  }, [])

  useEffect(() => {
    const { first_name, last_name, birthdate } = form
    if (!first_name.trim() || !last_name.trim() || !birthdate) {
      setDuplicates([])
      return
    }
    clearTimeout(dupTimer.current)
    dupTimer.current = setTimeout(async () => {
      setDupChecking(true)
      try {
        const r = await api.get('/farmers/check-duplicate/', {
          params: { first_name: first_name.trim(), last_name: last_name.trim(), birth_date: birthdate },
        })
        setDuplicates(r.data?.duplicates || [])
      } catch {
        setDuplicates([])
      } finally {
        setDupChecking(false)
      }
    }, 500)
    return () => clearTimeout(dupTimer.current)
  }, [form.first_name, form.last_name, form.birthdate])

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
  const barangayCode = BARANGAY_RSBSA_CODES[form.barangay] || '000'
  const rsbsaParts = [
    { type: 'text', value: '01-33-02-' },
    { type: 'text', value: `${barangayCode}-` },
    { type: 'input', key: 'seq', length: 6, placeholder: '000000' },
  ]

  const handleSubmit = async (event) => {
    event.preventDefault()
    setContactError('')
    setFormError('')
    setRsbsaTouched(true)

    const ageError = validateAge(form.birthdate)
    if (ageError) { setBirthdateError(ageError); return }

    if (!form.rsbsa_number) { setFormError('RSBSA number is required and must be complete.'); return }

    const philsysErr = validatePhilsys(form.philsys_number)
    if (philsysErr) { setPhilsysError(philsysErr); return }

    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr); return }

    setIsSubmitting(true)

    try {
      await api.post('/farmers/', { ...form, is_senior_citizen: isSenior })
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      const rsbsaMessage = data?.rsbsa_number?.[0] || data?.non_field_errors?.[0]
      if (rsbsaMessage) {
        setFormError(rsbsaMessage)
      } else if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
      } else if (data?.philsys_number?.[0]) {
        setPhilsysError(data.philsys_number[0])
      } else {
        setFormError(data?.detail || 'Unable to register farmer. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Register Farmer"
      subtitle="Fill in the farmer's details below"
      icon={UserPlus}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" form="add-farmer-form" variant="primary">Save Farmer</Button>
        </>
      }
    >
      <form id="add-farmer-form" onSubmit={handleSubmit} className="space-y-5">
        <Section title="Personal Information">
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
        </Section>

        <Section title="Contact Information">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel>Contact Number</FormLabel>
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
          </div>
        </Section>

        <Section title="Government Information">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel required>RSBSA Number</FormLabel>
              <SegmentedIdInput
                parts={rsbsaParts}
                value={form.rsbsa_number}
                onChange={(v) => setForm((c) => ({ ...c, rsbsa_number: v }))}
              />
              <p className="mt-1 text-[11px] text-[#7A8E7A]">
                {form.barangay
                  ? `Barangay code ${barangayCode} auto-filled from ${form.barangay}.`
                  : 'Select a barangay below to auto-fill the barangay code.'}
              </p>
              {rsbsaTouched && !form.rsbsa_number && (
                <p className="mt-1 text-[12px] font-medium text-red-600">RSBSA number is required and must be complete.</p>
              )}
            </div>

            <div>
              <FormLabel>PhilSys / National ID No.</FormLabel>
              <input className={baseInputClasses} id="philsys_number" onChange={(e) => updateField('philsys_number', e.target.value)}
                value={form.philsys_number} placeholder="8419-5032-7741-3096" />
              {philsysError && <p className="mt-1 text-[12px] font-medium text-red-600">{philsysError}</p>}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#E2E8E2] bg-[#EBF5EE]/30 p-4">
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

          <div className="mt-4">
            <FormLabel>Farmer Organization</FormLabel>
            <select
              className={baseInputClasses}
              value={form.farmers_organization || ''}
              onChange={e => updateField('farmers_organization', e.target.value || null)}
            >
              <option value="">— Not a member of any organization</option>
              {organizations.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="text-[12px] text-[#7A8E7A] mt-1">
              Leave blank if the farmer is not part of any organization. This can be updated later by editing the farmer profile.
            </p>
          </div>
        </Section>

        {/* Account Information — the citizen login account itself is set up
            later, in person, via the "Set Up Account" button on the
            farmer's detail page (staff generate and read aloud a system
            password there — never typed here). Email is optional and just
            kept on file for later contact. */}
        <Section title="Account Information">
          <div>
            <FormLabel>Email</FormLabel>
            <input className={baseInputClasses} id="email" type="email" onChange={(e) => updateField('email', e.target.value)} value={form.email} />
            <p className="mt-1 text-[12px] text-[#7A8E7A]">
              Optional. The citizen login account is set up separately, in person, via "Set Up Account" on the farmer's detail page.
            </p>
          </div>
        </Section>

        {dupChecking && (
          <p className="text-[12px] text-[#7A8E7A] italic">Checking for duplicate entries…</p>
        )}

        {!dupChecking && duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
              <p className="text-[13px] font-semibold text-amber-800">
                Possible duplicate{duplicates.length > 1 ? 's' : ''} found — you may still submit
              </p>
            </div>
            <ul className="space-y-1">
              {duplicates.map((d) => (
                <li key={d.id} className="text-[12px] text-amber-800">
                  <span className="font-medium">{d.full_name}</span>
                  {d.barangay ? ` — ${d.barangay}` : ''}
                  {d.rsbsa_number ? ` (RSBSA: ${d.rsbsa_number})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
            {formError}
          </p>
        )}

      </form>
    </ModalShell>
  )
}

export default AddFarmerModal
