import React, { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardList, Edit, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ActivateCitizenAccountButton from '../../components/ActivateCitizenAccountButton.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import AddFarmParcelModal from './AddFarmParcelModal.jsx'
import EditFarmerModal from './EditFarmerModal.jsx'

const MONITORING_STATUS_TONES = { Planted: 'green', 'Near Harvest': 'amber', Harvested: 'blue', 'Total Loss': 'rose' }

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
      <p className="text-[12px] text-[#7A8E7A] mb-0.5">{label}</p>
      <p className="text-[14px] font-medium text-[#1A2B1A]">{value || '-'}</p>
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
      <p className="py-2 text-[13px] italic text-[#7A8E7A]">{emptyText}</p>
    )
  }
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white">
        <tr>
          {columns.map((col) => (
            <th key={col.key} className="px-3 py-2 text-left">{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F0F4F0]">
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9FAF9]'}>
            {columns.map((col) => (
              <td key={col.key} className="px-3 py-2 text-[#1A2B1A]">
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
  if (records.length === 0) return <p className="py-1 text-[12px] italic text-[#7A8E7A]">No monitoring records for this parcel.</p>

  return (
    <table className="min-w-full text-xs">
      <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white">
        <tr>
          {['Crop', 'Season/Year', 'Date Planted', 'Exp. Harvest', 'Status', 'Est. Yield (kg)', 'Act. Yield (kg)'].map((h) => (
            <th key={h} className="px-3 py-1.5 text-left">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F0F4F0]">
        {records.map((r, i) => (
          <React.Fragment key={r.id}>
            <tr className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9FAF9]'}>
              <td className="px-3 py-1.5 text-[#1A2B1A]">{r.crop_type_name}</td>
              <td className="px-3 py-1.5 text-[#1A2B1A]">{r.season} {r.year}</td>
              <td className="px-3 py-1.5 text-[#1A2B1A]">{fmt(r.date_planted)}</td>
              <td className="px-3 py-1.5 text-[#1A2B1A]">{fmt(r.expected_harvest_date)}</td>
              <td className="px-3 py-1.5">
                <StatusPill tone={MONITORING_STATUS_TONES[r.status] || 'slate'}>{r.status}</StatusPill>
              </td>
              <td className="px-3 py-1.5 text-[#1A2B1A]">{r.estimated_yield_kg ? parseFloat(r.estimated_yield_kg).toLocaleString() : '—'}</td>
              <td className="px-3 py-1.5 text-[#1A2B1A]">{r.actual_yield_kg ? parseFloat(r.actual_yield_kg).toLocaleString() : '—'}</td>
            </tr>
            <tr className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9FAF9]'}>
              <td colSpan={7} className="px-3 pb-2 pt-0 text-[11px] text-[#7A8E7A]">
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
      <tr className="border-b border-[#F0F4F0] bg-white hover:bg-[#F9FAF9] transition-colors">
        <td className="px-4 py-3 text-[13px] text-[#1A2B1A]">{parcel.parcel_number}</td>
        <td className="px-4 py-3 text-[13px] text-[#1A2B1A]">{parcel.area_hectares}</td>
        <td className="px-4 py-3 text-[13px] text-[#1A2B1A]">{parcel.land_ownership}</td>
        <td className="px-4 py-3 text-[13px] text-[#1A2B1A]">{parcel.commodity_name || '-'}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              parcel.farm_status === 'Active'
                ? 'bg-[#EBF5EE] text-[#1B4D2E]'
                : 'bg-[#F0F4F0] text-[#7A8E7A]'
            }`}
          >
            {parcel.farm_status}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <button
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
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
          <td colSpan={6} className="bg-[#EBF5EE]/20 px-6 py-4">
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
                  Crops Grown
                </p>
                <div className="overflow-hidden rounded-lg border border-[#E2E8E2]">
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
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
                  Agricultural Machinery
                </p>
                <div className="overflow-hidden rounded-lg border border-[#E2E8E2]">
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
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
                  Crop Monitoring Records
                </p>
                <div className="overflow-hidden rounded-lg border border-[#E2E8E2]">
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

  return (
    <PageLayout title="Farmer Details" subtitle="View and manage farmer profile and farm parcels">
      <div className="space-y-4">
        {/* Back link */}
        <Link
          className="inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline"
          to="/farmers"
        >
          <ArrowLeft size={14} />
          Back to Farmers
        </Link>

        {farmerError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
            {farmerError}
          </div>
        )}

        {isLoadingFarmer && (
          <div className="flex min-h-56 items-center justify-center bg-white border border-[#E2E8E2] rounded-xl">
            <LoadingSpinner size={28} />
          </div>
        )}

        {!isLoadingFarmer && farmer && (
          <div className="bg-white border border-[#E2E8E2] rounded-xl p-6">
            {/* Farmer header */}
            <div className="mb-5 flex flex-col gap-3 border-b border-[#E2E8E2] pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[20px] font-semibold text-[#1A2B1A]">{farmer.full_name}</h1>
                  <StatusPill tone={farmer.is_active ? 'green' : 'rose'}>
                    {farmer.is_active ? 'Active' : 'Inactive'}
                  </StatusPill>
                  {farmer.is_senior_citizen && (
                    <StatusPill tone="amber">Senior Citizen</StatusPill>
                  )}
                  {farmer.is_affected_by_disaster && (
                    <StatusPill tone="rose">Affected by Disaster</StatusPill>
                  )}
                </div>
                <p className="mt-1 text-[13px] font-medium text-[#4A5E4A]">
                  RSBSA Number: {farmer.rsbsa_number}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon={ClipboardList} onClick={openHistory} variant="outline">
                  View Assistance History
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
                {(isAdmin || isEvaluator) && (
                  <ActivateCitizenAccountButton
                    citizenAccount={farmer.citizen_account}
                    personLabel={farmer.full_name}
                    onActivated={fetchFarmer}
                  />
                )}
              </div>
            </div>

            {/* Info grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            {(farmer.is_pwd || farmer.is_4ps_beneficiary || farmer.is_icc_ip_member || farmer.is_senior_citizen || farmer.is_farm_laborer) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {farmer.is_pwd && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[12px] font-medium text-blue-700 ring-1 ring-blue-200">
                    Person with Disability (PWD)
                  </span>
                )}
                {farmer.is_4ps_beneficiary && (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-[12px] font-medium text-green-700 ring-1 ring-green-200">
                    4Ps Beneficiary
                  </span>
                )}
                {farmer.is_icc_ip_member && (
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-[12px] font-medium text-purple-700 ring-1 ring-purple-200">
                    ICC/IP Member{farmer.icc_ip_name ? ` — ${farmer.icc_ip_name}` : ''}
                  </span>
                )}
                {farmer.is_senior_citizen && (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-700 ring-1 ring-amber-200">
                    Senior Citizen
                  </span>
                )}
                {farmer.is_farm_laborer && (
                  <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-[12px] font-medium text-orange-700 ring-1 ring-orange-200">
                    Farm Laborer
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Farm Parcels */}
        <div className="bg-white border border-[#E2E8E2] rounded-xl p-6">
          <h2 className="text-[14px] font-semibold text-[#1A2B1A] mb-4">Farm Parcels</h2>

          {parcelError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
              {parcelError}
            </div>
          )}

          {isLoadingParcels ? (
            <div className="flex min-h-24 items-center justify-center">
              <LoadingSpinner size={24} />
            </div>
          ) : parcels.length === 0 ? (
            <p className="rounded-lg border border-[#E2E8E2] bg-[#EBF5EE]/30 px-4 py-3 text-[13px] text-[#4A5E4A]">
              No farm parcels registered.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#E2E8E2]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white">
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
        </div>

        {/* Visit History */}
        <div className="bg-white border border-[#E2E8E2] rounded-xl p-6">
          <h2 className="text-[14px] font-semibold text-[#1A2B1A] mb-4">Visit History</h2>
          {isLoadingVisits ? (
            <LoadingSpinner />
          ) : visitHistory.length === 0 ? (
            <p className="text-[13px] italic text-[#7A8E7A]">No farm visits recorded for this farmer.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#E2E8E2]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white">
                  <tr>
                    {['Visit Date', 'Next Visit', 'Purpose', 'Notes'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F0]">
                  {visitHistory.map((v, i) => {
                    const fmt = (d) => d ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d)) : '—'
                    return (
                      <tr key={v.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9FAF9]'}>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{fmt(v.visit_date)}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{fmt(v.next_visit_date)}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{v.purpose}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#7A8E7A]">{v.notes || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
