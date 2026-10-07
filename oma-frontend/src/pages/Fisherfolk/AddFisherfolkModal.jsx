import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses, FormLabel } from '../../components/UI/FormField.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import EmailInput from '../../components/UI/EmailInput.jsx'
import { guardPhilsys as formatPhilsys } from '../../utils/inputGuards.js'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import SegmentedIdInput from '../../components/UI/SegmentedIdInput.jsx'
import { BARANGAY_RSBSA_CODES } from '../../constants/barangays.js'
import { getPrefixOptions, isPrefixValidForGender } from '../../utils/prefixOptions.js'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'
const currentYear = String(new Date().getFullYear())

// Section heading — a real divider + title, not just a faint uppercase
// label buried inside a field's own FormLabel. Groups the form into the
// same named sections a staff member would recognize from a paper form.
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
  fishr_number: '',
  rsbsa_number: '',
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
  philsys_number: '',
  fisherfolk_type: 'Aquaculture',
  is_pwd: false,
  is_4ps_beneficiary: false,
  is_icc_ip_member: false,
  icc_ip_name: '',
  fisherfolk_organization: null,
  is_aquaculture: true,
  is_capture_fishery: false,
  is_mariculture: false,
  is_inland_fishery: false,
  vessel_type: '',
  vessel_material: '',
  vessel_material_other_specify: '',
  vessel_registration_number: '',
  fishing_gear_type: '',
  fishing_ground: '',
  average_catch_per_trip_kg: '',
  has_vessel: true,
  boat_registration_number: '',
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
  const age = computeAge(birthdate)
  if (age !== null && age < 10) return 'Must be at least 10 years old to register.'
  return null
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

const validateBoatRegNumber = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 7) return 'Boat Registration Number must be exactly 7 digits.'
  return ''
}

const getMaxBirthdate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return d.toISOString().split('T')[0]
}

function AddFisherfolkModal({ onClose, onSuccess }) {
  const [form,          setForm]          = useState(initialForm)
  const [organizations,  setOrganizations]  = useState([])
  const [prefixResetNote, setPrefixResetNote] = useState('')
  const [idTouched,     setIdTouched]     = useState({ fishr: false, rsbsa: false })
  const [contactError,  setContactError]  = useState('')
  const [boatRegError,  setBoatRegError]  = useState('')
  const [philsysError,  setPhilsysError]  = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [fieldErrors,   setFieldErrors]   = useState({})
  const [formError,     setFormError]     = useState('')
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [duplicates,    setDuplicates]    = useState([])
  const [dupChecking,   setDupChecking]   = useState(false)
  const dupTimer = useRef(null)

  useEffect(() => {
    api.get('/organizations/fisherfolk/')
      .then(r => setOrganizations(r.data.results || r.data))
      .catch(console.error)
  }, [])

  useEffect(() => {
    const { first_name, last_name, birthdate } = form
    if (!first_name.trim() || !last_name.trim() || !birthdate) {
      setDuplicates([]); return
    }
    clearTimeout(dupTimer.current)
    dupTimer.current = setTimeout(async () => {
      setDupChecking(true)
      try {
        const r = await api.get('/fisheries/fisherfolk/check-duplicate/', {
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
      setForm((c) => ({ ...c, philsys_number: formatted }))
      setPhilsysError(validatePhilsys(formatted))
      return
    }
    if (field === 'birthdate') setBirthdateError(validateAge(value) || '')
    if (field === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      setForm((c) => ({ ...c, contact_number: digits }))
      setContactError(validateContact(digits))
      return
    }
    if (field === 'gender') {
      setForm((c) => {
        if (c.prefix && !isPrefixValidForGender(c.prefix, value)) {
          setPrefixResetNote('Prefix reset — please reselect.')
          return { ...c, gender: value, prefix: '' }
        }
        setPrefixResetNote('')
        return { ...c, gender: value }
      })
      return
    }
    if (field === 'prefix') {
      setPrefixResetNote('')
    }
    if (field === 'boat_registration_number') {
      const digits = value.replace(/\D/g, '').slice(0, 7)
      setForm((c) => ({ ...c, boat_registration_number: digits }))
      setBoatRegError(validateBoatRegNumber(digits))
      return
    }
    if (field === 'vessel_type' && value !== 'Motorized') {
      setForm((c) => ({ ...c, vessel_type: value, vessel_material: '', vessel_material_other_specify: '' }))
      return
    }
    setForm((c) => {
      const next = { ...c, [field]: value }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setFieldErrors({})
    setIdTouched({ fishr: true, rsbsa: true })
    if (!form.rsbsa_number) { setFormError('RSBSA number is required and must be complete.'); return }
    const ageErr = validateAge(form.birthdate)
    if (ageErr) { setBirthdateError(ageErr); return }
    const philsysErr = validatePhilsys(form.philsys_number)
    if (philsysErr) { setPhilsysError(philsysErr); return }
    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr); return }

    const boatRegErr = form.has_vessel ? validateBoatRegNumber(form.boat_registration_number) : ''
    if (boatRegErr) { setBoatRegError(boatRegErr); return }

    if (form.fisherfolk_type === 'Capture') {
      if (!form.vessel_type) {
        setFormError('Vessel Type is required for capture fisherfolk.')
        return
      }
      if (form.vessel_type === 'Motorized' && !form.vessel_material) {
        setFormError('Vessel Material is required for motorized vessels.')
        return
      }
      if (form.vessel_type === 'Motorized' && form.vessel_material === 'Other' && !form.vessel_material_other_specify.trim()) {
        setFormError('Please specify the vessel material.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const payload = {
        ...form,
        vessel_material_other_specify: form.vessel_material === 'Other' ? (form.vessel_material_other_specify || '').trim() : '',
      }
      if (payload.average_catch_per_trip_kg === '') delete payload.average_catch_per_trip_kg
      await api.post('/fisheries/fisherfolk/', payload)
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      if (data && typeof data === 'object' && !data.detail) {
        const fieldErrs = {}
        let hasField = false
        Object.entries(data).forEach(([k, v]) => {
          if (k !== 'non_field_errors') { fieldErrs[k] = Array.isArray(v) ? v[0] : v; hasField = true }
        })
        if (hasField) {
          setFieldErrors(fieldErrs)
          setFormError(data.non_field_errors?.[0] || 'Please correct the errors below.')
        } else {
          setFormError(data.detail || data.non_field_errors?.[0] || 'Unable to register fisherfolk. Please check the form and try again.')
        }
      } else {
        setFormError(data?.detail || 'Unable to register fisherfolk. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const age = computeAge(form.birthdate)
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

  return (
    <ModalShell
      title="Register Fisherfolk"
      subtitle="Fill in the fisherfolk's details below"
      icon={Fish}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" form="add-fisherfolk-form" variant="primary">Save Fisherfolk</Button>
        </>
      }
    >
      <form id="add-fisherfolk-form" onSubmit={handleSubmit} className="space-y-5">
        <Section title="Personal Information">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel>Prefix</FormLabel>
              <select className={baseInputClasses} id="prefix" value={form.prefix} onChange={(e) => updateField('prefix', e.target.value)}>
                {getPrefixOptions(form.gender).map((p) => (
                  <option key={p || 'none'} value={p}>{p || '(None)'}</option>
                ))}
              </select>
              {prefixResetNote && <p className="mt-1 text-[12px] text-amber-600">{prefixResetNote}</p>}
            </div>

            <div>
              <FormLabel required>First Name</FormLabel>
              <input className={baseInputClasses} id="first_name" required value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
            </div>

            <div>
              <FormLabel required>Last Name</FormLabel>
              <input className={baseInputClasses} id="last_name" required value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
            </div>

            <div>
              <FormLabel>Middle Name</FormLabel>
              <input className={baseInputClasses} id="middle_name" value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
            </div>

            <div>
              <FormLabel required>Sex</FormLabel>
              <select className={baseInputClasses} id="gender" value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
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
                required
                type="date"
                value={form.birthdate}
                onChange={(e) => updateField('birthdate', e.target.value)}
              />
              {form.birthdate && age !== null && !birthdateError && (
                <p className="mt-1 text-[12px] text-[#4A5E4A]">
                  Age: <strong>{age}</strong> years old
                  {isSenior && (
                    <span className="ml-2 text-amber-600 font-medium">(Senior Citizen auto-detected)</span>
                  )}
                </p>
              )}
              {birthdateError && <p className="mt-1 text-[12px] text-rose-600">{birthdateError}</p>}
            </div>

            <div>
              <FormLabel required>Civil Status</FormLabel>
              <select className={baseInputClasses} id="civil_status" value={form.civil_status} onChange={(e) => updateField('civil_status', e.target.value)}>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
              </select>
            </div>

            <div>
              <FormLabel>Highest Education</FormLabel>
              <input className={baseInputClasses} id="highest_education" value={form.highest_education} onChange={(e) => updateField('highest_education', e.target.value)} />
            </div>
          </div>
        </Section>

        <Section title="Contact Information">
          <div className="grid gap-4 md:grid-cols-2">
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
              {idTouched.rsbsa && !form.rsbsa_number && (
                <p className="mt-1 text-[12px] font-medium text-red-600">RSBSA number is required and must be complete.</p>
              )}
              {fieldErrors.rsbsa_number && (
                <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.rsbsa_number}</p>
              )}
            </div>

            <div>
              <FormLabel>FishR Number</FormLabel>
              <SegmentedIdInput
                parts={fishrParts}
                value={form.fishr_number}
                onChange={(v) => setForm((c) => ({ ...c, fishr_number: v }))}
              />
              {fieldErrors.fishr_number && (
                <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.fishr_number}</p>
              )}
            </div>

            <div>
              <FormLabel>PhilSys / National ID No.</FormLabel>
              <input className={baseInputClasses} id="philsys_number" value={form.philsys_number} placeholder="8419-5032-7741-3096"
                onChange={(e) => updateField('philsys_number', e.target.value)} />
              {(philsysError || fieldErrors.philsys_number) && (
                <p className="mt-1 text-[12px] font-medium text-red-600">{philsysError || fieldErrors.philsys_number}</p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#E2E8E2] bg-[#EBF5EE]/30 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Classification</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                ['is_pwd',              'Person with Disability (PWD)', false],
                ['is_4ps_beneficiary',  '4Ps Beneficiary',              false],
                ['is_icc_ip_member',    'ICC/IP Member',                false],
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
        </Section>

        <Section title="Fisheries Information">
          <div className="mb-4">
            <FormLabel required>Fisherfolk Type</FormLabel>
            <select className={`${baseInputClasses} md:w-1/2`} id="fisherfolk_type" required value={form.fisherfolk_type} onChange={(e) => updateField('fisherfolk_type', e.target.value)}>
              <option value="Aquaculture">Aquaculture</option>
              <option value="Capture">Capture</option>
            </select>
          </div>

          {form.fisherfolk_type === 'Capture' && (
            <div className="mb-4 rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Vessel & Capture Details</p>
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="has_vessel"
                  className="h-4 w-4 accent-[#1B4D2E]"
                  checked={form.has_vessel}
                  onChange={(e) => updateField('has_vessel', e.target.checked)}
                />
                <label htmlFor="has_vessel" className="text-[13px] text-[#1A2B1A] cursor-pointer">Owns or operates a fishing vessel</label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FormLabel required>Vessel Type</FormLabel>
                  <select className={baseInputClasses} id="vessel_type" required value={form.vessel_type} onChange={(e) => updateField('vessel_type', e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="Motorized">Motorized</option>
                    <option value="Non-Motorized">Non-Motorized</option>
                    <option value="No Vessel">No Vessel</option>
                  </select>
                </div>

                {form.vessel_type === 'Motorized' && (
                  <div>
                    <FormLabel required>Vessel Material</FormLabel>
                    <ComboboxWithOther
                      options={['Wooden', 'Composite', 'Fiberglass', 'Steel']}
                      value={form.vessel_material}
                      otherValue={form.vessel_material_other_specify}
                      onChange={(v) => updateField('vessel_material', v)}
                      onOtherChange={(v) => updateField('vessel_material_other_specify', v)}
                      placeholder="— Select —"
                      required
                    />
                    {fieldErrors.vessel_material_other_specify && (
                      <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.vessel_material_other_specify}</p>
                    )}
                  </div>
                )}

                {form.has_vessel && (
                  <div>
                    <FormLabel>Boat Registration Number (Boat-R)</FormLabel>
                    <input
                      className={baseInputClasses}
                      id="boat_registration_number"
                      inputMode="numeric"
                      maxLength={7}
                      placeholder="0000000"
                      value={form.boat_registration_number}
                      onChange={(e) => updateField('boat_registration_number', e.target.value)}
                    />
                    {boatRegError && <p className="mt-1 text-[12px] text-rose-600">{boatRegError}</p>}
                  </div>
                )}

                <div>
                  <FormLabel>Vessel Registration Number</FormLabel>
                  <input className={baseInputClasses} id="vessel_registration_number" value={form.vessel_registration_number} onChange={(e) => updateField('vessel_registration_number', e.target.value)} />
                </div>

                <div>
                  <FormLabel>Fishing Gear Type</FormLabel>
                  <input className={baseInputClasses} id="fishing_gear_type" value={form.fishing_gear_type} onChange={(e) => updateField('fishing_gear_type', e.target.value)} />
                </div>

                <div>
                  <FormLabel>Fishing Ground</FormLabel>
                  <input className={baseInputClasses} id="fishing_ground" value={form.fishing_ground} onChange={(e) => updateField('fishing_ground', e.target.value)} />
                </div>

                <div>
                  <FormLabel>Average Catch per Trip (kg)</FormLabel>
                  <input className={baseInputClasses} id="average_catch_per_trip_kg" type="number" step="0.01" min="0" value={form.average_catch_per_trip_kg} onChange={(e) => updateField('average_catch_per_trip_kg', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Type of Fishery Activity</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                ['is_aquaculture',     'Aquaculture'],
                ['is_capture_fishery', 'Capture Fishery'],
                ['is_mariculture',     'Mariculture'],
                ['is_inland_fishery',  'Inland Fishery'],
              ].map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#1B4D2E]"
                    checked={form[field]}
                    onChange={(e) => updateField(field, e.target.checked)}
                  />
                  <span className="text-[13px] text-[#1A2B1A]">{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[#7A8E7A]">
              Profile classification only; production monitoring covers aquaculture.
            </p>
          </div>

          <div className="mt-4">
            <FormLabel>Fisherfolk Organization</FormLabel>
            <select
              className={baseInputClasses}
              value={form.fisherfolk_organization || ''}
              onChange={e => updateField('fisherfolk_organization', e.target.value || null)}
            >
              <option value="">— Not a member of any organization</option>
              {organizations.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="text-[12px] text-[#7A8E7A] mt-1">
              Leave blank if the fisherfolk is not part of any organization.
            </p>
          </div>
        </Section>

        {/* Account Information — the citizen login account itself is set up
            later, in person, via the "Set Up Account" button on the
            fisherfolk's detail page (staff generate and read aloud a
            system password there — never typed here). Email is optional
            and just kept on file for later contact. */}
        <Section title="Account Information">
          <div>
            <FormLabel>Email</FormLabel>
            <EmailInput className={baseInputClasses} id="email" value={form.email} onChange={(v) => updateField('email', v)} />
            <p className="mt-1 text-[12px] text-[#7A8E7A]">
              Optional. The citizen login account is set up separately, in person, via "Set Up Account" on the fisherfolk's detail page.
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
                  {d.lgu_registration_number ? ` (LGU: ${d.lgu_registration_number})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-[13px] font-medium text-red-700">{formError}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k} className="text-[12px] text-red-600">
                    <span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span> {v}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

      </form>
    </ModalShell>
  )
}

export default AddFisherfolkModal
