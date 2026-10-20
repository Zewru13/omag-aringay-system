import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { AlertTriangle, ChevronDown, ChevronRight, Eye, Fish, HelpCircle, Layers, Lock, Pencil, Trash2, Unlock, Wheat } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import RowActions from '../../components/UI/RowActions.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DisasterIndicator from '../../components/UI/DisasterIndicator.jsx'
import FishingNetIcon from '../../components/UI/FishingNetIcon.jsx'
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
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import { pcicError, pcicPayload, pcicStateFrom, uploadPcicForm } from '../../utils/pcic.js'
import AquacultureCycleDetailModal from '../Monitoring/AquacultureCycleDetailModal.jsx'
import { rowClickProps } from '../../utils/rowClick.js'
import StartProductionCycleModal from '../Monitoring/StartProductionCycleModal.jsx'
import {
  RecordStockingHarvestModal,
  StockingDisasterReportModal,
  ViewStockingLogsModal,
} from './StockingMonitoringModals.jsx'
import PondSelector from './PondSelector.jsx'
import { ProductionUnitsCards, ProductionUnitsTable } from './ProductionUnitsPanel.jsx'
import useExpandableProductionUnits from './useExpandableProductionUnits.js'
import { computeHarvestPreview, detectSeason, fmtActualHarvestKg, fmtLong, fmtShort, harvestGateStatus } from './stockingHelpers.js'
import PcicBadge from '../../components/UI/PcicBadge.jsx'

const filterSelectCls =
  'rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_TONES = {
  Stocked:         'green',
  'Near Harvest':  'amber',
  Late:            'rose',    // display_status only: past the expected harvest date, not yet harvested
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
  { key: 'actual_harvest_kg_fmt', label: 'ACTUAL HARVEST (KG)' },
  { key: 'assoc_name',          label: 'ORGANIZATION' },
  { key: 'pond_location',       label: 'POND LOCATION' },
  { key: 'status_cell',         label: 'STATUS' },
  { key: 'actions_cell',        label: 'ACTIONS' },
]

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
    production_cycle:        record.production_cycle ?? null,
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
  const [pcic, setPcic]           = useState(() => pcicStateFrom(record))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]         = useState('')

  const normalize = (v) => (v === null || v === undefined ? '' : String(v).trim())
  const isDirty = Object.keys(originalData).some(k => normalize(form[k]) !== normalize(originalData[k]))
    || pcic.insured !== !!record.has_pcic_insurance || !!pcic.file

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Cycles this fisherfolk owns: Active ones for normal selection, plus the
  // currently-linked cycle even if it is Harvested/Failed/Abandoned so it stays visible.
  const [cycleOptions, setCycleOptions] = useState([])
  useEffect(() => {
    if (!record.fisherfolk) return
    api.get('/monitoring/aquaculture-cycles/', { params: { fisherfolk: record.fisherfolk } })
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setCycleOptions(list.filter(c => c.status === 'Active' || c.id === record.production_cycle))
      })
      .catch(() => showToast('Failed to load production cycles.', 'error'))
  }, [record.fisherfolk, record.production_cycle])

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
    const pcicProblem = pcicError(pcic)
    if (pcicProblem) { setError(pcicProblem); return }
    setError(''); setIsSubmitting(true)
    try {
      await api.patch(`/fisheries/stocking/${record.id}/`, {
        ...pcicPayload(pcic),
        pond:                    form.pond || null,
        production_cycle:        form.production_cycle || null,
        pond_location_barangay: form.pond_location_barangay,
        land_status:            form.land_status,
        land_status_other_specify: form.land_status === 'Other' ? form.land_status_other_specify : '',
        culture_type:           form.culture_type,
        date_stocked:           form.date_stocked,
        date_stocked_is_estimated: false,
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
      try {
        await uploadPcicForm(api, 'stocking', record.id, pcic)
      } catch {
        showToast('The record was saved, but the PCIC form photo could not be uploaded. Try again.', 'error')
      }
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
      footer={(
        <>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
            Cancel
          </button>
          <button type="submit" form="edit-stocking-form" disabled={isSubmitting || !isDirty}
            className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      )}
    >
      <form id="edit-stocking-form" onSubmit={handleSubmit} className="space-y-4">
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

        <div>
          <label className={editLabelCls}>Production Cycle (optional)</label>
          <select className={baseInputClasses} value={form.production_cycle ?? ''}
            onChange={e => set('production_cycle', e.target.value ? Number(e.target.value) : null)}>
            <option value="">— None —</option>
            {cycleOptions.map(c => (
              <option key={c.id} value={c.id}>{c.cycle_name} — {c.species_farmed} ({c.status})</option>
            ))}
          </select>
        </div>

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
            {record.date_stocked_is_estimated && (
              <p className="mt-1.5 text-[11px] text-amber-700">
                This date is an estimate. Saving this form confirms it as the real stocking date and
                unblocks Record Harvest for this stock.
              </p>
            )}
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
                Production Cycle <strong>#{record.production_cycle_no}</strong> for this fisherfolk
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

        <PcicInsuranceField value={pcic} onChange={setPcic} subject="stocking record" />

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

// Force-harvested ponds/cages of a cycle-linked record, straight from the backend's harvest_units.
// `force_harvested` = the unit is listed on a harvest record with is_force_harvest=True (set by the
// backend). A normally harvested unit and a Health Log alone (force_harvest without a harvest) never
// qualify. Labels are "Pond N" / "Cage N" -> HP N / HC N.
function forceHarvestedUnits(rec) {
  return (rec.harvest_units || [])
    .filter(u => u.force_harvested)
    .map(u => {
      const m = /^(Pond|Cage)\s+(\d+)$/.exec(u.label || '')
      if (!m) return null
      const prefix = m[1] === 'Pond' ? 'HP' : 'HC'
      return { ...u, typeLabel: m[1], number: m[2], prefix, code: `${prefix}${m[2]}` }
    })
    .filter(Boolean)
}

// Display only: one compact badge per prefix showing HOW MANY units were force harvested - three ponds
// -> "HP 3", ten cages -> "HC 10"; mixed types stay separate ("HP 2" and "HC 2"). The badge never lists
// the units, so it keeps the same small footprint however many there are; each group keeps its actual
// units (numeric order) for the details modal, which lists them all.
function groupForceHarvestedUnits(units) {
  const groups = new Map()
  for (const u of units) {
    if (!groups.has(u.prefix)) groups.set(u.prefix, [])
    groups.get(u.prefix).push(u)
  }
  return [...groups.entries()].map(([prefix, list]) => {
    const sorted = [...list].sort((a, b) => Number(a.number) - Number(b.number))
    const noun = sorted[0].typeLabel === 'Cage' ? 'cage' : 'pond'
    return {
      prefix, units: sorted, code: `${prefix} ${sorted.length}`,
      names: sorted.map(u => u.label).join(', '),
      ariaLabel: `View ${sorted.length} Force Harvested ${noun}${sorted.length === 1 ? '' : 's'}`,
    }
  })
}

// Force Harvest Details for ONE pond/cage at a time: its own Health Log entries (cycle health endpoint,
// filtered by production_unit) and the harvest record that lists it (stocking detail endpoint,
// production_units). A grouped badge (e.g. HP1,2) passes all its units; a switcher picks the unit shown.
function ForceHarvestDetailsModal({ record, units, onClose }) {
  const [activeUnitId, setActiveUnitId] = useState(units[0].id)
  const unit = units.find(u => u.id === activeUnitId) || units[0]
  const [harvests, setHarvests] = useState(null)
  // No production cycle -> no Health Log to load.
  const [logs, setLogs] = useState(record.production_cycle ? null : [])
  const [harvestFailed, setHarvestFailed] = useState(false)
  const [logsFailed, setLogsFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get(`/fisheries/stocking/${record.id}/`)
      .then(r => { if (!cancelled) setHarvests(r.data.harvests || []) })
      .catch(() => { if (!cancelled) setHarvestFailed(true) })
    if (record.production_cycle) {
      api.get(`/monitoring/aquaculture-cycles/${record.production_cycle}/health/`)
        .then(r => { if (!cancelled) setLogs(Array.isArray(r.data) ? r.data : (r.data.results || [])) })
        .catch(() => { if (!cancelled) setLogsFailed(true) })
    }
    return () => { cancelled = true }
  }, [record.id, record.production_cycle])

  const fmtKg = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const list = (items) => (items.length === 1 ? items[0] : (
    <ul className="space-y-0.5">{items.map((it, i) => <li key={i}>• {it}</li>)}</ul>
  ))

  // Only this unit's own Force Harvest Health Log entries.
  const unitLogs = (logs || []).filter(l => l.production_unit === unit.id && l.force_harvest)
  // The Force Harvest record (is_force_harvest) whose production_units include a unit.
  const harvestFor = (u) => (harvests || []).find(h => h.is_force_harvest && ((h.production_units || []).includes(u.id)
    || (h.production_unit_details || []).some(d => d.id === u.id)))
  const harvest = harvestFor(unit)
  // A unit's own recorded kg for the "Force Harvested Units" list (combined total for older records).
  const unitKgText = (u) => {
    const h = harvestFor(u)
    if (!h) return harvests === null ? '…' : '—'
    const own = (h.unit_harvests || []).find(r => r.production_unit === u.id)
    return own ? `${fmtKg(own.quantity_kg)} kg` : `${fmtKg(h.quantity_kg)} kg combined`
  }
  const harvestedWith = harvest ? (harvest.production_unit_details || []).map(d => d.label) : []
  // Per-unit actual kg of that Force Harvest (FisheriesHarvestUnit rows). Empty for older records,
  // which only have the combined quantity_kg.
  const unitHarvests = harvest?.unit_harvests || []
  const ownUnitHarvest = unitHarvests.find(r => r.production_unit === unit.id)

  const rows = [
    ['Production Unit', unit.label],
    ['Status', 'Force Harvested'],
  ]
  const issues = [...new Set(unitLogs.map(l => l.observation).filter(Boolean))]
  if (issues.length) rows.push(['Health Issue', list(issues)])
  const mortality = unitLogs.filter(l => Number(l.mortality_count) > 0)
  if (mortality.length) {
    rows.push(['Mortality Count', list(mortality.map(l => (unitLogs.length > 1
      ? `${Number(l.mortality_count).toLocaleString()} (${fmtLong(l.log_date)})`
      : Number(l.mortality_count).toLocaleString())))])
  }
  const logDates = [...new Set(unitLogs.map(l => l.log_date).filter(Boolean))]
  if (logDates.length) rows.push(['Health Log Date', list(logDates.map(fmtLong))])
  // Every Force Harvest reason the backend classified for this unit (harvest_units.reasons).
  if ((unit.reasons || []).length) rows.push(['Force Harvest Reason', list(unit.reasons)])
  if (harvest) {
    if (harvest.early_late_reason && harvest.early_late_reason !== (unit.reasons || []).join('; ')) {
      rows.push(['Recorded Harvest Reason', harvest.early_late_reason])
    }
    rows.push(['Harvest Date', fmtLong(harvest.harvest_date)])
    rows.push(['Actual Harvest (kg)', ownUnitHarvest
      ? fmtKg(ownUnitHarvest.quantity_kg)                                   // this unit's own recorded kg
      : harvestedWith.length > 1
        ? <span>{fmtKg(harvest.quantity_kg)} <span className="font-normal text-[#7A8E7A]">(combined total for {harvestedWith.join(', ')})</span></span>
        : fmtKg(harvest.quantity_kg)])
    if (harvest.area_or_units_harvested) rows.push(['Area / Units Harvested', harvest.area_or_units_harvested])
    if (harvest.notes) rows.push(['Notes', harvest.notes])
  }
  const logNotes = unitLogs.map(l => l.notes).filter(Boolean)
  if (logNotes.length) rows.push(['Health Log Notes', list(logNotes)])

  const loading = (harvests === null && !harvestFailed) || (logs === null && !logsFailed)

  return (
    <ModalShell
      title={`Force Harvest Details — ${unit.label}`}
      subtitle={`${record.species_name || ''}${record.fisherfolk_name ? ` · ${record.fisherfolk_name}` : ''}`}
      icon={AlertTriangle}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-3" data-testid="force-harvest-details">
        {units.length > 1 && (
          // Every force-harvested unit of this badge with its own kg; picking one shows its full details below.
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7A8E7A]">
              Force Harvested Units ({units.length})
            </p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-[#E2E8E2]" role="tablist" aria-orientation="vertical" data-testid="force-unit-switcher">
              {units.map(u => (
                <button
                  key={u.id}
                  type="button"
                  role="tab"
                  aria-selected={u.id === unit.id}
                  onClick={() => setActiveUnitId(u.id)}
                  data-testid="force-unit-row"
                  className={`flex w-full items-center justify-between gap-3 border-b border-[#F0F4F0] px-3 py-1.5 text-left text-[12px] transition-colors last:border-b-0 ${
                    u.id === unit.id ? 'bg-red-600 font-semibold text-white' : 'text-[#1A2B1A] hover:bg-red-50'
                  }`}
                >
                  <span>{u.label}</span>
                  <span className="whitespace-nowrap tabular-nums">{unitKgText(u)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {harvestFailed &&<p className="text-[12px] text-rose-600">Failed to load harvest records.</p>}
        {logsFailed && <p className="text-[12px] text-rose-600">Failed to load Health Log entries.</p>}
        {loading ? (
          <p className="text-[12px] text-[#7A8E7A]">Loading force harvest details…</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#E2E8E2]">
            <table className="min-w-full text-[13px]">
              <thead className="bg-[#F9FAF9] text-[11px] uppercase tracking-[0.06em] text-[#7A8E7A]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Detail</th>
                  <th className="px-3 py-2 text-left font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label} className="border-t border-[#F0F4F0] align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-[#4A5E4A]">{label}</td>
                    <td className="px-3 py-2 font-semibold text-[#1A2B1A]">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && unitHarvests.length > 1 && (
          // Every unit harvested in this same Force Harvest event, each with its own recorded kg.
          <div className="space-y-1.5" data-testid="force-harvest-unit-kg">
            <p className="text-[12px] font-semibold text-[#4A5E4A]">Units harvested in this Force Harvest</p>
            <div className="overflow-hidden rounded-xl border border-[#E2E8E2]">
              <table className="min-w-full text-[13px]">
                <thead className="bg-[#F9FAF9] text-[11px] uppercase tracking-[0.06em] text-[#7A8E7A]">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Production Unit</th>
                    <th className="px-3 py-2 text-right font-semibold">Actual Harvest (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {unitHarvests.map(r => (
                    <tr key={r.production_unit} className={`border-t border-[#F0F4F0] ${r.production_unit === unit.id ? 'bg-red-50/60' : ''}`}>
                      <td className="px-3 py-2 font-medium text-[#1A2B1A]">{r.label}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#1A2B1A]">{fmtKg(r.quantity_kg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// Harvest details for a record: one block per harvest record, listing the actual ponds/cages
// linked to it. Loaded from the record's detail endpoint (which nests the harvest records).
function HarvestDetailsSection({ record }) {
  const [harvests, setHarvests] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!record.harvest_count) { setHarvests([]); return }
    let cancelled = false
    api.get(`/fisheries/stocking/${record.id}/`)
      .then(r => { if (!cancelled) setHarvests(r.data.harvests || []) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [record.id, record.harvest_count])

  // Harvested vs remaining ponds/cages, from the backend's harvest_units (harvest <-> production-unit link).
  const units = record.harvest_units || []
  const harvestedUnits = units.filter(u => u.harvested)
  const remainingUnits = units.filter(u => !u.harvested)
  if (!record.harvest_count && harvestedUnits.length === 0) return null

  const fmtKg = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const unitWord = (units[0]?.label || 'Pond').split(' ')[0]
  // Only harvests actually linked to a production unit (backend production_units relation) are primary.
  const linkedHarvests = (harvests || []).filter(h => (h.production_unit_details || []).length > 0)
  // Harvest records with no linked production unit are not shown here (they stay in the database).
  if (harvests !== null && linkedHarvests.length === 0 && units.length === 0) return null
  return (
    <div className="space-y-3" data-testid="harvest-details">
      <p className="text-[13px] font-semibold text-[#1B4D2E]">Harvest Details</p>
      {failed && <p className="text-[12px] text-rose-600">Failed to load harvest details.</p>}
      {harvests === null && !failed && <p className="text-[12px] text-[#7A8E7A]">Loading harvest details…</p>}
      {linkedHarvests.map(h => {
        const details = h.production_unit_details
        const type = details[0]?.unit_type_label
        const reasons = [...new Set(details.flatMap(d => d.reasons || []))]
        return (
          <div key={h.id} className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px]">
            <div>
              <p className="font-medium text-[#4A5E4A]">{details.length > 1 ? `Harvested ${type}s` : `Harvested ${type}`}</p>
              {details.map(d => {
                const own = (h.unit_harvests || []).find(r => r.production_unit === d.id)
                return (
                  <p key={d.id} className="font-semibold text-emerald-700">
                    {d.label} — Harvested{own ? ` (${fmtKg(own.quantity_kg)} kg)` : ''}
                  </p>
                )
              })}
            </div>
            <p><span className="font-medium text-[#4A5E4A]">Harvest Date: </span><span className="font-semibold">{fmtLong(h.harvest_date)}</span></p>
            <p><span className="font-medium text-[#4A5E4A]">Actual Harvest: </span><span className="font-semibold">{fmtKg(h.quantity_kg)} kg</span></p>
            {h.early_late_reason && (
              <p><span className="font-medium text-[#4A5E4A]">Reason for Early Harvest: </span><span className="font-semibold">{h.early_late_reason}</span></p>
            )}
            {h.is_force_harvest && reasons.length > 0 && (
              <p><span className="font-medium text-[#4A5E4A]">Force Harvest: </span><span className="font-semibold">{reasons.join('; ')}</span></p>
            )}
          </div>
        )
      })}
      {units.length > 0 && (
        <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2.5 text-[13px]" data-testid="unit-harvest-status">
          <p className="font-medium text-[#4A5E4A]">{`Remaining ${unitWord}s`}</p>
          {remainingUnits.length === 0
            ? <p className="text-[#7A8E7A]">None</p>
            : remainingUnits.map(u => <p key={u.id} className="font-semibold text-[#1A2B1A]">{u.label} — Remaining (Stocked)</p>)}
        </div>
      )}
    </div>
  )
}

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
    ['PCIC Insurance', <PcicBadge key="pcic" insured={record.has_pcic_insurance} url={record.pcic_form_photo} none="No" />],
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
    ['Status', record.display_status || record.status || '—'],
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

        <HarvestDetailsSection record={record} />

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
  if (rec.date_stocked_is_estimated) {
    return {
      gated: true,
      message: 'This record’s stocking date is an estimate, not a confirmed field date. Harvest ' +
        'cannot be recorded until a staff member confirms or corrects the real stocking date.',
    }
  }
  // Force Harvest (fish mortality / disease in the cycle's Health Log) lifts the waiting period; the
  // backend applies the same exemption.
  if (rec.force_harvest) return { gated: false, message: null }
  // Normal harvest: active once >= 50% of this record's own Stocking Date -> Expected Harvest Date has elapsed.
  return harvestGateStatus(rec.date_stocked, rec.expected_harvest_date)
}

// The row itself expands the cycle's ponds/cages, so View Cycle (Cycle Info, Feeding Logs, Health Logs) is
// offered to every role here. simplified (Admin and fisherfolk accounts): View Logs / Record Harvest / Report
// Disaster are not repeated in the menu - harvest stays reachable through the fishing-net button beside the
// menu; disasters through Disaster. Evaluator accounts keep the full menu.
function StockingRowActions({
  rec, isAdmin, isLocked, lockedByName, simplified = false,
  onViewDetails, onEdit, onViewCycle, onViewLogs, onRecordHarvest, onReportDisaster, onForceUnlock, showToast,
}) {
  const canEdit = rec.status !== 'Harvested'
  const canHarvest = rec.status !== 'Total Loss' && rec.status !== 'Harvested'
  const isNearHarvest = rec.status === 'Near Harvest'
  const harvestGate = harvestGateInfo(rec)

  const actions = [
    { key: 'view', label: 'View Details', icon: Eye, onClick: onViewDetails, group: 'crud' },
    canEdit && { key: 'edit', label: 'Edit', icon: Pencil, onClick: onEdit, group: 'crud' },
    { key: 'cycle', label: 'View Cycle Details & Logs', icon: Layers, onClick: onViewCycle, group: 'lifecycle' },
    !simplified && { key: 'logs', label: 'View Logs', icon: Eye, onClick: onViewLogs, group: 'lifecycle' },
    !simplified && canHarvest && {
      key: 'harvest',
      label: harvestGate.gated ? 'Record Harvest (Not Yet Available)' : 'Record Harvest',
      icon: Wheat,
      onClick: () => (harvestGate.gated ? showToast(harvestGate.message, 'error') : onRecordHarvest()),
      tone: harvestGate.gated ? 'default' : (isNearHarvest ? 'amber' : 'default'), group: 'lifecycle',
    },
    !simplified && { key: 'disaster', label: 'Report Disaster', icon: AlertTriangle, onClick: onReportDisaster, tone: 'rose', group: 'lifecycle' },
    isAdmin && isLocked && {
      key: 'unlock', label: `Force Unlock (${lockedByName || 'locked'})`, icon: Unlock, onClick: onForceUnlock,
      tone: 'amber', group: 'lifecycle',
    },
  ]

  // Quick-access Record Harvest shortcut beside the ⋮ menu. It opens the SAME Record Harvest modal as
  // the menu item (same handler, same gate) - it never records anything by itself. Red = the cycle's
  // Health Log has fish mortality or a disease (Force Harvest).
  const force = Boolean(rec.force_harvest)
  // Inactive (disabled) before 50% of the culture duration, unless Force Harvest overrides the rule.
  const netActive = canHarvest && !harvestGate.gated
  const netTitle = rec.status === 'Harvested' ? 'Already harvested'
    : rec.status === 'Total Loss' ? 'Harvest not available (Total Loss)'
    : harvestGate.gated ? harvestGate.message
    : force ? 'Record Harvest — Force Harvest' : 'Record Harvest'
  const netColor = !netActive
    ? 'cursor-not-allowed text-[#C8D5C8]'
    : force ? 'text-red-600 hover:bg-red-50' : 'text-[#1B4D2E] hover:bg-[#F0F4F0]'

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        data-testid="quick-harvest"
        data-force={force ? 'true' : 'false'}
        title={netTitle}
        aria-label={netTitle}
        disabled={!netActive}
        onClick={(e) => {
          e.stopPropagation()
          onRecordHarvest()
        }}
        className={`rounded-lg p-1.5 transition-colors ${netColor}`}
      >
        <FishingNetIcon size={16} />
      </button>
      <RowActions actions={actions} menuTitle="Actions" menuWidthClassName="w-52" />
    </div>
  )
}

// Top-right of an expanded row's pond/cage panel: opens the existing Production Cycle modal (Cycle Info,
// Feeding Logs, Health Logs) via handleViewCycle. Only for a stock linked to a cycle - there is nothing to open
// otherwise. It sits outside the parent row (desktop) / inside a data-no-row-click area (cards), so a click
// never expands or collapses the row.
function CycleDetailsButton({ rec, onViewCycle }) {
  if (!rec.production_cycle) return null
  return (
    <button
      type="button"
      data-testid="view-cycle-details"
      onClick={() => onViewCycle(rec)}
      className="flex items-center gap-1.5 rounded-lg border border-[#C8D5C8] bg-white px-3 py-[5px] text-[12px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0]"
    >
      <Layers className="h-3.5 w-3.5" />
      View Cycle Details &amp; Logs
    </button>
  )
}

// Fisherfolk phones (< md): one card per stock instead of the wide table. Tapping the card expands its
// ponds/cages as compact cards (same as the table row); the buttons are full-height touch targets for the
// same actions the row menu offers (Cycle details, View Details, Edit, Record Harvest with the same gate).
function StockingMobileCard({ row, expanded, unitsState, onToggle, onRetryUnits, onOpenCycle, onViewDetails, onEdit, onRecordHarvest }) {
  const canEdit = row.status !== 'Harvested'
  const canHarvest = row.status !== 'Total Loss' && row.status !== 'Harvested'
  const harvestGate = harvestGateInfo(row)
  const netActive = canHarvest && !harvestGate.gated
  const force = Boolean(row.force_harvest)
  const harvestTitle = row.status === 'Harvested' ? 'Already harvested'
    : row.status === 'Total Loss' ? 'Harvest not available (Total Loss)'
    : harvestGate.gated ? harvestGate.message
    : force ? 'Record Harvest — Force Harvest' : 'Record Harvest'
  const fields = [
    ['Culture Type', row.culture_type || '—'],
    ['Date Stocked', row.date_stocked_fmt],
    ['Expected Harvest', row.expected_harvest_fmt],
    ['Pond Location', row.pond_location],
    ['Est. Harvest (kg)', row.est_harvest_kg_fmt],
    ['Actual Harvest (kg)', row.actual_harvest_kg_fmt],
  ]
  const btn = 'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-[13px] font-medium transition-colors'
  return (
    <div
      data-testid="stock-card"
      className="cursor-pointer rounded-xl border border-[#E2E8E2] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      aria-expanded={expanded}
      {...rowClickProps(onToggle, `${expanded ? 'Hide' : 'Show'} ponds/cages: ${row.species_name || 'stock'}${row.production_cycle_no ? ` #${row.production_cycle_no}` : ''}`)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-[15px] text-[#1A2B1A] [&>span>svg:first-child]:hidden">{row.species_name_cell}</div>
          <p className="mt-0.5 break-words text-[12px] text-[#7A8E7A]">
            {[row.fisherfolk_cell, row.cycle_cell && row.cycle_cell !== '—' ? `Cycle ${row.cycle_cell}` : null].filter((x) => x && x !== '—').join(' · ')}
          </p>
        </div>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-[#7A8E7A] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      {expanded && (
        // Everything else opens when the card is tapped; data-no-row-click: taps inside never collapse it.
        <div className="mt-3 cursor-default space-y-3 border-t border-[#F0F4F0] pt-3" data-no-row-click>
          <div className="flex flex-wrap items-center gap-1.5">{row.status_cell}</div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {fields.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#7A8E7A]">{label}</dt>
                <dd className="mt-0.5 break-words text-[13px] text-[#1A2B1A]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-[#F0F4F0] pt-3">
            <ProductionUnitsCards state={unitsState} speciesName={row.species_name} onRetry={onRetryUnits}
              headerAction={<CycleDetailsButton rec={row._rec} onViewCycle={onOpenCycle} />} />
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-[#F0F4F0] pt-3 min-[420px]:flex">
            <button type="button" className={`${btn} border-[#E2E8E2] text-[#1B4D2E] hover:bg-[#F0F4F0]`} onClick={onOpenCycle}>
              <Layers size={15} /> Cycle
            </button>
            <button type="button" className={`${btn} border-[#E2E8E2] text-[#1B4D2E] hover:bg-[#F0F4F0]`} onClick={onViewDetails}>
              <Eye size={15} /> Details
            </button>
            {canEdit && (
              <button type="button" className={`${btn} border-[#E2E8E2] text-[#1B4D2E] hover:bg-[#F0F4F0]`} onClick={onEdit}>
                <Pencil size={15} /> Edit
              </button>
            )}
            <button
              type="button" data-testid="card-harvest" data-force={force ? 'true' : 'false'}
              title={harvestTitle} aria-label={harvestTitle} disabled={!netActive} onClick={onRecordHarvest}
              className={`${btn} ${!netActive ? 'cursor-not-allowed border-[#E2E8E2] text-[#C8D5C8]'
                : force ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-[#E2E8E2] text-[#1B4D2E] hover:bg-[#F0F4F0]'}`}
            >
              <FishingNetIcon size={16} /> Harvest
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FisheriesRecordsPage({ asTab = false }) {
  const { user, isFisherfolk } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const [records,      setRecords]      = useState([])
  const [totalCount,   setTotalCount]   = useState(0)
  const [page,         setPage]         = useState(1)
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [search,       setSearch]       = useState('')
  // Server-side search over every record (fisherfolk name or RSBSA / FishR number, species,
  // barangay) - debounced; the latest-request guard below already drops any slower, older answer.
  const debouncedSearch = useDebouncedValue(search.trim())
  // Pond / cage name: the stock's pond name or one of its units ("Pond 2", "Cage 1"); typed, so debounced like the search.
  const [pondFilter,   setPondFilter]   = useState('')
  const debouncedPond = useDebouncedValue(pondFilter.trim())
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [seasonFilter, setSeasonFilter] = useState('')
  const [yearFilter,   setYearFilter]   = useState('')
  const [editingRec,   setEditingRec]   = useState(null)
  const [viewingRec,   setViewingRec]   = useState(null)
  const [speciesList,  setSpeciesList]  = useState([])
  const [viewLogsRec,  setViewLogsRec]  = useState(null)
  const [disasterRec,  setDisasterRec]  = useState(null)
  const [harvestRec,   setHarvestRec]   = useState(null)
  const [showStartCycle, setShowStartCycle] = useState(false)
  const [viewingCycle,   setViewingCycle]   = useState(null)
  const [forceUnitView,  setForceUnitView]  = useState(null)   // { rec, units } for an HP/HC badge group

  // View Cycle uses the real production_cycle FK — never production_cycle_no.
  const handleViewCycle = async (rec) => {
    if (!rec.production_cycle) { showToast('No Production Cycle linked', 'error'); return }
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${rec.production_cycle}/`)
      setViewingCycle(r.data)
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to load production cycle.', 'error')
    }
  }

  const refreshViewingCycle = async () => {
    if (!viewingCycle) return
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${viewingCycle.id}/`)
      setViewingCycle(r.data)
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to refresh production cycle.', 'error')
    }
  }

  // ?cycle=<id> (a Fisheries notification link): open that production cycle's existing details. The cycle
  // endpoint applies the usual ownership rules, so a fisherfolk can only ever open their own cycle.
  // ?record=<id> (a link from a fisherfolk's profile): open that stocking record's details window.
  const linkedRecordId = searchParams.get('record')
  useEffect(() => {
    if (!linkedRecordId) return undefined
    let cancelled = false
    api.get(`/fisheries/stocking/${linkedRecordId}/`)
      .then(r => { if (!cancelled) setViewingRec(r.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [linkedRecordId])
  const linkedCycleId = searchParams.get('cycle')
  useEffect(() => {
    if (!linkedCycleId) return undefined
    let cancelled = false
    api.get(`/monitoring/aquaculture-cycles/${linkedCycleId}/`)
      .then(r => { if (!cancelled) setViewingCycle(r.data) })
      .catch(err => { if (!cancelled) showToast(err?.response?.data?.detail || 'This production cycle could not be opened.', 'error') })
    return () => { cancelled = true }
  }, [linkedCycleId, showToast])
  const closeViewingCycle = () => {
    setViewingCycle(null)
    if (linkedCycleId) {
      const next = new URLSearchParams(searchParams)
      next.delete('cycle')
      setSearchParams(next, { replace: true })
    }
  }

  useEffect(() => {
    api.get('/fisheries/species/')
      .then(r => setSpeciesList(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => {})
  }, [])

  // Only the latest request may update the table (a slower earlier response never overwrites a newer one).
  const latestFetch = useRef(0)
  const fetchRecords = useCallback(async (pageNum = 1) => {
    const fetchId = ++latestFetch.current
    setIsLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: pageNum })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (debouncedPond) params.set('pond', debouncedPond)
      if (statusFilter === 'All Status') {
        params.set('status', 'Stocked,Near Harvest,Harvested')
      } else if (statusFilter !== 'All Status') {
        params.set('status', statusFilter)
      }
      if (seasonFilter) params.set('season', seasonFilter)
      if (yearFilter)   params.set('year', yearFilter)
      const r = await api.get(`/fisheries/stocking/?${params.toString()}`)
      if (fetchId !== latestFetch.current) return
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      if (fetchId === latestFetch.current) setError('Failed to load stocking records.')
    } finally {
      if (fetchId === latestFetch.current) setIsLoading(false)
    }
  }, [statusFilter, seasonFilter, yearFilter, debouncedSearch, debouncedPond])

  // ONE fetch per page view: changing a filter also resets the page to 1 in the same update (changeFilter
  // below), so this single effect runs once with the new filters and page.
  useEffect(() => { fetchRecords(page) }, [fetchRecords, page])
  // A new search starts from the first page.
  useEffect(() => { setPage(1) }, [debouncedSearch, debouncedPond])
  const changeFilter = (setter) => (value) => { setter(value); setPage(1) }

  // Lock indicators for the currently-visible page only - one batched request for all its rows.
  const [lockStatuses, setLockStatuses] = useState({})

  const refreshLockStatuses = useCallback(async (recs) => {
    if (!recs.length) { setLockStatuses({}); return }
    try {
      const r = await api.get('/locks/status/', { params: { record_type: 'stocking', record_ids: recs.map(rec => rec.id).join(',') } })
      const results = r.data?.results || {}
      setLockStatuses(Object.fromEntries(Object.entries(results).filter(([, v]) => v?.locked).map(([id, v]) => [Number(id), v])))
    } catch { setLockStatuses({}) }
  }, [])

  useEffect(() => { refreshLockStatuses(records) }, [records, refreshLockStatuses])

  // Clicking a row expands that stock's ponds/cages under it (one row at a time); clicking it again collapses.
  const {
    expandedId, unitsState, toggle: toggleExpanded, retry: retryUnits,
  } = useExpandableProductionUnits(records)

  const handleForceUnlock = async (recordId) => {
    try {
      await api.post('/locks/release/', { record_type: 'stocking', record_id: recordId })
      refreshLockStatuses(records)
    } catch { /* ignore */ }
  }

  // The search runs on the server (above), so the rows are exactly what came back.
  const filtered = records

  const rows = filtered.map(rec => ({
    ...rec,
    _rec: rec,   // the untouched record, for the mobile card actions
    species_name_cell: (
      <span className="flex items-center gap-1.5">
        {expandedId === rec.id
          ? <ChevronDown size={15} className="shrink-0 text-[#1B4D2E]" aria-hidden="true" />
          : <ChevronRight size={15} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />}
        <span className="font-medium">{rec.species_name}</span>
        <DisasterIndicator disastersCount={rec.disaster_count} hasRecoveredDisaster={rec.has_recovered_disaster} />
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
    date_stocked_fmt:     rec.date_stocked_is_estimated ? (
      <span className="flex flex-col gap-0.5">
        <span>{fmtShort(rec.date_stocked)}</span>
        <span
          className="inline-flex w-fit items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap"
          title="Not a confirmed field date."
        >
          <HelpCircle className="w-2.5 h-2.5" /> Estimated
        </span>
      </span>
    ) : fmtShort(rec.date_stocked),
    expected_harvest_fmt: fmtShort(rec.expected_harvest_date),
    // Estimated (forecast) only - the actual harvested weight has its own column.
    est_harvest_kg_fmt:   rec.estimated_harvest_kg
      ? Number(rec.estimated_harvest_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—',
    actual_harvest_kg_fmt: fmtActualHarvestKg(rec),
    assoc_name:   rec.organization_name || '—',
    pond_location: rec.pond_location_barangay || '—',
    status_cell: (
      <span className="flex items-center gap-1.5">
        {/* Overall cycle status is the backend's display_status (rec.status with Stocked / Near Harvest / Late
            from today's date): it only becomes Harvested on the final harvest, so force-harvesting some
            ponds/cages leaves it active. Those units show as HP/HC badges below. */}
        {rec.harvest_count > 0 ? (
          <button type="button" data-testid="harvested-status" title="View harvest details" onClick={() => setViewingRec(rec)}>
            <StatusPill tone={STATUS_TONES[rec.display_status || rec.status] || 'slate'}>{rec.display_status || rec.status}</StatusPill>
          </button>
        ) : (
          <StatusPill tone={STATUS_TONES[rec.display_status || rec.status] || 'slate'}>{rec.display_status || rec.status}</StatusPill>
        )}
        {groupForceHarvestedUnits(forceHarvestedUnits(rec)).map(g => (
          // Count only ("HP 10"), never the unit list, so the cell stays compact; the modal lists every unit.
          <button
            key={g.prefix}
            type="button"
            data-testid="force-harvest-unit"
            title={`Force Harvested: ${g.names}. View details`}
            aria-label={g.ariaLabel}
            onClick={() => setForceUnitView({ rec, units: g.units })}
            className="inline-flex min-w-[3.5rem] shrink-0 justify-center whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-1.5 py-[2px] text-[10px] font-bold tracking-wide tabular-nums text-red-700 transition-colors hover:bg-red-100 hover:border-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            {g.code}
          </button>
        ))}
        <HarvestVarianceBadge days={rec.harvest_variance_days} />
      </span>
    ),
    actions_cell: (
      <StockingRowActions
        rec={rec}
        isAdmin={user?.role === 'ADMIN'}
        simplified={user?.role === 'ADMIN' || isFisherfolk}
        isLocked={Boolean(lockStatuses[rec.id])}
        lockedByName={lockStatuses[rec.id]?.locked_by?.name}
        onViewDetails={() => setViewingRec(rec)}
        onEdit={() => setEditingRec(rec)}
        onViewCycle={() => handleViewCycle(rec)}
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
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-lg border border-[#E2E8E2] px-4 py-2 text-[13px] font-medium text-[#1B4D2E] hover:bg-[#F0F4F0] transition-colors ${isFisherfolk ? 'min-h-[44px] w-full justify-center md:min-h-0 md:w-auto' : ''}`}
          onClick={() => setShowStartCycle(true)}
        >
          <Fish size={15} /> Start Production Cycle
        </button>
      </div>

      <div className="space-y-4">
        {/* Search + Filters are staff tools; a fisherfolk account sees only its own records, so it gets the
            table directly (search/status/season/year stay at their defaults). */}
        {!isFisherfolk && (
        <FilterPanel
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by fisherfolk, RSBSA no., species, or barangay..."
          activeCount={[statusFilter !== 'All Status', Boolean(seasonFilter), Boolean(yearFilter), Boolean(pondFilter.trim())].filter(Boolean).length}
        >
          <input
            type="search"
            className={`${filterSelectCls} w-44`}
            placeholder="Pond / cage name"
            aria-label="Pond or cage name"
            value={pondFilter}
            onChange={e => setPondFilter(e.target.value)}
          />
          <select className={filterSelectCls} value={statusFilter} onChange={e => changeFilter(setStatusFilter)(e.target.value)}>
            <option value="All Status">All Status</option>
            <option value="Stocked">Stocked</option>
            <option value="Near Harvest">Near Harvest</option>
            <option value="Late">Late</option>
            <option value="Harvested">Harvested</option>
            <option value="Total Loss">Total Loss</option>
          </select>
          <select className={filterSelectCls} value={seasonFilter} onChange={e => changeFilter(setSeasonFilter)(e.target.value)}>
            <option value="">All Seasons</option>
            <option value="Dry">Dry Season</option>
            <option value="Wet">Wet Season</option>
          </select>
          <select className={filterSelectCls} value={yearFilter} onChange={e => changeFilter(setYearFilter)(e.target.value)}>
            <option value="">All Years</option>
            {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </FilterPanel>
        )}

        {error && <ErrorMessage message={error} />}

        {/* Phones: cards instead of the wide table (the table returns at md and up). */}
        {(
          <div className="space-y-3 md:hidden" data-testid="stock-cards">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl border border-[#E2E8E2] bg-white" />
              ))
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-10 text-center">
                <p className="text-[14px] font-medium text-[#4A5E4A]">No stocking records found</p>
                <p className="mt-1 text-[13px] text-[#7A8E7A]">Tap Start Production Cycle to add one</p>
              </div>
            ) : rows.map(row => (
              <StockingMobileCard
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                unitsState={unitsState(row.id)}
                onToggle={() => toggleExpanded(row._rec)}
                onRetryUnits={() => retryUnits(row.id)}
                onOpenCycle={() => handleViewCycle(row._rec)}
                onViewDetails={() => setViewingRec(row._rec)}
                onEdit={() => setEditingRec(row._rec)}
                onRecordHarvest={() => setHarvestRec(row._rec)}
              />
            ))}
          </div>
        )}

        {/* Table */}
        <div className={`overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hidden md:block`}>
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
                rows.map(row => {
                  const isExpanded = expandedId === row.id
                  return (
                    // The whole row expands/collapses this stock's ponds/cages underneath it; the full Production
                    // Cycle (Cycle Info, Feeding Logs, Health Logs) is "View Cycle Details & Logs" in the expanded panel
                    // and in the row menu.
                    // The badges and buttons inside the row keep their own actions.
                    <Fragment key={row.id}>
                      <tr className={`cursor-pointer border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9] ${isExpanded ? 'bg-[#F5F8F5]' : ''}`}
                        aria-expanded={isExpanded}
                        {...rowClickProps(() => toggleExpanded(row._rec), `${isExpanded ? 'Hide' : 'Show'} ponds/cages: ${row.species_name || 'stock'}${row.production_cycle_no ? ` #${row.production_cycle_no}` : ''}`)}>
                        {COLUMNS.map(col => (
                          <td key={col.key} className="whitespace-nowrap px-4 py-[13px] text-[13px] text-[#1A2B1A] align-middle">
                            {row[col.key]}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-[#E2E8E2]">
                          <td colSpan={COLUMNS.length} className="p-0">
                            <ProductionUnitsTable state={unitsState(row.id)} speciesName={row.species_name} onRetry={() => retryUnits(row.id)}
                              headerAction={<CycleDetailsButton rec={row._rec} onViewCycle={handleViewCycle} />} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
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

      {forceUnitView && (
        <ForceHarvestDetailsModal
          record={forceUnitView.rec}
          units={forceUnitView.units}
          onClose={() => setForceUnitView(null)}
        />
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

      {showStartCycle && (
        <StartProductionCycleModal
          onClose={() => setShowStartCycle(false)}
          onSuccess={() => { setShowStartCycle(false); setPage(1); fetchRecords(1) }}
        />
      )}

      {viewingCycle && (
        <AquacultureCycleDetailModal
          cycle={viewingCycle}
          onClose={closeViewingCycle}
          onRefresh={refreshViewingCycle}
          // A saved/deleted Health Log can start or clear Force Harvest: reload the rows so the
          // existing fishing-net button reflects it without a manual page reload.
          onHealthChanged={() => fetchRecords(page)}
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
