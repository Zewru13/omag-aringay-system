import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Search, Sprout, Trash2, User } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import BARANGAYS from '../../constants/barangays.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

// Compact variants of the standard form controls — the standard
// baseInputClasses (h-[38px], px-3) is sized for a single stacked field;
// a table cell needs a shorter, narrower control so a whole record fits on
// one horizontal row.
const cellInputClasses =
  'w-full h-9 px-2 border border-[#E2E8E2] rounded-md text-[12px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

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
  farm_parcel: '',
})

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
      farmer_assoc_id: farmer.farmers_organization || null,
      farmer_assoc_name: farmer.farmers_organization_name || '',
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
          className={`w-full h-[38px] px-3 pl-8 border border-[#E2E8E2] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors ${selected.farmer_id ? 'pr-16' : ''}`}
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

// ── Crop Record Row (tabular) ─────────────────────────────────────────────────

function CropRecordRow({ rec, index, total, cropTypes, seedSources, varieties, farmerId, farmerParcels, error, expanded, onToggleExpand, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(rec._id, field, value)
  const { duplicates, isChecking } = useCropDuplicateCheck(farmerId, rec.crop_type)

  const relevantVarieties = varieties.filter(
    v => v.is_active && (!v.crop_type || String(v.crop_type) === String(rec.crop_type))
  )

  const selectedCropType = cropTypes.find(c => String(c.id) === String(rec.crop_type))
  const hasDuplicates = !isChecking && duplicates.length > 0

  return (
    <>
      <tr className={`border-b border-[#F0F4F0] ${error ? 'bg-rose-50/40' : ''}`}>
        <td className="px-2 py-2 text-center text-[12px] text-[#7A8E7A] align-top">{index + 1}</td>
        <td className="px-2 py-2 align-top min-w-[140px]">
          <select
            className={cellInputClasses}
            value={rec.farm_location_barangay}
            onChange={e => set('farm_location_barangay', e.target.value)}
          >
            <option value="" disabled>Select…</option>
            {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </td>
        <td className="px-2 py-2 align-top min-w-[130px]">
          <ComboboxWithOther
            options={['Owner', 'Lessee', 'Tenant']}
            value={rec.land_status}
            otherValue={rec.land_status_other_specify}
            onChange={(v) => set('land_status', v)}
            onOtherChange={(v) => set('land_status_other_specify', v)}
            placeholder="Select…"
            inputClassName={cellInputClasses}
            chevronSize={12}
          />
        </td>
        <td className="px-2 py-2 align-top min-w-[170px]">
          <select className={cellInputClasses} value={rec.crop_type}
            onChange={e => set('crop_type', e.target.value)}>
            <option value="">Select crop…</option>
            {cropTypes.map(ct => (
              <option key={ct.id} value={ct.id}>{ct.name} ({ct.days_to_harvest}d)</option>
            ))}
          </select>
          {hasDuplicates && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700" title="An active record already exists for this crop — you may still proceed.">
              <AlertTriangle size={11} className="shrink-0" /> Active record exists
            </p>
          )}
        </td>
        <td className="px-2 py-2 align-top min-w-[140px]">
          <input type="date" className={cellInputClasses} value={rec.date_planted}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => {
              set('date_planted', e.target.value)
              set('season', detectSeason(e.target.value))
            }} />
          {selectedCropType && rec.date_planted && (
            <p className="mt-1 text-[11px] text-[#7A8E7A]">
              Harvest ~{(() => {
                const d = new Date(rec.date_planted + 'T00:00:00')
                d.setDate(d.getDate() + selectedCropType.days_to_harvest)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              })()}
            </p>
          )}
        </td>
        <td className="px-2 py-2 align-top min-w-[100px]">
          <input type="number" step="0.01" min="0" className={cellInputClasses}
            placeholder="0.00"
            value={rec.area_planted_ha}
            onChange={e => set('area_planted_ha', e.target.value)} />
        </td>
        <td className="px-2 py-2 align-top min-w-[110px]">
          <select className={cellInputClasses} value={rec.season}
            onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
        </td>
        <td className="px-2 py-2 align-top text-center">
          <button
            type="button"
            onClick={() => onToggleExpand(rec._id)}
            title="More fields (variety, seed source, parcel)"
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-2 py-2 align-top text-center">
          {total > 1 && (
            <button type="button" onClick={() => onRemove(rec._id)} title="Remove row"
              className="inline-flex items-center rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr className="border-b border-[#F0F4F0]">
          <td />
          <td colSpan={8} className="px-2 pb-2 -mt-1 text-[11px] text-rose-600">{error}</td>
        </tr>
      )}
      {expanded && (
        <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9]">
          <td />
          <td colSpan={8} className="px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Variety (optional)</p>
                <ComboboxWithOther
                  options={relevantVarieties.map(v => v.name)}
                  value={rec.variety_used_is_other ? 'Other' : rec.variety_used}
                  otherValue={rec.variety_used}
                  onChange={(v) => {
                    if (v === 'Other') { set('variety_used_is_other', true); set('variety_used', '') }
                    else { set('variety_used_is_other', false); set('variety_used', v) }
                  }}
                  onOtherChange={(v) => set('variety_used', v)}
                  placeholder="Select variety"
                  inputClassName={cellInputClasses}
                  chevronSize={12}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Seed Source (optional)</p>
                <ComboboxWithOther
                  options={seedSources.filter(s => s.is_active).map(s => s.name)}
                  value={rec.seed_source}
                  otherValue={rec.seed_source_other_specify}
                  onChange={(v) => set('seed_source', v)}
                  onOtherChange={(v) => set('seed_source_other_specify', v)}
                  placeholder="Select source"
                  inputClassName={cellInputClasses}
                  chevronSize={12}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Quantity of Seeds (optional)</p>
                <div className="flex gap-1.5">
                  <input type="number" step="0.01" min="0" className={cellInputClasses}
                    placeholder="e.g. 25"
                    value={rec.quantity_of_seeds}
                    onChange={e => set('quantity_of_seeds', e.target.value)} />
                  <select className={`${cellInputClasses} w-24 shrink-0`} value={rec.seed_quantity_unit}
                    onChange={e => set('seed_quantity_unit', e.target.value)}>
                    <option value="kg">kg</option>
                    <option value="bags">bags</option>
                    <option value="pcs">pcs</option>
                    <option value="bundles">bundles</option>
                  </select>
                </div>
              </div>
              {farmerParcels.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Farm Parcel (optional)</p>
                  <select className={cellInputClasses} value={rec.farm_parcel}
                    onChange={e => set('farm_parcel', e.target.value)}>
                    <option value="">Not linked</option>
                    {farmerParcels.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.parcel_number ? `Parcel ${p.parcel_number}` : `Parcel #${p.id}`} — {p.barangay}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {isChecking && (
                <p className="col-span-full text-[11px] text-slate-400 italic">Checking for active duplicates…</p>
              )}
              {hasDuplicates && (
                <div className="col-span-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                  <ul className="space-y-0.5">
                    {duplicates.map(d => (
                      <li key={d.id} className="text-[11px] text-amber-700">
                        Planted: {d.date_planted || '—'} · Area: {d.area_planted_ha} ha
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
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
  const [expandedIds,  setExpandedIds]  = useState(() => new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState('')
  const [rowErrors,    setRowErrors]    = useState({})

  // Shared farmer state — applies to ALL crop records in this session
  const [farmerInfo, setFarmerInfo] = useState({
    farmer_id: null,
    farmer_full_name: '',
    farmer_home_barangay: '',
    farmer_assoc_id: null,
    farmer_assoc_name: '',
  })
  const [farmerParcels, setFarmerParcels] = useState([])

  useEffect(() => {
    api.get('/production/crop-types/').then(r => {
      const all = Array.isArray(r.data) ? r.data : (r.data.results || [])
      setCropTypes(all.filter(ct => ct.is_active !== false))
    })
    api.get('/production/seed-sources/').then(r => setSeedSources(Array.isArray(r.data) ? r.data : (r.data.results || [])))
    api.get('/production/varieties/').then(r => setVarieties(Array.isArray(r.data) ? r.data : (r.data.results || [])))
  }, [])

  useEffect(() => {
    setRecords(r => r.map(x => ({ ...x, farm_parcel: '' })))
    if (!farmerInfo.farmer_id) { setFarmerParcels([]); return }
    api.get(`/farmers/${farmerInfo.farmer_id}/parcels/`)
      .then(r => setFarmerParcels(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => setFarmerParcels([]))
  }, [farmerInfo.farmer_id])

  const addRecord = () => {
    setRecords(r => [...r, makeRecord(nextId)])
    setNextId(n => n + 1)
  }

  const removeRecord = (id) => setRecords(r => r.filter(x => x._id !== id))

  const updateRecord = (id, field, value) => {
    setRecords(r => r.map(x => x._id === id ? { ...x, [field]: value } : x))
  }

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const buildPayload = (rec) => {
    const year = new Date(rec.date_planted).getFullYear()
    return {
      farmer:                 farmerInfo.farmer_id,
      farmers_organization:    farmerInfo.farmer_assoc_id || null,
      farm_location_barangay: rec.farm_location_barangay || '',
      land_status:            rec.land_status || '',
      land_status_other_specify: rec.land_status === 'Other' ? (rec.land_status_other_specify || '') : '',
      crop_type:              rec.crop_type || null,
      season:                 rec.season,
      year,
      date_planted:           rec.date_planted || null,
      area_planted_ha:        rec.area_planted_ha || null,
      variety_used:           rec.variety_used || '',
      seed_source:            rec.seed_source || '',
      seed_source_other_specify: rec.seed_source === 'Other' ? (rec.seed_source_other_specify || '') : '',
      quantity_of_seeds:      rec.quantity_of_seeds ? parseFloat(rec.quantity_of_seeds) : null,
      seed_quantity_unit:     rec.seed_quantity_unit || 'kg',
      farm_parcel:            rec.farm_parcel || null,
    }
  }

  const validate = () => {
    if (!farmerInfo.farmer_id) { setError('Please select a farmer.'); return false }
    const nextRowErrors = {}
    records.forEach((rec, i) => {
      const missing = []
      if (!rec.farm_location_barangay) missing.push('barangay')
      if (!rec.land_status) missing.push('land status')
      if (!rec.crop_type) missing.push('crop type')
      if (!rec.date_planted) missing.push('date planted')
      if (!rec.area_planted_ha) missing.push('area planted')
      if (missing.length > 0) {
        nextRowErrors[rec._id] = `Row ${i + 1}: missing ${missing.join(', ')}.`
      }
    })
    if (Object.keys(nextRowErrors).length > 0) {
      setRowErrors(nextRowErrors)
      setError('Please fix the highlighted rows.')
      return false
    }
    setRowErrors({})
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
      await api.post('/production/monitoring/bulk/', records.map(buildPayload))
      showToast(`${records.length} crop monitoring record${records.length > 1 ? 's' : ''} added.`, 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      if (data?.errors && Array.isArray(data.errors)) {
        const nextRowErrors = {}
        data.errors.forEach((rowErr, i) => {
          if (rowErr && Object.keys(rowErr).length > 0) {
            const rec = records[i]
            const msgs = Object.entries(rowErr).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v[0] : v}`)
            nextRowErrors[rec._id] = `Row ${i + 1}: ${msgs.join(' · ')}`
          }
        })
        setRowErrors(nextRowErrors)
        setError('Nothing was saved — fix the highlighted row(s) and try again.')
      } else {
        setError(data?.detail || 'Nothing was saved — failed to add these records.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell title="Add New Crop" subtitle="Enter one row per crop record — all rows save together." icon={Sprout} onClose={onClose} maxWidth="max-w-6xl">
        <form onSubmit={handleSubmit}>
          <div className="overflow-y-auto pr-1 space-y-4 pb-6" style={{ maxHeight: 'calc(85vh - 180px)' }}>
            {/* Farmer (entered once) */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">
                Farmer Information
              </p>
              <FarmerSearchInput onSelect={setFarmerInfo} selected={farmerInfo} />
              {farmerInfo.farmer_id && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Home Barangay</p>
                    <p className="text-xs font-medium text-[#1A2B1A]">{farmerInfo.farmer_home_barangay || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Organization</p>
                    <p className="text-xs font-medium text-[#1A2B1A]">{farmerInfo.farmer_assoc_name || 'Non-organization'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Crop records — horizontal table, one row per record */}
            <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-[#1B4D2E] text-white">
                  <tr>
                    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide">#</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Barangay</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Land Status</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Crop Type</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Date Planted</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Area (ha)</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Season</th>
                    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide">More</th>
                    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, i) => (
                    <CropRecordRow
                      key={rec._id}
                      rec={rec}
                      index={i}
                      total={records.length}
                      cropTypes={cropTypes}
                      seedSources={seedSources}
                      varieties={varieties}
                      farmerId={farmerInfo.farmer_id}
                      farmerParcels={farmerParcels}
                      error={rowErrors[rec._id]}
                      expanded={expandedIds.has(rec._id)}
                      onToggleExpand={toggleExpand}
                      onUpdate={updateRecord}
                      onRemove={removeRecord}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addRecord}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#C8D5C8] py-2.5 text-sm font-medium text-[#4A5E4A] hover:border-[#1B4D2E] hover:text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
            >
              <Plus size={14} /> Add Another Row
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
              {error}
            </p>
          )}

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
