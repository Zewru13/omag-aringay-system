import { useEffect, useState } from 'react'
import { ArrowLeft, ClipboardList, Edit, Eye, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import Tabs from '../../components/UI/Tabs.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AquacultureCycleDetailModal from '../Monitoring/AquacultureCycleDetailModal.jsx'
import StartProductionCycleModal from '../Monitoring/StartProductionCycleModal.jsx'
import EditFisherfolkModal from './EditFisherfolkModal.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function fmtShort(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || '-'}</p>
    </div>
  )
}

const HISTORY_COLUMNS = [
  { key: 'program_name', label: 'Program' },
  { key: 'program_type', label: 'Type' },
  { key: 'season', label: 'Season' },
  { key: 'year', label: 'Year' },
  { key: 'quantity_given', label: 'Qty Given' },
  { key: 'unit', label: 'Unit' },
  { key: 'date_given', label: 'Date Given' },
]

function AssistanceHistoryModal({ history, isLoading, error, onClose }) {
  return (
    <ModalShell title="Assistance History" onClose={onClose} maxWidth="max-w-3xl">
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <DataTable columns={HISTORY_COLUMNS} data={history} isLoading={false} />
      )}
    </ModalShell>
  )
}

function AquacultureSection({ record }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-400 uppercase tracking-wide">Aquaculture Record</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Culture Type" value={record.culture_type} />
        <Field label="Species Cultured" value={record.species_cultured} />
        <Field label="Area (ha)" value={record.area_hectares} />
        <Field label="Fingerlings Stocked" value={record.fingerlings_stocked} />
        <Field label="Production Volume (kg)" value={record.production_volume_kg} />
      </div>
    </section>
  )
}

function FacilitySection({ fisherfolk }) {
  const hasAny = fisherfolk.facility_location || fisherfolk.pond_area_ha || fisherfolk.number_of_ponds ||
    fisherfolk.water_source || fisherfolk.number_of_cages || fisherfolk.cage_dimensions
  if (!hasAny) return null
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-400 uppercase tracking-wide">Facility Profile</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {fisherfolk.facility_location && <Field label="Facility Location" value={fisherfolk.facility_location} />}
        {fisherfolk.pond_area_ha && <Field label="Pond Area (ha)" value={fisherfolk.pond_area_ha} />}
        {fisherfolk.number_of_ponds != null && <Field label="Number of Ponds" value={fisherfolk.number_of_ponds} />}
        {fisherfolk.water_source && <Field label="Water Source" value={fisherfolk.water_source} />}
        {fisherfolk.number_of_cages != null && <Field label="Number of Cages" value={fisherfolk.number_of_cages} />}
        {fisherfolk.cage_dimensions && <Field label="Cage Dimensions" value={fisherfolk.cage_dimensions} />}
      </div>
    </section>
  )
}

function CaptureSection({ record }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-400 uppercase tracking-wide">Capture Record</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vessel Type" value={record.vessel_type} />
        {record.vessel_type === 'Motorized' && (
          <Field label="Vessel Material" value={record.vessel_material} />
        )}
        <Field label="Vessel Reg. Number" value={record.vessel_registration_number} />
        <Field label="Fishing Gear Type" value={record.fishing_gear_type} />
        <Field label="Fishing Ground" value={record.fishing_ground} />
        <Field label="Avg. Catch / Trip (kg)" value={record.average_catch_per_trip_kg} />
      </div>
    </section>
  )
}

function VendorSection({ record }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6">
      <h2 className="mb-4 text-sm font-medium text-slate-400 uppercase tracking-wide">Vendor Record</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location Type" value={record.location_type} />
        {record.location_type !== 'Ambulant / No Fixed Location' && (
          <Field label="Stall Location" value={record.stall_location} />
        )}
        <Field label="Commodity" value={record.type_of_products_sold} />
        <Field label="Source of Fish" value={record.source_of_fish} />
      </div>
    </section>
  )
}

const LICENSE_TONES = { Valid: 'green', 'Expiring Soon': 'amber', Expired: 'rose' }
const CYCLE_STATUS_TONES = { Active: 'green', Harvested: 'blue', Failed: 'rose', Abandoned: 'slate' }
const DISASTER_STATUS_TONES = { Reported: 'amber', Verified: 'green', Closed: 'slate' }

const ASSISTANCE_TYPE_CHOICES = [
  'Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other',
]

function GovernmentAssistanceTab({ fisherfolkId }) {
  const { showToast } = useToast()
  const { isAdmin, isEvaluator } = useAuth()
  const canRecord = isAdmin || isEvaluator

  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    assistance_type: 'Fishing Gear',
    description: '',
    quantity: '',
    date_received: '',
    source_agency: '',
    season: '',
    year: new Date().getFullYear().toString(),
    remarks: '',
  })

  const fetchRecords = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/monitoring/fisheries-assistance/?fisherfolk=${fisherfolkId}`)
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setRecords([]) }
    finally { setIsLoading(false) }
  }

  useEffect(() => { fetchRecords() }, [fisherfolkId])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleAdd = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await api.post('/monitoring/fisheries-assistance/', {
        ...form,
        fisherfolk: fisherfolkId,
        year: parseInt(form.year),
      })
      showToast('Assistance record saved.', 'success')
      setShowForm(false)
      setForm({ assistance_type: 'Fishing Gear', description: '', quantity: '', date_received: '', source_agency: '', season: '', year: new Date().getFullYear().toString(), remarks: '' })
      fetchRecords()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this assistance record?')) return
    try {
      await api.delete(`/monitoring/fisheries-assistance/${id}/`)
      showToast('Deleted.', 'success')
      fetchRecords()
    } catch { showToast('Failed to delete.', 'error') }
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 6 }, (_, i) => (currentYear - i).toString())

  return (
    <div className="space-y-3">
      {canRecord && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? '— Cancel' : '+ Log Assistance'}</Button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Type *</label>
              <select className={baseInputClasses} required value={form.assistance_type} onChange={e => set('assistance_type', e.target.value)}>
                {ASSISTANCE_TYPE_CHOICES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Description *</label>
              <input className={baseInputClasses} required value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Quantity</label>
              <input className={baseInputClasses} value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="e.g. 1 unit, 10 kg" />
            </div>
            <div>
              <label className={labelCls}>Date Received *</label>
              <input type="date" className={baseInputClasses} required value={form.date_received} onChange={e => set('date_received', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Source Agency *</label>
              <input className={baseInputClasses} required value={form.source_agency} onChange={e => set('source_agency', e.target.value)} placeholder="e.g. BFAR, LGU" />
            </div>
            <div>
              <label className={labelCls}>Season</label>
              <select className={baseInputClasses} value={form.season} onChange={e => set('season', e.target.value)}>
                <option value="">—</option>
                <option value="Dry">Dry</option>
                <option value="Wet">Wet</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Year *</label>
              <select className={baseInputClasses} required value={form.year} onChange={e => set('year', e.target.value)}>
                {yearOptions.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Remarks</label>
              <input className={baseInputClasses} value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingSpinner /> : records.length === 0 ? (
        <p className="py-3 text-sm italic text-slate-400">No government assistance records on file.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-[#1E4620]">
            <tr>
              {['Type', 'Description', 'Quantity', 'Date Received', 'Source', 'Season/Year', ''].map((h) => (
                <th key={h} className="px-4 py-2 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-green-50">
            {records.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
                <td className="px-4 py-2 font-medium">{r.assistance_type}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2">{r.quantity || '—'}</td>
                <td className="px-4 py-2">{fmtShort(r.date_received)}</td>
                <td className="px-4 py-2">{r.source_agency}</td>
                <td className="px-4 py-2">{r.season ? `${r.season} ${r.year}` : r.year}</td>
                <td className="px-4 py-2 text-right">
                  {canRecord && (
                    <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => handleDelete(r.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FisherfolkDetailPage() {
  const { id } = useParams()
  const { isAdmin, isEvaluator } = useAuth()
  const [fisherfolk, setFisherfolk] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [activeTab, setActiveTab] = useState(null)
  const [catchLogs, setCatchLogs] = useState([])
  const [aquaCycles, setAquaCycles] = useState([])
  const [disasters, setDisasters] = useState([])
  const [selectedCycle, setSelectedCycle] = useState(null)
  const [showStartCycle, setShowStartCycle] = useState(false)
  const [isLoadingCatch, setIsLoadingCatch] = useState(false)
  const [isLoadingAqua, setIsLoadingAqua] = useState(false)
  const [isLoadingDisasters, setIsLoadingDisasters] = useState(false)

  const fetchFisherfolk = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await api.get(`/fisheries/${id}/`)
      setFisherfolk(response.data)
    } catch {
      setError('Unable to load fisherfolk profile.')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchHistory = async () => {
    setIsLoadingHistory(true)
    setHistoryError('')
    try {
      const response = await api.get(`/interventions/fisherfolk-history/${id}/`)
      setHistory(Array.isArray(response.data) ? response.data : [])
    } catch {
      setHistoryError('Unable to load assistance history.')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const fetchCatchLogs = async () => {
    setIsLoadingCatch(true)
    try {
      const r = await api.get(`/monitoring/fishing-trips/?fisherfolk=${id}`)
      setCatchLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setCatchLogs([]) }
    finally { setIsLoadingCatch(false) }
  }

  const fetchAquaCycles = async () => {
    setIsLoadingAqua(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/?fisherfolk=${id}`)
      setAquaCycles(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setAquaCycles([]) }
    finally { setIsLoadingAqua(false) }
  }

  const fetchDisasters = async () => {
    setIsLoadingDisasters(true)
    try {
      const r = await api.get(`/monitoring/disasters/?fisherfolk=${id}`)
      setDisasters(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setDisasters([]) }
    finally { setIsLoadingDisasters(false) }
  }

  useEffect(() => {
    fetchFisherfolk()
  }, [id])

  useEffect(() => {
    if (!fisherfolk) return
    const type = fisherfolk.fisherfolk_type
    if (type === 'Capture' || type === 'Inland') {
      setActiveTab('catch')
      fetchCatchLogs()
      fetchDisasters()
    } else if (type === 'Aquaculture' || type === 'Mariculture') {
      setActiveTab('cycles')
      fetchAquaCycles()
      fetchDisasters()
    } else {
      setActiveTab('assistance')
    }
  }, [fisherfolk])

  const openHistory = () => {
    setIsHistoryModalOpen(true)
    fetchHistory()
  }

  return (
    <PageLayout title="Fisherfolk Details" subtitle="View and manage fisherfolk profile and records">
      <div className="space-y-5">
        <Link
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          to="/fisheries"
        >
          <ArrowLeft size={16} />
          Back to Fisheries List
        </Link>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-100 bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-100 border-t-[#16a34a]" />
          </div>
        )}

        {!isLoading && fisherfolk && (
          <>
            {/* Profile section */}
            <section className="rounded-2xl border border-slate-100 bg-white p-6">
              <div className="mb-6 flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-slate-900">{fisherfolk.full_name}</h1>
                    <StatusPill tone={fisherfolk.is_active ? 'green' : 'rose'}>
                      {fisherfolk.is_active ? 'Active' : 'Inactive'}
                    </StatusPill>
                    {fisherfolk.is_senior_citizen && (
                      <StatusPill tone="amber">Senior Citizen</StatusPill>
                    )}
                    {(fisherfolk.fisherfolk_type === 'Capture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
                      fisherfolk.has_vessel
                        ? <StatusPill tone="green">With Vessel</StatusPill>
                        : <StatusPill tone="slate">No Vessel</StatusPill>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    LGU Registration Number: {fisherfolk.lgu_registration_number}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Type: {fisherfolk.fisherfolk_type}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button icon={ClipboardList} onClick={openHistory} variant="outline">
                    View Assistance History
                  </Button>
                  {(isAdmin || isEvaluator) && (
                    <Button icon={Edit} onClick={() => setIsEditModalOpen(true)} variant="outline">
                      Edit Profile
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {fisherfolk.prefix && <Field label="Prefix" value={fisherfolk.prefix} />}
                <Field label="First Name" value={fisherfolk.first_name} />
                <Field label="Last Name" value={fisherfolk.last_name} />
                <Field label="Middle Name" value={fisherfolk.middle_name} />
                <Field label="Gender" value={fisherfolk.gender} />
                <Field label="Birthdate" value={formatDate(fisherfolk.birthdate)} />
                <Field label="Contact Number" value={fisherfolk.contact_number} />
                <Field label="Barangay" value={fisherfolk.barangay} />
                <Field label="Municipality" value={fisherfolk.municipality} />
                <Field label="Date Registered" value={formatDate(fisherfolk.date_registered)} />
                {fisherfolk.fish_registration_number && (
                  <Field label="Fish Registration No. (Fish-R)" value={fisherfolk.fish_registration_number} />
                )}
                {fisherfolk.boat_registration_number && (
                  <Field label="Boat Registration No. (Boat-R)" value={fisherfolk.boat_registration_number} />
                )}
              </div>
            </section>

            {/* Type-specific sub-record */}
            {fisherfolk.aquaculture_record && (
              <AquacultureSection record={fisherfolk.aquaculture_record} />
            )}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <FacilitySection fisherfolk={fisherfolk} />
            )}
            {fisherfolk.capture_record && (
              <CaptureSection record={fisherfolk.capture_record} />
            )}
            {fisherfolk.vendor_record && (
              <VendorSection record={fisherfolk.vendor_record} />
            )}

            {/* Monitoring tabs */}
            {activeTab && (() => {
              const type = fisherfolk.fisherfolk_type
              const isAqua = type === 'Aquaculture' || type === 'Mariculture'
              const isCapture = type === 'Capture' || type === 'Inland'

              const tabList = isAqua
                ? [
                    { label: 'Production Cycles', value: 'cycles' },
                    { label: 'Disaster Reports', value: 'disasters' },
                    { label: 'Government Assistance', value: 'assistance' },
                  ]
                : isCapture
                  ? [
                      { label: 'Catch Logs', value: 'catch' },
                      { label: 'Disaster Reports', value: 'disasters' },
                      { label: 'Government Assistance', value: 'assistance' },
                    ]
                  : [
                      { label: 'Government Assistance', value: 'assistance' },
                    ]

              return (
                <section className="rounded-2xl border border-slate-100 bg-white p-6">
                  <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">Monitoring Records</h2>
                  <Tabs tabs={tabList} activeTab={activeTab} onChange={setActiveTab} />
                  <div className="mt-4">
                    {activeTab === 'catch' && (
                      isLoadingCatch ? <LoadingSpinner /> :
                      catchLogs.length === 0 ? (
                        <p className="py-3 text-sm italic text-slate-400">No catch logs recorded.</p>
                      ) : (
                        <table className="min-w-full text-sm">
                          <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-[#1E4620]">
                            <tr>
                              {['Trip Date', 'Return Date', 'Ground', 'Gear', 'Catch (kg)', 'Top Species', 'Hrs at Sea'].map((h) => (
                                <th key={h} className="px-4 py-2 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-50">
                            {catchLogs.map((c, i) => {
                              const entries = c.species_entries || []
                              const top = entries.sort((a, b) => b.volume_kg - a.volume_kg)[0]
                              const extra = entries.length - 1
                              return (
                                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
                                  <td className="px-4 py-2">{fmtShort(c.trip_date)}</td>
                                  <td className="px-4 py-2">{fmtShort(c.return_date)}</td>
                                  <td className="px-4 py-2">{c.fishing_ground}</td>
                                  <td className="px-4 py-2">{c.gear_used}</td>
                                  <td className="px-4 py-2">{c.total_catch_kg ? parseFloat(c.total_catch_kg).toLocaleString() : '—'}</td>
                                  <td className="px-4 py-2 text-slate-700">
                                    {top ? (
                                      <span>
                                        {top.species_name}
                                        {extra > 0 && (
                                          <span style={{ marginLeft: 5, background: '#e8f5e9', color: '#2e7d32', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                                            +{extra}
                                          </span>
                                        )}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-slate-500">{c.hours_at_sea ? `${c.hours_at_sea} hrs` : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )
                    )}

                    {activeTab === 'cycles' && (
                      isLoadingAqua ? <LoadingSpinner /> : (
                      <>
                        {(isAdmin || isEvaluator) && (
                          <div className="mb-3 flex justify-end">
                            <Button size="sm" onClick={() => setShowStartCycle(true)}>+ Start New Cycle</Button>
                          </div>
                        )}
                        {aquaCycles.length === 0 ? (
                        <p className="py-3 text-sm italic text-slate-400">No production cycles recorded.</p>
                      ) : (
                        <table className="min-w-full text-sm">
                          <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-[#1E4620]">
                            <tr>
                              {['Cycle Name', 'Species', 'System', 'Stocking Date', 'Harvest Vol.', 'Area/Cage', 'Status', ''].map((h) => (
                                <th key={h} className="px-4 py-2 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-50">
                            {aquaCycles.map((c, i) => (
                              <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
                                <td className="px-4 py-2 font-medium">{c.cycle_name}</td>
                                <td className="px-4 py-2">{c.species_farmed}</td>
                                <td className="px-4 py-2">{c.culture_system}</td>
                                <td className="px-4 py-2">{fmtShort(c.stocking_date)}</td>
                                <td className="px-4 py-2">{c.harvest_volume_kg ? `${Number(c.harvest_volume_kg).toLocaleString()} kg` : '—'}</td>
                                <td className="px-4 py-2">{c.area_cage_harvested || '—'}</td>
                                <td className="px-4 py-2">
                                  <StatusPill tone={CYCLE_STATUS_TONES[c.status] || 'slate'}>{c.status}</StatusPill>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1E4620] hover:bg-[#f0f7f0]"
                                    onClick={() => setSelectedCycle(c)}
                                  >
                                    <Eye size={13} /> View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    }
                      </>
                    )
                    )}

                    {activeTab === 'disasters' && (
                      isLoadingDisasters ? <LoadingSpinner /> :
                      disasters.length === 0 ? (
                        <p className="py-3 text-sm italic text-slate-400">No disaster reports on file.</p>
                      ) : (
                        <table className="min-w-full text-sm">
                          <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-[#1E4620]">
                            <tr>
                              {['Date', 'Type', 'Barangay', 'Vol. Lost (kg)', 'Status'].map((h) => (
                                <th key={h} className="px-4 py-2 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-50">
                            {disasters.map((d, i) => (
                              <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
                                <td className="px-4 py-2">{fmtShort(d.report_date)}</td>
                                <td className="px-4 py-2">{d.disaster_type}</td>
                                <td className="px-4 py-2">{d.affected_barangay}</td>
                                <td className="px-4 py-2">{d.volume_lost_kg ? `${Number(d.volume_lost_kg).toLocaleString()} kg` : '—'}</td>
                                <td className="px-4 py-2">
                                  <StatusPill tone={DISASTER_STATUS_TONES[d.status] || 'slate'}>{d.status}</StatusPill>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}

                    {activeTab === 'assistance' && (
                      <GovernmentAssistanceTab fisherfolkId={parseInt(id)} />
                    )}
                  </div>
                </section>
              )
            })()}
          </>
        )}
      </div>

      {isHistoryModalOpen && (
        <AssistanceHistoryModal
          error={historyError}
          history={history}
          isLoading={isLoadingHistory}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}

      {isEditModalOpen && fisherfolk && (
        <EditFisherfolkModal
          fisherfolk={fisherfolk}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={fetchFisherfolk}
        />
      )}
      {selectedCycle && (
        <AquacultureCycleDetailModal
          cycle={selectedCycle}
          onClose={() => setSelectedCycle(null)}
          onRefresh={fetchAquaCycles}
        />
      )}
      {showStartCycle && fisherfolk && (
        <StartProductionCycleModal
          fisherfolk={fisherfolk}
          onClose={() => setShowStartCycle(false)}
          onSuccess={() => { setShowStartCycle(false); fetchAquaCycles() }}
        />
      )}
    </PageLayout>
  )
}

export default FisherfolkDetailPage
