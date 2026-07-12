import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Plus, Search, Sprout, Trash2, User } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

function detectSeason(dateStr) {
  if (!dateStr) return 'Wet'
  const month = new Date(dateStr).getMonth() + 1
  return month >= 6 && month <= 11 ? 'Wet' : 'Dry'
}

const makeRecord = (n) => ({
  _id: n,
  farm_location_barangay: '',
  land_status: '',
  land_status_other_specify: '',
  crop_type: '',
  date_planted: '',
  area_planted_ha: '',
  season: detectSeason(''),
  variety_used: '',
  variety_used_is_other: false,
  seed_source: '',
  seed_source_other_specify: '',
  quantity_of_seeds: '',
  seed_quantity_unit: 'kg',
})

// ── Harvest Preview ───────────────────────────────────────────────────────────

function HarvestPreview({ cropTypes, cropTypeId, datePlanted, areaPha }) {
  const preview = useMemo(() => {
    if (!cropTypeId || !datePlanted) return null
    const ct = cropTypes.find(c => String(c.id) === String(cropTypeId))
    if (!ct) return null
    const harvest = new Date(datePlanted + 'T00:00:00')
    harvest.setDate(harvest.getDate() + ct.days_to_harvest)
    const estYield = ct.yield_per_ha_kg && areaPha
      ? (parseFloat(ct.yield_per_ha_kg) * parseFloat(areaPha)).toFixed(0)
      : null
    return {
      date: harvest.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      days: ct.days_to_harvest,
      estYield,
    }
  }, [cropTypes, cropTypeId, datePlanted, areaPha])

  if (!preview) return null
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#C8E6D0] bg-[#EBF5EE] px-4 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#1B4D2E]" />
      <div>
        <p className="text-xs font-semibold text-[#1B4D2E]">Expected Harvest: {preview.date}</p>
        <p className="text-[11px] text-[#235E38]">
          {preview.days} days growing period
          {preview.estYield ? ` · Est. yield: ${Number(preview.estYield).toLocaleString()} kg` : ''}
        </p>
      </div>
    </div>
  )
}

// ── Farmer Search (top-level, shared) ─────────────────────────────────────────

function FarmerSearchInput({ onSelect, selected }) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [showDrop,  setShowDrop]  = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef  = useRef(null)

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const r = await api.get('/farmers/', { params: { search: q } })
      const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
      setResults(list.slice(0, 8))
    } catch { setResults([]) }
    finally { setSearching(false) }
  }, [])

  const handleChange = (e) => {
    const v = e.target.value
    setQuery(v)
    setShowDrop(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(v), 300)
  }

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (farmer) => {
    onSelect({
      farmer_id: farmer.id,
      farmer_full_name: farmer.full_name,
      farmer_home_barangay: farmer.barangay || '',
      farmer_assoc_id: farmer.farmers_association || null,
      farmer_assoc_name: farmer.farmers_association_name || '',
    })
    setQuery(farmer.full_name)
    setShowDrop(false)
  }

  const handleClear = () => {
    setQuery('')
    onSelect({ farmer_id: null, farmer_full_name: '', farmer_home_barangay: '', farmer_assoc_id: null, farmer_assoc_name: '' })
    setResults([])
  }

  const displayValue = selected.farmer_id ? selected.farmer_full_name : query

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[13px] font-medium text-[#4A5E4A]">
        Farmer <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name or RSBSA number…"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
          className={`${baseInputClasses} pl-8 ${selected.farmer_id ? 'pr-16' : ''}`}
        />
        {selected.farmer_id && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-rose-500 hover:text-rose-700 px-1"
          >
            Clear
          </button>
        )}
      </div>

      {showDrop && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto">
          {searching ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">{query.trim() ? 'No farmers found.' : 'Type to search farmers.'}</p>
          ) : (
            results.map(f => (
              <button
                key={f.id}
                type="button"
                onMouseDown={() => handleSelect(f)}
                className="flex items-start gap-3 w-full px-4 py-2.5 text-left hover:bg-[#F5F7F5] transition-colors"
              >
                <User className="w-3.5 h-3.5 mt-0.5 text-[#A8BCA8] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[#1A2B1A]">{f.full_name}</p>
                  <p className="text-[11px] text-[#7A8E7A]">
                    {f.rsbsa_number && `${f.rsbsa_number} · `}{f.barangay || ''}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Crop Duplicate Check ──────────────────────────────────────────────────────

function useCropDuplicateCheck(farmerId, cropTypeId) {
  const [duplicates,  setDuplicates]  = useState([])
  const [isChecking,  setIsChecking]  = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!farmerId || !cropTypeId) { setDuplicates([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setIsChecking(true)
      try {
        const r = await api.get('/production/monitoring/check-duplicate/', {
          params: { farmer: farmerId, crop_type: cropTypeId },
        })
        setDuplicates(r.data?.duplicates || [])
      } catch { setDuplicates([]) }
      finally { setIsChecking(false) }
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [farmerId, cropTypeId])

  return { duplicates, isChecking }
}

// ── Single Crop Record Card ───────────────────────────────────────────────────

function CropRecordCard({ rec, index, total, cropTypes, seedSources, varieties, farmerId, errors, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(rec._id, field, value)
  const { duplicates, isChecking } = useCropDuplicateCheck(farmerId, rec.crop_type)

  const relevantVarieties = varieties.filter(
    v => v.is_active && (!v.crop_type || String(v.crop_type) === String(rec.crop_type))
  )

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Crop Record {index + 1}</p>
        {total > 1 && (
          <button type="button" onClick={() => onRemove(rec._id)}
            className="flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-700">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>

      {/* Farm location + land status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <BarangaySelect
          id={`farm_loc_${rec._id}`}
          label="Farm Location (Barangay)"
          required
          value={rec.farm_location_barangay}
          onChange={e => set('farm_location_barangay', e.target.value)}
          error={errors.farm_location_barangay}
        />

        <FormField label="Land Status" required error={errors.land_status}>
          <select className={baseInputClasses} value={rec.land_status}
            onChange={e => {
              set('land_status', e.target.value)
              if (e.target.value !== 'Other') set('land_status_other_specify', '')
            }}>
            <option value="">Select…</option>
            <option value="Owner">Owner</option>
            <option value="Lessee">Lessee</option>
            <option value="Tenant">Tenant</option>
            <option value="Other">Other</option>
          </select>
          {rec.land_status === 'Other' && (
            <input type="text" className={`${baseInputClasses} mt-2`}
              placeholder="Please specify land status"
              value={rec.land_status_other_specify}
              onChange={e => set('land_status_other_specify', e.target.value)} />
          )}
        </FormField>
      </div>

      <div className="border-t border-[#F0F4F0]" />

      {/* Crop details */}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Crop Type" required>
          <select className={baseInputClasses} value={rec.crop_type}
            onChange={e => set('crop_type', e.target.value)}>
            <option value="">Select crop type…</option>
            {cropTypes.map(ct => (
              <option key={ct.id} value={ct.id}>{ct.name} ({ct.days_to_harvest}d)</option>
            ))}
          </select>
        </FormField>

        <FormField label="Date Planted" required>
          <input type="date" className={baseInputClasses} value={rec.date_planted}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => {
              set('date_planted', e.target.value)
              set('season', detectSeason(e.target.value))
            }} />
        </FormField>

        {rec.crop_type && (() => {
          const ct = cropTypes.find(c => String(c.id) === String(rec.crop_type))
          if (!ct) return null
          return (
            <div className="sm:col-span-2 bg-slate-50 rounded-xl px-4 py-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Category</p>
                  <p className="text-sm font-medium text-slate-900">{ct.category_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Subcategory</p>
                  <p className="text-sm font-medium text-slate-900">{ct.subcategory_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Growth Duration</p>
                  <p className="text-sm font-medium text-slate-900">{ct.days_to_harvest} days</p>
                </div>
              </div>
            </div>
          )
        })()}

        <FormField label="Area Planted (ha)" required>
          <input type="number" step="0.01" min="0" className={baseInputClasses}
            placeholder="0.00"
            value={rec.area_planted_ha}
            onChange={e => set('area_planted_ha', e.target.value)} />
        </FormField>

        <FormField label="Cropping Season" required>
          <select className={baseInputClasses} value={rec.season}
            onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet Season (Jun–Nov)</option>
            <option value="Dry">Dry Season (Dec–May)</option>
          </select>
        </FormField>
      </div>

      <HarvestPreview
        cropTypes={cropTypes}
        cropTypeId={rec.crop_type}
        datePlanted={rec.date_planted}
        areaPha={rec.area_planted_ha}
      />

      {isChecking && (
        <p className="text-xs text-slate-400 italic">Checking for active duplicates…</p>
      )}

      {!isChecking && duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-amber-800">
              Active record{duplicates.length > 1 ? 's' : ''} already exist for this crop — you may still proceed.
            </p>
          </div>
          <ul className="space-y-0.5">
            {duplicates.map(d => (
              <li key={d.id} className="text-xs text-amber-700">
                Planted: {d.date_planted || '—'} · Area: {d.area_planted_ha} ha
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Optional planting details */}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Variety Used (optional)">
          {rec.variety_used_is_other ? (
            <div className="flex gap-2">
              <input type="text" className={baseInputClasses}
                placeholder="Please specify variety"
                value={rec.variety_used}
                onChange={e => set('variety_used', e.target.value)}
                autoFocus />
              <button type="button"
                className="shrink-0 text-xs font-medium text-[#4A5E4A] hover:text-[#1B4D2E] px-2"
                onClick={() => { set('variety_used_is_other', false); set('variety_used', '') }}>
                Back to list
              </button>
            </div>
          ) : (
            <select className={baseInputClasses} value={rec.variety_used}
              onChange={e => {
                if (e.target.value === '__other__') {
                  set('variety_used_is_other', true)
                  set('variety_used', '')
                } else {
                  set('variety_used', e.target.value)
                }
              }}>
              <option value="">Select variety</option>
              {relevantVarieties.map(v => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
              <option value="__other__">Other</option>
            </select>
          )}
        </FormField>

        <FormField label="Seed Source (optional)">
          <select className={baseInputClasses} value={rec.seed_source}
            onChange={e => {
              set('seed_source', e.target.value)
              if (e.target.value !== 'Other') set('seed_source_other_specify', '')
            }}>
            <option value="">Select source</option>
            {seedSources.filter(s => s.is_active).map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
            <option value="Other">Other</option>
          </select>
          {rec.seed_source === 'Other' && (
            <input type="text" className={`${baseInputClasses} mt-2`}
              placeholder="Please specify seed source"
              value={rec.seed_source_other_specify}
              onChange={e => set('seed_source_other_specify', e.target.value)} />
          )}
        </FormField>

        <FormField label="Quantity of Seeds (optional)">
          <input type="number" step="0.01" min="0" className={baseInputClasses}
            placeholder="e.g. 25"
            value={rec.quantity_of_seeds}
            onChange={e => set('quantity_of_seeds', e.target.value)} />
        </FormField>

        <FormField label="Unit">
          <select className={baseInputClasses} value={rec.seed_quantity_unit}
            onChange={e => set('seed_quantity_unit', e.target.value)}>
            <option value="kg">kg</option>
            <option value="bags">bags</option>
            <option value="pcs">pcs</option>
            <option value="bundles">bundles</option>
          </select>
        </FormField>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

function AddCropMonitoringModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [cropTypes,    setCropTypes]    = useState([])
  const [seedSources,  setSeedSources]  = useState([])
  const [varieties,    setVarieties]    = useState([])
  const [records,      setRecords]      = useState([makeRecord(1)])
  const [nextId,       setNextId]       = useState(2)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState('')
  const [fieldErrors,  setFieldErrors]  = useState({})

  // Shared farmer state — applies to ALL crop records in this session
  const [farmerInfo, setFarmerInfo] = useState({
    farmer_id: null,
    farmer_full_name: '',
    farmer_home_barangay: '',
    farmer_assoc_id: null,
    farmer_assoc_name: '',
  })

  useEffect(() => {
    api.get('/production/crop-types/').then(r => setCropTypes(Array.isArray(r.data) ? r.data : (r.data.results || [])))
    api.get('/production/seed-sources/').then(r => setSeedSources(Array.isArray(r.data) ? r.data : (r.data.results || [])))
    api.get('/production/varieties/').then(r => setVarieties(Array.isArray(r.data) ? r.data : (r.data.results || [])))
  }, [])

  const addRecord = () => {
    setRecords(r => [...r, makeRecord(nextId)])
    setNextId(n => n + 1)
  }

  const removeRecord = (id) => setRecords(r => r.filter(x => x._id !== id))

  const updateRecord = (id, field, value) => {
    setRecords(r => r.map(x => x._id === id ? { ...x, [field]: value } : x))
  }

  const validate = () => {
    if (!farmerInfo.farmer_id) { setError('Please select a farmer.'); return false }
    for (const rec of records) {
      const i = records.indexOf(rec) + 1
      if (!rec.crop_type)       { setError(`Record ${i}: Crop type is required.`); return false }
      if (!rec.date_planted)    { setError(`Record ${i}: Date planted is required.`); return false }
      if (!rec.area_planted_ha) { setError(`Record ${i}: Area planted is required.`); return false }
    }
    const nextFieldErrors = {}
    for (const rec of records) {
      const recErrors = {}
      if (!rec.farm_location_barangay) recErrors.farm_location_barangay = 'Farm location (barangay) is required.'
      if (!rec.land_status) recErrors.land_status = 'Land status is required.'
      if (Object.keys(recErrors).length > 0) nextFieldErrors[rec._id] = recErrors
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setError('Please fix the highlighted fields.')
      return false
    }
    setFieldErrors({})
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      for (const rec of records) {
        const year = new Date(rec.date_planted).getFullYear()
        await api.post('/production/monitoring/', {
          farmer:                 farmerInfo.farmer_id,
          farmers_association:    farmerInfo.farmer_assoc_id || null,
          farm_location_barangay: rec.farm_location_barangay || '',
          land_status:            rec.land_status || '',
          land_status_other_specify: rec.land_status === 'Other' ? (rec.land_status_other_specify || '') : '',
          crop_type:              rec.crop_type,
          season:                 rec.season,
          year,
          date_planted:           rec.date_planted,
          area_planted_ha:        rec.area_planted_ha,
          variety_used:           rec.variety_used || '',
          seed_source:            rec.seed_source || '',
          seed_source_other_specify: rec.seed_source === 'Other' ? (rec.seed_source_other_specify || '') : '',
          quantity_of_seeds:      rec.quantity_of_seeds ? parseFloat(rec.quantity_of_seeds) : null,
          seed_quantity_unit:     rec.seed_quantity_unit || 'kg',
        })
      }
      showToast(`${records.length} crop monitoring record${records.length > 1 ? 's' : ''} added.`, 'success')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save one or more records.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell title="Add New Crop" subtitle="Enter crop information below." icon={Sprout} onClose={onClose} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit}>
          {/* Scrollable body */}
          <div
            className="overflow-y-auto pr-1 space-y-4 pb-6"
            style={{ maxHeight: 'calc(85vh - 180px)' }}
          >
            {/* ── SECTION 1: Farmer (entered once) ── */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">
                Farmer Information
              </p>

              <FarmerSearchInput
                onSelect={setFarmerInfo}
                selected={farmerInfo}
              />

              {farmerInfo.farmer_id && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Home Barangay</p>
                    <p className="text-xs font-medium text-[#1A2B1A]">{farmerInfo.farmer_home_barangay || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Association</p>
                    <p className="text-xs font-medium text-[#1A2B1A]">{farmerInfo.farmer_assoc_name || 'Non-association'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── SECTION 2: Crop Records (repeatable) ── */}
            {records.map((rec, i) => (
              <CropRecordCard
                key={rec._id}
                rec={rec}
                index={i}
                total={records.length}
                cropTypes={cropTypes}
                seedSources={seedSources}
                varieties={varieties}
                farmerId={farmerInfo.farmer_id}
                errors={fieldErrors[rec._id] || {}}
                onUpdate={updateRecord}
                onRemove={removeRecord}
              />
            ))}

            {/* Add Another Crop Record button — inside scroll area */}
            <button
              type="button"
              onClick={addRecord}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#C8D5C8] py-3 text-sm font-medium text-[#4A5E4A] hover:border-[#1B4D2E] hover:text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors mt-2 mb-2"
            >
              <Plus size={14} /> Add Another Crop Record
            </button>
          </div>

          {/* Error — outside scroll */}
          {error && (
            <p className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
              {error}
            </p>
          )}

          {/* Footer — never scrolls away */}
          <div className="flex justify-end gap-3 border-t border-[#F0F4F0] pt-4 mt-4">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[#C8D5C8] px-5 py-2 text-sm font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg bg-[#1B4D2E] px-5 py-2 text-sm font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-60">
              {isSubmitting ? 'Saving…' : `Save ${records.length > 1 ? `${records.length} Records` : 'Record'}`}
            </button>
          </div>
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Add Crop"
          message={`Add ${records.length} crop monitoring record${records.length > 1 ? 's' : ''} for ${farmerInfo.farmer_full_name}?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

export default AddCropMonitoringModal
