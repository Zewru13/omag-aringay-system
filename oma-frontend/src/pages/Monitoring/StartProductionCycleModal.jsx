import { useEffect, useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { detectSeason } from '../FisheriesRecords/stockingHelpers.js'

// Aquaculture production cycles: ponds or cages only (the backend accepts only these for a new cycle).
const CULTURE_SYSTEMS = ['Fishpond', 'Fishcage']
const CULTURE_PHASE_OPTIONS = [
  'Nursery Phase',
  'Stocking Phase',
  'Grow-out Phase',
  'Harvest Phase',
  'Post-Harvest Phase',
  'Other',
]

// Culture systems that are described by individual units (ponds / cages).
const UNIT_SYSTEMS = { Fishpond: 'Pond', Fishcage: 'Cage' }
const MAX_UNITS = 50
const EMPTY_UNIT = { length_m: '', width_m: '', fingerling_count: '' }
const unitArea = (u) => {
  const l = parseFloat(u.length_m)
  const w = parseFloat(u.width_m)
  return l > 0 && w > 0 ? Math.round(l * w * 100) / 100 : 0
}
const fmtInt = (n) => n.toLocaleString()

// Plain calendar arithmetic on YYYY-MM-DD strings (UTC, so no timezone/DST drift).
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function StartProductionCycleModal({ onClose, onSuccess, fisherfolk: prefilledFf = null }) {
  const { showToast } = useToast()
  const { isFisherfolk, user } = useAuth()
  // Oyster is not offered when starting a production cycle (Admin and fisherfolk accounts). Only this form's
  // list is filtered: the Oyster SpeciesOption, the shared species API and existing records are untouched.
  const hideOyster = isFisherfolk || user?.role === 'ADMIN'
  const [ffSearch, setFfSearch] = useState(prefilledFf ? prefilledFf.full_name : '')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(prefilledFf)
  const [ffError, setFfError] = useState('')   // shown under Fisherfolk when Save is pressed without one
  // A fisherfolk account always starts a cycle for THEMSELVES: their own record (the only one the
  // fisherfolk API returns to them) is fixed here, and the backend forces it again on save.
  const [ownFf, setOwnFf] = useState(null)
  useEffect(() => {
    if (!isFisherfolk || prefilledFf) return
    api.get('/fisheries/fisherfolk/')
      .then(r => {
        const mine = (Array.isArray(r.data) ? r.data : (r.data.results || []))[0] || null
        setOwnFf(mine)
        setSelectedFf(mine)
      })
      .catch(() => showToast('Failed to load your fisherfolk record.', 'error'))
  }, [isFisherfolk, prefilledFf, showToast])
  const fixedFf = prefilledFf || ownFf
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [speciesList, setSpeciesList] = useState([])
  const [isLoadingSpecies, setIsLoadingSpecies] = useState(true)
  const [form, setForm] = useState({
    organization: '',
    cycle_name: '',
    cycle_name_other: '',
    species_option: '',
    culture_system: 'Fishpond',
    stocking_date: '',
    pond_location_barangay: '',
    pond_location_other_specify: '',
    water_source: '',
    water_source_other_specify: '',
    stocking_count: '',
    area_sqm: '',
    unit_count: '',
    target_harvest_date: '',
  })

  // Pond Location / Water Source options come from the backend's own lists (the same values it validates).
  const [barangayOptions, setBarangayOptions] = useState([])
  const [waterSourceOptions, setWaterSourceOptions] = useState([])
  useEffect(() => {
    api.get('/fisheries/stocking/form-options/')
      .then(r => { setBarangayOptions(r.data.barangays || []); setWaterSourceOptions(r.data.water_sources || []) })
      .catch(() => showToast('Failed to load pond location / water source options.', 'error'))
  }, [])

  // Default Pond Location = the selected fisherfolk's registered barangay (Fisherfolk.barangay, from the
  // fisherfolk API). It only runs when the fisherfolk (or the loaded options) change, so a barangay the
  // user picks manually afterwards is never overwritten. A fisherfolk with no barangay, or one that is
  // not among the options, leaves the field empty for manual selection - nothing is guessed.
  useEffect(() => {
    if (barangayOptions.length === 0) return
    const registered = selectedFf?.barangay
    setForm(f => ({ ...f, pond_location_barangay: registered && barangayOptions.includes(registered) ? registered : '', pond_location_other_specify: '' }))
  }, [selectedFf?.id, barangayOptions])

  useEffect(() => {
    api.get('/fisheries/species/?aquaculture_only=true')
      .then(r => setSpeciesList(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => showToast('Failed to load species list.', 'error'))
      .finally(() => setIsLoadingSpecies(false))
  }, [])

  // Organization options = only the organizations the selected fisherfolk is registered with.
  // Whenever the fisherfolk changes, the previous selection and options are cleared before the
  // new list loads, so an organization of a previous fisherfolk can never stay selected.
  const [orgOptions, setOrgOptions] = useState([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false)
  useEffect(() => {
    setOrgOptions([])
    setForm(f => ({ ...f, organization: '' }))
    if (!selectedFf) { setIsLoadingOrgs(false); return }
    let cancelled = false
    setIsLoadingOrgs(true)
    ;(async () => {
      try {
        const all = []
        for (let page = 1; page <= 20; page++) {
          const r = await api.get('/organizations/fisherfolk/', { params: { fisherfolk: selectedFf.id, page } })
          if (Array.isArray(r.data)) { all.push(...r.data); break }
          all.push(...(r.data.results || []))
          if (!r.data.next) break
        }
        if (!cancelled) setOrgOptions(all)
      } catch {
        if (!cancelled) { setOrgOptions([]); showToast('Failed to load organizations.', 'error') }
      } finally {
        if (!cancelled) setIsLoadingOrgs(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedFf?.id])

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    if (!q) { setFfResults([]); return }
    try {
      const r = await api.get('/fisheries/fisherfolk/', { params: { search: q } })
      setFfResults(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setFfResults([]) }
  }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // Target Harvest Date = stocking date + the selected species' own culture_duration_days
  // (SpeciesOption, from the species API). No duration -> no automatic date, never a fallback.
  // `targetTouched` marks a user-entered date so species/date changes don't overwrite it.
  const [targetTouched, setTargetTouched] = useState(false)
  const selectedSpecies = speciesList.find(sp => String(sp.id) === String(form.species_option))
  const speciesDays = selectedSpecies && Number(selectedSpecies.culture_duration_days) > 0 ? Number(selectedSpecies.culture_duration_days) : null
  const autoTarget = (species, stockingDate) => {
    const days = species && Number(species.culture_duration_days) > 0 ? Number(species.culture_duration_days) : null
    return days && stockingDate ? addDays(stockingDate, days) : ''
  }
  const handleSpeciesChange = (speciesId) => {
    const species = speciesList.find(sp => String(sp.id) === String(speciesId))
    setForm(f => ({ ...f, species_option: speciesId, ...(targetTouched ? {} : { target_harvest_date: autoTarget(species, f.stocking_date) }) }))
  }
  const handleStockingDateChange = (value) => {
    setForm(f => ({ ...f, stocking_date: value, ...(targetTouched ? {} : { target_harvest_date: autoTarget(selectedSpecies, value) }) }))
  }
  const handleTargetChange = (value) => {
    setTargetTouched(true)
    set('target_harvest_date', value)
  }
  const resumeAutoTarget = () => {
    setTargetTouched(false)
    set('target_harvest_date', autoTarget(selectedSpecies, form.stocking_date))
  }

  // Fishpond / Fishcage: one table row per pond/cage. `units` may hold more entries than
  // are shown (so 5 -> 2 -> 5 keeps what was typed); only the first `unitCount` are shown/sent.
  const [units, setUnits] = useState([])
  const unitLabel = UNIT_SYSTEMS[form.culture_system] || null
  const parsedCount = Number(form.unit_count)
  const unitCount = unitLabel && Number.isInteger(parsedCount) && parsedCount >= 1 ? Math.min(parsedCount, MAX_UNITS) : 0
  // Area = length x width (display only; the backend recomputes it). Actual Fingerlings is always
  // the user's own required number.
  const shownUnits = Array.from({ length: unitCount }, (_, i) => {
    const u = units[i] || EMPTY_UNIT
    return { ...u, area: unitArea(u), actual: u.fingerling_count }
  })
  const totalFingerlings = shownUnits.reduce((s, u) => s + (parseInt(u.actual) > 0 ? parseInt(u.actual) : 0), 0)
  const totalArea = shownUnits.reduce((s, u) => s + u.area, 0)
  // Estimated Harvest Biomass (kg): read-only preview from the backend, which applies the same
  // formula as StockingRecord.estimated_harvest_kg (fingerlings x survival % x avg body weight).
  // The submitted cycle never carries this value - the backend recalculates it on create.
  const [biomass, setBiomass] = useState(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [estimateFailed, setEstimateFailed] = useState(false)
  useEffect(() => {
    if (!unitLabel || !form.species_option || totalFingerlings < 1) { setBiomass(null); setEstimateFailed(false); setIsEstimating(false); return }
    let cancelled = false
    setIsEstimating(true)
    const timer = setTimeout(() => {
      api.get('/monitoring/aquaculture-cycles/estimate-harvest/', { params: { species: form.species_option, fingerlings: totalFingerlings } })
        .then(r => { if (!cancelled) { setBiomass(r.data); setEstimateFailed(false) } })
        .catch(() => { if (!cancelled) { setBiomass(null); setEstimateFailed(true) } })
        .finally(() => { if (!cancelled) setIsEstimating(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [unitLabel, form.species_option, totalFingerlings])

  const setUnitCount = (value) => {
    set('unit_count', value)
    const n = Math.min(parseInt(value) || 0, MAX_UNITS)
    setUnits(prev => (prev.length >= n ? prev : [...prev, ...Array.from({ length: n - prev.length }, () => ({ ...EMPTY_UNIT }))]))
  }
  const setUnitFields = (index, changes) => {
    setUnits(prev => {
      const next = prev.slice()
      while (next.length <= index) next.push({ ...EMPTY_UNIT })
      next[index] = { ...next[index], ...changes }
      return next
    })
  }
  const setUnitField = (index, field, value) => setUnitFields(index, { [field]: value })
  // Changing the culture system discards pond/cage data so it can never be submitted for another system.
  const handleCultureSystemChange = (value) => {
    setForm(f => ({ ...f, culture_system: value, unit_count: '', stocking_count: '', area_sqm: '' }))
    setUnits([])
  }

  const validateUnits = () => {
    if (!unitLabel) return null
    const plural = `${unitLabel.toLowerCase()}s`
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || form.unit_count === '') return `Number of ${unitLabel}s must be a positive whole number.`
    if (parsedCount > MAX_UNITS) return `At most ${MAX_UNITS} ${plural} are allowed.`
    for (let i = 0; i < shownUnits.length; i++) {
      const u = shownUnits[i]
      const count = Number(u.actual)
      if (!(parseFloat(u.length_m) > 0)) return `${unitLabel} ${i + 1}: length must be greater than 0.`
      if (!(parseFloat(u.width_m) > 0)) return `${unitLabel} ${i + 1}: width must be greater than 0.`
      if (u.area < 0.01) return `${unitLabel} ${i + 1}: length x width must be at least 0.01 sq.m.`
      if (u.actual === '' || !Number.isInteger(count) || count < 1) return `${unitLabel} ${i + 1}: actual fingerlings must be a positive whole number.`
    }    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Fisherfolk is required: nothing is sent without one.
    if (!selectedFf) { setFfError('Fisherfolk is required.'); showToast('Select a fisherfolk.', 'error'); return }
    if (form.target_harvest_date && form.stocking_date && form.target_harvest_date < form.stocking_date) {
      showToast('Target harvest date cannot be earlier than the stocking date.', 'error'); return
    }
    if (form.pond_location_barangay === 'Other' && !form.pond_location_other_specify.trim()) {
      showToast('Specify the pond location.', 'error'); return
    }
    const unitError = validateUnits()
    if (unitError) { showToast(unitError, 'error'); return }
    setIsSubmitting(true)
    try {
      const normalizedCycleName = form.cycle_name === 'Other'
        ? form.cycle_name_other.trim()
        : form.cycle_name
      const species = speciesList.find(sp => String(sp.id) === String(form.species_option))

      const res = await api.post('/monitoring/aquaculture-cycles/', {
        fisherfolk: selectedFf.id,
        organization: form.organization ? Number(form.organization) : null,
        cycle_name: normalizedCycleName,
        species_farmed: species.species_name,
        species_option: species.id,
        culture_system: form.culture_system,
        stocking_date: form.stocking_date,
        pond_location_barangay: form.pond_location_barangay,
        ...(form.pond_location_barangay === 'Other' ? { pond_location_other_specify: form.pond_location_other_specify.trim() } : {}),
        water_source: form.water_source,
        ...(form.water_source === 'Other' ? { water_source_other_specify: form.water_source_other_specify.trim() } : {}),
        ...(unitLabel
          // Area and totals are derived server-side from length x width and the actual counts.
          ? { units: shownUnits.map(u => ({ length_m: parseFloat(u.length_m), width_m: parseFloat(u.width_m), fingerling_count: parseInt(u.actual) })) }
          : {
              stocking_count: form.stocking_count ? parseInt(form.stocking_count) : null,
              area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
            }),
        target_harvest_date: form.target_harvest_date || null,
      })
      showToast('Production cycle started.', 'success')
      onSuccess(res.data)
      onClose()
    } catch (err) {
      const data = err?.response?.data
      let message = 'Failed to save.'

      if (typeof data === 'string') {
        message = data
      } else if (Array.isArray(data)) {
        message = data.join(' ')
      } else if (data && typeof data === 'object') {
        if (typeof data.detail === 'string') {
          message = data.detail
        } else if (Array.isArray(data.detail)) {
          message = data.detail.join(' ')
        } else {
          const parts = []
          Object.entries(data).forEach(([field, value]) => {
            if (field === 'units' && Array.isArray(value)) {
              value.forEach((unitErrors, i) => {
                if (unitErrors && typeof unitErrors === 'object') {
                  Object.entries(unitErrors).forEach(([k, v]) => parts.push(` ${i + 1} ${k.replace(/_/g, ' ')}: ${[].concat(v).join(' ')}`))
                } else if (typeof unitErrors === 'string') {
                  parts.push(unitErrors)
                }
              })
            } else if (Array.isArray(value)) {
              parts.push(`${field}: ${value.join(' ')}`)
            } else if (typeof value === 'string') {
              parts.push(`${field}: ${value}`)
            }
          })
          if (parts.length > 0) {
            message = parts.join(' | ')
          }
        }
      }

      showToast(message, 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell title="Start Production Cycle" subtitle="Begin a new aquaculture production cycle" icon={Fish} onClose={onClose} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {fixedFf ? (
          <FormField label="Fisherfolk" required>
            <p className="rounded-xl border border-green-200 bg-[#f0f7f0] px-3 py-2 text-sm font-medium text-slate-800">
              {fixedFf.full_name} <span className="ml-2 text-xs text-slate-400">{fixedFf.barangay}</span>
            </p>
          </FormField>
        ) : isFisherfolk ? (
          <FormField label="Fisherfolk" required error={ffError}>
            <p className="text-sm text-slate-500">Loading your fisherfolk record…</p>
          </FormField>
        ) : (
          <FormField label="Fisherfolk" required error={ffError}>
            <SearchBar value={ffSearch} onChange={handleFfSearch} placeholder="Search fisherfolk by name or registration number…" />
            {ffResults.length > 0 && (
              <ul className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {ffResults.map(ff => (
                  <li key={ff.id}>
                    <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]" onClick={() => { setSelectedFf(ff); setFfSearch(ff.full_name); setFfResults([]); setFfError('') }}>
                      <span className="font-medium">{ff.full_name}</span>
                      <span className="ml-2 text-slate-400">{ff.barangay}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedFf && <p className="mt-1 text-xs text-[#1E4620]">Selected: {selectedFf.full_name}</p>}
          </FormField>
        )}

        <FormField label="Organization">
          <select
            className={baseInputClasses}
            value={form.organization}
            disabled={!selectedFf || isLoadingOrgs || orgOptions.length === 0}
            onChange={e => set('organization', e.target.value)}
          >
            <option value="">
              {!selectedFf ? 'Select Fisherfolk first'
                : isLoadingOrgs ? 'Loading organizations…'
                : orgOptions.length === 0 ? 'No registered organizations'
                : 'Select Organization'}
            </option>
            {orgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Culture Phase" required>
            <select
              className={baseInputClasses}
              required
              value={form.cycle_name}
              onChange={e => {
                const value = e.target.value
                set('cycle_name', value)
                if (value !== 'Other') set('cycle_name_other', '')
              }}
            >
              <option value="">Select Culture Phase</option>
              {CULTURE_PHASE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            {form.cycle_name === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`}
                required
                value={form.cycle_name_other}
                onChange={e => set('cycle_name_other', e.target.value)}
                placeholder="Specify Culture Phase"
              />
            )}
          </FormField>
          <FormField label="Species Farmed" required>
            <select
              className={baseInputClasses}
              required
              value={form.species_option}
              onChange={e => handleSpeciesChange(e.target.value)}
            >
              <option value="">{isLoadingSpecies ? 'Loading species…' : 'Select Species'}</option>
              {speciesList
                .filter(sp => !hideOyster || (sp.species_name || '').trim().toLowerCase() !== 'oyster')
                .map(sp => <option key={sp.id} value={sp.id}>{sp.species_name}</option>)}
            </select>
          </FormField>
          <FormField label="Culture System" required>
            <select className={baseInputClasses} required value={form.culture_system} onChange={e => handleCultureSystemChange(e.target.value)}>
              {CULTURE_SYSTEMS.map(s => <option key={s}>{s}</option>)}
            </select>
          </FormField>
          <FormField label="Water Source" required>
            <select
              className={baseInputClasses} required
              value={form.water_source}
              onChange={e => { set('water_source', e.target.value); if (e.target.value !== 'Other') set('water_source_other_specify', '') }}
            >
              <option value="" disabled>Select Water Source</option>
              {waterSourceOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {form.water_source === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`} required
                value={form.water_source_other_specify}
                onChange={e => set('water_source_other_specify', e.target.value)}
                placeholder="Specify Water Source"
              />
            )}
          </FormField>
          <FormField label="Pond Location" required>
            <select
              className={baseInputClasses} required
              value={form.pond_location_barangay}
              onChange={e => { set('pond_location_barangay', e.target.value); if (e.target.value !== 'Other') set('pond_location_other_specify', '') }}
            >
              <option value="" disabled>Select Barangay</option>
              {barangayOptions.map(b => <option key={b} value={b}>{b}</option>)}
              <option value="Other">Other</option>
            </select>
            {form.pond_location_barangay === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`} required maxLength={100}
                value={form.pond_location_other_specify}
                onChange={e => set('pond_location_other_specify', e.target.value)}
                placeholder="Enter pond location" aria-label="Specify Pond Location"
              />
            )}
          </FormField>
          <FormField label="Stocking Date" required>
            <input type="date" className={baseInputClasses} required value={form.stocking_date} onChange={e => handleStockingDateChange(e.target.value)} />
          </FormField>
          <FormField label="Season">
            <input
              type="text" readOnly tabIndex={-1} data-testid="detected-season"
              className={`${baseInputClasses} cursor-not-allowed bg-slate-50 text-slate-700`}
              value={form.stocking_date ? `${detectSeason(form.stocking_date)} Season` : ''}
              placeholder="Detected from Stocking Date"
            />
          </FormField>
          <FormField label="Target Harvest Date">
            <input
              type="date" className={baseInputClasses} min={form.stocking_date || undefined}
              value={form.target_harvest_date} onChange={e => handleTargetChange(e.target.value)}
            />
            {form.species_option && (
              <p className="mt-1 text-xs text-slate-500">
                {speciesDays
                  ? (targetTouched
                    ? <>Custom date. <button type="button" className="font-medium text-[#1E4620] underline" onClick={resumeAutoTarget}>Use automatic estimate</button> ({speciesDays} days after stocking)</>
                    : `Automatically estimated from species (${speciesDays} days) and stocking date. You may adjust this date.`)
                  : 'No estimated harvest period is configured for this species. Enter a target date if known.'}
              </p>
            )}
          </FormField>
          {unitLabel ? (
            <FormField label={`Number of ${unitLabel}s`} required>
              <input
                type="number" className={baseInputClasses} required min="1" max={MAX_UNITS} step="1"
                value={form.unit_count} onChange={e => setUnitCount(e.target.value)}
              />
            </FormField>
          ) : (
            <>
              <FormField label="Stocking Count (pieces)" required>
                <input type="number" className={baseInputClasses} required min="1" value={form.stocking_count} onChange={e => set('stocking_count', e.target.value)} />
              </FormField>
              <FormField label="Area (sq.m.)">
                <input type="number" step="0.01" className={baseInputClasses} min="0" value={form.area_sqm} onChange={e => set('area_sqm', e.target.value)} />
              </FormField>
            </>
          )}
        </div>

        {unitLabel && unitCount > 0 && (
          <div className="space-y-3 rounded-xl border border-green-200 bg-[#f0f7f0] p-4">
            <p className="text-sm font-semibold text-[#1E4620]">{unitLabel} Details</p>
            {/* One table for all ponds/cages: one row per unit, numbered by its unit number (1..N). */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[560px] text-sm" data-testid="unit-table">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">{unitLabel} No.</th>
                    <th className="px-3 py-2">Length (m) <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2">Width (m) <span className="text-red-500">*</span></th>
                    <th className="px-3 py-2">Area (m²)</th>
                    <th className="px-3 py-2">Number of Fingerlings <span className="text-red-500">*</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shownUnits.map((u, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{unitLabel} {i + 1}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" className={baseInputClasses} required min="0.01" step="0.01" aria-label={`${unitLabel} ${i + 1} length (m)`}
                          value={u.length_m} onChange={e => setUnitField(i, 'length_m', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" className={baseInputClasses} required min="0.01" step="0.01" aria-label={`${unitLabel} ${i + 1} width (m)`}
                          value={u.width_m} onChange={e => setUnitField(i, 'width_m', e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800" data-testid="unit-area">{u.area > 0 ? u.area.toFixed(2) : '—'}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" className={baseInputClasses} required min="1" step="1" aria-label={`${unitLabel} ${i + 1} number of fingerlings`}
                          value={u.actual} onChange={e => setUnitField(i, 'fingerling_count', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800" data-testid="unit-total-row">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2" data-testid="total-area">{totalArea.toFixed(2)}</td>
                    <td className="px-3 py-2" data-testid="total-fingerlings">{fmtInt(totalFingerlings)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-green-200 pt-2 text-sm text-slate-800">
              <span data-testid="estimated-biomass">
                Estimated Harvest Biomass:{' '}
                <strong className="text-[#1E4620]">
                  {isEstimating ? '…' : biomass?.estimated_harvest_kg != null
                    ? `${Number(biomass.estimated_harvest_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
                    : totalFingerlings < 1 ? '—' : estimateFailed ? 'Unavailable' : 'Not configured'}
                </strong>
              </span>
              {!isEstimating && biomass?.estimated_harvest_kg != null && (
                <span className="basis-full text-xs text-slate-500">
                  Forecast: {fmtInt(totalFingerlings)} fingerlings × {Number(biomass.survival_rate_pct)}% survival × {Number(biomass.avg_body_weight_kg)} kg average weight (species settings).
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Start Cycle</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default StartProductionCycleModal
