import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, Fish, Lock, Pencil, Plus, Search, Trash2, Unlock, User, Wheat } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import RowActions from '../../components/UI/RowActions.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import HarvestVarianceBadge from '../../components/UI/HarvestVarianceBadge.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  RecordStockingHarvestModal,
  StockingDisasterReportModal,
  ViewStockingLogsModal,
} from './StockingMonitoringModals.jsx'
import PondSelector from './PondSelector.jsx'
import PondModal from '../Fisheries/PondModal.jsx'

// Compact variants of the standard form controls — sized for a table cell
// instead of a single stacked field, so a whole record fits on one row.
const cellInputClasses =
  'w-full h-9 px-2 border border-[#E2E8E2] rounded-md text-[12px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

const filterSelectCls =
  'rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtShort(v) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function fmtLong(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

function detectSeason(dateStr) {
  if (!dateStr) return 'Wet'
  const month = new Date(dateStr).getMonth() + 1
  return month >= 6 && month <= 11 ? 'Wet' : 'Dry'
}

function computeHarvestPreview(species, dateStocked, fingerlings, survivalRate, avgWeight) {
  if (!species || !dateStocked) return null
  const d = new Date(dateStocked + 'T00:00:00')
  d.setDate(d.getDate() + species.culture_duration_days)
  const harvestDate = d
  let estKg = null
  if (fingerlings && survivalRate && avgWeight) {
    estKg = parseFloat(fingerlings) * (parseFloat(survivalRate) / 100) * parseFloat(avgWeight)
  }
  return { harvestDate, estKg }
}

const STATUS_TONES = {
  Stocked:         'green',
  'Near Harvest':  'amber',
  Harvested:       'blue',
  'Total Loss':    'rose',
}

const COLUMNS = [
  { key: 'species_name_cell',   label: 'SPECIES' },
  { key: 'fisherfolk_cell',     label: 'FISHERFOLK' },
  { key: 'culture_type',        label: 'CULTURE TYPE' },
  { key: 'cycle_cell',          label: 'CYCLE' },
  { key: 'date_stocked_fmt',    label: 'DATE STOCKED' },
  { key: 'expected_harvest_fmt',label: 'EXPECTED HARVEST' },
  { key: 'est_harvest_kg_fmt',  label: 'EST. HARVEST (KG)' },
  { key: 'assoc_name',          label: 'ORGANIZATION' },
  { key: 'pond_location',       label: 'POND LOCATION' },
  { key: 'status_cell',         label: 'STATUS' },
  { key: 'actions_cell',        label: 'ACTIONS' },
]

// ─── Fisherfolk Search Input ──────────────────────────────────────────────────

function FisherfolkSearchInput({ onSelect, selected }) {
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
      const r = await api.get('/fisheries/fisherfolk/', { params: { search: q } })
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
    setResults([])
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
          placeholder="Search by name or registration number…"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
          className={`${baseInputClasses} pl-8 ${selected.id ? 'pr-16' : ''}`}
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
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto">
          {searching ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">{query.trim() ? 'No fisherfolk found.' : 'Type to search fisherfolk.'}</p>
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
                    {f.lgu_registration_number && `${f.lgu_registration_number} · `}{f.barangay || ''}
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

// ─── Add Stocking Modal ───────────────────────────────────────────────────────

function makeRecord(n) {
  return {
    _id:                  n,
    pond:                 null,
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
        className={cellInputClasses}
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

function StockingRecordRow({ rec, index, total, speciesList, fisherfolkId, error, expanded, onToggleExpand, onUpdate, onRemove }) {
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
      <tr className={`border-b border-[#F0F4F0] ${error ? 'bg-rose-50/40' : ''}`}>
        <td className="px-2 py-2 text-center text-[12px] text-[#7A8E7A] align-top">{index + 1}</td>
        <td className="px-2 py-2 align-top min-w-[160px]">
          <PondCell fisherfolkId={fisherfolkId} value={rec.pond} onSelectPond={handlePondSelect} />
        </td>
        <td className="px-2 py-2 align-top min-w-[170px]">
          <select className={cellInputClasses} value={rec.species} onChange={e => handleSpeciesChange(e.target.value)}>
            <option value="">Select species…</option>
            {speciesList.map(s => (
              <option key={s.id} value={s.id}>{s.species_name} ({s.culture_environment})</option>
            ))}
          </select>
        </td>
        <td className="px-2 py-2 align-top min-w-[110px]">
          <select className={cellInputClasses} value={rec.culture_type} onChange={e => set('culture_type', e.target.value)}>
            <option value="Pond">Pond</option>
            <option value="Cage">Cage</option>
            <option value="Pen">Pen</option>
          </select>
        </td>
        <td className="px-2 py-2 align-top min-w-[140px]">
          <input type="date" className={cellInputClasses} value={rec.date_stocked}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => {
              set('date_stocked', e.target.value)
              set('season', detectSeason(e.target.value))
            }} />
        </td>
        <td className="px-2 py-2 align-top min-w-[110px]">
          <input type="number" min="1" className={cellInputClasses}
            placeholder={isShellfish ? 'Spat/pcs' : 'e.g. 500'} value={rec.number_of_fingerlings}
            onChange={e => set('number_of_fingerlings', e.target.value)} />
        </td>
        <td className="px-2 py-2 align-top min-w-[100px]">
          <select className={cellInputClasses} value={rec.season} onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
        </td>
        <td className="px-2 py-2 align-top text-center">
          <button
            type="button"
            onClick={() => onToggleExpand(rec._id)}
            title="More fields (land status, culture phase, survival rate...)"
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
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Land Status (optional)</p>
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
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Culture Phase (optional)</p>
                <ComboboxWithOther
                  options={['Nursery Phase', 'Stocking Phase', 'Grow-out Phase', 'Harvest Phase', 'Post-Harvest Phase']}
                  value={rec.culture_phase}
                  otherValue={rec.culture_phase_other_specify}
                  onChange={(v) => set('culture_phase', v)}
                  onOtherChange={(v) => set('culture_phase_other_specify', v)}
                  placeholder="Select…"
                  inputClassName={cellInputClasses}
                  chevronSize={12}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">
                  {rec.culture_type === 'Pond' ? 'Number of Ponds' : rec.culture_type === 'Pen' ? 'Number of Pens' : 'Number of Cages'} (optional)
                </p>
                <input type="number" min="0" className={cellInputClasses}
                  placeholder={rec.culture_type === 'Pond' ? 'e.g. 2' : rec.culture_type === 'Pen' ? 'e.g. 3' : 'e.g. 5'}
                  value={rec.number_of_units}
                  onChange={e => set('number_of_units', e.target.value)} />
              </div>
              {rec.culture_type !== 'Pond' && (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Unit Dimensions (optional)</p>
                  <input type="text" className={cellInputClasses}
                    placeholder="e.g. 10m x 10m x 2m" value={rec.unit_dimensions}
                    onChange={e => set('unit_dimensions', e.target.value)} />
                </div>
              )}
              {!isShellfish && (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Fingerling/Fry Source (optional)</p>
                  <ComboboxWithOther
                    options={['BFAR', 'Private Hatchery', 'Own Production']}
                    value={rec.fingerling_source}
                    otherValue={rec.fingerling_source_other_specify}
                    onChange={(v) => set('fingerling_source', v)}
                    onOtherChange={(v) => set('fingerling_source_other_specify', v)}
                    placeholder="Select…"
                    inputClassName={cellInputClasses}
                    chevronSize={12}
                  />
                </div>
              )}
              {!isShellfish && (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Avg Fingerling Size (optional)</p>
                  <input type="text" className={cellInputClasses}
                    placeholder="e.g. 2-3 cm" value={rec.avg_fingerling_size}
                    onChange={e => set('avg_fingerling_size', e.target.value)} />
                </div>
              )}
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Survival Rate % (optional)</p>
                <input type="number" min="0" max="100" step="0.01" className={cellInputClasses}
                  placeholder="e.g. 80.00" value={rec.survival_rate_pct}
                  onChange={e => set('survival_rate_pct', e.target.value)} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Avg Body Weight kg (optional)</p>
                <input type="number" min="0" step="0.001" className={cellInputClasses}
                  placeholder="e.g. 0.250" value={rec.avg_body_weight_kg}
                  onChange={e => set('avg_body_weight_kg', e.target.value)} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-[#4A5E4A]">Seed/Fingerling Cost ₱ (optional)</p>
                <input type="number" min="0" step="0.01" className={cellInputClasses}
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

function AddStockingModal({ onClose, onSuccess }) {
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
      onSuccess(); onClose()
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
      <ModalShell title="Add New Stocking Record" subtitle="Enter one row per stocking record — all rows save together." icon={Fish} onClose={onClose} maxWidth="max-w-6xl">
        <form onSubmit={handleSubmit}>
          <div className="overflow-y-auto pr-1 space-y-4 pb-6" style={{ maxHeight: 'calc(85vh - 180px)' }}>
            {/* Fisherfolk section */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">
                Fisherfolk Information
              </p>
              <FisherfolkSearchInput onSelect={setFisherfolkInfo} selected={fisherfolkInfo} />
              {fisherfolkInfo.id && (
                <div className="grid grid-cols-2 gap-3 mt-3">
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
            <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-[#1B4D2E] text-white">
                  <tr>
                    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide">#</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Pond</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Species</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Culture Type</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Date Stocked</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">No. Fingerlings</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Season</th>
                    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide">More</th>
                    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody>
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#C8D5C8] py-2.5 text-sm font-medium text-[#4A5E4A] hover:border-[#1B4D2E] hover:text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
            >
              <Plus size={14} /> Add Another Row
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">{error}</p>
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
          title="Confirm Add Stocking"
          message={`Add ${records.length} stocking record${records.length > 1 ? 's' : ''} for ${fisherfolkInfo.full_name}?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// ─── Edit Stocking Modal ──────────────────────────────────────────────────────

const editLabelCls = 'block text-[13px] font-medium text-[#4A5E4A] mb-1.5'

function EditStockingModal({ record, speciesList, onClose, onSaved }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/fisheries/stocking/${record.id}/`)
      showToast('Stocking record deleted.', 'success')
      setShowDeleteConfirm(false)
      onSaved()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete record.', 'error')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  const originalData = {
    pond:                    record.pond || null,
    pond_location_barangay: record.pond_location_barangay || '',
    land_status:            record.land_status || '',
    land_status_other_specify: record.land_status_other_specify || '',
    culture_type:           record.culture_type || 'Pond',
    date_stocked:           record.date_stocked || '',
    area_hectares:          record.area_hectares != null ? String(record.area_hectares) : '',
    number_of_fingerlings:  record.number_of_fingerlings ? String(record.number_of_fingerlings) : '',
    survival_rate_pct:      record.survival_rate_pct != null ? String(record.survival_rate_pct) : '',
    avg_body_weight_kg:     record.avg_body_weight_kg != null ? String(record.avg_body_weight_kg) : '',
    number_of_units:        record.number_of_units != null ? String(record.number_of_units) : '',
    unit_dimensions:        record.unit_dimensions || '',
    water_source:           record.water_source || '',
    water_source_other_specify: record.water_source_other_specify || '',
    fingerling_source:      record.fingerling_source || '',
    fingerling_source_other_specify: record.fingerling_source_other_specify || '',
    avg_fingerling_size:    record.avg_fingerling_size || '',
    culture_phase:          record.culture_phase || '',
    culture_phase_other_specify: record.culture_phase_other_specify || '',
    seed_cost_php:          record.seed_cost_php != null ? String(record.seed_cost_php) : '',
    season:                 record.season || '',
  }
  const [form, setForm]           = useState(originalData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]         = useState('')

  const normalize = (v) => (v === null || v === undefined ? '' : String(v).trim())
  const isDirty = Object.keys(originalData).some(k => normalize(form[k]) !== normalize(originalData[k]))

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const speciesObj = speciesList.find(s => String(s.id) === String(record.species))
  const isShellfish = Boolean(speciesObj && speciesObj.category_name && speciesObj.category_name !== 'Finfish')

  const preview = useMemo(() =>
    computeHarvestPreview(speciesObj, form.date_stocked, form.number_of_fingerlings, form.survival_rate_pct, form.avg_body_weight_kg),
    [speciesObj, form.date_stocked, form.number_of_fingerlings, form.survival_rate_pct, form.avg_body_weight_kg]
  )
  const density = useMemo(() => {
    const area = parseFloat(form.area_hectares)
    const count = parseInt(form.number_of_fingerlings)
    if (!isNaN(area) && area > 0 && !isNaN(count) && count > 0) {
      return (count / area).toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
    return null
  }, [form.area_hectares, form.number_of_fingerlings])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date_stocked)          { setError('Date stocked is required.'); return }
    if (!form.number_of_fingerlings) { setError('Number of fingerlings is required.'); return }
    setError(''); setIsSubmitting(true)
    try {
      await api.patch(`/fisheries/stocking/${record.id}/`, {
        pond:                    form.pond || null,
        pond_location_barangay: form.pond_location_barangay,
        land_status:            form.land_status,
        land_status_other_specify: form.land_status === 'Other' ? form.land_status_other_specify : '',
        culture_type:           form.culture_type,
        date_stocked:           form.date_stocked,
        area_hectares:          form.area_hectares !== '' ? parseFloat(form.area_hectares) : null,
        number_of_fingerlings:  parseInt(form.number_of_fingerlings),
        survival_rate_pct:      form.survival_rate_pct !== '' ? parseFloat(form.survival_rate_pct) : null,
        avg_body_weight_kg:     form.avg_body_weight_kg !== '' ? parseFloat(form.avg_body_weight_kg) : null,
        water_source:           form.water_source || '',
        water_source_other_specify: form.water_source === 'Other' ? form.water_source_other_specify : '',
        number_of_units:        form.number_of_units !== '' ? parseInt(form.number_of_units) : null,
        unit_dimensions:        form.unit_dimensions || '',
        fingerling_source:      form.fingerling_source || '',
        fingerling_source_other_specify: form.fingerling_source === 'Other' ? form.fingerling_source_other_specify : '',
        avg_fingerling_size:    form.avg_fingerling_size || '',
        culture_phase:          form.culture_phase || '',
        culture_phase_other_specify: form.culture_phase === 'Other' ? (form.culture_phase_other_specify || '') : '',
        seed_cost_php:          form.seed_cost_php !== '' ? parseFloat(form.seed_cost_php) : null,
        season:                 form.season,
      })
      showToast('Stocking record updated.', 'success')
      onSaved()
    } catch {
      setError('Failed to update stocking record.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={`Edit — ${record.species_name}`}
      subtitle="Update stocking record details."
      icon={Pencil}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Species info — read-only */}
        <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8] mb-1">Species (Read-Only)</p>
          <p className="text-[14px] font-semibold text-[#1A2B1A]">{record.species_name}</p>
          {speciesObj && (
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">
              {speciesObj.culture_environment} · {speciesObj.culture_duration_days} days
            </p>
          )}
        </div>

        <PondSelector
          fisherfolkId={record.fisherfolk}
          value={form.pond}
          onSelectPond={(pond) => {
            if (!pond) { set('pond', null); return }
            setForm((f) => ({
              ...f,
              pond: pond.id,
              pond_location_barangay: pond.barangay || '',
              area_hectares: pond.area_hectares != null ? String(pond.area_hectares) : '',
              water_source: pond.water_source || '',
              water_source_other_specify: '',
            }))
          }}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={editLabelCls}>Land Status</label>
            <ComboboxWithOther
              options={['Owner', 'Lessee', 'Tenant']}
              value={form.land_status}
              otherValue={form.land_status_other_specify}
              onChange={(v) => set('land_status', v)}
              onOtherChange={(v) => set('land_status_other_specify', v)}
              placeholder="Select…"
            />
          </div>
          <div>
            <label className={editLabelCls}>Culture Type</label>
            <select className={baseInputClasses} value={form.culture_type} onChange={e => set('culture_type', e.target.value)}>
              <option value="Pond">Pond</option>
              <option value="Cage">Cage</option>
              <option value="Pen">Pen</option>
            </select>
          </div>
          <div>
            <label className={editLabelCls}>Culture Phase (optional)</label>
            <ComboboxWithOther
              options={['Nursery Phase', 'Stocking Phase', 'Grow-out Phase', 'Harvest Phase', 'Post-Harvest Phase']}
              value={form.culture_phase}
              otherValue={form.culture_phase_other_specify}
              onChange={(v) => set('culture_phase', v)}
              onOtherChange={(v) => set('culture_phase_other_specify', v)}
              placeholder="Select…"
            />
          </div>
          <div>
            <label className={editLabelCls}>Date Stocked <span className="text-rose-500">*</span></label>
            <input type="date" className={baseInputClasses} value={form.date_stocked}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => { set('date_stocked', e.target.value); if (!form.season) set('season', detectSeason(e.target.value)) }} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={editLabelCls}>{form.culture_type === 'Pond' ? 'Number of Ponds' : form.culture_type === 'Pen' ? 'Number of Pens' : 'Number of Cages'}</label>
            <input type="number" min="0" className={baseInputClasses}
              placeholder={form.culture_type === 'Pond' ? 'e.g. 2' : form.culture_type === 'Pen' ? 'e.g. 3' : 'e.g. 5'}
              value={form.number_of_units} onChange={e => set('number_of_units', e.target.value)} />
          </div>
          {form.culture_type !== 'Pond' && (
            <div>
              <label className={editLabelCls}>Unit Dimensions</label>
              <input type="text" className={baseInputClasses}
                placeholder="e.g. 10m x 10m x 2m"
                value={form.unit_dimensions} onChange={e => set('unit_dimensions', e.target.value)} />
            </div>
          )}
        </div>

        {!isShellfish && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={editLabelCls}>Fingerling/Fry Source</label>
              <ComboboxWithOther
                options={['BFAR', 'Private Hatchery', 'Own Production']}
                value={form.fingerling_source}
                otherValue={form.fingerling_source_other_specify}
                onChange={(v) => set('fingerling_source', v)}
                onOtherChange={(v) => set('fingerling_source_other_specify', v)}
                placeholder="Select…"
              />
            </div>
          </div>
        )}

        {!isShellfish && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={editLabelCls}>Average Fingerling Size (optional)</label>
              <input type="text" className={baseInputClasses}
                placeholder="e.g. 2-3 cm"
                value={form.avg_fingerling_size} onChange={e => set('avg_fingerling_size', e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={editLabelCls}>
              {isShellfish ? 'No. of Spat / Pieces' : 'No. of Fingerlings'} <span className="text-rose-500">*</span>
            </label>
            <input type="number" min="1" className={baseInputClasses} placeholder="e.g. 500"
              value={form.number_of_fingerlings} onChange={e => set('number_of_fingerlings', e.target.value)} />
          </div>
          <div>
            <label className={editLabelCls}>Survival Rate (%)</label>
            <input type="number" min="0" max="100" step="0.01" className={baseInputClasses} placeholder="e.g. 80.00"
              value={form.survival_rate_pct} onChange={e => set('survival_rate_pct', e.target.value)} />
          </div>
          <div>
            <label className={editLabelCls}>Avg Body Weight (kg)</label>
            <input type="number" min="0" step="0.001" className={baseInputClasses} placeholder="e.g. 0.250"
              value={form.avg_body_weight_kg} onChange={e => set('avg_body_weight_kg', e.target.value)} />
          </div>
        </div>

        <div>
          <label className={editLabelCls}>Seed/Fingerling Cost (₱, optional)</label>
          <input type="number" min="0" step="0.01" className={baseInputClasses} placeholder="e.g. 1500.00"
            value={form.seed_cost_php} onChange={e => set('seed_cost_php', e.target.value)} />
        </div>

        {/* Harvest preview */}
        {(preview || density !== null || record.production_cycle_no) && (
          <div className="rounded-xl border border-[#C8E6D0] bg-[#EBF5EE] px-4 py-3 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E] mb-1">Harvest Preview</p>
            {density !== null && (
              <p className="text-[11px] text-[#235E38]">
                Stocking Density: <strong>{density}</strong> fingerlings/ha
              </p>
            )}
            {record.production_cycle_no && (
              <p className="text-[11px] text-[#235E38]">
                Production Cycle <strong>#{record.production_cycle_no}</strong> for this fisherfolk and species
              </p>
            )}
            {preview && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
                <div>
                  <p className="text-[11px] text-[#4A5E4A]">Est. Harvest Date</p>
                  <p className="text-[13px] font-semibold text-[#1A2B1A]">
                    {fmtLong(preview.harvestDate.toISOString().slice(0, 10))}
                  </p>
                </div>
                {preview.estKg != null && (
                  <div>
                    <p className="text-[11px] text-[#4A5E4A]">Est. Harvest (kg)</p>
                    <p className="text-[13px] font-semibold text-[#1A2B1A]">
                      {preview.estKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label className={editLabelCls}>Season</label>
          <select className={baseInputClasses} value={form.season} onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
        </div>

        {error && (
          <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>
        )}

        {user?.role === 'ADMIN' && record.status !== 'Harvested' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-[12px] font-semibold text-rose-700 mb-1">Danger Zone</p>
            <p className="text-[11px] text-rose-600 mb-2">
              Permanently delete this stocking record and all its logs, disaster reports, and harvest records.
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-100 transition-colors"
            >
              <Trash2 size={13} /> Delete this record
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting || !isDirty}
            className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Delete ${record.species_name}?`}
          message="This action cannot be undone."
          details={`${record.log_count ?? 0} activity log(s), ${record.disaster_report_count ?? 0} disaster report(s), ${record.harvest_count ?? 0} harvest record(s).`}
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete Record'}
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </ModalShell>
  )
}

// ─── Detail Modal (Eye) ────────────────────────────────────────────────────────

function StockingDetailModal({ record, onClose }) {
  const landStatusDisplay =
    record.land_status === 'Other' ? `Other — ${record.land_status_other_specify || ''}` : record.land_status || '—'
  const waterSourceDisplay =
    record.water_source === 'Other' ? `Other — ${record.water_source_other_specify || ''}` : record.water_source || '—'
  const fingerlingSourceDisplay =
    record.fingerling_source === 'Other' ? `Other — ${record.fingerling_source_other_specify || ''}` : record.fingerling_source || '—'
  const culturePhaseDisplay =
    record.culture_phase === 'Other' ? `Other — ${record.culture_phase_other_specify || ''}` : record.culture_phase || '—'
  const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  const fmtPhp = (v) => (v == null ? '—' : `₱${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

  const rows = [
    ['Species', record.species_name || '—'],
    ['Category', record.category_name || '—'],
    ['Fisherfolk', record.fisherfolk_name || '—'],
    ['Pond Location', record.pond_location_barangay || '—'],
    ['Land Status', landStatusDisplay],
    ['Culture Type', record.culture_type || '—'],
    ['Culture Phase', culturePhaseDisplay],
    ['Season / Year', `${record.season || '—'} ${record.year || ''}`],
    ['Date Stocked', fmtLong(record.date_stocked)],
    ['Area (ha)', record.area_hectares ? Number(record.area_hectares).toFixed(4) : '—'],
    ['Number of Fingerlings', record.number_of_fingerlings ?? '—'],
    ['Survival Rate (%)', record.survival_rate_pct ?? '—'],
    ['Avg Body Weight (kg)', record.avg_body_weight_kg ?? '—'],
    ['Seed/Fingerling Cost', fmtPhp(record.seed_cost_php)],
    ['Water Source', waterSourceDisplay],
    ['Number of Units', record.number_of_units ?? '—'],
    ['Unit Dimensions', record.unit_dimensions || '—'],
    ['Fingerling Source', fingerlingSourceDisplay],
    ['Avg Fingerling Size', record.avg_fingerling_size || '—'],
    ['Expected Harvest Date', fmtLong(record.expected_harvest_date)],
    [
      'Total Harvested (kg)',
      <span className="flex items-center justify-end gap-1.5" key="thk">
        {fmtNum(record.total_harvested_kg)}
        <HarvestVarianceBadge days={record.harvest_variance_days} />
      </span>,
    ],
    ['Estimated Harvest (kg)', fmtNum(record.estimated_harvest_kg)],
    ['Stocking Density (fingerlings/ha)', record.stocking_density ?? '—'],
    ['Production Cycle', record.production_cycle_no ? `#${record.production_cycle_no}` : '—'],
    ['Status', record.status || '—'],
    ['Notes', record.notes || '—'],
  ]

  return (
    <ModalShell
      title={`Stocking Record — ${record.species_name}`}
      subtitle="Read-only detail view"
      icon={Eye}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 border-b border-[#F0F4F0] pb-2">
              <span className="text-[12px] font-medium text-[#7A8E7A]">{label}</span>
              <span className="text-right text-[13px] font-semibold text-[#1A2B1A]">{value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 text-center">
            <p className="text-[20px] font-bold text-[#1B4D2E]">{record.log_count ?? 0}</p>
            <p className="text-[11px] text-[#7A8E7A]">Activity Log(s)</p>
          </div>
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 text-center">
            <p className="text-[20px] font-bold text-[#1B4D2E]">{record.disaster_report_count ?? 0}</p>
            <p className="text-[11px] text-[#7A8E7A]">Disaster Report(s)</p>
          </div>
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 text-center">
            <p className="text-[20px] font-bold text-[#1B4D2E]">{record.harvest_count ?? 0}</p>
            <p className="text-[11px] text-[#7A8E7A]">Harvest Record(s)</p>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Row Actions Menu (⋮): CRUD group (View Details / Edit) + lifecycle group ──
// (View Logs / Record Harvest / Report Disaster / Force Unlock), one merged
// menu — Batch B. Previously two separate ⋮ menus plus a standalone Force
// Unlock icon; RowActions collapses them into one dropdown with a divider
// between the groups since a row always offers 3+ applicable actions here.
// Delete lives inside EditStockingModal's Danger Zone, not in this menu.

// Mirrors core.utils.harvest_gate_status on the backend (the real
// enforcement — this is client-side UX only, to explain the gate before
// the user even opens the modal rather than after a rejected submit).
function harvestGateInfo(rec) {
  if (!rec.date_stocked || !rec.expected_harvest_date) return { gated: false, message: null }
  const stocked = new Date(rec.date_stocked + 'T00:00:00')
  const expected = new Date(rec.expected_harvest_date + 'T00:00:00')
  const totalDays = (expected - stocked) / (1000 * 60 * 60 * 24)
  if (totalDays <= 0) return { gated: false, message: null }
  const halfwayDays = totalDays / 2
  const elapsedDays = (new Date() - stocked) / (1000 * 60 * 60 * 24)
  if (elapsedDays >= halfwayDays) return { gated: false, message: null }
  const daysRemaining = Math.ceil(halfwayDays - elapsedDays)
  return {
    gated: true,
    message: `Harvest can only be recorded once at least half the expected culture duration has passed. Available in about ${daysRemaining} more day(s).`,
  }
}

function StockingRowActions({
  rec, isAdmin, isLocked, lockedByName,
  onViewDetails, onEdit, onViewLogs, onRecordHarvest, onReportDisaster, onForceUnlock, showToast,
}) {
  const canEdit = rec.status !== 'Harvested'
  const canHarvest = rec.status !== 'Total Loss' && rec.status !== 'Harvested'
  const isNearHarvest = rec.status === 'Near Harvest'
  const harvestGate = harvestGateInfo(rec)

  const actions = [
    { key: 'view', label: 'View Details', icon: Eye, onClick: onViewDetails, group: 'crud' },
    canEdit && { key: 'edit', label: 'Edit', icon: Pencil, onClick: onEdit, group: 'crud' },
    { key: 'logs', label: 'View Logs', icon: Eye, onClick: onViewLogs, group: 'lifecycle' },
    canHarvest && {
      key: 'harvest',
      label: harvestGate.gated ? 'Record Harvest (Not Yet Available)' : 'Record Harvest',
      icon: Wheat,
      onClick: () => (harvestGate.gated ? showToast(harvestGate.message, 'error') : onRecordHarvest()),
      tone: harvestGate.gated ? 'default' : (isNearHarvest ? 'amber' : 'default'), group: 'lifecycle',
    },
    { key: 'disaster', label: 'Report Disaster', icon: AlertTriangle, onClick: onReportDisaster, tone: 'rose', group: 'lifecycle' },
    isAdmin && isLocked && {
      key: 'unlock', label: `Force Unlock (${lockedByName || 'locked'})`, icon: Unlock, onClick: onForceUnlock,
      tone: 'amber', group: 'lifecycle',
    },
  ]

  return <RowActions actions={actions} menuTitle="Actions" menuWidthClassName="w-52" />
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FisheriesRecordsPage({ asTab = false }) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()
  const [records,      setRecords]      = useState([])
  const [totalCount,   setTotalCount]   = useState(0)
  const [page,         setPage]         = useState(1)
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [seasonFilter, setSeasonFilter] = useState('')
  const [yearFilter,   setYearFilter]   = useState('')
  const [showAdd,      setShowAdd]      = useState(false)
  const [editingRec,   setEditingRec]   = useState(null)
  const [viewingRec,   setViewingRec]   = useState(null)
  const [speciesList,  setSpeciesList]  = useState([])
  const [viewLogsRec,  setViewLogsRec]  = useState(null)
  const [disasterRec,  setDisasterRec]  = useState(null)
  const [harvestRec,   setHarvestRec]   = useState(null)

  // Handle ?action=add from fisheries monitoring "Add Stocking" button
  useEffect(() => {
    if (searchParams.get('action') === 'add') setShowAdd(true)
  }, [])

  useEffect(() => {
    api.get('/fisheries/species/')
      .then(r => setSpeciesList(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => {})
  }, [])

  const fetchRecords = useCallback(async (pageNum = 1) => {
    setIsLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: pageNum })
      if (statusFilter === 'All Status') {
        params.set('status', 'Stocked,Near Harvest,Harvested')
      } else if (statusFilter !== 'All Status') {
        params.set('status', statusFilter)
      }
      if (seasonFilter) params.set('season', seasonFilter)
      if (yearFilter)   params.set('year', yearFilter)
      const r = await api.get(`/fisheries/stocking/?${params.toString()}`)
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      setError('Failed to load stocking records.')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, seasonFilter, yearFilter])

  useEffect(() => { setPage(1); fetchRecords(1) }, [statusFilter, seasonFilter, yearFilter])
  useEffect(() => { fetchRecords(page) }, [fetchRecords, page])

  // Lock indicators for the currently-visible page only.
  const [lockStatuses, setLockStatuses] = useState({})

  const refreshLockStatuses = useCallback(async (recs) => {
    if (!recs.length) { setLockStatuses({}); return }
    const entries = await Promise.all(recs.map(async rec => {
      try {
        const r = await api.get('/locks/status/', { params: { record_type: 'stocking', record_id: rec.id } })
        return [rec.id, r.data.locked ? r.data : null]
      } catch { return [rec.id, null] }
    }))
    setLockStatuses(Object.fromEntries(entries.filter(([, v]) => v)))
  }, [])

  useEffect(() => { refreshLockStatuses(records) }, [records, refreshLockStatuses])

  const handleForceUnlock = async (recordId) => {
    try {
      await api.post('/locks/release/', { record_type: 'stocking', record_id: recordId })
      refreshLockStatuses(records)
    } catch { /* ignore */ }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(rec =>
      !q
      || rec.species_name?.toLowerCase().includes(q)
      || rec.fisherfolk_name?.toLowerCase().includes(q)
      || rec.pond_location_barangay?.toLowerCase().includes(q)
    )
  }, [records, search])

  const rows = filtered.map(rec => ({
    ...rec,
    species_name_cell: (
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{rec.species_name}</span>
        {rec.disaster_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <AlertTriangle className="w-2.5 h-2.5" /> {rec.disaster_count > 1 ? rec.disaster_count : 'Disaster'}
          </span>
        )}
        {rec.disaster_count === 0 && rec.has_recovered_disaster && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            <CheckCircle2 className="w-2.5 h-2.5" /> Recovered
          </span>
        )}
        {lockStatuses[rec.id] && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap"
            title={`Locked by ${lockStatuses[rec.id].locked_by?.name || 'another user'}`}
          >
            <Lock className="w-2.5 h-2.5" /> {lockStatuses[rec.id].locked_by?.name}
          </span>
        )}
      </span>
    ),
    fisherfolk_cell:      rec.fisherfolk_name || '—',
    cycle_cell:           rec.production_cycle_no ? `#${rec.production_cycle_no}` : '—',
    date_stocked_fmt:     fmtShort(rec.date_stocked),
    expected_harvest_fmt: fmtShort(rec.expected_harvest_date),
    est_harvest_kg_fmt:   rec.status === 'Harvested' && rec.total_harvested_kg
      ? <span className="text-slate-400">{Number(rec.total_harvested_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      : rec.estimated_harvest_kg
        ? Number(rec.estimated_harvest_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—',
    assoc_name:   rec.organization_name || '—',
    pond_location: rec.pond_location_barangay || '—',
    status_cell: (
      <span className="flex items-center gap-1.5">
        <StatusPill tone={STATUS_TONES[rec.status] || 'slate'}>{rec.status}</StatusPill>
        <HarvestVarianceBadge days={rec.harvest_variance_days} />
      </span>
    ),
    actions_cell: (
      <StockingRowActions
        rec={rec}
        isAdmin={user?.role === 'ADMIN'}
        isLocked={Boolean(lockStatuses[rec.id])}
        lockedByName={lockStatuses[rec.id]?.locked_by?.name}
        onViewDetails={() => setViewingRec(rec)}
        onEdit={() => setEditingRec(rec)}
        onViewLogs={() => setViewLogsRec(rec)}
        onRecordHarvest={() => setHarvestRec(rec)}
        onReportDisaster={() => setDisasterRec(rec)}
        onForceUnlock={() => handleForceUnlock(rec.id)}
        showToast={showToast}
      />
    ),
  }))

  const innerContent = (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors"
          onClick={() => setShowAdd(true)}
        >
          <Plus size={15} /> Add Stocking Record
        </button>
      </div>

      <div className="space-y-4">
        <FilterPanel
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by species, fisherfolk, or barangay..."
          activeCount={[statusFilter !== 'All Status', Boolean(seasonFilter), Boolean(yearFilter)].filter(Boolean).length}
        >
          <select className={filterSelectCls} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All Status">All Status</option>
            <option value="Stocked">Stocked</option>
            <option value="Near Harvest">Near Harvest</option>
            <option value="Harvested">Harvested</option>
            <option value="Total Loss">Total Loss</option>
          </select>
          <select className={filterSelectCls} value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}>
            <option value="">All Seasons</option>
            <option value="Dry">Dry Season</option>
            <option value="Wet">Wet Season</option>
          </select>
          <select className={filterSelectCls} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </FilterPanel>

        {error && <ErrorMessage message={error} />}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className="whitespace-nowrap px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#F0F4F0] animate-pulse">
                    {COLUMNS.map(col => (
                      <td key={col.key} className="px-4 py-[13px]">
                        <div className="h-4 bg-[#E8EEE8] rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-[#C8D5C8]">
                      <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                      <p className="text-[14px] font-medium text-[#4A5E4A]">No stocking records found</p>
                      <p className="text-[13px] text-[#7A8E7A]">Try adjusting your filters or add a new stocking record</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]">
                    {COLUMNS.map(col => (
                      <td key={col.key} className="whitespace-nowrap px-4 py-[13px] text-[13px] text-[#1A2B1A] align-middle">
                        {row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          totalCount={totalCount}
          pageSize={10}
          onPageChange={p => setPage(p)}
        />
      </div>

      {showAdd && (
        <AddStockingModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); setPage(1); fetchRecords(1) }}
        />
      )}

      {editingRec && (
        <EditStockingModal
          record={editingRec}
          speciesList={speciesList}
          onClose={() => setEditingRec(null)}
          onSaved={() => { setEditingRec(null); fetchRecords(page) }}
        />
      )}


      {viewingRec && (
        <StockingDetailModal record={viewingRec} onClose={() => setViewingRec(null)} />
      )}

      {viewLogsRec && (
        <ViewStockingLogsModal
          record={viewLogsRec}
          onClose={() => setViewLogsRec(null)}
          onLogAdded={() => fetchRecords(page)}
        />
      )}

      {disasterRec && (
        <StockingDisasterReportModal
          record={disasterRec}
          onClose={() => setDisasterRec(null)}
          onSuccess={() => fetchRecords(page)}
        />
      )}

      {harvestRec && (
        <RecordStockingHarvestModal
          record={harvestRec}
          onClose={() => setHarvestRec(null)}
          onSuccess={() => { setHarvestRec(null); fetchRecords(page) }}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Fisheries Records"
      subtitle="Manage stocking records for aquaculture production."
    >
      {innerContent}
    </PageLayout>
  )
}
