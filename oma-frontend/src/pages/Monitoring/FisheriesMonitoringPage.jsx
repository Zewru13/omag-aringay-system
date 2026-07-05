import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Fish, Plus, Trash2, X,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

// ─── constants ────────────────────────────────────────────────────────────────

const DISASTER_TYPES = [
  'Fish Kill', 'Disease Outbreak', 'Flood', 'Typhoon', 'Drought', 'Predator Attack', 'Other',
]

const STATUS_TONES = {
  Stocked:      'green',
  'For Harvest': 'amber',
  Harvested:    'blue',
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const COLUMNS = [
  { key: 'fisherfolk_name',      label: 'FISHERFOLK' },
  { key: 'species_name',         label: 'SPECIES' },
  { key: 'culture_type',         label: 'CULTURE TYPE' },
  { key: 'date_stocked_fmt',     label: 'DATE STOCKED' },
  { key: 'expected_harvest_fmt', label: 'EXPECTED HARVEST' },
  { key: 'est_harvest_fmt',      label: 'EST. (KG)' },
  { key: 'harvested_fmt',        label: 'HARVESTED (KG)' },
  { key: 'pond_location_barangay', label: 'POND BARANGAY' },
  { key: 'status_cell',          label: 'STATUS' },
  { key: 'actions_cell',         label: '' },
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function fmtDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(v + 'T00:00:00'),
  )
}

function MetricCard({ label, value, accent }) {
  return (
    <div className="flex-1 min-w-[130px] rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent || '#212121' }}>{value}</div>
    </div>
  )
}

// ─── LogDisasterModal ─────────────────────────────────────────────────────────

function LogDisasterModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({
    disaster_type: 'Fish Kill',
    date_of_occurrence: todayISO(),
    area_affected_ha: '',
    estimated_damage: '',
    production_loss: '',
  })
  const [areaError, setAreaError] = useState('')
  const [dateError, setDateError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const maxArea     = record.area_hectares ? parseFloat(record.area_hectares) : null
  const dateStocked = record.date_stocked || null

  const validateArea = (val) => {
    if (!val && val !== 0) return 'Area affected is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Area must be greater than 0.'
    if (maxArea !== null && n > maxArea) return `Cannot exceed stocking area (${maxArea} ha).`
    return ''
  }

  const validateDate = (val) => {
    if (!val) return 'Date of occurrence is required.'
    if (val > todayISO()) return 'Date cannot be in the future.'
    if (dateStocked && val < dateStocked) return `Date cannot be before stocking date (${dateStocked}).`
    return ''
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ae = validateArea(form.area_affected_ha)
    const de = validateDate(form.date_of_occurrence)
    setAreaError(ae)
    setDateError(de)
    if (ae || de) return

    setIsSaving(true)
    try {
      await api.post(`/fisheries/stocking/${record.id}/disasters/`, {
        disaster_type:      form.disaster_type,
        date_of_occurrence: form.date_of_occurrence,
        area_affected_ha:   parseFloat(form.area_affected_ha),
        estimated_damage:   form.estimated_damage,
        production_loss:    form.production_loss,
      })
      showToast('Disaster report submitted.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to submit disaster report.'
      showToast(msg, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalShell title="Log Disaster Report" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>{record.fisherfolk_name}</strong> — {record.species_name} ({record.culture_type})
          {maxArea && <span className="ml-2 text-xs text-amber-600">Stocking area: {maxArea} ha</span>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Disaster Type *</label>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            value={form.disaster_type}
            onChange={(e) => set('disaster_type', e.target.value)}
          >
            {DISASTER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date of Occurrence *</label>
          <input
            type="date"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            value={form.date_of_occurrence}
            max={todayISO()}
            min={dateStocked || undefined}
            onChange={(e) => { set('date_of_occurrence', e.target.value); setDateError(validateDate(e.target.value)) }}
          />
          {dateError && <p className="mt-1 text-xs text-red-600">{dateError}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Area Affected (ha) *</label>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            max={maxArea || undefined}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            placeholder={maxArea ? `Max ${maxArea} ha` : 'Hectares'}
            value={form.area_affected_ha}
            onChange={(e) => { set('area_affected_ha', e.target.value); setAreaError(validateArea(e.target.value)) }}
          />
          {areaError && <p className="mt-1 text-xs text-red-600">{areaError}</p>}
          {maxArea && !areaError && (
            <p className="mt-1 text-xs text-slate-500">Cannot exceed stocking area of {maxArea} ha.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Estimated Damage</label>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            placeholder="e.g. ₱50,000 — describe damage"
            value={form.estimated_damage}
            onChange={(e) => set('estimated_damage', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Production Loss</label>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            placeholder="e.g. 200 kg fish lost"
            value={form.production_loss}
            onChange={(e) => set('production_loss', e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSaving}>Submit Report</Button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── RecordHarvestModal ───────────────────────────────────────────────────────

function RecordHarvestModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({
    harvest_date: todayISO(),
    quantity_kg: '',
    avg_body_weight_kg: '',
    is_final: false,
    notes: '',
  })
  const [qtyError, setQtyError]       = useState('')
  const [dateError, setDateError]     = useState('')
  const [showSoftConfirm, setShowSoftConfirm] = useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [isSaving, setIsSaving]       = useState(false)

  const estKg     = record.estimated_harvest_kg ? parseFloat(record.estimated_harvest_kg) : null
  const alreadyKg = record.total_harvested_kg   ? parseFloat(record.total_harvested_kg)   : 0
  const remaining = estKg !== null ? Math.max(0, estKg - alreadyKg) : null

  const softLow  = estKg ? +(estKg * 0.70).toFixed(2) : null
  const softHigh = estKg ? +(estKg * 1.30).toFixed(2) : null
  const hardMax  = remaining !== null ? +(remaining * 2).toFixed(2) : null

  const validateDate = (val) => {
    if (!val) return 'Harvest date is required.'
    if (val > todayISO()) return 'Date cannot be in the future.'
    if (record.date_stocked && val < record.date_stocked) return `Date cannot be before stocking date.`
    return ''
  }

  const validateQty = (val) => {
    if (!val) return 'Quantity harvested is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Quantity must be greater than 0.'
    if (hardMax !== null && n > hardMax) {
      return `Quantity (${n.toLocaleString()} kg) exceeds 2× the remaining estimate (${remaining?.toLocaleString()} kg). Cannot proceed.`
    }
    return ''
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmitClick = (e) => {
    e.preventDefault()
    const de = validateDate(form.harvest_date)
    const qe = validateQty(form.quantity_kg)
    setDateError(de)
    setQtyError(qe)
    if (de || qe) return

    const qty = parseFloat(form.quantity_kg)
    if (softLow !== null && (qty < softLow || qty > softHigh)) {
      setShowSoftConfirm(true)
      return
    }
    setShowFinalConfirm(true)
  }

  const doSave = async () => {
    setShowFinalConfirm(false)
    setIsSaving(true)
    try {
      await api.post(`/fisheries/stocking/${record.id}/harvests/`, {
        harvest_date:       form.harvest_date,
        quantity_kg:        parseFloat(form.quantity_kg),
        avg_body_weight_kg: form.avg_body_weight_kg ? parseFloat(form.avg_body_weight_kg) : null,
        is_final:           form.is_final,
        notes:              form.notes,
      })
      showToast('Harvest record saved.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to save harvest record.'
      showToast(msg, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const qty = parseFloat(form.quantity_kg) || 0

  return (
    <ModalShell title="Record Harvest" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmitClick} className="space-y-4">
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <strong>{record.fisherfolk_name}</strong> — {record.species_name}
          {alreadyKg > 0 && (
            <span className="ml-2 font-medium text-blue-700">
              Already harvested: {alreadyKg.toLocaleString()} kg
            </span>
          )}
          {remaining !== null && (
            <span className="ml-2 text-xs text-blue-600">
              / Remaining est.: {remaining.toLocaleString()} kg
            </span>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Harvest Date *</label>
          <input
            type="date"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            value={form.harvest_date}
            max={todayISO()}
            min={record.date_stocked || undefined}
            onChange={(e) => { set('harvest_date', e.target.value); setDateError(validateDate(e.target.value)) }}
          />
          {dateError && <p className="mt-1 text-xs text-red-600">{dateError}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Quantity Harvested (kg) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            placeholder="kg"
            value={form.quantity_kg}
            onChange={(e) => { set('quantity_kg', e.target.value); setQtyError(validateQty(e.target.value)) }}
          />
          {qtyError && (
            <p className={`mt-1 text-xs ${qtyError.includes('Cannot proceed') ? 'text-red-600 font-medium' : 'text-red-600'}`}>
              {qtyError}
            </p>
          )}
          {softLow !== null && !qtyError && (
            <p className="mt-1 text-xs text-slate-500">
              Expected range: {softLow.toLocaleString()} – {softHigh.toLocaleString()} kg
              (±30% of {estKg.toLocaleString()} kg estimate)
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Avg. Body Weight (kg)</label>
          <input
            type="number"
            step="0.001"
            min="0"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            placeholder="optional"
            value={form.avg_body_weight_kg}
            onChange={(e) => set('avg_body_weight_kg', e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="is_final"
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-[#1E4620] focus:ring-[#1E4620]"
            checked={form.is_final}
            onChange={(e) => set('is_final', e.target.checked)}
          />
          <label htmlFor="is_final" className="text-sm text-slate-700">
            Mark as final harvest — closes this stocking cycle
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none"
            placeholder="Optional notes"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSaving}>Save Harvest</Button>
        </div>
      </form>

      {showSoftConfirm && (
        <ConfirmDialog
          title="Quantity Outside Expected Range"
          message={`The quantity entered (${qty.toLocaleString()} kg) is outside the expected range of ${softLow?.toLocaleString()} – ${softHigh?.toLocaleString()} kg (±30% of estimated ${estKg?.toLocaleString()} kg). Do you want to proceed?`}
          confirmLabel="Yes, Proceed"
          onConfirm={() => { setShowSoftConfirm(false); setShowFinalConfirm(true) }}
          onCancel={() => setShowSoftConfirm(false)}
        />
      )}

      {showFinalConfirm && (
        <ConfirmDialog
          title="Confirm Harvest Record"
          message={`Record ${qty.toLocaleString()} kg harvested${form.is_final ? ' (final harvest — cycle will close)' : ''}?`}
          confirmLabel="Save"
          onConfirm={doSave}
          onCancel={() => setShowFinalConfirm(false)}
        />
      )}
    </ModalShell>
  )
}

// ─── StockingDetailModal ──────────────────────────────────────────────────────

function StockingDetailModal({ recordId, onClose, onRefresh }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [detail, setDetail] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLogDisaster, setShowLogDisaster] = useState(false)
  const [showRecordHarvest, setShowRecordHarvest] = useState(false)
  const [expandedDisasters, setExpandedDisasters] = useState(new Set())
  const [deletingHarvestId, setDeletingHarvestId] = useState(null)
  const [confirmDeleteHarvest, setConfirmDeleteHarvest] = useState(null)

  const fetchDetail = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/fisheries/stocking/${recordId}/`)
      setDetail(r.data)
    } catch {
      showToast('Failed to load stocking record.', 'error')
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchDetail() }, [recordId])

  const handleDeleteHarvest = async (harvest) => {
    setDeletingHarvestId(harvest.id)
    try {
      await api.delete(`/fisheries/stocking/harvests/${harvest.id}/`)
      showToast('Harvest record deleted.', 'success')
      fetchDetail()
      onRefresh()
    } catch {
      showToast('Failed to delete harvest record.', 'error')
    } finally {
      setDeletingHarvestId(null)
      setConfirmDeleteHarvest(null)
    }
  }

  const toggleDisaster = (id) => {
    setExpandedDisasters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (isLoading || !detail) {
    return (
      <ModalShell title="Stocking Record" onClose={onClose} maxWidth="max-w-3xl">
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-100 border-t-[#16a34a]" />
        </div>
      </ModalShell>
    )
  }

  const canHarvest = detail.status !== 'Harvested'

  return (
    <ModalShell title="Stocking Record Details" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-5">
        {/* Header summary */}
        <div className="rounded-xl bg-[#f0f7f0] border border-[#c8e6c9] p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Fisherfolk</p>
            <p className="font-semibold text-slate-800">{detail.fisherfolk_name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Species</p>
            <p className="font-semibold text-slate-800">{detail.species_name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Culture Type</p>
            <p className="text-slate-700">{detail.culture_type}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pond Barangay</p>
            <p className="text-slate-700">{detail.pond_location_barangay || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Date Stocked</p>
            <p className="text-slate-700">{fmtDate(detail.date_stocked)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Expected Harvest</p>
            <p className="text-slate-700">{fmtDate(detail.expected_harvest_date)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Est. Harvest</p>
            <p className="text-slate-700">
              {detail.estimated_harvest_kg ? `${Number(detail.estimated_harvest_kg).toLocaleString()} kg` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <StatusPill tone={STATUS_TONES[detail.status] || 'slate'}>{detail.status}</StatusPill>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowLogDisaster(true)}
          >
            <AlertTriangle size={14} className="mr-1" /> Log Disaster
          </Button>
          {canHarvest && (
            <Button size="sm" onClick={() => setShowRecordHarvest(true)}>
              <Fish size={14} className="mr-1" /> Record Harvest
            </Button>
          )}
        </div>

        {/* Activity Logs */}
        {detail.logs && detail.logs.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Activity Logs ({detail.logs.length})</h3>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {detail.logs.map((log) => (
                <div key={log.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{log.activity}</span>
                    <span className="text-xs text-slate-500">{fmtDate(log.date_of_activity)}</span>
                  </div>
                  {log.recommendations && (
                    <p className="mt-0.5 text-xs text-slate-500">{log.recommendations}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disaster Reports */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            Disaster Reports ({detail.disaster_reports?.length || 0})
            {detail.disaster_reports?.length > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                <AlertTriangle className="w-3 h-3" /> {detail.disaster_reports.length} reports
              </span>
            )}
          </h3>
          {(!detail.disaster_reports || detail.disaster_reports.length === 0) ? (
            <p className="text-sm italic text-slate-400">No disaster reports.</p>
          ) : (
            <div className="space-y-2">
              {detail.disaster_reports.map((d) => {
                const isExp = expandedDisasters.has(d.id)
                return (
                  <div key={d.id} className="rounded-xl border border-rose-200 bg-rose-50">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-4 py-3 text-sm"
                      onClick={() => toggleDisaster(d.id)}
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={14} className="text-rose-500" />
                        <span className="font-medium text-rose-800">{d.disaster_type}</span>
                        <span className="text-xs text-rose-600">{fmtDate(d.date_of_occurrence)}</span>
                        {d.area_affected_ha && (
                          <span className="text-xs text-rose-600">{d.area_affected_ha} ha affected</span>
                        )}
                      </div>
                      {isExp ? <ChevronDown size={14} className="text-rose-400" /> : <ChevronRight size={14} className="text-rose-400" />}
                    </button>
                    {isExp && (d.estimated_damage || d.production_loss || d.reported_by_name) && (
                      <div className="border-t border-rose-200 px-4 py-3 text-sm space-y-1">
                        {d.estimated_damage  && <p className="text-rose-700"><span className="font-medium">Damage:</span> {d.estimated_damage}</p>}
                        {d.production_loss   && <p className="text-rose-700"><span className="font-medium">Production loss:</span> {d.production_loss}</p>}
                        {d.reported_by_name  && <p className="text-xs text-rose-500">Reported by: {d.reported_by_name}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Harvest Records */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Harvest Records ({detail.harvests?.length || 0})
            {detail.total_harvested_kg > 0 && (
              <span className="ml-2 text-sm font-normal text-blue-700">
                Total: {Number(detail.total_harvested_kg).toLocaleString()} kg
              </span>
            )}
          </h3>
          {(!detail.harvests || detail.harvests.length === 0) ? (
            <p className="text-sm italic text-slate-400">No harvest records yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {detail.harvests.map((h) => (
                <div key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{Number(h.quantity_kg).toLocaleString()} kg</span>
                    <span className="ml-2 text-xs text-slate-500">{fmtDate(h.harvest_date)}</span>
                    {h.avg_body_weight_kg && (
                      <span className="ml-2 text-xs text-slate-500">avg {h.avg_body_weight_kg} kg/fish</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {h.is_final && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        <CheckCircle size={11} /> Final
                      </span>
                    )}
                    {h.recorded_by_name && (
                      <span className="text-xs text-slate-400">{h.recorded_by_name}</span>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteHarvest(h)}
                        disabled={deletingHarvestId === h.id}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        title="Delete harvest record"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showLogDisaster && (
        <LogDisasterModal
          record={detail}
          onClose={() => setShowLogDisaster(false)}
          onSuccess={() => { fetchDetail(); onRefresh() }}
        />
      )}
      {showRecordHarvest && (
        <RecordHarvestModal
          record={detail}
          onClose={() => setShowRecordHarvest(false)}
          onSuccess={() => { fetchDetail(); onRefresh() }}
        />
      )}
      {confirmDeleteHarvest && (
        <ConfirmDialog
          title="Delete Harvest Record"
          message={`Delete this harvest record (${Number(confirmDeleteHarvest.quantity_kg).toLocaleString()} kg on ${fmtDate(confirmDeleteHarvest.harvest_date)})?${confirmDeleteHarvest.is_final ? ' This will reopen the stocking cycle.' : ''}`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => handleDeleteHarvest(confirmDeleteHarvest)}
          onCancel={() => setConfirmDeleteHarvest(null)}
        />
      )}
    </ModalShell>
  )
}

// ─── FisheriesMonitoringPage ───────────────────────────────────────────────────

export default function FisheriesMonitoringPage() {
  const [records, setRecords]     = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState('')

  const [search, setSearch]       = useState('')
  const [barangay, setBarangay]   = useState('')
  const [season, setSeason]       = useState('')
  const [year, setYear]           = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const [detailId, setDetailId]   = useState(null)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search)   params.set('search',   search)
      if (barangay) params.set('barangay', barangay)
      if (season)   params.set('season',   season)
      if (year)     params.set('year',     year)
      if (statusFilter === 'active') {
        params.set('status', 'Stocked,For Harvest')
      } else if (statusFilter === 'harvested') {
        params.set('status', 'Harvested')
      } else {
        params.set('status', 'Stocked,For Harvest,Harvested')
      }
      const r = await api.get(`/fisheries/stocking/?${params}`)
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load stocking records.')
    } finally {
      setIsLoading(false)
    }
  }, [search, barangay, season, year, statusFilter])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const metrics = useMemo(() => ({
    stocked:    records.filter((r) => r.status === 'Stocked').length,
    forHarvest: records.filter((r) => r.status === 'For Harvest').length,
    harvested:  records.filter((r) => r.status === 'Harvested').length,
    nearHarvest: records.filter((r) => r.is_near_harvest).length,
    totalEstKg: records.reduce((s, r) => s + (parseFloat(r.estimated_harvest_kg) || 0), 0),
  }), [records])

  const tableData = useMemo(() => records.map((r) => ({
    ...r,
    date_stocked_fmt:     fmtDate(r.date_stocked),
    expected_harvest_fmt: fmtDate(r.expected_harvest_date),
    est_harvest_fmt:      r.estimated_harvest_kg != null
      ? `${Number(r.estimated_harvest_kg).toLocaleString()} kg` : '—',
    harvested_fmt:        r.total_harvested_kg > 0
      ? `${Number(r.total_harvested_kg).toLocaleString()} kg` : '—',
    status_cell: (
      <div className="flex items-center gap-1.5">
        <StatusPill tone={STATUS_TONES[r.status] || 'slate'}>{r.status}</StatusPill>
        {r.is_near_harvest && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            Near Harvest
          </span>
        )}
        {r.disaster_count > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
            <AlertTriangle size={9} /> {r.disaster_count}
          </span>
        )}
      </div>
    ),
    actions_cell: (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setDetailId(r.id)}
      >
        View
      </Button>
    ),
  })), [records])

  return (
    <PageLayout title="Fisheries Monitoring" subtitle="Monitor stocking cycles, log disasters, and record harvests">
      <div className="space-y-5">
        {/* Metrics */}
        {records.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <MetricCard label="Stocked"     value={metrics.stocked}     accent="#1E4620" />
            <MetricCard label="For Harvest" value={metrics.forHarvest}  accent="#b45309" />
            <MetricCard label="Harvested"   value={metrics.harvested}   accent="#1565c0" />
            {metrics.nearHarvest > 0 && (
              <MetricCard label="Near Harvest" value={metrics.nearHarvest} accent="#d97706" />
            )}
            <MetricCard
              label="Total Est. Yield"
              value={`${metrics.totalEstKg.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg`}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <input
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
            placeholder="Search fisherfolk, species…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 200 }}
          />
          <div className="w-44">
            <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
          </div>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            <option value="">All Seasons</option>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex overflow-hidden rounded-xl border border-slate-200">
            {[
              { value: 'active',    label: 'Active' },
              { value: 'harvested', label: 'Harvested' },
              { value: 'all',       label: 'All' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`border-none px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                  statusFilter === opt.value ? 'bg-[#1E4620] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <ErrorMessage message={error} />
        ) : (
          <DataTable columns={COLUMNS} data={tableData} isLoading={isLoading} />
        )}
      </div>

      {detailId && (
        <StockingDetailModal
          recordId={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={fetchRecords}
        />
      )}
    </PageLayout>
  )
}
