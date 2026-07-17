import { useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'

const ARINGAY_BARANGAYS = [
  'Alaska',
  'Basca',
  'Dulao',
  'Gallano',
  'Macabato',
  'Manga',
  'Pangao-aoan East',
  'Pangao-aoan West',
  'Poblacion',
  'Samara',
  'San Antonio',
  'San Benito Norte',
  'San Benito Sur',
  'San Eugenio',
  'San Juan East',
  'San Juan West',
  'San Simon East',
  'San Simon West',
  'Santa Cecilia',
  'Santa Lucia',
  'Santa Rita East',
  'Santa Rita West',
  'Santo Rosario East',
  'Santo Rosario West',
]

const TYPE_DESCRIPTIONS = {
  Aquaculture: 'Freshwater pond/cage/pen farming of fish, shrimp, or other aquatic species.',
  Capture: 'Fishing in open waters (sea, lake, river) using vessels and gear.',
  Mariculture: 'Marine/coastal aquaculture — seaweed, oyster, mussel, or marine fish farming.',
  Inland: 'Inland water fishing — rivers, lakes, and freshwater bodies.',
  Vendor: 'Fish vendor or trader who buys and sells fishery products.',
}

const initialForm = {
  lgu_registration_number: '',
  prefix: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  gender: 'Male',
  birthdate: '',
  contact_number: '',
  barangay: '',
  fisherfolk_type: 'Aquaculture',
  fish_registration_number: '',
  boat_registration_number: '',
  // Aquaculture / Mariculture sub-record
  culture_type: 'Fish Cage',
  species_cultured: 'Tilapia',
  area_hectares: '',
  fingerlings_stocked: '',
  // Facility profile (Aquaculture / Mariculture)
  facility_location: 'Alaska',
  pond_area_ha: '',
  number_of_ponds: '',
  water_source: 'River',
  water_source_other: '',
  number_of_cages: '',
  cage_dimensions: '',
  // Capture / Inland sub-record
  vessel_type: 'Motorized',
  vessel_material: '',
  vessel_registration_number: '',
  fishing_gear_type: '',
  fishing_ground: '',
  average_catch_per_trip_kg: '',
  // Vendor sub-record
  location_type: 'Fixed Stall',
  stall_location: '',
  type_of_products_sold: '',
  source_of_fish: '',
}

const toTitleCaseWords = (value) => {
  return (value || '')
    .toLowerCase()
    .replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1))
}

const validateNameCapitalization = (value) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (!/^([A-Z][a-z]*)(\s+[A-Z][a-z]*)*$/.test(trimmed)) {
    return 'Name must start with capital letters.'
  }
  return ''
}

const formatContactNumber = (value) => {
  const digits = (value || '').replace(/\D/g, '')

  // Convert international PH mobile format: 639XXXXXXXXX -> 09XXXXXXXXX
  if (/^639\d{9}$/.test(digits)) {
    return `09${digits.slice(3)}`
  }

  // Empty input becomes forced prefix
  if (!digits) return '09'

  // Keep prefix immutable as 09
  let rest = digits
  if (digits.startsWith('09')) {
    rest = digits.slice(2)
  } else if (digits.startsWith('9')) {
    rest = digits.slice(1)
  } else {
    // invalid leading digits remain for validation error display
    return digits.slice(0, 11)
  }

  return `09${rest.slice(0, 9)}`
}

const validateContactNumber = (value) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (!/^09\d{9}$/.test(trimmed)) {
    return 'Contact number must start with 09 and contain exactly 11 digits.'
  }
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

const formatLguRegistrationNumber = (value) => {
  const raw = (value || '')
    .toUpperCase()
    .replace(/[^F0-9]/g, '')

  // Keep only digits and enforce FF prefix
  const digitsOnly = raw.replace(/F/g, '').slice(0, 9)
  const year = digitsOnly.slice(0, 4)
  const sequence = digitsOnly.slice(4, 9)

  let formatted = 'FF'
  if (digitsOnly.length > 0) {
    formatted += `-${year}`
  }
  if (digitsOnly.length > 4) {
    formatted += `-${sequence}`
  }

  return formatted.slice(0, 13)
}

const validateLguRegistrationNumber = (value) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return 'LGU Registration Number is required.'
  if (!/^FF-\d{4}-\d{5}$/.test(trimmed)) {
    return 'LGU Registration Number must follow format FF-YYYY-00001.'
  }
  return ''
}

const getMaxBirthdate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return d.toISOString().split('T')[0]
}

function RegisterFisherfolkModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [step, setStep] = useState(1)
  const [lguError, setLguError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [fishRError, setFishRError] = useState('')
  const [boatRError, setBoatRError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [nameError, setNameError] = useState('')
  const [contactError, setContactError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateFishR = (value) => {
    if (!value.trim()) return ''
    if (!/^\d{14,16}$/.test(value.trim())) return 'Fish Registration Number must be 14 to 16 digits.'
    return ''
  }

  const validateBoatR = (value) => {
    if (!value.trim()) return ''
    if (!/^\d{7}$/.test(value.trim())) return 'Boat Registration Number must be exactly 7 digits.'
    return ''
  }

  const updateField = (field, value) => {
    let nextValue = value

    if (field === 'lgu_registration_number') {
      nextValue = formatLguRegistrationNumber(value)
    } else if (field === 'contact_number') {
      nextValue = formatContactNumber(value)
    } else if (['first_name', 'middle_name', 'last_name'].includes(field)) {
      nextValue = toTitleCaseWords(value)
    }

    setForm((prev) => ({ ...prev, [field]: nextValue }))
    if (field === 'lgu_registration_number') setLguError('')
    if (field === 'birthdate') setBirthdateError(validateAge(nextValue) || '')
    if (field === 'fish_registration_number') setFishRError('')
    if (field === 'boat_registration_number') setBoatRError('')
    if (['first_name', 'middle_name', 'last_name'].includes(field)) setNameError('')
    if (field === 'contact_number') setContactError('')
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const handleNext = () => {
    setLguError('')
    setFormError('')

    const lguValidationError = validateLguRegistrationNumber(form.lgu_registration_number)
    if (lguValidationError) {
      setLguError(lguValidationError)
      return
    }

    const firstNameErr = validateNameCapitalization(form.first_name)
    const middleNameErr = validateNameCapitalization(form.middle_name)
    const lastNameErr = validateNameCapitalization(form.last_name)
    if (firstNameErr || middleNameErr || lastNameErr) {
      setNameError('Name must start with capital letters.')
      return
    }

    const contactValidationError = validateContactNumber(form.contact_number)
    if (contactValidationError) {
      setContactError(contactValidationError)
      return
    }
    if (!form.first_name.trim() || !form.last_name.trim() || !form.birthdate || !form.barangay) {
      setFormError('Please fill in all required fields before proceeding.')
      return
    }

    const ageError = validateAge(form.birthdate)
    if (ageError) {
      setBirthdateError(ageError)
      return
    }

    const fishErr = validateFishR(form.fish_registration_number)
    if (fishErr) { setFishRError(fishErr); return }
    const boatErr = validateBoatR(form.boat_registration_number)
    if (boatErr) { setBoatRError(boatErr); return }

    setStep(2)
  }

  const buildPayload = () => {
    const base = {
      lgu_registration_number: form.lgu_registration_number,
      prefix: form.prefix,
      first_name: form.first_name,
      middle_name: form.middle_name,
      last_name: form.last_name,
      gender: form.gender,
      birthdate: form.birthdate,
      contact_number: form.contact_number,
      barangay: form.barangay,
      fisherfolk_type: form.fisherfolk_type,
      fish_registration_number: form.fish_registration_number,
      boat_registration_number: form.boat_registration_number,
    }
    const aquaCultureType = form.culture_type
    const isPondCulture = aquaCultureType === 'Fish Pond'
    const isCageCulture = ['Fish Cage', 'Fish Pen', 'Pond Cage', 'Pen Tank'].includes(aquaCultureType)

    const facilityFields = {
      facility_location: form.facility_location,
      pond_area_ha: isPondCulture ? (form.pond_area_ha || null) : null,
      number_of_ponds: isPondCulture ? (form.number_of_ponds || null) : null,
      water_source: form.water_source === 'Other' ? (form.water_source_other || '').trim() : form.water_source,
      number_of_cages: isCageCulture ? (form.number_of_cages || null) : null,
      cage_dimensions: isCageCulture ? form.cage_dimensions : '',
    }
    if (form.fisherfolk_type === 'Aquaculture' || form.fisherfolk_type === 'Mariculture') {
      return {
        ...base,
        ...facilityFields,
        culture_type: form.culture_type,
        species_cultured: form.species_cultured,
        fingerlings_stocked: form.fingerlings_stocked,
      }
    }
    if (form.fisherfolk_type === 'Capture' || form.fisherfolk_type === 'Inland') {
      const payload = {
        ...base,
        vessel_type: form.vessel_type,
        vessel_registration_number: form.vessel_registration_number,
        fishing_gear_type: form.fishing_gear_type,
        fishing_ground: form.fishing_ground,
        average_catch_per_trip_kg: form.average_catch_per_trip_kg,
      }
      if (form.vessel_type === 'Motorized') payload.vessel_material = form.vessel_material
      return payload
    }
    if (form.fisherfolk_type === 'Vendor') {
      const payload = { ...base, location_type: form.location_type, type_of_products_sold: form.type_of_products_sold, source_of_fish: form.source_of_fish }
      if (form.location_type !== 'Ambulant / No Fixed Location') payload.stall_location = form.stall_location
      return payload
    }
    return base
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLguError('')
    setFieldErrors({})
    setFormError('')

    const lguValidationError = validateLguRegistrationNumber(form.lgu_registration_number)
    if (lguValidationError) {
      setLguError(lguValidationError)
      setStep(1)
      return
    }

    const firstNameErr = validateNameCapitalization(form.first_name)
    const middleNameErr = validateNameCapitalization(form.middle_name)
    const lastNameErr = validateNameCapitalization(form.last_name)
    if (firstNameErr || middleNameErr || lastNameErr) {
      setNameError('Name must start with capital letters.')
      setStep(1)
      return
    }

    const contactValidationError = validateContactNumber(form.contact_number)
    if (contactValidationError) {
      setContactError(contactValidationError)
      setStep(1)
      return
    }

    const ageError = validateAge(form.birthdate)
    if (ageError) {
      setBirthdateError(ageError)
      setStep(1)
      return
    }

    setIsSubmitting(true)
    const payload = buildPayload()
    console.log("Submitted payload:", payload)
    try {
      await api.post('/fisheries/fisherfolk/', payload)
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      console.log("Backend error:", data)
      if (data?.lgu_registration_number) {
        setLguError(data.lgu_registration_number[0])
        setStep(1)
      } else if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
        setStep(1)
      } else if (data?.first_name || data?.middle_name || data?.last_name) {
        setNameError('Name must start with capital letters.')
        setStep(1)
      } else if (data?.contact_number?.[0]) {
        setContactError(data.contact_number[0])
        setStep(1)
      } else if (data?.fish_registration_number) {
        setFishRError(data.fish_registration_number[0])
        setStep(1)
      } else if (data?.boat_registration_number) {
        setBoatRError(data.boat_registration_number[0])
        setStep(1)
      } else if (data?.vessel_material) {
        setFieldErrors((prev) => ({ ...prev, vessel_material: data.vessel_material[0] }))
      } else if (data?.stall_location) {
        setFieldErrors((prev) => ({ ...prev, stall_location: data.stall_location[0] }))
      } else if (data?.non_field_errors) {
        setFormError(Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : String(data.non_field_errors))
      } else if (data?.detail) {
        setFormError(Array.isArray(data.detail) ? data.detail[0] : String(data.detail))
      } else if (data && typeof data === 'object') {
        const flattened = Object.entries(data)
          .map(([key, value]) => {
            const message = Array.isArray(value) ? value.join(', ') : String(value)
            return `${key}: ${message}`
          })
          .join(' | ')
        setFormError(flattened || 'Unable to register fisherfolk. Please check the form and try again.')
      } else {
        setFormError('Unable to register fisherfolk. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isAqua = form.fisherfolk_type === 'Aquaculture' || form.fisherfolk_type === 'Mariculture'
  const isCapture = form.fisherfolk_type === 'Capture' || form.fisherfolk_type === 'Inland'
  const isPondCulture = form.culture_type === 'Fish Pond'
  const isCageCulture = ['Fish Cage', 'Fish Pen', 'Pond Cage', 'Pen Tank'].includes(form.culture_type)

  return (
    <ModalShell title="Register Fisherfolk" subtitle="Fill in the fisherfolk's details below" icon={Fish} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-slate-400">Step {step} of 2</p>

        {/* Step 1: Basic Information */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>LGU Registration Number</label>
              <input
                className={baseInputClasses}
                required
                placeholder="e.g. FF-2024-00001"
                value={form.lgu_registration_number}
                onChange={(e) => updateField('lgu_registration_number', e.target.value)}
                onBlur={(e) => setLguError(validateLguRegistrationNumber(e.target.value))}
              />
              {lguError && <p className="mt-1 text-sm font-medium text-red-600">{lguError}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Prefix</label>
                <select className={baseInputClasses} value={form.prefix} onChange={(e) => updateField('prefix', e.target.value)}>
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
                <label className={labelCls}>First Name</label>
                <input className={baseInputClasses} required placeholder="e.g. Juan" value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
              </div>

              <div>
                <label className={labelCls}>Middle Name</label>
                <input className={baseInputClasses} placeholder="e.g. Santos" value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
              </div>

              <div>
                <label className={labelCls}>Last Name</label>
                <input className={baseInputClasses} required placeholder="e.g. Dela Cruz" value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
              </div>
            </div>
            {nameError && <p className="mt-1 text-sm font-medium text-red-600">{nameError}</p>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Sex</label>
                <select className={baseInputClasses} required value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Birthdate</label>
                <input
                  className={baseInputClasses}
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
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Contact Number</label>
                <input
                  className={baseInputClasses}
                  placeholder="e.g. 09123456789"
                  value={form.contact_number}
                  onFocus={() => {
                    if (!form.contact_number) updateField('contact_number', '09')
                  }}
                  onChange={(e) => updateField('contact_number', e.target.value)}
                />
                {contactError && <p className="mt-1 text-sm font-medium text-red-600">{contactError}</p>}
              </div>
              <BarangaySelect
                label="Barangay"
                value={form.barangay}
                onChange={(e) => updateField('barangay', e.target.value)}
                required
              />
            </div>

            <div>
              <label className={labelCls}>Fisherfolk Type</label>
              <select className={baseInputClasses} required value={form.fisherfolk_type} onChange={(e) => updateField('fisherfolk_type', e.target.value)}>
                <option value="Aquaculture">Aquaculture</option>
                <option value="Capture">Capture Fishery</option>
                <option value="Mariculture">Mariculture</option>
                <option value="Inland">Inland Fishery</option>
                <option value="Vendor">Fish Vendor</option>
              </select>
              {TYPE_DESCRIPTIONS[form.fisherfolk_type] && (
                <p className="mt-1 text-xs text-slate-400">{TYPE_DESCRIPTIONS[form.fisherfolk_type]}</p>
              )}
            </div>

            {form.fisherfolk_type !== 'Vendor' && (
              <div>
                <label className={labelCls}>Fish Registration No. (Fish-R) <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  className={baseInputClasses}
                  placeholder="14 to 16 digit number"
                  maxLength={16}
                  value={form.fish_registration_number}
                  onChange={(e) => updateField('fish_registration_number', e.target.value)}
                  onBlur={(e) => setFishRError(validateFishR(e.target.value))}
                />
                {fishRError && <p className="mt-1 text-xs text-rose-600">{fishRError}</p>}
              </div>
            )}

            {(form.fisherfolk_type === 'Capture' || form.fisherfolk_type === 'Mariculture') && (
              <div>
                <label className={labelCls}>Boat Registration No. (Boat-R) <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  className={baseInputClasses}
                  placeholder="Exactly 7 digits"
                  maxLength={7}
                  value={form.boat_registration_number}
                  onChange={(e) => updateField('boat_registration_number', e.target.value)}
                  onBlur={(e) => setBoatRError(validateBoatR(e.target.value))}
                />
                {boatRError && <p className="mt-1 text-xs text-rose-600">{boatRError}</p>}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Type-Specific Information */}
        {step === 2 && (
          <div className="space-y-4">
            {isAqua && (
              <>
                <div>
                  <label className={labelCls}>Culture Type</label>
                  <select className={baseInputClasses} required value={form.culture_type} onChange={(e) => updateField('culture_type', e.target.value)}>
                    <option value="Fish Cage">Fish Cage</option>
                    <option value="Fish Pond">Fish Pond</option>
                    <option value="Fish Pen">Fish Pen</option>
                    <option value="Pond Cage">Pond Cage</option>
                    <option value="Pen Tank">Pen Tank</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Species Cultured</label>
                  <select className={baseInputClasses} required value={form.species_cultured} onChange={(e) => updateField('species_cultured', e.target.value)}>
                    <option value="Tilapia">Tilapia</option>
                    <option value="Milkfish">Milkfish</option>
                    <option value="Shrimp">Shrimp</option>
                    <option value="Catfish">Catfish</option>
                    <option value="Bangus">Bangus</option>
                    <option value="Mudfish">Mudfish</option>
                    <option value="Carp">Carp</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fingerlings Stocked</label>
                  <input className={baseInputClasses} min="0" required type="number" value={form.fingerlings_stocked} onChange={(e) => updateField('fingerlings_stocked', e.target.value)} />
                </div>

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Aquaculture Facility Details</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Facility Location</label>
                    <select className={baseInputClasses} value={form.facility_location} onChange={(e) => updateField('facility_location', e.target.value)}>
                      {ARINGAY_BARANGAYS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  {isPondCulture && (
                    <>
                      <div>
                        <label className={labelCls}>Pond Dimension</label>
                        <input className={baseInputClasses} min="0" step="0.0001" type="number" value={form.pond_area_ha} onChange={(e) => updateField('pond_area_ha', e.target.value)} />
                      </div>
                      <div>
                        <label className={labelCls}>Number of Ponds</label>
                        <input className={baseInputClasses} min="0" type="number" value={form.number_of_ponds} onChange={(e) => updateField('number_of_ponds', e.target.value)} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className={labelCls}>Water Source</label>
                    <select className={baseInputClasses} value={form.water_source} onChange={(e) => updateField('water_source', e.target.value)}>
                      <option value="River">River</option>
                      <option value="Lake">Lake</option>
                      <option value="Creek">Creek</option>
                      <option value="Spring">Spring</option>
                      <option value="Irrigation Canal">Irrigation Canal</option>
                      <option value="Rain-fed">Rain-fed</option>
                      <option value="Tidal">Tidal</option>
                      <option value="Brackish Water">Brackish Water</option>
                      <option value="Freshwater">Freshwater</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {form.water_source === 'Other' && (
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Specify Water Source</label>
                      <input
                        className={baseInputClasses}
                        required
                        value={form.water_source_other}
                        onChange={(e) => updateField('water_source_other', e.target.value)}
                        placeholder="Specify water source"
                      />
                    </div>
                  )}
                  {isCageCulture && (
                    <>
                      <div>
                        <label className={labelCls}>Number of Cages</label>
                        <input className={baseInputClasses} min="0" type="number" value={form.number_of_cages} onChange={(e) => updateField('number_of_cages', e.target.value)} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Cage Dimensions</label>
                        <input className={baseInputClasses} value={form.cage_dimensions} onChange={(e) => updateField('cage_dimensions', e.target.value)} placeholder="e.g. 6m × 6m × 2m" />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {isCapture && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Vessel Type</label>
                    <select className={baseInputClasses} required value={form.vessel_type} onChange={(e) => updateField('vessel_type', e.target.value)}>
                      <option value="Motorized">Motorized</option>
                      <option value="Non-Motorized">Non-Motorized</option>
                      <option value="No Vessel">No Vessel</option>
                    </select>
                  </div>
                  {form.vessel_type === 'Motorized' && (
                    <div>
                      <label className={labelCls}>Vessel Material</label>
                      <select className={baseInputClasses} required value={form.vessel_material} onChange={(e) => updateField('vessel_material', e.target.value)}>
                        <option value="">-- Select --</option>
                        <option value="Wooden">Wooden</option>
                        <option value="Composite">Composite</option>
                        <option value="Fiberglass">Fiberglass</option>
                        <option value="Steel">Steel</option>
                        <option value="Other">Other</option>
                      </select>
                      {fieldErrors.vessel_material && <p className="mt-1 text-sm font-medium text-red-600">{fieldErrors.vessel_material}</p>}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Vessel Registration Number</label>
                  <input className={baseInputClasses} placeholder="e.g. MF-2024-001" value={form.vessel_registration_number} onChange={(e) => updateField('vessel_registration_number', e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Fishing Gear Type</label>
                    <input className={baseInputClasses} required placeholder="e.g. Gill Net, Handline, Purse Seine" value={form.fishing_gear_type} onChange={(e) => updateField('fishing_gear_type', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Fishing Ground</label>
                    <input className={baseInputClasses} required placeholder="e.g. Lingayen Gulf, Paratong" value={form.fishing_ground} onChange={(e) => updateField('fishing_ground', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Avg. Catch / Trip (kg)</label>
                    <input className={baseInputClasses} min="0" required step="0.01" type="number" value={form.average_catch_per_trip_kg} onChange={(e) => updateField('average_catch_per_trip_kg', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {form.fisherfolk_type === 'Vendor' && (
              <>
                <div>
                  <label className={labelCls}>Location Type</label>
                  <select className={baseInputClasses} required value={form.location_type} onChange={(e) => updateField('location_type', e.target.value)}>
                    <option value="Fixed Stall">Fixed Stall</option>
                    <option value="Market Stall">Market Stall</option>
                    <option value="Ambulant / No Fixed Location">Ambulant / No Fixed Location</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                {form.location_type !== 'Ambulant / No Fixed Location' && (
                  <div>
                    <label className={labelCls}>Stall Location</label>
                    <input className={baseInputClasses} required placeholder="e.g. Aringay Public Market, Stall 4" value={form.stall_location} onChange={(e) => updateField('stall_location', e.target.value)} />
                    {fieldErrors.stall_location && <p className="mt-1 text-sm font-medium text-red-600">{fieldErrors.stall_location}</p>}
                  </div>
                )}
                <div>
                  <label className={labelCls}>Commodity</label>
                  <input className={baseInputClasses} required placeholder="e.g. Tilapia, Bangus, Squid" value={form.type_of_products_sold} onChange={(e) => updateField('type_of_products_sold', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Source of Fish</label>
                  <input className={baseInputClasses} required placeholder="e.g. Local fishers, Wholesale market" value={form.source_of_fish} onChange={(e) => updateField('source_of_fish', e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {formError}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          {step === 1 && (
            <>
              <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
              <Button onClick={handleNext} type="button" variant="primary">Next</Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button onClick={() => setStep(1)} type="button" variant="ghost">Back</Button>
              <Button isLoading={isSubmitting} type="submit" variant="primary">Register Fisherfolk</Button>
            </>
          )}
        </div>
      </form>
    </ModalShell>
  )
}

export default RegisterFisherfolkModal
