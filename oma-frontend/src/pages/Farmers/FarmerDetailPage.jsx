import React, { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardList, Edit, FileDown, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import AddFarmParcelModal from './AddFarmParcelModal.jsx'
import EditFarmerModal from './EditFarmerModal.jsx'

const MONITORING_STATUS_TONES = { Active: 'green', Harvested: 'blue', Damaged: 'rose', Abandoned: 'slate' }

function formatDate(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
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

function SubTable({ columns, rows, emptyText }) {
  if (!rows || rows.length === 0) {
    return (
      <p className="py-2 text-sm italic text-slate-400">{emptyText}</p>
    )
  }
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-[#1E4620]">
        <tr>
          {columns.map((col) => (
            <th key={col.key} className="px-3 py-2 text-left">{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-green-50">
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
            {columns.map((col) => (
              <td key={col.key} className="px-3 py-2 text-slate-700">
                {row[col.key] ?? '-'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CropMonitoringSubSection({ parcelId }) {
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    setIsLoading(true)
    api.get(`/production/monitoring/?farm_parcel=${parcelId}`)
      .then((r) => setRecords(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => setRecords([]))
      .finally(() => { setIsLoading(false); setLoaded(true) })
  }, [parcelId, loaded])

  const fmt = (v) => v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v)) : '—'

  if (isLoading) return <LoadingSpinner />
  if (records.length === 0) return <p className="py-1 text-xs italic text-slate-400">No monitoring records for this parcel.</p>

  return (
    <table className="min-w-full text-xs">
      <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-[#1E4620]">
        <tr>
          {['Crop', 'Season/Year', 'Date Planted', 'Exp. Harvest', 'Status', 'Est. Yield (kg)', 'Act. Yield (kg)'].map((h) => (
            <th key={h} className="px-3 py-1.5 text-left">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-green-50">
        {records.map((r, i) => (
          <React.Fragment key={r.id}>
            <tr className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
              <td className="px-3 py-1.5">{r.crop_type_name}</td>
              <td className="px-3 py-1.5">{r.season} {r.year}</td>
              <td className="px-3 py-1.5">{fmt(r.date_planted)}</td>
              <td className="px-3 py-1.5">{fmt(r.expected_harvest_date)}</td>
              <td className="px-3 py-1.5">
                <StatusPill tone={MONITORING_STATUS_TONES[r.status] || 'slate'}>{r.status}</StatusPill>
              </td>
              <td className="px-3 py-1.5">{r.estimated_yield_kg ? parseFloat(r.estimated_yield_kg).toLocaleString() : '—'}</td>
              <td className="px-3 py-1.5">{r.actual_yield_kg ? parseFloat(r.actual_yield_kg).toLocaleString() : '—'}</td>
            </tr>
            <tr className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
              <td colSpan={7} className="px-3 pb-2 pt-0 text-[11px] text-slate-400">
                {(r.log_count ?? 0)} activity log{(r.log_count ?? 0) !== 1 ? 's' : ''}
                {' · '}
                {(r.labor_log_count ?? 0)} operation{(r.labor_log_count ?? 0) !== 1 ? 's' : ''} logged
              </td>
            </tr>
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}

function ParcelRow({ parcel }) {
  const [expanded, setExpanded] = useState(false)

  const cropRows = (parcel.crops || []).map((c) => ({
    crop_name: c.crop_name === 'Other' ? c.crop_name_other : c.crop_name,
    area_hectares: c.area_hectares,
    main_crop_pill: c.is_main_crop ? (
      <StatusPill tone="green">Main</StatusPill>
    ) : null,
  }))

  const machineryRows = (parcel.machinery || []).map((m) => ({
    machinery_type: m.machinery_type === 'Other' ? m.machinery_type_other : m.machinery_type,
    quantity: m.quantity,
    ownership: m.ownership,
  }))

  return (
    <>
      <tr className="border-b border-green-50 bg-white hover:bg-[#f0f7f0]">
        <td className="px-4 py-3 text-slate-700">{parcel.parcel_number}</td>
        <td className="px-4 py-3 text-slate-700">{parcel.area_hectares}</td>
        <td className="px-4 py-3 text-slate-700">{parcel.land_ownership}</td>
        <td className="px-4 py-3 text-slate-700">{parcel.commodity_name || '-'}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
              parcel.farm_status === 'Active'
                ? 'bg-green-100 text-[#1E4620]'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {parcel.farm_status}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <button
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[#1E4620] hover:bg-green-100"
            onClick={() => setExpanded((v) => !v)}
            type="button"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {expanded ? 'Hide' : 'Details'}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={6} className="bg-[#f0fdf4] px-6 py-4">
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Crops Grown
                </p>
                <div className="overflow-hidden rounded border border-green-100">
                  <SubTable
                    columns={[
                      { key: 'crop_name', label: 'Crop' },
                      { key: 'area_hectares', label: 'Area (ha)' },
                      { key: 'main_crop_pill', label: 'Main Crop' },
                    ]}
                    rows={cropRows}
                    emptyText="None recorded"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Agricultural Machinery
                </p>
                <div className="overflow-hidden rounded border border-green-100">
                  <SubTable
                    columns={[
                      { key: 'machinery_type', label: 'Type' },
                      { key: 'quantity', label: 'Qty' },
                      { key: 'ownership', label: 'Ownership' },
                    ]}
                    rows={machineryRows}
                    emptyText="None recorded"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Crop Monitoring Records
                </p>
                <div className="overflow-hidden rounded border border-green-100">
                  <CropMonitoringSubSection parcelId={parcel.id} />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function FarmerDetailPage() {
  const { id } = useParams()
  const { isAdmin, isEvaluator } = useAuth()
  const { showToast } = useToast()
  const [farmer, setFarmer] = useState(null)
  const [parcels, setParcels] = useState([])
  const [history, setHistory] = useState([])
  const [visitHistory, setVisitHistory] = useState([])
  const [isLoadingFarmer, setIsLoadingFarmer] = useState(true)
  const [isLoadingParcels, setIsLoadingParcels] = useState(true)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingVisits, setIsLoadingVisits] = useState(false)
  const [farmerError, setFarmerError] = useState('')
  const [parcelError, setParcelError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [isParcelModalOpen, setIsParcelModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDownloadingProfile, setIsDownloadingProfile] = useState(false)

  const fetchFarmer = async () => {
    setIsLoadingFarmer(true)
    setFarmerError('')

    try {
      const response = await api.get(`/farmers/${id}/`)
      setFarmer(response.data)
    } catch {
      setFarmerError('Unable to load farmer profile.')
    } finally {
      setIsLoadingFarmer(false)
    }
  }

  const fetchParcels = async () => {
    setIsLoadingParcels(true)
    setParcelError('')

    try {
      const response = await api.get(`/farmers/${id}/parcels/`)
      setParcels(Array.isArray(response.data) ? response.data : response.data.results || [])
    } catch {
      setParcelError('Unable to load farm parcels.')
    } finally {
      setIsLoadingParcels(false)
    }
  }

  const fetchHistory = async () => {
    setIsLoadingHistory(true)
    setHistoryError('')

    try {
      const response = await api.get(`/interventions/farmer-history/${id}/`)
      setHistory(Array.isArray(response.data) ? response.data : [])
    } catch {
      setHistoryError('Unable to load assistance history.')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const fetchVisits = async () => {
    setIsLoadingVisits(true)
    try {
      const r = await api.get(`/monitoring/farm-visits/?farmer=${id}`)
      setVisitHistory(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setVisitHistory([]) }
    finally { setIsLoadingVisits(false) }
  }

  useEffect(() => {
    fetchFarmer()
    fetchParcels()
    fetchVisits()
  }, [id])

  const openHistory = () => {
    setIsHistoryModalOpen(true)
    fetchHistory()
  }

  const handlePrintProfile = async () => {
    setIsDownloadingProfile(true)
    try {
      await downloadFile(api, `/reports/farmers/${id}/profile/`, 'farmer_profile.pdf')
      showToast('Farmer profile PDF downloaded successfully.', 'success')
    } catch {
      showToast('Could not download the profile. Please try again.', 'error')
    } finally {
      setIsDownloadingProfile(false)
    }
  }

  return (
    <PageLayout title="Farmer Details" subtitle="View and manage farmer profile and farm parcels">
      <div className="space-y-5">
        <Link
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          to="/farmers"
        >
          <ArrowLeft size={16} />
          Back to Farmers List
        </Link>

        {farmerError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {farmerError}
          </div>
        )}

        {isLoadingFarmer && (
          <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-100 bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-100 border-t-[#16a34a]" />
          </div>
        )}

        {!isLoadingFarmer && farmer && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6">
            <div className="mb-6 flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900">{farmer.full_name}</h1>
                  <StatusPill tone={farmer.is_active ? 'green' : 'rose'}>
                    {farmer.is_active ? 'Active' : 'Inactive'}
                  </StatusPill>
                  {farmer.is_senior_citizen && (
                    <StatusPill tone="amber">Senior Citizen</StatusPill>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-slate-600">
                  RSBSA Number: {farmer.rsbsa_number}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon={ClipboardList} onClick={openHistory} variant="outline">
                  View Assistance History
                </Button>

                <Button
                  icon={FileDown}
                  isLoading={isDownloadingProfile}
                  onClick={handlePrintProfile}
                  variant="secondary"
                >
                  {isDownloadingProfile ? 'Downloading...' : 'Download Profile PDF'}
                </Button>

                {(isAdmin || isEvaluator) && (
                  <Button icon={Plus} onClick={() => setIsParcelModalOpen(true)} variant="primary">
                    Add Farm Parcel
                  </Button>
                )}
                {(isAdmin || isEvaluator) && (
                  <Button icon={Edit} onClick={() => setIsEditModalOpen(true)} variant="outline">
                    Edit Farmer
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {farmer.prefix && <Field label="Prefix" value={farmer.prefix} />}
              <Field label="First Name" value={farmer.first_name} />
              <Field label="Last Name" value={farmer.last_name} />
              <Field label="Middle Name" value={farmer.middle_name} />
              <Field label="Gender" value={farmer.gender} />
              <Field label="Birthdate" value={formatDate(farmer.birthdate)} />
              <Field label="Contact Number" value={farmer.contact_number} />
              <Field label="Barangay" value={farmer.barangay} />
              <Field label="Municipality" value={farmer.municipality} />
              <Field label="Province" value={farmer.province} />
              <Field label="Civil Status" value={farmer.civil_status} />
              <Field label="Highest Education" value={farmer.highest_education} />
              <Field label="Date Registered" value={formatDate(farmer.date_registered)} />
              {farmer.philsys_number && (
                <Field label="PhilSys / National ID No." value={farmer.philsys_number} />
              )}
            </div>

            {/* RSBSA Classification badges */}
            {(farmer.is_pwd || farmer.is_4ps_beneficiary || farmer.is_icc_ip_member) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {farmer.is_pwd && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                    Person with Disability (PWD)
                  </span>
                )}
                {farmer.is_4ps_beneficiary && (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                    4Ps Beneficiary
                  </span>
                )}
                {farmer.is_icc_ip_member && (
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 ring-1 ring-purple-200">
                    ICC/IP Member{farmer.icc_ip_name ? ` — ${farmer.icc_ip_name}` : ''}
                  </span>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Farm Parcels</h2>
          </div>

          {parcelError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {parcelError}
            </div>
          )}

          {isLoadingParcels ? (
            <div className="flex min-h-24 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-100 border-t-[#16a34a]" />
            </div>
          ) : parcels.length === 0 ? (
            <p className="rounded-md border border-green-100 bg-[#f0f7f0] px-4 py-3 text-sm font-medium text-slate-600">
              No farm parcels registered.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-green-100">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-green-800">
                  <tr>
                    <th className="px-4 py-3">Parcel No.</th>
                    <th className="px-4 py-3">Area (ha)</th>
                    <th className="px-4 py-3">Ownership</th>
                    <th className="px-4 py-3">Commodity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((parcel) => (
                    <ParcelRow key={parcel.id} parcel={parcel} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Visit History */}
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">Visit History</h2>
          {isLoadingVisits ? (
            <LoadingSpinner />
          ) : visitHistory.length === 0 ? (
            <p className="text-sm italic text-slate-400">No farm visits recorded for this farmer.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-[#1E4620]">
                <tr>
                  {['Visit Date', 'Next Visit', 'Purpose', 'Notes'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-green-50">
                {visitHistory.map((v, i) => {
                  const fmt = (d) => d ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d)) : '—'
                  return (
                    <tr key={v.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
                      <td className="px-4 py-2 text-slate-700">{fmt(v.visit_date)}</td>
                      <td className="px-4 py-2 text-slate-700">{fmt(v.next_visit_date)}</td>
                      <td className="px-4 py-2 text-slate-700">{v.purpose}</td>
                      <td className="px-4 py-2 text-slate-500">{v.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {isParcelModalOpen && (
        <AddFarmParcelModal
          farmerId={id}
          onClose={() => setIsParcelModalOpen(false)}
          onSuccess={fetchParcels}
        />
      )}

      {isHistoryModalOpen && (
        <AssistanceHistoryModal
          error={historyError}
          history={history}
          isLoading={isLoadingHistory}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}

      {isEditModalOpen && farmer && (
        <EditFarmerModal
          farmer={farmer}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={fetchFarmer}
        />
      )}
    </PageLayout>
  )
}

export default FarmerDetailPage
