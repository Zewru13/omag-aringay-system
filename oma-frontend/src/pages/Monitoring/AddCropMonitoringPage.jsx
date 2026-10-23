import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Plus, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { sameCrop } from '../../utils/cropNames.js'
import { ownerParcelFill, parcelProblem } from '../CropInformation/parcelRecords.js'
import api from '../../api/axiosInstance.js'
import FarmerSearchInput from '../../components/FarmerSearchInput.jsx'
import BARANGAYS from '../../constants/barangays.js'
import { bulkCellInputClasses, bulkThClasses, bulkThCenterClasses } from '../../components/UI/bulkEntryStyles.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import { EMPTY_PCIC, pcicError, pcicPayload, uploadPcicForm } from '../../utils/pcic.js'

// Fixed pixel width per column, shared by every <th>/<td> in that column so
// header and body can never drift out of alignment (table-fixed sizes every
// column from these, not from cell content — an input can no longer force
// its column, or its neighbor's, to grow past what's declared here).
const COL_WIDTH = {
  index: 44,
  barangay: 150,
  landStatus: 140,
  cropType: 190,
  datePlanted: 160,
  area: 110,
  season: 110,
  variety: 170,
  seedSource: 160,
  qtySeeds: 130,
  farmParcel: 170,
  remove: 56,
}

function detectSeason(dateStr) {
  if (!dateStr) return 'Wet'
  const month = new Date(dateStr).getMonth() + 1
  return month >= 6 && month <= 11 ? 'Wet' : 'Dry'
}

const makeRecord = (n) => ({
  _id: n,
  pcic: { ...EMPTY_PCIC },
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

// ── Required / Optional legend — mirrors the reference form's key so staff
// don't have to guess which of the now-always-visible columns are optional. ──

function RequiredOptionalLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#4A5E4A]">
      <span className="flex items-center gap-1">
        <span className="text-rose-500">*</span> Required field
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#4A5E4A] text-white">opt</span>
        Optional — leave blank if not applicable
      </span>
    </div>
  )
}

function OptBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-white/20 text-white align-middle">
      opt
    </span>
  )
}

// ── Crop Duplicate Check ──────────────────────────────────────────────────────

// Same rule the server enforces on save (production/duplicates.py): same farmer, crop and variety, an active record,
// and the same parcel (or the same barangay when no parcel is chosen). The warning is advice; the server refuses.
function useCropDuplicateCheck(farmerId, rec) {
  const [duplicates,  setDuplicates]  = useState([])
  const [isChecking,  setIsChecking]  = useState(false)
  const timerRef = useRef(null)
  const cropTypeId = rec.crop_type
  const variety = rec.variety_used || ''
  const parcel = rec.farm_parcel || ''
  const barangay = rec.farm_location_barangay || ''

  useEffect(() => {
    if (!farmerId || !cropTypeId) { setDuplicates([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setIsChecking(true)
      try {
        const r = await api.get('/production/monitoring/check-duplicate/', {
          params: { farmer: farmerId, crop_type: cropTypeId, variety, parcel, barangay },
        })
        setDuplicates(r.data?.duplicates || [])
      } catch { setDuplicates([]) }
      finally { setIsChecking(false) }
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [farmerId, cropTypeId, variety, parcel, barangay])

  return { duplicates, isChecking }
}

// ── Crop Record Row (tabular, every field flat — no expand/collapse) ─────────

function CropRecordRow({ rec, index, total, cropTypes, seedSources, varieties, farmerId, showParcelColumn, farmerParcels, error, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(rec._id, field, value)
  const { duplicates, isChecking } = useCropDuplicateCheck(farmerId, rec)

  const relevantVarieties = varieties.filter(
    v => v.is_active && (!v.crop_type || String(v.crop_type) === String(rec.crop_type))
  )

  const selectedCropType = cropTypes.find(c => String(c.id) === String(rec.crop_type))
  const hasDuplicates = !isChecking && duplicates.length > 0
  const duplicateTitle = hasDuplicates
    ? `An active ${duplicates[0].crop_type}${duplicates[0].variety_used ? ` (${duplicates[0].variety_used})` : ''} record already exists here: ${duplicates.map(d => `${d.date_planted || '—'} (${d.area_planted_ha} ha)`).join(', ')}`
    : undefined

  const colCount = 11 + (showParcelColumn ? 1 : 0)

  return (
    <>
      <tr className={`border-b border-[#F0F4F0] align-top max-md:block max-md:mb-3 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:p-3 ${error ? 'bg-rose-50/40' : 'max-md:bg-white'}`}>
        <td data-label="Crop record" className="px-3 py-3 text-center text-[13px] text-[#7A8E7A] max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.index }}>{index + 1}</td>
        <td data-label="Barangay *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.barangay }}>
          <select
            className={`${bulkCellInputClasses} w-full`}
            value={rec.farm_location_barangay}
            onChange={e => set('farm_location_barangay', e.target.value)}
          >
            <option value="" disabled>Select…</option>
            {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </td>
        <td data-label="Land status *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.landStatus }}>
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
        </td>
        <td data-label="Crop type *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.cropType }}>
          <select className={`${bulkCellInputClasses} w-full`} value={rec.crop_type}
            onChange={e => set('crop_type', e.target.value)}>
            <option value="">Select crop…</option>
            {cropTypes.map(ct => (
              <option key={ct.id} value={ct.id}>{ct.name} ({ct.days_to_harvest}d)</option>
            ))}
          </select>
          {hasDuplicates && (
            <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-amber-700" title={duplicateTitle}>
              <AlertTriangle size={11} className="shrink-0" /> Active record exists
            </p>
          )}
        </td>
        <td data-label="Date planted *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.datePlanted }}>
          <input type="date" className={`${bulkCellInputClasses} w-full`} value={rec.date_planted}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => {
              set('date_planted', e.target.value)
              set('season', detectSeason(e.target.value))
            }} />
          {selectedCropType && rec.date_planted && (
            <p className="mt-1.5 truncate text-[11px] text-[#7A8E7A]">
              Harvest ~{(() => {
                const d = new Date(rec.date_planted + 'T00:00:00')
                d.setDate(d.getDate() + selectedCropType.days_to_harvest)
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              })()}
            </p>
          )}
        </td>
        <td data-label="Area (ha) *" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.area }}>
          <DecimalInput decimals={2} className={`${bulkCellInputClasses} w-full`}
            placeholder="0.00"
            value={rec.area_planted_ha}
            onChange={v => set('area_planted_ha', v)} />
        </td>
        <td data-label="Season" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.season }}>
          <select className={`${bulkCellInputClasses} w-full`} value={rec.season}
            onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
        </td>
        <td data-label="Variety" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.variety }}>
          <ComboboxWithOther
            options={relevantVarieties.map(v => v.name)}
            value={rec.variety_used_is_other ? 'Other' : rec.variety_used}
            otherValue={rec.variety_used}
            onChange={(v) => {
              if (v === 'Other') { set('variety_used_is_other', true); set('variety_used', '') }
              else { set('variety_used_is_other', false); set('variety_used', v) }
            }}
            onOtherChange={(v) => set('variety_used', v)}
            placeholder="e.g. NSIC Rc222"
            inputClassName={bulkCellInputClasses}
            chevronSize={13}
          />
        </td>
        <td data-label="Seed source" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.seedSource }}>
          <ComboboxWithOther
            options={seedSources.filter(s => s.is_active).map(s => s.name)}
            value={rec.seed_source}
            otherValue={rec.seed_source_other_specify}
            onChange={(v) => set('seed_source', v)}
            onOtherChange={(v) => set('seed_source_other_specify', v)}
            placeholder="Select source"
            inputClassName={bulkCellInputClasses}
            chevronSize={13}
          />
        </td>
        <td data-label="Qty of seeds (kg)" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.qtySeeds }}>
          <input type="number" step="0.01" min="0" className={`${bulkCellInputClasses} w-full`}
            placeholder="0"
            value={rec.quantity_of_seeds}
            onChange={e => set('quantity_of_seeds', e.target.value)} />
        </td>
        {showParcelColumn && (
          <td data-label="Farm parcel" className="px-3 py-3 overflow-hidden max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]" style={{ width: COL_WIDTH.farmParcel }}>
            <select className={`${bulkCellInputClasses} w-full`} value={rec.farm_parcel}
              onChange={e => {
                const value = e.target.value
                set('farm_parcel', value)
                // The parcel knows its barangay and the farmer's tenure there; fill them in only where still blank.
                const parcel = farmerParcels.find(p => String(p.id) === value)
                if (parcel) {
                  if (!rec.farm_location_barangay) set('farm_location_barangay', parcel.barangay || '')
                  if (!rec.land_status && ['Owner', 'Tenant', 'Lessee'].includes(parcel.land_ownership)) set('land_status', parcel.land_ownership)
                }
              }}>
              <option value="">Choose parcel</option>
              {farmerParcels.map(p => (
                <option key={p.id} value={p.id}>
                  {p.parcel_number ? `Parcel ${p.parcel_number}` : `Parcel #${p.id}`} — {p.barangay}
                </option>
              ))}
            </select>
          </td>
        )}
        <td className="px-3 py-3 text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right" style={{ width: COL_WIDTH.remove }}>
          {total > 1 && (
            <button type="button" onClick={() => onRemove(rec._id)} title="Remove row"
              className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium">
              <Trash2 size={13} /> <span className="md:hidden">Remove record</span>
            </button>
          )}
        </td>
      </tr>
      <tr className="border-b border-[#F0F4F0] max-md:block">
        <td colSpan={colCount} className="px-3 pb-3 max-md:block max-md:px-0">
          <PcicInsuranceField value={rec.pcic} onChange={(next) => set('pcic', next)} subject="planting" />
        </td>
      </tr>
      {error && (
        <tr className="border-b border-[#F0F4F0] bg-rose-50/40 max-md:block max-md:-mt-2 max-md:mb-3 max-md:rounded-b-xl max-md:px-3 max-md:pb-2">
          <td className="max-md:hidden" />
          <td colSpan={colCount - 1} className="px-3 pb-2.5 -mt-1 text-[12px] text-rose-600 max-md:block max-md:px-0">{error}</td>
        </tr>
      )}
    </>
  )
}

// ── Confirm Submission — review step before the actual save ──────────────────

function ConfirmSubmissionModal({ records, cropTypes, farmerFullName, isSubmitting, onConfirm, onCancel }) {
  const period = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const cropName = (id) => cropTypes.find(c => String(c.id) === String(id))?.name || '—'

  return (
    <ModalShell
      title="Confirm Submission"
      subtitle={`Crop Monitoring Records · ${period}`}
      icon={CheckCircle2}
      iconBg="bg-emerald-100"
      iconColor="text-emerald-700"
      onClose={onCancel}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>Go Back &amp; Review</Button>
          <Button type="button" isLoading={isSubmitting} onClick={onConfirm}>Confirm &amp; Submit</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-800" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold text-emerald-800">
              {records.length} record{records.length === 1 ? '' : 's'} will be added
            </p>
            <p className="mt-0.5 text-[13px] text-emerald-700">
              Crop monitoring · for {farmerFullName}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-[13px] text-amber-800">
            <span className="font-semibold">All-or-nothing:</span> if any row fails server-side validation, none of
            the {records.length} record{records.length === 1 ? '' : 's'} will be saved. Review all entries before confirming.
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8E2] bg-white">
          <p className="border-b border-[#E2E8E2] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
            Row Summary
          </p>
          <div className="max-h-64 divide-y divide-[#F0F4F0] overflow-y-auto">
            {records.map((rec, i) => (
              <div key={rec._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#1A2B1A]">
                    #{i + 1} {rec.farm_location_barangay || '—'}
                  </p>
                  <p className="truncate text-[12px] text-[#7A8E7A]">
                    {cropName(rec.crop_type)}{rec.variety_used ? ` — ${rec.variety_used}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] text-[#4A5A4C]">{rec.area_planted_ha || '0'} ha</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AddCropMonitoringPage() {
  const navigate = useNavigate()
  // Arriving from a farmer's profile ("Start monitoring" on a declared parcel
  // crop) carries the farmer, parcel, crop and area to start the first row from.
  // The planting date is left for staff: a declared crop has none.
  const prefill = useLocation().state?.prefill || null
  const prefillApplied = useRef(false)
  const { showToast } = useToast()
  const [cropTypes,    setCropTypes]    = useState([])
  const [seedSources,  setSeedSources]  = useState([])
  const [varieties,    setVarieties]    = useState([])
  const [records,      setRecords]      = useState([makeRecord(1)])
  // Ref, not state: two addRecord() calls in the same tick (e.g. a fast
  // double-click) must never read the same "next id" — a state variable
  // updated via setNextId(n => n + 1) doesn't advance until the next
  // render, so both calls would build a row with the same _id, giving React
  // two list children with duplicate keys.
  const nextIdRef = useRef(2)
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
  const [parcelsReadyFor, setParcelsReadyFor] = useState(null)

  // Resolve the prefilled farmer through the same list the search box uses, so
  // the farmer's organization comes through exactly as if they were picked there.
  useEffect(() => {
    if (!prefill?.farmerId) return
    api.get('/farmers/', { params: { search: prefill.rsbsa } }).then((r) => {
      const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
      const f = list.find((x) => x.id === prefill.farmerId)
      if (f) {
        setFarmerInfo({
          farmer_id: f.id,
          farmer_full_name: f.full_name,
          farmer_home_barangay: f.barangay || '',
          farmer_assoc_id: f.farmers_organization || null,
          farmer_assoc_name: f.farmers_organization_name || '',
        })
      }
    }).catch(() => {})
  }, [prefill])

  const goBack = () => navigate('/crop-records')

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
    const farmerId = farmerInfo.farmer_id
    api.get(`/farmers/${farmerId}/parcels/`)
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setFarmerParcels(list)
        setParcelsReadyFor(farmerId)
        // A farmer with a single parcel does not have to choose it.
        setRecords(rs => rs.map(x => ({ ...x, ...ownerParcelFill(list, x) })))
      })
      .catch(() => { setFarmerParcels([]); setParcelsReadyFor(null) })
  }, [farmerInfo.farmer_id])

  const showParcelColumn = farmerParcels.length > 0
  const parcelsReady = Boolean(farmerInfo.farmer_id) && parcelsReadyFor === farmerInfo.farmer_id
  const hasNoParcel = parcelsReady && farmerParcels.length === 0

  // Once the crop catalog and the farmer's parcels are in, fill the first row
  // from the prefill (once).
  useEffect(() => {
    if (!prefill || prefillApplied.current || !cropTypes.length || !farmerParcels.length) return
    const parcel = farmerParcels.find((p) => p.id === prefill.parcel.id)
    if (!parcel) return
    prefillApplied.current = true
    const crop = cropTypes.find((ct) => sameCrop(ct.name, prefill.cropName))
    setRecords((rs) => rs.map((x, i) => (i > 0 ? x : {
      ...x,
      farm_parcel: String(parcel.id),
      farm_location_barangay: parcel.barangay || '',
      land_status: ['Owner', 'Tenant', 'Lessee'].includes(parcel.land_ownership) ? parcel.land_ownership : '',
      crop_type: crop ? String(crop.id) : '',
      area_planted_ha: prefill.areaHa ? String(prefill.areaHa) : '',
    })))
  }, [prefill, cropTypes, farmerParcels])

  const addRecord = () => {
    const id = nextIdRef.current++
    setRecords(r => [...r, makeRecord(id)])
  }

  const removeRecord = (id) => setRecords(r => r.filter(x => x._id !== id))

  const updateRecord = (id, field, value) => {
    setRecords(r => r.map(x => x._id === id ? { ...x, [field]: value } : x))
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
      ...pcicPayload(rec.pcic),
    }
  }

  const validate = () => {
    if (!farmerInfo.farmer_id) { setError('Please select a farmer.'); return false }
    const noParcel = parcelProblem({ farmerId: farmerInfo.farmer_id, ready: parcelsReady, parcels: farmerParcels, rows: records })
    if (noParcel) { setError(noParcel); return false }
    const nextRowErrors = {}
    records.forEach((rec, i) => {
      const missing = []
      if (!rec.farm_location_barangay) missing.push('barangay')
      if (!rec.land_status) missing.push('land status')
      if (!rec.crop_type) missing.push('crop type')
      if (!rec.date_planted) missing.push('date planted')
      if (!rec.area_planted_ha) missing.push('area planted')
      const pcicProblem = pcicError(rec.pcic)
      if (missing.length > 0) {
        nextRowErrors[rec._id] = `Row ${i + 1}: missing ${missing.join(', ')}.`
      } else if (pcicProblem) {
        nextRowErrors[rec._id] = `Row ${i + 1}: ${pcicProblem}`
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
    setIsSubmitting(true)
    try {
      const { data: created } = await api.post('/production/monitoring/bulk/', records.map(buildPayload))
      const photoFailures = []
      for (let i = 0; i < records.length; i += 1) {
        try {
          await uploadPcicForm(api, 'planting', created[i].id, records[i].pcic)
        } catch {
          photoFailures.push(`row ${i + 1}`)
        }
      }
      setShowConfirm(false)
      if (photoFailures.length) {
        showToast(`Records saved, but the PCIC form photo could not be uploaded for ${photoFailures.join(', ')}. Edit the record to try again.`, 'error')
      }
      showToast(`${records.length} crop monitoring record${records.length > 1 ? 's' : ''} added.`, 'success')
      navigate('/crop-records')
    } catch (err) {
      setShowConfirm(false)
      const data = err?.response?.data
      if (data?.errors && Array.isArray(data.errors)) {
        const nextRowErrors = {}
        data.errors.forEach((rowErr, i) => {
          if (rowErr && Object.keys(rowErr).length > 0) {
            const rec = records[i]
            // The duplicate refusal is a full sentence; every other error keeps its field name in front.
            const msgs = Object.entries(rowErr).map(([k, v]) => {
              const text = Array.isArray(v) ? v[0] : v
              return k === 'crop_type' && /already has an active|duplicates row/.test(String(text)) ? text : `${k.replace(/_/g, ' ')}: ${text}`
            })
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
    <PageLayout
      title="Add Crop Monitoring Records"
      subtitle="Each row is one crop record for this reporting period. Fill all required fields before submitting."
    >
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline max-md:min-h-[40px]"
      >
        <ArrowLeft size={14} /> Back to Crop Records
      </button>

      <form onSubmit={handleSubmit} className="space-y-5">
        <RequiredOptionalLegend />

        {/* Farmer (entered once, kept from the previous design — every row in
            this batch is still attributed to one farmer, unlike the barangay-
            only paper-form reference this redesign otherwise follows). */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">
            Farmer Information
          </p>
          <div className="max-w-xl">
            <FarmerSearchInput onSelect={setFarmerInfo} selected={farmerInfo} />
          </div>
          {farmerInfo.farmer_id && (
            <div className="grid grid-cols-2 gap-3 mt-3 max-w-xl">
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

        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-sky-800" aria-hidden="true" />
          <p className="text-[13px] text-sky-800">
            <span className="font-semibold">All-or-nothing submission:</span> every row must pass validation before
            any record is saved. An error in one row prevents all rows from saving.
          </p>
        </div>

        {hasNoParcel && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{farmerInfo.farmer_full_name || 'This farmer'} has no farm parcel yet.</span>{' '}
              A crop is recorded on a farm parcel, so add the parcel first, then come back to add the crop.
            </span>
            <Link to={`/crop-records/add-parcels?farmer=${farmerInfo.farmer_id}`} className="inline-flex min-h-[40px] items-center rounded-lg bg-amber-900 px-3 font-semibold text-white hover:bg-amber-950">
              Add farm parcels
            </Link>
          </div>
        )}
        {showParcelColumn && (
          <p className="text-[12px] text-[#4A5E4A]">
            <span className="font-semibold">Farm Parcel:</span> every crop is grown on one of this farmer's parcels. A farmer
            with a single parcel has it chosen already; with several, choose one for each row.
          </p>
        )}

        {/* Crop records — a horizontal table, every field visible (no expand toggle); on a phone each record is a stacked card */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="table-fixed text-sm max-md:block max-md:w-full">
            <thead className="bg-[#1B4D2E] text-white max-md:hidden">
              <tr>
                <th className={`${bulkThCenterClasses} overflow-hidden`} style={{ width: COL_WIDTH.index }}>#</th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.barangay }}>Barangay <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.landStatus }}>Land Status <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.cropType }}>Crop Type <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.datePlanted }}>Date Planted <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.area }}>Area (ha) <span className="text-white/70">*</span></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.season }}>Season<OptBadge /></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.variety }}>Variety<OptBadge /></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.seedSource }}>Seed Source<OptBadge /></th>
                <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.qtySeeds }}>Qty of Seeds (kg)<OptBadge /></th>
                {showParcelColumn && <th className={`${bulkThClasses} overflow-hidden`} style={{ width: COL_WIDTH.farmParcel }}>Farm Parcel <span className="text-white/70">*</span></th>}
                <th className={bulkThCenterClasses} style={{ width: COL_WIDTH.remove }}></th>
              </tr>
            </thead>
            <tbody className="max-md:block">
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
                  showParcelColumn={showParcelColumn}
                  farmerParcels={farmerParcels}
                  error={rowErrors[rec._id]}
                  onUpdate={updateRecord}
                  onRemove={removeRecord}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addRecord}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors"
          >
            <Plus size={14} /> Add Row
          </button>
          <span className="text-[12.5px] text-[#7A8E7A]">{records.length} row{records.length === 1 ? '' : 's'}</span>
        </div>

        {error && (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-[#F0F4F0] pt-4">
          <button type="button" onClick={goBack}
            className="rounded-lg border border-[#C8D5C8] px-5 py-2 text-sm font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="rounded-lg bg-[#1B4D2E] px-5 py-2 text-sm font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-60">
            {isSubmitting ? 'Submitting…' : `Submit ${records.length > 1 ? `${records.length} Records` : 'Record'}`}
          </button>
        </div>
      </form>

      {showConfirm && (
        <ConfirmSubmissionModal
          records={records}
          cropTypes={cropTypes}
          farmerFullName={farmerInfo.farmer_full_name}
          isSubmitting={isSubmitting}
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </PageLayout>
  )
}
