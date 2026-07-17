import { useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'

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
  species_cultured: '',
  area_hectares: '',
  fingerlings_stocked: '',
  // Facility profile (Aquaculture / Mariculture)
  facility_location: '',
  pond_area_ha: '',
  number_of_ponds: '',
  water_source: '',
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

function RegisterFisherfolkModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [step, setStep] = useState(1)
  const [noVessel, setNoVessel] = useState(false)
  const [lguError, setLguError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [fishRError, setFishRError] = useState('')
  const [boatRError, setBoatRError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateFishR = (value) => {
    if (!value.trim()) return 'Fish Registration Number is required.'
    if (!/^\d{14,16}$/.test(value.trim())) return 'Fish Registration Number must be 14 to 16 digits.'
    return ''
  }

  const validateBoatR = (value) => {
    if (!value.trim()) return ''
    if (!/^\d{7}$/.test(value.trim())) return 'Boat Registration Number must be exactly 7 digits.'
    return ''
  }

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === 'lgu_registration_number') setLguError('')
    if (field === 'birthdate') setBirthdateError(validateAge(value) || '')
    if (field === 'fish_registration_number') setFishRError('')
    if (field === 'boat_registration_number') setBoatRError('')
    if (field === 'fisherfolk_type' && value !== 'Capture' && value !== 'Mariculture') {
      setNoVessel(false)
      setBoatRError('')
    }
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const handleNoVesselChange = (checked) => {
    setNoVessel(checked)
    if (checked) {
      setForm((prev) => ({ ...prev, boat_registration_number: '' }))
      setBoatRError('')
    }
  }

  const handleNext = () => {
    setLguError('')
    setFormError('')

    if (!form.lgu_registration_number.trim()) {
      setLguError('LGU Registration Number is required.')
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

    if (form.fisherfolk_type !== 'Vendor') {
      const fishErr = validateFishR(form.fish_registration_number)
      if (fishErr) { setFishRError(fishErr); return }
    }
    if (!noVessel && (form.fisherfolk_type === 'Capture' || form.fisherfolk_type === 'Mariculture')) {
      const boatErr = validateBoatR(form.boat_registration_number)
      if (boatErr) { setBoatRError(boatErr); return }
    }

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
      boat_registration_number: noVessel ? '' : form.boat_registration_number,
      has_vessel: !noVessel,
    }
    const facilityFields = {
      facility_location: form.facility_location,
      pond_area_ha: form.pond_area_ha || null,
      number_of_ponds: form.number_of_ponds || null,
      water_source: form.water_source,
      number_of_cages: form.number_of_cages || null,
      cage_dimensions: form.cage_dimensions,
    }
    if (form.fisherfolk_type === 'Aquaculture' || form.fisherfolk_type === 'Mariculture') {
      return {
        ...base,
        ...facilityFields,
        culture_type: form.culture_type,
        species_cultured: form.species_cultured,
        area_hectares: form.area_hectares,
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

    const ageError = validateAge(form.birthdate)
    if (ageError) {
      setBirthdateError(ageError)
      setStep(1)
      return
    }

    setIsSubmitting(true)
    try {
      await api.post('/fisheries/fisherfolk/', buildPayload())
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      if (data?.lgu_registration_number) {
        setLguError(data.lgu_registration_number[0])
        setStep(1)
      } else if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
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
        setFormError(data.non_field_errors[0])
      } else if (data?.detail) {
        setFormError(data.detail)
      } else {
        setFormError('Unable to register fisherfolk. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isAqua = form.fisherfolk_type === 'Aquaculture' || form.fisherfolk_type === 'Mariculture'
  const isCapture = form.fisherfolk_type === 'Capture' || form.fisherfolk_type === 'Inland'
  const isVesselType = form.fisherfolk_type === 'Capture' || form.fisherfolk_type === 'Mariculture'

  return (
    <ModalShell title="Register Fisherfolk" subtitle="Fill in the fisherfolk's details below" icon={Fish} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-slate-400">Step {step} of 2</p>

        {/* Step 1: Basic Information */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>LGU Registration Number</label>
              <input className={baseInputClasses} required placeholder="e.g. FF-2024-00001" value={form.lgu_registration_number} onChange={(e) => updateField('lgu_registration_number', e.target.value)} />
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
                <input className={baseInputClasses} placeholder="e.g. 09123456789" value={form.contact_number} onChange={(e) => updateField('contact_number', e.target.value)} />
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
              {isVesselType && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="no_vessel"
                    checked={noVessel}
                    onChange={(e) => handleNoVesselChange(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E4620] focus:ring-[#1E4620]"
                  />
                  <label htmlFor="no_vessel" className="cursor-pointer text-sm text-slate-700">
                    No Vessel — this fisherfolk does not own or operate a fishing vessel
                  </label>
                </div>
              )}
            </div>

            {form.fisherfolk_type !== 'Vendor' && (
              <div>
                <label className={labelCls}>Fish Registration No. (Fish-R)</label>
                <input
                  className={baseInputClasses}
                  required
                  placeholder="14 to 16 digit number"
                  maxLength={16}
                  value={form.fish_registration_number}
                  onChange={(e) => updateField('fish_registration_number', e.target.value)}
                  onBlur={(e) => setFishRError(validateFishR(e.target.value))}
                />
                {fishRError && <p className="mt-1 text-xs text-rose-600">{fishRError}</p>}
              </div>
            )}

            {isVesselType && !noVessel && (
              <div>
                <label className={labelCls}>
                  Boat Registration No. (Boat-R){' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  className={baseInputClasses}
                  placeholder="Exactly 7 digits"
                  maxLength={7}
                  value={form.boat_registration_number}
                  onChange={(e) => updateField('boat_registration_number', e.target.value)}
                  onBlur={(e) => setBoatRError(validateBoatR(e.target.value))}
                />
                <p className="mt-1 text-xs text-slate-400">7-digit Boat-R number</p>
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
                  <input className={baseInputClasses} required placeholder="e.g. Tilapia, Milkfish, Shrimp" value={form.species_cultured} onChange={(e) => updateField('species_cultured', e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Area (hectares)</label>
                    <input className={baseInputClasses} min="0" required step="0.01" type="number" value={form.area_hectares} onChange={(e) => updateField('area_hectares', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Fingerlings Stocked</label>
                    <input className={baseInputClasses} min="0" required type="number" value={form.fingerlings_stocked} onChange={(e) => updateField('fingerlings_stocked', e.target.value)} />
                  </div>
                </div>

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Aquaculture Facility Details</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Facility Location</label>
                    <input className={baseInputClasses} value={form.facility_location} onChange={(e) => updateField('facility_location', e.target.value)} placeholder="e.g. Brgy. San Juan, Near river" />
                  </div>
                  <div>
                    <label className={labelCls}>Pond Area (ha)</label>
                    <input className={baseInputClasses} min="0" step="0.0001" type="number" value={form.pond_area_ha} onChange={(e) => updateField('pond_area_ha', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Number of Ponds</label>
                    <input className={baseInputClasses} min="0" type="number" value={form.number_of_ponds} onChange={(e) => updateField('number_of_ponds', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Water Source</label>
                    <input className={baseInputClasses} value={form.water_source} onChange={(e) => updateField('water_source', e.target.value)} placeholder="e.g. River, Tidal, Rain-fed" />
                  </div>
                  <div>
                    <label className={labelCls}>Number of Cages</label>
                    <input className={baseInputClasses} min="0" type="number" value={form.number_of_cages} onChange={(e) => updateField('number_of_cages', e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Cage Dimensions</label>
                    <input className={baseInputClasses} value={form.cage_dimensions} onChange={(e) => updateField('cage_dimensions', e.target.value)} placeholder="e.g. 6m × 6m × 2m" />
                  </div>
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
