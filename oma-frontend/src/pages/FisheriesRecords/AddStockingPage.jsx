import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Plus, Search, Trash2, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import useSuggestSearch from '../../hooks/useSuggestSearch.js'
import { bulkCellInputClasses, bulkSubLabelClasses, bulkTdClasses, bulkThClasses, bulkThCenterClasses } from '../../components/UI/bulkEntryStyles.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { computeHarvestPreview, detectSeason, fmtLong } from './stockingHelpers.js'
import PondModal from '../Fisheries/PondModal.jsx'

// ─── Fisherfolk Search Input ──────────────────────────────────────────────────

function FisherfolkSearchInput({ onSelect, selected }) {
  const [query,     setQuery]     = useState('')
  const [showDrop,  setShowDrop]  = useState(false)
  const wrapperRef  = useRef(null)

  // Shared search-as-you-type hook: an answer made stale by newer typing is
  // thrown away. The server can take seconds, so an older, slower answer used
  // to land after (and overwrite) the one the user was actually waiting for.
  const { results, isSearching: searching, failed, active } = useSuggestSearch(
    selected.id ? '' : query,
    (q) => api.get('/fisheries/fisherfolk/', { params: { search: q } })
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.results || [])).slice(0, 10)),
  )

  const handleChange = (e) => {
    setQuery(e.target.value)
    setShowDrop(true)
  }

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (folk) => {
    onSelect({
      id:            folk.id,
      full_name:     folk.full_name,
      barangay:      folk.barangay || '',
      assoc_name:    folk.organization_name || '',
    })
    setQuery(folk.full_name)
    setShowDrop(false)
  }

  const handleClear = () => {
    setQuery('')
    onSelect({ id: null, full_name: '', barangay: '', assoc_name: '' })
  }

  const displayValue = selected.id ? selected.full_name : query

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[13px] font-medium text-[#4A5E4A]">
        Fisherfolk <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name or RSBSA / FishR number…"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
          className={`w-full h-[38px] px-3 pl-8 border border-[#C8D5C8] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#8AA08A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/20 transition-colors ${selected.id ? 'pr-16' : ''}`}
        />
        {selected.id && (
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
        <div className={`absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto transition-opacity ${searching && results.length > 0 ? 'opacity-60' : ''}`}>
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">
              {!active ? 'Type at least 2 characters.' : searching ? 'Searching…' : failed ? 'Search failed — please try again.' : 'No fisherfolk found.'}
            </p>
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
                    {(f.rsbsa_number || f.lgu_registration_number || f.fishr_number) && `${f.rsbsa_number || f.lgu_registration_number || f.fishr_number} · `}{f.barangay || ''}
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

// ─── Harvest Preview Box ──────────────────────────────────────────────────────

function HarvestPreviewBox({ species, dateStocked, fingerlings, survivalRate, avgWeight, areaHectares, productionCycleNo }) {
  const preview = useMemo(() =>
    computeHarvestPreview(species, dateStocked, fingerlings, survivalRate, avgWeight),
    [species, dateStocked, fingerlings, survivalRate, avgWeight]
  )
  const density = useMemo(() => {
    const area = parseFloat(areaHectares)
    const count = parseInt(fingerlings)
    if (!isNaN(area) && area > 0 && !isNaN(count) && count > 0) {
      return (count / area).toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
    return null
  }, [areaHectares, fingerlings])

  if (!preview && density === null && productionCycleNo === null) return null
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#C8E6D0] bg-[#EBF5EE] px-4 py-3">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#1B4D2E]" />
      <div className="space-y-0.5">
        {preview && (
          <p className="text-xs font-semibold text-[#1B4D2E]">
            Expected Harvest: {fmtLong(preview.harvestDate.toISOString().slice(0, 10))}
          </p>
        )}
        {density !== null && (
          <p className="text-[11px] text-[#235E38]">
            Stocking Density: <strong>{density}</strong> fingerlings/ha
          </p>
        )}
        {productionCycleNo !== null && productionCycleNo !== undefined && (
          <p className="text-[11px] text-[#235E38]">
            Production Cycle <strong>#{productionCycleNo}</strong> for this fisherfolk and species
          </p>
        )}
        {preview && preview.estKg != null && (
          <>
            <p className="text-[11px] text-[#235E38]">
              {species.culture_duration_days} days culture period
              {` · Est. harvest: ${preview.estKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`}
            </p>
            <p className="text-[11px] text-[#4A5E4A]">
              = {fingerlings} fingerlings × {survivalRate}% survival × {avgWeight} kg avg weight
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function makeRecord(n) {
  return {
    _id:                  n,
    pond:                 null,
    production_cycle:     null,
    pond_location_barangay: '',
    land_status:          '',
    land_status_other_specify: '',
    culture_type:         'Pond',
    species:              '',
    date_stocked:         '',
    area_hectares:        '',
    number_of_fingerlings:'',
    survival_rate_pct:    '',
    avg_body_weight_kg:   '',
    number_of_units:      '',
    unit_dimensions:      '',
    water_source:         '',
    water_source_other_specify: '',
    fingerling_source:    '',
    fingerling_source_other_specify: '',
    avg_fingerling_size:  '',
    culture_phase:        '',
    culture_phase_other_specify: '',
    seed_cost_php:        '',
    season:               detectSeason(''),
    _speciesObj:          null,
  }
}

// Compact pond dropdown for a table cell — same fetch/select contract as
// PondSelector.jsx (including "+ Add New Pond"), just without its FormField
// wrapper and read-only preview panel, which don't fit a table row.
function PondCell({ fisherfolkId, value, onSelectPond }) {
  const [ponds, setPonds] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const ADD_NEW_VALUE = '__add_new__'

  const fetchPonds = () => {
    if (!fisherfolkId) { setPonds([]); return Promise.resolve([]) }
    return api.get(`/fisheries/fisherfolk/${fisherfolkId}/ponds/`)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        const active = list.filter((p) => p.is_active)
        setPonds(active)
        return active
      })
      .catch(() => { setPonds([]); return [] })
  }

  useEffect(() => { fetchPonds() }, [fisherfolkId])

  const handleChange = (e) => {
    const v = e.target.value
    if (v === ADD_NEW_VALUE) { setShowAddModal(true); return }
    if (!v) { onSelectPond(null); return }
    const pond = ponds.find((p) => String(p.id) === String(v))
    onSelectPond(pond || null)
  }

  const handlePondCreated = async () => {
    const active = await fetchPonds()
    const newest = active.reduce((a, b) => (!a || b.id > a.id ? b : a), null)
    if (newest) onSelectPond(newest)
  }

  return (
    <>
      <select
        className={bulkCellInputClasses}
        value={value || ''}
        disabled={!fisherfolkId}
        onChange={handleChange}
      >
        <option value="">{fisherfolkId ? 'Select pond…' : 'Pick fisherfolk first'}</option>
        {ponds.map((p) => (
          <option key={p.id} value={p.id}>{p.name}{p.barangay ? ` — ${p.barangay}` : ''}</option>
        ))}
        {fisherfolkId && <option value={ADD_NEW_VALUE}>+ Add New Pond</option>}
      </select>

      {showAddModal && (
        <PondModal
          fisherfolkId={fisherfolkId}
          onClose={() => setShowAddModal(false)}
          onSuccess={handlePondCreated}
        />
      )}
    </>
  )
}

function StockingRecordRow({ rec, index, total, speciesList, cycles, fisherfolkId, error, expanded, onToggleExpand, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(rec._id, field, value)
  const isShellfish = Boolean(rec._speciesObj && rec._speciesObj.category_name && rec._speciesObj.category_name !== 'Finfish')

  const handlePondSelect = (pond) => {
    if (!pond) { set('pond', null); return }
    onUpdate(rec._id, 'pond', pond.id)
    onUpdate(rec._id, 'pond_location_barangay', pond.barangay || '')
    onUpdate(rec._id, 'area_hectares', pond.area_hectares != null ? String(pond.area_hectares) : '')
    onUpdate(rec._id, 'water_source', pond.water_source || '')
    onUpdate(rec._id, 'water_source_other_specify', '')
  }

  const handleSpeciesChange = (speciesId) => {
    const sp = speciesList.find(s => String(s.id) === String(speciesId))
    onUpdate(rec._id, 'species', speciesId)
    onUpdate(rec._id, '_speciesObj', sp || null)
    if (sp) {
      onUpdate(rec._id, 'survival_rate_pct', String(sp.default_survival_rate_pct || ''))
      onUpdate(rec._id, 'avg_body_weight_kg', String(sp.default_avg_body_weight_kg || ''))
      // Fingerlings are a finfish concept — clear any stale fingerling-source
      // data when switching to a shellfish species so it doesn't get submitted.
      if (sp.category_name && sp.category_name !== 'Finfish') {
        onUpdate(rec._id, 'fingerling_source', '')
        onUpdate(rec._id, 'fingerling_source_other_specify', '')
        onUpdate(rec._id, 'avg_fingerling_size', '')
      }
    }
  }

  return (
    <>
      <tr className={`border-b border-[#F0F4F0] max-md:block max-md:mb-3 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:p-3 ${error ? 'bg-rose-50/40' : 'max-md:bg-white'}`}>
        <td data-label="Stocking record" className={`${bulkTdClasses} text-center text-[13px] text-[#7A8E7A] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>{index + 1}</td>
        <td data-label="Pond" className={`${bulkTdClasses} min-w-[180px] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>
          <PondCell fisherfolkId={fisherfolkId} value={rec.pond} onSelectPond={handlePondSelect} />
        </td>
        <td data-label="Species *" className={`${bulkTdClasses} min-w-[190px] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>
          <select className={bulkCellInputClasses} value={rec.species} onChange={e => handleSpeciesChange(e.target.value)}>
            <option value="">Select species…</option>
            {speciesList.map(s => (
              <option key={s.id} value={s.id}>{s.species_name} ({s.culture_environment})</option>
            ))}
          </select>
        </td>
        <td data-label="Culture type" className={`${bulkTdClasses} min-w-[130px] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>
          <select className={bulkCellInputClasses} value={rec.culture_type} onChange={e => set('culture_type', e.target.value)}>
            <option value="Pond">Pond</option>
            <option value="Cage">Cage</option>
            <option value="Pen">Pen</option>
          </select>
        </td>
        <td data-label="Date stocked *" className={`${bulkTdClasses} min-w-[160px] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>
          <input type="date" className={bulkCellInputClasses} value={rec.date_stocked}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => {
              set('date_stocked', e.target.value)
              set('season', detectSeason(e.target.value))
            }} />
        </td>
        <td data-label="No. of fingerlings *" className={`${bulkTdClasses} min-w-[130px] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>
          <input type="number" min="1" className={bulkCellInputClasses}
            placeholder={isShellfish ? 'Spat/pcs' : 'e.g. 500'} value={rec.number_of_fingerlings}
            onChange={e => set('number_of_fingerlings', e.target.value)} />
        </td>
        <td data-label="Season" className={`${bulkTdClasses} min-w-[120px] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>
          <select className={bulkCellInputClasses} value={rec.season} onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
        </td>
        <td data-label="More fields" className={`${bulkTdClasses} text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]`}>
          <button
            type="button"
            onClick={() => onToggleExpand(rec._id)}
            title="More fields (land status, culture phase, survival rate...)"
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors max-md:min-h-[40px] max-md:gap-1.5 max-md:px-3 max-md:text-[13px] max-md:font-medium"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="md:hidden">{expanded ? 'Hide extra fields' : 'Land status, phase, survival rate…'}</span>
          </button>
        </td>
        <td className={`${bulkTdClasses} text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right`}>
          {total > 1 && (
            <button type="button" onClick={() => onRemove(rec._id)} title="Remove row"
              className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium">
              <Trash2 size={13} /> <span className="md:hidden">Remove record</span>
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr className="border-b border-[#F0F4F0] max-md:block max-md:-mt-2 max-md:mb-3 max-md:px-3">
          <td className="max-md:hidden" />
          <td colSpan={8} className="px-3 pb-3 -mt-1 text-[12px] text-rose-600 max-md:block max-md:px-0">{error}</td>
        </tr>
      )}
      {expanded && (
        <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9] max-md:block max-md:-mt-2 max-md:mb-3 max-md:rounded-b-xl max-md:border max-md:border-t-0 max-md:border-[#E2E8E2]">
          <td className="max-md:hidden" />
          <td colSpan={8} className="px-3 py-4 max-md:block">
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className={bulkSubLabelClasses}>Production Cycle (optional)</p>
                <select className={bulkCellInputClasses} value={rec.production_cycle ?? ''}
                  onChange={e => set('production_cycle', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— None —</option>
                  {cycles.map(c => (
                    <option key={c.id} value={c.id}>{c.cycle_name} — {c.species_farmed}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className={bulkSubLabelClasses}>Land Status (optional)</p>
                <ComboboxWithOther
                  options={['Owner', 'Lessee', 'Tenant']}
                  value={rec.land_status}
                  otherValue={rec.land_status_other_specify}
                  onChange={(v) => set('land_status', v)}
                  onOtherChange={(v) => set('land_status_other_specify', v)}
                  placeholder="Select…"
                  inputClassName={bulkCellInputClasses}
                  chevronSize={13}
                />
              </div>
              <div>
                <p className={bulkSubLabelClasses}>Culture Phase (optional)</p>
                <ComboboxWithOther
                  options={['Nursery Phase', 'Stocking Phase', 'Grow-out Phase', 'Harvest Phase', 'Post-Harvest Phase']}
                  value={rec.culture_phase}
                  otherValue={rec.culture_phase_other_specify}
                  onChange={(v) => set('culture_phase', v)}
                  onOtherChange={(v) => set('culture_phase_other_specify', v)}
                  placeholder="Select…"
                  inputClassName={bulkCellInputClasses}
                  chevronSize={13}
                />
              </div>
              <div>
                <p className={bulkSubLabelClasses}>
                  {rec.culture_type === 'Pond' ? 'Number of Ponds' : rec.culture_type === 'Pen' ? 'Number of Pens' : 'Number of Cages'} (optional)
                </p>
                <input type="number" min="0" className={bulkCellInputClasses}
                  placeholder={rec.culture_type === 'Pond' ? 'e.g. 2' : rec.culture_type === 'Pen' ? 'e.g. 3' : 'e.g. 5'}
                  value={rec.number_of_units}
                  onChange={e => set('number_of_units', e.target.value)} />
              </div>
              {rec.culture_type !== 'Pond' && (
                <div>
                  <p className={bulkSubLabelClasses}>Unit Dimensions (optional)</p>
                  <input type="text" className={bulkCellInputClasses}
                    placeholder="e.g. 10m x 10m x 2m" value={rec.unit_dimensions}
                    onChange={e => set('unit_dimensions', e.target.value)} />
                </div>
              )}
              {!isShellfish && (
                <div>
                  <p className={bulkSubLabelClasses}>Fingerling/Fry Source (optional)</p>
                  <ComboboxWithOther
                    options={['BFAR', 'Private Hatchery', 'Own Production']}
                    value={rec.fingerling_source}
                    otherValue={rec.fingerling_source_other_specify}
                    onChange={(v) => set('fingerling_source', v)}
                    onOtherChange={(v) => set('fingerling_source_other_specify', v)}
                    placeholder="Select…"
                    inputClassName={bulkCellInputClasses}
                    chevronSize={13}
                  />
                </div>
              )}
              {!isShellfish && (
                <div>
                  <p className={bulkSubLabelClasses}>Avg Fingerling Size (optional)</p>
                  <input type="text" className={bulkCellInputClasses}
                    placeholder="e.g. 2-3 cm" value={rec.avg_fingerling_size}
                    onChange={e => set('avg_fingerling_size', e.target.value)} />
                </div>
              )}
              <div>
                <p className={bulkSubLabelClasses}>Survival Rate % (optional)</p>
                <input type="number" min="0" max="100" step="0.01" className={bulkCellInputClasses}
                  placeholder="e.g. 80.00" value={rec.survival_rate_pct}
                  onChange={e => set('survival_rate_pct', e.target.value)} />
              </div>
              <div>
                <p className={bulkSubLabelClasses}>Avg Body Weight kg (optional)</p>
                <input type="number" min="0" step="0.001" className={bulkCellInputClasses}
                  placeholder="e.g. 0.250" value={rec.avg_body_weight_kg}
                  onChange={e => set('avg_body_weight_kg', e.target.value)} />
              </div>
              <div>
                <p className={bulkSubLabelClasses}>Seed/Fingerling Cost ₱ (optional)</p>
                <input type="number" min="0" step="0.01" className={bulkCellInputClasses}
                  placeholder="e.g. 1500.00" value={rec.seed_cost_php}
                  onChange={e => set('seed_cost_php', e.target.value)} />
              </div>
              <div className="col-span-full">
                <HarvestPreviewBox
                  species={rec._speciesObj}
                  dateStocked={rec.date_stocked}
                  fingerlings={rec.number_of_fingerlings}
                  survivalRate={rec.survival_rate_pct}
                  avgWeight={rec.avg_body_weight_kg}
                  areaHectares={rec.area_hectares}
                  productionCycleNo={rec._productionCycleNo}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AddStockingPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [speciesList,  setSpeciesList]  = useState([])
  const [records,      setRecords]      = useState([makeRecord(1)])
  const [nextId,       setNextId]       = useState(2)
  const [expandedIds,  setExpandedIds]  = useState(() => new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState('')
  const [rowErrors,    setRowErrors]    = useState({})
  const [fisherfolkInfo, setFisherfolkInfo] = useState({
    id: null, full_name: '', barangay: '', assoc_name: '',
  })
  const [existingCycleCount, setExistingCycleCount] = useState(0)
  // Actual AquacultureProductionCycle rows (FK) — not the computed production_cycle_no above.
  const [cycles, setCycles] = useState([])

  const goBack = () => navigate('/fisheries-monitoring?tab=stocking')

  useEffect(() => {
    api.get('/fisheries/species/')
      .then(r => setSpeciesList(Array.isArray(r.data) ? r.data : (r.data.results || [])))
  }, [])

  useEffect(() => {
    if (!fisherfolkInfo.id) {
      setExistingCycleCount(0)
      return
    }
    api.get('/fisheries/stocking/', { params: { fisherfolk: fisherfolkInfo.id, status: 'Stocked,Near Harvest,Harvested' } })
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setExistingCycleCount(list.length)
      })
      .catch(() => setExistingCycleCount(0))
  }, [fisherfolkInfo.id])

  useEffect(() => {
    // A cycle belongs to one fisherfolk, so any previously picked cycle is stale on change.
    setRecords(rs => rs.map(r => (r.production_cycle ? { ...r, production_cycle: null } : r)))
    if (!fisherfolkInfo.id) { setCycles([]); return }
    api.get('/monitoring/aquaculture-cycles/', { params: { fisherfolk: fisherfolkInfo.id, status: 'Active' } })
      .then(r => setCycles(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => { setCycles([]); showToast('Failed to load production cycles.', 'error') })
  }, [fisherfolkInfo.id])

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
    const year = new Date(rec.date_stocked).getFullYear()
    return {
      fisherfolk:               fisherfolkInfo.id,
      species:                  rec.species || null,
      pond:                     rec.pond || null,
      production_cycle:         rec.production_cycle || null,
      pond_location_barangay:   rec.pond_location_barangay || '',
      land_status:              rec.land_status || '',
      land_status_other_specify: rec.land_status === 'Other' ? (rec.land_status_other_specify || '') : '',
      culture_type:             rec.culture_type,
      date_stocked:             rec.date_stocked || null,
      area_hectares:            rec.area_hectares ? parseFloat(rec.area_hectares) : null,
      number_of_fingerlings:    rec.number_of_fingerlings ? parseInt(rec.number_of_fingerlings) : null,
      survival_rate_pct:        rec.survival_rate_pct !== '' ? parseFloat(rec.survival_rate_pct) : null,
      avg_body_weight_kg:       rec.avg_body_weight_kg !== '' ? parseFloat(rec.avg_body_weight_kg) : null,
      water_source:             rec.water_source || '',
      water_source_other_specify: rec.water_source === 'Other' ? (rec.water_source_other_specify || '') : '',
      number_of_units:          rec.number_of_units !== '' ? parseInt(rec.number_of_units) : null,
      unit_dimensions:          rec.unit_dimensions || '',
      fingerling_source:        rec.fingerling_source || '',
      fingerling_source_other_specify: rec.fingerling_source === 'Other' ? (rec.fingerling_source_other_specify || '') : '',
      avg_fingerling_size:      rec.avg_fingerling_size || '',
      culture_phase:            rec.culture_phase || '',
      culture_phase_other_specify: rec.culture_phase === 'Other' ? (rec.culture_phase_other_specify || '') : '',
      seed_cost_php:            rec.seed_cost_php !== '' ? parseFloat(rec.seed_cost_php) : null,
      season:                   rec.season,
      year,
    }
  }

  const validate = () => {
    if (!fisherfolkInfo.id) { setError('Please select a fisherfolk.'); return false }
    const nextRowErrors = {}
    records.forEach((rec, i) => {
      const missing = []
      if (!rec.species) missing.push('species')
      if (!rec.date_stocked) missing.push('date stocked')
      if (!rec.number_of_fingerlings) missing.push('number of fingerlings')
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
    e.preventDefault(); setError('')
    if (!validate()) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false); setIsSubmitting(true)
    try {
      await api.post('/fisheries/stocking/bulk/', records.map(buildPayload))
      showToast(`${records.length} stocking record${records.length > 1 ? 's' : ''} added.`, 'success')
      navigate('/fisheries-monitoring?tab=stocking')
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
    <PageLayout title="Add New Stocking Record" subtitle="Enter one row per stocking record — all rows save together.">
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline max-md:min-h-[40px]"
      >
        <ArrowLeft size={14} /> Back to Fisheries Monitoring
      </button>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Fisherfolk section */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">
            Fisherfolk Information
          </p>
          <div className="max-w-xl">
            <FisherfolkSearchInput onSelect={setFisherfolkInfo} selected={fisherfolkInfo} />
          </div>
          {fisherfolkInfo.id && (
            <div className="grid grid-cols-2 gap-3 mt-3 max-w-xl">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Home Barangay</p>
                <p className="text-xs font-medium text-[#1A2B1A]">{fisherfolkInfo.barangay || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Organization</p>
                <p className="text-xs font-medium text-[#1A2B1A]">{fisherfolkInfo.assoc_name || 'Non-member'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stocking records — horizontal table, one row per record */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="min-w-full text-sm max-md:block max-md:w-full">
            <thead className="bg-[#1B4D2E] text-white max-md:hidden">
              <tr>
                <th className={bulkThCenterClasses}>#</th>
                <th className={bulkThClasses}>Pond</th>
                <th className={bulkThClasses}>Species <span className="text-white/70">*</span></th>
                <th className={bulkThClasses}>Culture Type</th>
                <th className={bulkThClasses}>Date Stocked <span className="text-white/70">*</span></th>
                <th className={bulkThClasses}>No. Fingerlings <span className="text-white/70">*</span></th>
                <th className={bulkThClasses}>Season</th>
                <th className={bulkThCenterClasses}>More</th>
                <th className={bulkThCenterClasses}></th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {(() => {
                const speciesCounts = {}
                return records.map((rec, i) => {
                  const key = rec.species || '_none'
                  const before = speciesCounts[key] || 0
                  speciesCounts[key] = before + 1
                  const recWithCycle = { ...rec, _productionCycleNo: rec.species ? existingCycleCount + before + 1 : null }
                  return (
                    <StockingRecordRow
                      key={rec._id}
                      rec={recWithCycle}
                      cycles={cycles}
                      index={i}
                      total={records.length}
                      speciesList={speciesList}
                      fisherfolkId={fisherfolkInfo.id}
                      error={rowErrors[rec._id]}
                      expanded={expandedIds.has(rec._id)}
                      onToggleExpand={toggleExpand}
                      onUpdate={updateRecord}
                      onRemove={removeRecord}
                    />
                  )
                })
              })()}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addRecord}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#C8D5C8] py-3 text-sm font-medium text-[#4A5E4A] hover:border-[#1B4D2E] hover:text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
        >
          <Plus size={14} /> Add Another Row
        </button>

        {error && (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">{error}</p>
        )}

        <div className="flex justify-end gap-3 border-t border-[#F0F4F0] pt-4">
          <button type="button" onClick={goBack}
            className="rounded-lg border border-[#C8D5C8] px-5 py-2 text-sm font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="rounded-lg bg-[#1B4D2E] px-5 py-2 text-sm font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-60">
            {isSubmitting ? 'Saving…' : `Save ${records.length > 1 ? `${records.length} Records` : 'Record'}`}
          </button>
        </div>
      </form>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Add Stocking"
          message={`Add ${records.length} stocking record${records.length > 1 ? 's' : ''} for ${fisherfolkInfo.full_name}?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </PageLayout>
  )
}
