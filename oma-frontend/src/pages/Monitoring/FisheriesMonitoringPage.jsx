import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import FisheriesRecordsPage from '../FisheriesRecords/FisheriesRecordsPage.jsx'
import FisheriesHistoryModal from './FisheriesHistoryModal.jsx'
import LogCatchModal from './LogCatchModal.jsx'
import LogFisheriesDisasterModal from './LogFisheriesDisasterModal.jsx'

const DISASTER_STATUS_TONES = { Reported: 'amber', Verified: 'green', Closed: 'slate' }
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const CATCH_COLUMNS = [
  { key: 'fisherfolk_name',   label: 'Fisherfolk' },
  { key: 'fisherfolk_type',   label: 'Type' },
  { key: 'trip_date_fmt',     label: 'Trip Date' },
  { key: 'fishing_ground',    label: 'Ground' },
  { key: 'gear_used',         label: 'Gear' },
  { key: 'total_catch_kg',    label: 'Catch (kg)' },
  { key: 'top_species_cell',  label: 'Top Species' },
  { key: 'hours_at_sea_fmt',  label: 'Hrs at Sea' },
  { key: 'fuel_liters_fmt',   label: 'Fuel (L)' },
  { key: 'actions_cell',      label: 'Actions' },
]

const DISASTER_COLUMNS = [
  { key: 'fisherfolk_name',      label: 'Fisherfolk' },
  { key: 'report_date_fmt',      label: 'Report Date' },
  { key: 'disaster_type',        label: 'Type' },
  { key: 'affected_barangay',    label: 'Barangay' },
  { key: 'status_pill',          label: 'Status' },
  { key: 'actions_cell',         label: 'Actions' },
]

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="flex-1 min-w-[130px] rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent || '#212121' }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function SubTabBar({ options, value, onChange }) {
  return (
    <div className="flex w-fit overflow-hidden rounded-xl border border-slate-200">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`border-none px-5 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            value === opt.value ? 'bg-[#1E4620] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Table Row Actions: View Details / Edit ────────────────────────────────────
// Delete lives inside each Edit modal now, not as a standalone icon — Batch 5.
// onViewDetails is optional — Assistance Records had its View Details
// dropped (Batch B: the modal was near-redundant with the table row),
// leaving just Edit for that table. At most 2 actions
// either way, both roles, always — the action-count rule (Batch B) means
// this stays plain icons, never a ⋮ (RowActions makes that call automatically).

function TableActionsMenu({ onViewDetails, onEdit }) {
  const actions = [
    onViewDetails && { key: 'view', label: 'View Details', icon: Eye, onClick: onViewDetails },
    { key: 'edit', label: 'Edit', icon: Pencil, onClick: onEdit },
  ]
  return <RowActions actions={actions} />
}

// ─── Generic read-only Detail Modal (View Details) ─────────────────────────────

function DetailModal({ title, subtitle, rows, onClose }) {
  return (
    <ModalShell title={title} subtitle={subtitle} icon={Eye} onClose={onClose} maxWidth="max-w-lg">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 border-b border-[#F0F4F0] pb-2">
            <span className="text-[12px] font-medium text-[#7A8E7A]">{label}</span>
            <span className="text-right text-[13px] font-semibold text-[#1A2B1A]">{value ?? '—'}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-4 mt-2 border-t border-[#F0F4F0]">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
          Close
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Species Breakdown Modal (reveals the "+N more" collapsed species) ─────────
// The catch table only has room for the single top species; the "+N more"
// badge is the affordance to open this full per-trip breakdown. Rendered as a
// modal (not a hover tooltip) because the table sits inside an overflow-x-auto
// wrapper that would clip an in-cell popover.

function SpeciesBreakdownModal({ record, onClose }) {
  const entries = [...(record.species_entries || [])].sort(
    (a, b) => (Number(b.volume_kg) || 0) - (Number(a.volume_kg) || 0),
  )
  const total = entries.reduce((s, e) => s + (Number(e.volume_kg) || 0), 0)

  return (
    <ModalShell
      title="Species breakdown"
      subtitle={`${record.fisherfolk_name} · ${formatDate(record.trip_date)}`}
      icon={Eye}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-2">
        {entries.map((e, i) => {
          const kg = Number(e.volume_kg) || 0
          const pct = total > 0 ? Math.round((kg / total) * 100) : 0
          return (
            <div key={e.id ?? i} className="flex items-center gap-3">
              <span className="w-5 text-right text-[11px] text-[#7A8E7A]">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-[#1A2B1A]">{e.species_name}</span>
                  <span className="whitespace-nowrap text-[12px] text-[#4A5E4A]">
                    {kg.toLocaleString()} kg
                    <span className="ml-1.5 text-[11px] text-[#7A8E7A]">{pct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#e8f5e9]">
                  <div className="h-full rounded-full bg-[#4CAF50]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[#F0F4F0] pt-3">
        <span className="text-[12px] font-medium text-[#7A8E7A]">Total catch</span>
        <span className="text-[13px] font-semibold text-[#1A2B1A]">{total.toLocaleString()} kg</span>
      </div>
    </ModalShell>
  )
}

// ─── Danger Zone (shared bottom-of-Edit-modal delete section) ─────────────────

function DangerZone({ isAdmin, description, onDeleteClick }) {
  if (!isAdmin) return null
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
      <p className="text-[12px] font-semibold text-rose-700 mb-1">Danger Zone</p>
      <p className="text-[11px] text-rose-600 mb-2">{description}</p>
      <button
        type="button"
        onClick={onDeleteClick}
        className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-100 transition-colors"
      >
        <Trash2 size={13} /> Delete this record
      </button>
    </div>
  )
}

// ─── Edit Catch Log Modal ──────────────────────────────────────────────────────

function EditCatchModal({ record, onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const originalData = {
    trip_date: record.trip_date || '',
    return_date: record.return_date || '',
    fishing_ground: record.fishing_ground || '',
    gear_used: record.gear_used || '',
    total_catch_kg: record.total_catch_kg != null ? String(record.total_catch_kg) : '',
    hours_at_sea: record.hours_at_sea != null ? String(record.hours_at_sea) : '',
    fuel_consumption_liters: record.fuel_consumption_liters != null ? String(record.fuel_consumption_liters) : '',
    remarks: record.remarks || '',
  }
  const [form, setForm] = useState(originalData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isDirty = JSON.stringify(form) !== JSON.stringify(originalData)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setIsSubmitting(true)
    try {
      await api.patch(`/fisheries/fishing-trips/${record.id}/`, {
        trip_date: form.trip_date,
        return_date: form.return_date || null,
        fishing_ground: form.fishing_ground,
        gear_used: form.gear_used,
        total_catch_kg: form.total_catch_kg !== '' ? parseFloat(form.total_catch_kg) : null,
        hours_at_sea: form.hours_at_sea !== '' ? parseFloat(form.hours_at_sea) : null,
        fuel_consumption_liters: form.fuel_consumption_liters !== '' ? parseFloat(form.fuel_consumption_liters) : null,
        remarks: form.remarks,
      })
      showToast('Catch log updated.', 'success')
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update catch log.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/fisheries/fishing-trips/${record.id}/`)
      showToast('Catch log deleted.', 'success')
      onSaved()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete catch log.', 'error')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalShell title="Edit Catch Log" subtitle={record.fisherfolk_name} icon={Pencil} onClose={onClose} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Trip Date" required>
              <input type="date" className={baseInputClasses} value={form.trip_date}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => set('trip_date', e.target.value)} />
            </FormField>
            <FormField label="Return Date">
              <input type="date" className={baseInputClasses} value={form.return_date}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => set('return_date', e.target.value)} />
            </FormField>
            <FormField label="Fishing Ground">
              <input type="text" className={baseInputClasses} value={form.fishing_ground}
                onChange={(e) => set('fishing_ground', e.target.value)} />
            </FormField>
            <FormField label="Gear Used">
              <input type="text" className={baseInputClasses} value={form.gear_used}
                onChange={(e) => set('gear_used', e.target.value)} />
            </FormField>
            <FormField label="Total Catch (kg)">
              <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.total_catch_kg}
                onChange={(e) => set('total_catch_kg', e.target.value)} />
            </FormField>
            <FormField label="Hours at Sea">
              <input type="number" step="0.1" min="0" className={baseInputClasses} value={form.hours_at_sea}
                onChange={(e) => set('hours_at_sea', e.target.value)} />
            </FormField>
            <FormField label="Fuel Consumption (L)">
              <input type="number" step="0.1" min="0" className={baseInputClasses} value={form.fuel_consumption_liters}
                onChange={(e) => set('fuel_consumption_liters', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Remarks">
            <textarea className={baseInputClasses} rows={2} value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)} />
          </FormField>

          {error && (
            <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>
          )}

          <DangerZone
            isAdmin={isAdmin}
            description="Permanently delete this catch log and its species entries."
            onDeleteClick={() => setShowDeleteConfirm(true)}
          />

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
      </ModalShell>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Catch Log?"
          message="This action cannot be undone."
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete Record'}
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}

// ─── Edit Disaster Report Modal ─────────────────────────────────────────────────
// (Edit Assistance Modal relocated to pages/AssistanceManagement/FisheriesAssistancePage.jsx — Batch 5)

const DISASTER_TYPES = ['Typhoon', 'Flooding', 'Storm Surge', 'El Nino Drought', 'Red Tide', 'Disease Outbreak', 'Other']
const DISASTER_STATUS_OPTIONS = ['Reported', 'Verified', 'Closed']

function EditDisasterModal({ record, onClose, onSaved }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const originalData = {
    report_date: record.report_date || '',
    disaster_type: record.disaster_type || '',
    affected_barangay: record.affected_barangay || '',
    description: record.description || '',
    volume_lost_kg: record.volume_lost_kg != null ? String(record.volume_lost_kg) : '',
    equipment_damaged: record.equipment_damaged || '',
    status: record.status || 'Reported',
  }
  const [form, setForm] = useState(originalData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isDirty = JSON.stringify(form) !== JSON.stringify(originalData)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setIsSubmitting(true)
    try {
      await api.patch(`/monitoring/fisherfolk-disasters/${record.id}/`, {
        ...form,
        volume_lost_kg: form.volume_lost_kg !== '' ? parseFloat(form.volume_lost_kg) : null,
      })
      showToast('Disaster report updated.', 'success')
      onSaved()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update disaster report.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/monitoring/fisherfolk-disasters/${record.id}/`)
      showToast('Disaster report deleted.', 'success')
      onSaved()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete disaster report.', 'error')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalShell title="Edit Disaster Report" subtitle={record.fisherfolk_name} icon={Pencil} onClose={onClose} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Report Date" required>
              <input type="date" className={baseInputClasses} value={form.report_date}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => set('report_date', e.target.value)} />
            </FormField>
            <FormField label="Disaster Type" required>
              <select className={baseInputClasses} value={form.disaster_type}
                onChange={(e) => set('disaster_type', e.target.value)}>
                {DISASTER_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </FormField>
            <BarangaySelect label="Affected Barangay" value={form.affected_barangay}
              onChange={(e) => set('affected_barangay', e.target.value)} required />
            <FormField label="Status" required>
              <select className={baseInputClasses} value={form.status}
                onChange={(e) => set('status', e.target.value)}>
                {DISASTER_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Volume Lost (kg)">
              <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.volume_lost_kg}
                onChange={(e) => set('volume_lost_kg', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Equipment Damaged">
            <input type="text" className={baseInputClasses} value={form.equipment_damaged}
              onChange={(e) => set('equipment_damaged', e.target.value)} />
          </FormField>
          <FormField label="Description" required>
            <textarea className={baseInputClasses} rows={3} value={form.description}
              onChange={(e) => set('description', e.target.value)} />
          </FormField>

          {error && (
            <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>
          )}

          <DangerZone
            isAdmin={isAdmin}
            description="Permanently delete this disaster report."
            onDeleteClick={() => setShowDeleteConfirm(true)}
          />

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
      </ModalShell>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Disaster Report?"
          message="This action cannot be undone."
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete Record'}
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}

export default function FisheriesMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'stocking'
  // Forecasting moved out to its own /fisheries-forecasting route (Batch C),
  // Assistance moved out to /fisheries-assistance (Batch 5) — an old
  // ?tab=forecasting or ?tab=assistance link/bookmark falls back to the
  // default tab instead of rendering nothing.
  const subTab = (rawTab === 'forecasting' || rawTab === 'assistance') ? 'stocking' : rawTab
  const setSubTab = (tab) => setSearchParams({ tab }, { replace: true })

  const [barangay, setBarangay] = useState('')
  const [year, setYear]     = useState('')

  const [catchLogs, setCatchLogs]       = useState([])
  const [catchSummary, setCatchSummary] = useState(null)
  const [isLoadingCatch, setIsLoadingCatch] = useState(false)
  const [errorCatch, setErrorCatch]     = useState('')

  const [disasters, setDisasters]             = useState([])
  const [isLoadingDisasters, setIsLoadingDisasters] = useState(false)
  const [errorDisasters, setErrorDisasters]   = useState('')

  const [showAddCatch, setShowAddCatch]         = useState(false)
  const [showFisheriesHistory, setShowFisheriesHistory] = useState(false)
  const [showLogDisaster, setShowLogDisaster]   = useState(false)

  // View Details / Edit — Batch 5 action-icon reorganization
  const [viewingDetail, setViewingDetail] = useState(null) // { title, subtitle, rows }
  const [speciesBreakdown, setSpeciesBreakdown] = useState(null) // a catch record
  const [editingCatch, setEditingCatch]         = useState(null)
  const [editingDisaster, setEditingDisaster]   = useState(null)

  const fetchCatch = useCallback(async () => {
    setIsLoadingCatch(true); setErrorCatch('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const [logsRes, summaryRes] = await Promise.all([
        api.get(`/fisheries/fishing-trips/?${params}`),
        api.get(`/fisheries/fishing-trips/summary/?${params}`),
      ])
      setCatchLogs(Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data.results || []))
      setCatchSummary(summaryRes.data)
    } catch { setErrorCatch('Failed to load catch logs.') }
    finally { setIsLoadingCatch(false) }
  }, [barangay, year])

  const fetchDisasters = useCallback(async () => {
    setIsLoadingDisasters(true); setErrorDisasters('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const r = await api.get(`/monitoring/fisherfolk-disasters/?${params}`)
      setDisasters(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorDisasters('Failed to load disaster reports.') }
    finally { setIsLoadingDisasters(false) }
  }, [barangay, year])

  useEffect(() => { if (subTab === 'capture') fetchCatch() }, [subTab, fetchCatch])
  useEffect(() => { if (subTab === 'disasters') fetchDisasters() }, [subTab, fetchDisasters])

  const catchData = useMemo(() => catchLogs.map((c) => {
    const entries = c.species_entries || []
    const extra = entries.length > 1 ? entries.length - 1 : 0
    return {
      ...c,
      trip_date_fmt: formatDate(c.trip_date),
      total_catch_kg: c.total_catch_kg != null ? `${Number(c.total_catch_kg).toLocaleString()} kg` : '—',
      top_species_cell: c.top_species ? (
        <span className="text-sm">
          {c.top_species}
          {extra > 0 && (
            <button
              type="button"
              onClick={() => setSpeciesBreakdown(c)}
              title="View full species breakdown"
              aria-label={`View all ${entries.length} species for this trip`}
              className="ml-1 cursor-pointer rounded-full bg-[#f0f7f0] px-1.5 py-0.5 text-[10px] font-semibold text-[#1E4620] transition-colors hover:bg-[#dceadd] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1E4620]"
            >
              +{extra} more
            </button>
          )}
        </span>
      ) : '—',
      hours_at_sea_fmt: c.hours_at_sea != null ? `${Number(c.hours_at_sea).toFixed(1)} h` : '—',
      fuel_liters_fmt: c.fuel_consumption_liters != null ? `${Number(c.fuel_consumption_liters).toFixed(1)} L` : '—',
      actions_cell: (
        <TableActionsMenu
          onViewDetails={() => setViewingDetail({
            title: 'Catch Log Details',
            subtitle: c.fisherfolk_name,
            rows: [
              ['Fisherfolk', c.fisherfolk_name], ['Type', c.fisherfolk_type],
              ['Trip Date', formatDate(c.trip_date)], ['Return Date', formatDate(c.return_date)],
              ['Fishing Ground', c.fishing_ground], ['Gear Used', c.gear_used],
              ['Total Catch (kg)', c.total_catch_kg], ['Species Logged', c.species_count],
              ['Hours at Sea', c.hours_at_sea], ['Fuel (L)', c.fuel_consumption_liters],
              ['Remarks', c.remarks || '—'],
            ],
          })}
          onEdit={() => setEditingCatch(c)}
        />
      ),
    }
  }), [catchLogs])

  const disasterData = useMemo(() => disasters.map((d) => ({
    ...d,
    report_date_fmt:    formatDate(d.report_date),
    status_pill: <StatusPill tone={DISASTER_STATUS_TONES[d.status] || 'slate'}>{d.status}</StatusPill>,
    actions_cell: (
      <TableActionsMenu
        onViewDetails={() => setViewingDetail({
          title: 'Disaster Report Details',
          subtitle: d.fisherfolk_name,
          rows: [
            ['Fisherfolk', d.fisherfolk_name], ['Report Date', formatDate(d.report_date)],
            ['Disaster Type', d.disaster_type], ['Affected Barangay', d.affected_barangay],
            ['Status', d.status],
            ['Volume Lost (kg)', d.volume_lost_kg ?? '—'], ['Equipment Damaged', d.equipment_damaged || '—'],
            ['Description', d.description || '—'],
          ],
        })}
        onEdit={() => setEditingDisaster(d)}
      />
    ),
  })), [disasters])

  return (
    <PageLayout
      title="Fisheries Monitoring"
      subtitle="Stocking & culture, capture fishing, and disaster reports"
    >
      <div className="space-y-5">
        {/* Filters + Actions — not applicable to Stocking & Culture, which has its own filter bar */}
        {subTab !== 'stocking' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
            </div>
            <div>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All Years</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="ml-auto flex gap-2">
              {subTab === 'capture' && (
                <>
                  <Button variant="outline" onClick={() => setShowFisheriesHistory(true)}>
                    <History size={15} className="mr-1" /> Historical
                  </Button>
                  <Button onClick={() => setShowAddCatch(true)}>
                    <Plus size={15} className="mr-1" /> Log Catch
                  </Button>
                </>
              )}
              {subTab === 'disasters' && (
                <Button onClick={() => setShowLogDisaster(true)}>
                  <Plus size={15} className="mr-1" /> Log Disaster
                </Button>
              )}
            </div>
          </div>
        )}

        <SubTabBar
          options={[
            { value: 'stocking',   label: 'Stocking & Culture' },
            { value: 'capture',    label: 'Capture' },
            { value: 'disasters',  label: 'Fisherfolk Disasters' },
          ]}
          value={subTab}
          onChange={setSubTab}
        />

        {/* Stocking & Culture — the existing FisheriesRecordsPage, mounted as-is */}
        {subTab === 'stocking' && <FisheriesRecordsPage asTab />}

        {/* Capture Fishing */}
        {subTab === 'capture' && (
          <div className="space-y-4">
            {catchSummary && (
              <div className="flex flex-wrap gap-3">
                <MetricCard
                  label="Total Catch"
                  value={`${Number(catchSummary.totals?.total_volume_kg || 0).toLocaleString()} kg`}
                  sub={`${catchSummary.totals?.trip_count || 0} trips`}
                  accent="#1565c0"
                />
                <MetricCard
                  label="Estimated Value"
                  value={`₱${Number(catchSummary.totals?.total_value_php || 0).toLocaleString()}`}
                  sub="Total market value"
                />
                <MetricCard
                  label="Active Fisherfolk"
                  value={catchSummary.totals?.active_fisherfolk || 0}
                  sub="Unique fisherfolk"
                />
              </div>
            )}

            {catchSummary?.top_species?.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Top Species by Volume</p>
                <div className="space-y-2">
                  {catchSummary.top_species.slice(0, 10).map((sp, i) => (
                    <div key={sp.species_name} className="flex items-center gap-2">
                      <span className="w-5 text-right text-[11px] text-slate-400">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-700">{sp.species_name}</div>
                        <div className="mt-1 h-1.5 rounded-full bg-[#e8f5e9]">
                          <div className="h-full rounded-full bg-[#4CAF50]" style={{ width: `${sp.pct_of_total_catch}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-600 whitespace-nowrap">
                        {Number(sp.total_volume_kg).toLocaleString()} kg
                      </span>
                      <span className="w-9 text-right text-[11px] text-slate-400">{sp.pct_of_total_catch}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorCatch
              ? <ErrorMessage message={errorCatch} />
              : <DataTable columns={CATCH_COLUMNS} data={catchData} isLoading={isLoadingCatch} />
            }
          </div>
        )}

        {/* Disasters */}
        {subTab === 'disasters' && (
          <div className="space-y-4">
            {disasters.length > 0 && (
              <div className="flex flex-wrap gap-3">
                <MetricCard label="Total Reports" value={disasters.length} />
                <MetricCard label="Reported" value={disasters.filter((d) => d.status === 'Reported').length} accent="#f57c00" />
              </div>
            )}
            {errorDisasters
              ? <ErrorMessage message={errorDisasters} />
              : <DataTable columns={DISASTER_COLUMNS} data={disasterData} isLoading={isLoadingDisasters} />
            }
          </div>
        )}

      </div>

      {/* Modals */}
      {showAddCatch && (
        <LogCatchModal onClose={() => setShowAddCatch(false)} onSuccess={fetchCatch} />
      )}
      {showFisheriesHistory && (
        <FisheriesHistoryModal onClose={() => setShowFisheriesHistory(false)} />
      )}
      {showLogDisaster && (
        <LogFisheriesDisasterModal onClose={() => setShowLogDisaster(false)} onSuccess={fetchDisasters} />
      )}

      {viewingDetail && (
        <DetailModal
          title={viewingDetail.title}
          subtitle={viewingDetail.subtitle}
          rows={viewingDetail.rows}
          onClose={() => setViewingDetail(null)}
        />
      )}
      {speciesBreakdown && (
        <SpeciesBreakdownModal
          record={speciesBreakdown}
          onClose={() => setSpeciesBreakdown(null)}
        />
      )}
      {editingCatch && (
        <EditCatchModal
          record={editingCatch}
          onClose={() => setEditingCatch(null)}
          onSaved={() => { setEditingCatch(null); fetchCatch() }}
        />
      )}
      {editingDisaster && (
        <EditDisasterModal
          record={editingDisaster}
          onClose={() => setEditingDisaster(null)}
          onSaved={() => { setEditingDisaster(null); fetchDisasters() }}
        />
      )}
    </PageLayout>
  )
}
