import React, { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardList, Edit, FileText, Plus } from 'lucide-react'
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
import { downloadFile } from '../../utils/fileDownload.js'
import { declaredCropName, sameCrop } from '../../utils/cropNames.js'
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

// Rebuilt against the same reference (PROFILE BASIS.docx / screenshots) used
// for the Staff/Admin profile and the citizen "Aking Profile" screens:
// cover-banner identity card + a separate colored-header info card. Farmer
// and Fisherfolk detail pages share this exact structure -- see FisherfolkDetailPage
// for the identical pattern in blue (--color-cz-fish-header, #1B4457) instead
// of this green. Staff-specific action buttons (Edit, Generate Report, etc.)
// have no equivalent in the citizen reference, so they sit in the identity
// card where "Edit Profile" sits on the Admin/Staff profile page.
function initialsOf(fullName) {
  return (fullName || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?'
}

const HISTORY_COLUMNS = [
  { key: 'assistance_type', label: 'Assistance Type' },
  { key: 'source_agency', label: 'Source Agency' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'season', label: 'Season' },
  { key: 'year', label: 'Year' },
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
  const [cropRecords, setCropRecords] = useState([])
  const [isLoadingFarmer, setIsLoadingFarmer] = useState(true)
  const [isLoadingParcels, setIsLoadingParcels] = useState(true)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingVisits, setIsLoadingVisits] = useState(false)
  const [isLoadingCrops, setIsLoadingCrops] = useState(true)
  const [farmerError, setFarmerError] = useState('')
  const [parcelError, setParcelError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [cropError, setCropError] = useState('')
  const [isParcelModalOpen, setIsParcelModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

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
      const response = await api.get('/interventions/beneficiaries/adhoc/', { params: { farmer: id } })
      const rows = Array.isArray(response.data) ? response.data : (response.data.results || [])
      // source_agency was a single string; is now source_agencies (a list)
      // on the API — DataTable does a raw row[column.key] lookup with no
      // render-function support, so the join happens here, keyed back onto
      // the same 'source_agency' column name HISTORY_COLUMNS already uses.
      setHistory(rows.map((r) => ({ ...r, source_agency: (r.source_agencies || []).join(', ') })))
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

  // Queried directly by farmer_id — NOT derived from `parcels` (unlike the
  // per-parcel CropMonitoringSubSection above, nested under each parcel's
  // own "Details" expansion). A crop monitoring record's farm_parcel link
  // is optional, so a farmer with real crop records but zero registered
  // parcels previously had no code path on this page that could ever show
  // them, even though the main Crop Records list (which queries by status/
  // season/barangay, not by parcel) found them fine.
  const fetchCropRecords = async () => {
    setIsLoadingCrops(true)
    setCropError('')
    try {
      // Explicit full status list, not omitted: an omitted `status` makes
      // the backend default to excluding Total Loss (right for the
      // operational Crop Records list, wrong for a farmer's own complete
      // history — a total-loss record is still part of what happened on
      // this farmer's land).
      const r = await api.get('/production/monitoring/', {
        params: { farmer: id, status: 'Planted,Near Harvest,Harvested,Total Loss' },
      })
      setCropRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setCropError('Unable to load crop monitoring records.')
    } finally {
      setIsLoadingCrops(false)
    }
  }

  // Crops declared on a parcel that have no monitoring record yet. A declared
  // crop is only a registration entry — it has no planting date, season or
  // yield — so it is listed beside the real records as "Not yet monitored"
  // rather than turned into a made-up monitoring record.
  const unmonitoredCrops = isLoadingParcels || isLoadingCrops ? [] : parcels
    .flatMap((p) => (p.crops || []).map((c) => ({
      id: `declared-${c.id}`,
      parcel: p,
      crop: c,
      name: declaredCropName(c),
    })))
    .filter(({ parcel, name }) => !cropRecords.some(
      (r) => sameCrop(r.crop_type_name, name) && (!r.farm_parcel || r.farm_parcel === parcel.id),
    ))

  useEffect(() => {
    fetchFarmer()
    fetchParcels()
    fetchVisits()
    fetchCropRecords()
  }, [id])

  const openHistory = () => {
    setIsHistoryModalOpen(true)
    fetchHistory()
  }

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true)
    try {
      await downloadFile(api, `/reports/farmers/${id}/profile/`, `farmer_profile_${id}.pdf`)
    } catch {
      showToast('Failed to generate report.', 'error')
    } finally {
      setIsGeneratingReport(false)
    }
  }

  return (
    <PageLayout title="Farmer Details" subtitle="View and manage farmer profile and farm parcels">
      <div className="space-y-4">
        {/* Back link + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline"
            to="/farmers"
          >
            <ArrowLeft size={14} />
            Back to Farmers
          </Link>
          {!isLoadingFarmer && farmer && (
            <div className="flex flex-wrap gap-2">
              <Button icon={ClipboardList} onClick={openHistory} variant="outline">
                View Assistance History
              </Button>
              <Button icon={FileText} onClick={handleGenerateReport} variant="outline" isLoading={isGeneratingReport}>
                Generate Report
              </Button>
              {(isAdmin || isEvaluator) && (
                <Button icon={Plus} onClick={() => setIsParcelModalOpen(true)} variant="outline">
                  Add Farm Parcel
                </Button>
              )}
              {(isAdmin || isEvaluator) && (
                <Button icon={Edit} onClick={() => setIsEditModalOpen(true)} variant="primary">
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
          )}
        </div>

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
          <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
            {/* Identity card */}
            <div className="lg:sticky lg:top-20">
              <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="h-20 bg-[#1B4D2E]" />
                <div className="px-5 pb-5 -mt-8">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#1B4D2E] bg-white text-[18px] font-semibold text-[#1B4D2E]">
                    {initialsOf(farmer.full_name)}
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8]">Name</p>
                  <h1 className="mt-0.5 text-[16px] font-semibold text-[#1A2B1A]">{farmer.full_name}</h1>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusPill tone={farmer.is_active ? 'green' : 'rose'}>
                      {farmer.is_active ? 'Active' : 'Inactive'}
                    </StatusPill>
                    {farmer.is_senior_citizen && <StatusPill tone="amber">Senior Citizen</StatusPill>}
                  </div>
                </div>
              </section>

              <div className="mt-3 rounded-xl border border-[#E2E8E2] bg-[#EBF5EE] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E]">RSBSA Number</p>
                <p className="mt-1 text-[13px] font-semibold text-[#1A2B1A]">{farmer.rsbsa_number}</p>
              </div>
            </div>

            <div className="space-y-4 lg:sticky lg:top-20">
              {/* Personal Information card */}
              <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-3.5 bg-[#EBF5EE] border-b border-[#E2E8E2]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E]">Personal Information</p>
                </div>
                <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                </div>
              </section>

              {/* Reference Information card */}
              <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-3.5 bg-[#EBF5EE] border-b border-[#E2E8E2]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E]">Reference Information</p>
                </div>
                <div className="p-5">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Civil Status" value={farmer.civil_status} />
                    <Field label="Highest Education" value={farmer.highest_education} />
                    <Field label="Date Registered" value={formatDate(farmer.date_registered)} />
                    {farmer.philsys_number && (
                      <Field label="PhilSys / National ID No." value={farmer.philsys_number} />
                    )}
                    <div>
                      {/* Batch (Phase B): a farmer can belong to several
                          organizations at once — shows every membership,
                          the main one marked, inactive ones muted. */}
                      <p className="text-[12px] text-[#7A8E7A] mb-0.5">
                        {(farmer.organizations || []).length > 1 ? 'Organizations' : 'Organization'}
                      </p>
                      {(farmer.organizations || []).length === 0 ? (
                        <p className="text-[14px] font-medium italic text-[#A8BCA8]">Not part of any organization</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {farmer.organizations.map(o => (
                            <span
                              key={o.membership_id}
                              className={`inline-flex items-center gap-1 text-[14px] font-medium ${
                                o.is_active ? 'text-[#1A2B1A]' : 'text-[#A8BCA8]'
                              }`}
                            >
                              {o.organization_name}
                              {o.is_main && o.is_active && (
                                <span className="inline-flex items-center rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[11px] font-medium text-[#1B4D2E] align-middle">
                                  Main
                                </span>
                              )}
                              {!o.is_active && (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 align-middle">
                                  Inactive
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RSBSA Classification badges */}
                  {(farmer.is_pwd || farmer.is_4ps_beneficiary || farmer.is_icc_ip_member || farmer.is_senior_citizen || farmer.is_farm_laborer) && (
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[#F0F4F0] pt-4">
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
              </section>
            </div>
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

        {/* Crop Monitoring Records — this farmer's complete crop history,
            queried directly by farmer_id (not nested per-parcel like the
            table inside each Farm Parcel row's "Details" expansion above,
            which only ever shows records that have a farm_parcel link). */}
        <div className="bg-white border border-[#E2E8E2] rounded-xl p-6">
          <h2 className="text-[14px] font-semibold text-[#1A2B1A] mb-4">Crop Monitoring Records</h2>

          {cropError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
              {cropError}
            </div>
          )}

          {isLoadingCrops ? (
            <div className="flex min-h-24 items-center justify-center">
              <LoadingSpinner size={24} />
            </div>
          ) : cropRecords.length === 0 && unmonitoredCrops.length === 0 ? (
            <p className="rounded-lg border border-[#E2E8E2] bg-[#EBF5EE]/30 px-4 py-3 text-[13px] text-[#4A5E4A]">
              No crop monitoring records for this farmer.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#E2E8E2]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white">
                  <tr>
                    {['Crop', 'Season/Year', 'Date Planted', 'Exp. Harvest', 'Status', 'Est. Yield (kg)', 'Act. Yield (kg)'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F4F0]">
                  {cropRecords.map((r, i) => {
                    const fmt = (v) => v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v)) : '—'
                    return (
                      <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9FAF9]'}>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{r.crop_type_name}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{r.season} {r.year}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{fmt(r.date_planted)}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{fmt(r.expected_harvest_date)}</td>
                        <td className="px-4 py-2.5">
                          <StatusPill tone={MONITORING_STATUS_TONES[r.status] || 'slate'}>{r.status}</StatusPill>
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{r.estimated_yield_kg ? parseFloat(r.estimated_yield_kg).toLocaleString() : '—'}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">{r.actual_yield_kg ? parseFloat(r.actual_yield_kg).toLocaleString() : '—'}</td>
                      </tr>
                    )
                  })}
                  {unmonitoredCrops.map(({ id: rowId, parcel, crop, name }, i) => (
                    <tr key={rowId} className={(cropRecords.length + i) % 2 === 0 ? 'bg-white' : 'bg-[#F9FAF9]'}>
                      <td className="px-4 py-2.5 text-[13px] text-[#1A2B1A]">
                        {name}
                        <span className="mt-0.5 block text-[11px] font-normal text-[#7A8E7A]">
                          Declared on {parcel.parcel_number ? `parcel ${parcel.parcel_number}` : `parcel #${parcel.id}`} · {parseFloat(crop.area_hectares)} ha{crop.is_main_crop ? ' · Main crop' : ''}
                        </span>
                        {(isAdmin || isEvaluator) && (
                          <Link
                            to="/crop-records/add"
                            state={{ prefill: {
                              farmerId: farmer.id,
                              rsbsa: farmer.rsbsa_number,
                              parcel: { id: parcel.id, barangay: parcel.barangay, landOwnership: parcel.land_ownership },
                              cropName: name,
                              areaHa: parseFloat(crop.area_hectares),
                            } }}
                            className="mt-1 inline-block text-[12px] font-medium text-[#1B4D2E] hover:underline"
                          >
                            Start monitoring
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#7A8E7A]">—</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#7A8E7A]">—</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#7A8E7A]">—</td>
                      <td className="px-4 py-2.5">
                        <StatusPill tone="slate">Not yet monitored</StatusPill>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#7A8E7A]">—</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#7A8E7A]">—</td>
                    </tr>
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
