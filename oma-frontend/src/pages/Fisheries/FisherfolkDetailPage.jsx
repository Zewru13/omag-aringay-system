import { useEffect, useState } from 'react'
import { ArrowLeft, ClipboardList, Edit, FileText, Layers, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ActivateCitizenAccountButton from '../../components/ActivateCitizenAccountButton.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import EditFisherfolkModal from './EditFisherfolkModal.jsx'
import PondModal from './PondModal.jsx'
import BulkPondModal from './BulkPondModal.jsx'

const HISTORY_COLUMNS = [
  { key: 'assistance_type', label: 'Assistance Type' },
  { key: 'source_agency', label: 'Source Agency' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'season', label: 'Season' },
  { key: 'year', label: 'Year' },
  { key: 'date_given', label: 'Date Given' },
]

const STOCKING_STATUS_TONES = {
  Stocked: 'green',
  'Near Harvest': 'amber',
  Harvested: 'blue',
  'Total Loss': 'rose',
}

const STOCKING_COLUMNS = [
  { key: 'species_name',         label: 'SPECIES' },
  { key: 'culture_type',         label: 'CULTURE TYPE' },
  { key: 'date_stocked_fmt',     label: 'DATE STOCKED' },
  { key: 'expected_harvest_fmt', label: 'EXPECTED HARVEST' },
  { key: 'est_kg_fmt',           label: 'EST. HARVEST (KG)' },
  { key: 'harvested_kg_fmt',     label: 'HARVESTED (KG)' },
  { key: 'pond_location_barangay', label: 'POND BARANGAY' },
  { key: 'status_cell',          label: 'STATUS' },
]

const POND_COLUMNS = [
  { key: 'name',            label: 'NAME' },
  { key: 'barangay',        label: 'BARANGAY' },
  { key: 'area_fmt',        label: 'AREA (HA)' },
  { key: 'water_source',    label: 'WATER SOURCE' },
  { key: 'history_fmt',     label: 'STOCKING HISTORY' },
  { key: 'status_pill',     label: 'STATUS' },
  { key: 'actions_cell',    label: 'ACTIONS' },
]

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(value))
}

function fmtShort(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(v + 'T00:00:00'),
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[12px] text-[#7A8E7A] mb-0.5">{label}</p>
      <p className="text-[14px] font-medium text-[#1A2B1A]">{value || '-'}</p>
    </div>
  )
}

function initialsOf(fullName) {
  return (fullName || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?'
}

const otherLabel = (value, specify) => (value === 'Other' && specify ? `Other — ${specify}` : value)

function AssistanceHistoryModal({ history, isLoading, error, onClose }) {
  return (
    <ModalShell title="Assistance History" onClose={onClose} maxWidth="max-w-3xl">
      {isLoading ? <LoadingSpinner /> : error ? <ErrorMessage message={error} /> : (
        <DataTable columns={HISTORY_COLUMNS} data={history} isLoading={false} />
      )}
    </ModalShell>
  )
}

function AquacultureSection({ record }) {
  return (
    <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <h2 className="mb-4 text-[14px] font-semibold text-[#1A2B1A]">Aquaculture Record</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Culture Type" value={otherLabel(record.culture_type, record.culture_type_other_specify)} />
        <Field label="Species Cultured" value={otherLabel(record.species_cultured, record.species_cultured_other_specify)} />
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
    <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <h2 className="mb-4 text-[14px] font-semibold text-[#1A2B1A]">Facility Profile</h2>
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
    <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <h2 className="mb-4 text-[14px] font-semibold text-[#1A2B1A]">Capture Record</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vessel Type" value={record.vessel_type} />
        {record.vessel_type === 'Motorized' && <Field label="Vessel Material" value={otherLabel(record.vessel_material, record.vessel_material_other_specify)} />}
        <Field label="Vessel Reg. Number" value={record.vessel_registration_number} />
        <Field label="Fishing Gear Type" value={record.fishing_gear_type} />
        <Field label="Fishing Ground" value={record.fishing_ground} />
        <Field label="Avg. Catch / Trip (kg)" value={record.average_catch_per_trip_kg} />
      </div>
    </section>
  )
}


function FisherfolkDetailPage() {
  const { id } = useParams()
  const { isAdmin, isEvaluator } = useAuth()
  const { showToast } = useToast()
  const [fisherfolk, setFisherfolk]       = useState(null)
  const [isLoading, setIsLoading]         = useState(true)
  const [error, setError]                 = useState('')
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen]       = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [history, setHistory]             = useState([])
  const [isLoadingHistory, setIsLoadingHistory]     = useState(false)
  const [historyError, setHistoryError]   = useState('')
  const [stockingRecords, setStockingRecords]       = useState([])
  const [isLoadingStocking, setIsLoadingStocking]   = useState(false)
  const [ponds, setPonds]                 = useState([])
  const [isLoadingPonds, setIsLoadingPonds] = useState(false)
  const [isPondModalOpen, setIsPondModalOpen] = useState(false)
  const [isBulkPondModalOpen, setIsBulkPondModalOpen] = useState(false)
  const [editingPond, setEditingPond]     = useState(null)
  const [deletingPond, setDeletingPond]   = useState(null)
  const [deleteError, setDeleteError]     = useState('')

  const fetchFisherfolk = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await api.get(`/fisheries/fisherfolk/${id}/`)
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
      const response = await api.get('/interventions/fisherfolk-beneficiaries/adhoc/', { params: { fisherfolk: id } })
      const rows = Array.isArray(response.data) ? response.data : (response.data.results || [])
      // See FarmerDetailPage.jsx's own identical comment — source_agency ->
      // source_agencies, joined here since DataTable has no render-function
      // support, keyed back onto the same column name.
      setHistory(rows.map((r) => ({ ...r, source_agency: (r.source_agencies || []).join(', ') })))
    } catch {
      setHistoryError('Unable to load assistance history.')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const fetchStockingRecords = async () => {
    setIsLoadingStocking(true)
    try {
      const r = await api.get('/fisheries/stocking/', {
        params: { fisherfolk: id, status: 'Stocked,Near Harvest,Harvested' },
      })
      setStockingRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setStockingRecords([])
    } finally {
      setIsLoadingStocking(false)
    }
  }

  const fetchPonds = async () => {
    setIsLoadingPonds(true)
    try {
      const r = await api.get(`/fisheries/fisherfolk/${id}/ponds/`)
      setPonds(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setPonds([])
    } finally {
      setIsLoadingPonds(false)
    }
  }

  const toggleActive = async (pond) => {
    try {
      await api.patch(`/fisheries/ponds/${pond.id}/`, { is_active: !pond.is_active })
      showToast(`Pond ${pond.is_active ? 'deactivated' : 'activated'}.`, 'success')
      fetchPonds()
    } catch {
      showToast('Failed to update pond status.', 'error')
    }
  }

  const handleDeletePond = async () => {
    setDeleteError('')
    try {
      await api.delete(`/fisheries/ponds/${deletingPond.id}/`)
      showToast('Pond deleted.', 'success')
      setDeletingPond(null)
      fetchPonds()
    } catch (err) {
      setDeleteError(err?.response?.data?.detail || 'Failed to delete pond.')
    }
  }

  useEffect(() => { fetchFisherfolk() }, [id])

  useEffect(() => {
    if (!fisherfolk) return
    const type = fisherfolk.fisherfolk_type
    if (type === 'Aquaculture' || type === 'Mariculture') {
      fetchStockingRecords()
      fetchPonds()
    }
  }, [fisherfolk])

  const openHistory = () => {
    setIsHistoryModalOpen(true)
    fetchHistory()
  }

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true)
    try {
      await downloadFile(api, `/reports/fisheries/${id}/profile/`, `fisherfolk_profile_${id}.pdf`)
    } catch {
      showToast('Failed to generate report.', 'error')
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const stockingData = stockingRecords.map((r) => ({
    ...r,
    date_stocked_fmt:     fmtShort(r.date_stocked),
    expected_harvest_fmt: fmtShort(r.expected_harvest_date),
    est_kg_fmt:           r.estimated_harvest_kg != null
      ? `${Number(r.estimated_harvest_kg).toLocaleString()} kg` : '—',
    harvested_kg_fmt:     r.total_harvested_kg != null && r.total_harvested_kg > 0
      ? `${Number(r.total_harvested_kg).toLocaleString()} kg` : '—',
    status_cell: (
      <StatusPill tone={STOCKING_STATUS_TONES[r.status] || 'slate'}>{r.status}</StatusPill>
    ),
  }))

  const pondsData = ponds.map((p) => ({
    ...p,
    area_fmt: p.area_hectares != null ? Number(p.area_hectares).toFixed(4) : '—',
    water_source: p.water_source || '—',
    history_fmt: `${p.stocking_record_count} record${p.stocking_record_count === 1 ? '' : 's'}`,
    status_pill: (
      <StatusPill tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Inactive'}</StatusPill>
    ),
    actions_cell: (isAdmin || isEvaluator) ? (
      <div className="flex justify-end">
        <RowActions
          actions={[
            { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditingPond(p) },
            { key: 'toggle', label: p.is_active ? 'Deactivate' : 'Activate', icon: Power, onClick: () => toggleActive(p) },
            p.stocking_record_count === 0 && { key: 'delete', label: 'Delete', icon: Trash2, tone: 'rose', onClick: () => setDeletingPond(p) },
          ]}
        />
      </div>
    ) : null,
  }))

  return (
    <PageLayout title="Fisherfolk Details" subtitle="View and manage fisherfolk profile and records">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1 text-[13px] text-[#155E82] hover:underline max-md:min-h-[40px]"
            to="/fisherfolk"
          >
            <ArrowLeft size={14} />
            Back to Fisherfolk Registry
          </Link>
          {!isLoading && fisherfolk && (
            <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap [&>*]:w-full [&>*]:justify-center md:[&>*]:w-auto [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1">
              <Button icon={ClipboardList} onClick={openHistory} variant="outline">
                View Assistance History
              </Button>
              <Button icon={FileText} onClick={handleGenerateReport} variant="outline" isLoading={isGeneratingReport}>
                Generate Report
              </Button>
              {(isAdmin || isEvaluator) && (
                <Button icon={Edit} onClick={() => setIsEditModalOpen(true)} variant="primary">
                  Edit Profile
                </Button>
              )}
              {(isAdmin || isEvaluator) && (
                <ActivateCitizenAccountButton
                  citizenAccount={fisherfolk.citizen_account}
                  personLabel={fisherfolk.full_name}
                  onActivated={fetchFisherfolk}
                />
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex min-h-56 items-center justify-center rounded-xl border border-[#E2E8E2] bg-white">
            <LoadingSpinner size={28} />
          </div>
        )}

        {!isLoading && fisherfolk && (
          <>
            {/* Identity + Personal Information */}
            <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
              <div className="lg:sticky lg:top-20">
                <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="h-20 bg-[#155E82]" />
                  <div className="px-5 pb-5 -mt-8">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#155E82] bg-white text-[18px] font-semibold text-[#155E82]">
                      {initialsOf(fisherfolk.full_name)}
                    </div>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8]">Name</p>
                    <h1 className="mt-0.5 text-[16px] font-semibold text-[#1A2B1A]">{fisherfolk.full_name}</h1>
                    <p className="mt-0.5 text-xs text-[#7A8E7A]">{fisherfolk.fisherfolk_type}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StatusPill tone={fisherfolk.is_active ? 'green' : 'rose'}>
                        {fisherfolk.is_active ? 'Active' : 'Inactive'}
                      </StatusPill>
                      {fisherfolk.is_senior_citizen && <StatusPill tone="amber">Senior Citizen</StatusPill>}
                      {(fisherfolk.fisherfolk_type === 'Capture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
                        fisherfolk.has_vessel
                          ? <StatusPill tone="green">With Vessel</StatusPill>
                          : <StatusPill tone="slate">No Vessel</StatusPill>
                      )}
                      {fisherfolk.is_affected_by_disaster && <StatusPill tone="rose">Affected by Disaster</StatusPill>}
                    </div>
                  </div>
                </section>

                <div className="mt-3 rounded-xl border border-[#E2E8E2] bg-[#EAF1F5] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#155E82]">RSBSA Number</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#1A2B1A]">{fisherfolk.rsbsa_number}</p>
                </div>

                <div className="mt-3 rounded-xl border border-[#E2E8E2] bg-[#EAF1F5] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#155E82]">LGU Registration Number</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#1A2B1A]">{fisherfolk.lgu_registration_number || '—'}</p>
                </div>
              </div>

              <div className="space-y-4 lg:sticky lg:top-20">
                <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3.5 bg-[#EAF1F5] border-b border-[#E2E8E2]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#155E82]">Personal Information</p>
                  </div>
                  <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {fisherfolk.prefix && <Field label="Prefix" value={fisherfolk.prefix} />}
                    <Field label="First Name" value={fisherfolk.first_name} />
                    <Field label="Last Name" value={fisherfolk.last_name} />
                    <Field label="Middle Name" value={fisherfolk.middle_name} />
                    <Field label="Gender" value={fisherfolk.gender} />
                    <Field label="Birthdate" value={formatDate(fisherfolk.birthdate)} />
                    <Field label="Contact Number" value={fisherfolk.contact_number} />
                    <Field label="Barangay" value={fisherfolk.barangay} />
                    <Field label="Municipality" value={fisherfolk.municipality} />
                  </div>
                </section>

                <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3.5 bg-[#EAF1F5] border-b border-[#E2E8E2]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#155E82]">Reference Information</p>
                  </div>
                  <div className="p-5">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Civil Status" value={fisherfolk.civil_status} />
                    <Field label="Highest Education" value={fisherfolk.highest_education} />
                    <Field label="Date Registered" value={formatDate(fisherfolk.date_registered)} />
                    {fisherfolk.philsys_number && (
                      <Field label="PhilSys / National ID No." value={fisherfolk.philsys_number} />
                    )}
                    {fisherfolk.fish_registration_number && (
                      <Field label="Fish Registration No. (Fish-R)" value={fisherfolk.fish_registration_number} />
                    )}
                    {fisherfolk.boat_registration_number && (
                      <Field label="Boat Registration No. (Boat-R)" value={fisherfolk.boat_registration_number} />
                    )}
                    <div>
                      <p className="text-[12px] text-[#7A8E7A] mb-0.5">Organization</p>
                      {/* A fisherfolk may belong to more than one organization
                          at once (unlike Farmer), so this is a list, not a
                          single value -- see FisherfolkDetailSerializer's
                          organization_names. */}
                      {fisherfolk.organization_names?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {fisherfolk.organization_names.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded-full bg-[#EAF1F5] px-2.5 py-0.5 text-[12px] font-medium text-[#155E82]"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[14px] font-medium italic text-[#A8BCA8]">Not part of any organization</p>
                      )}
                    </div>
                  </div>

                  {/* Classification badges, as on the farmer profile */}
                  {(fisherfolk.is_pwd || fisherfolk.is_4ps_beneficiary || fisherfolk.is_icc_ip_member || fisherfolk.is_senior_citizen) && (
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[#F0F4F0] pt-4">
                      {fisherfolk.is_pwd && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[12px] font-medium text-blue-700 ring-1 ring-blue-200">
                          Person with Disability (PWD)
                        </span>
                      )}
                      {fisherfolk.is_4ps_beneficiary && (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-[12px] font-medium text-green-700 ring-1 ring-green-200">
                          4Ps Beneficiary
                        </span>
                      )}
                      {fisherfolk.is_icc_ip_member && (
                        <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-[12px] font-medium text-purple-700 ring-1 ring-purple-200">
                          ICC/IP Member{fisherfolk.icc_ip_name ? ` — ${fisherfolk.icc_ip_name}` : ''}
                        </span>
                      )}
                      {fisherfolk.is_senior_citizen && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[12px] font-medium text-amber-700 ring-1 ring-amber-200">
                          Senior Citizen
                        </span>
                      )}
                    </div>
                  )}
                  </div>
                </section>
              </div>
            </div>

            {fisherfolk.aquaculture_record && <AquacultureSection record={fisherfolk.aquaculture_record} />}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <FacilitySection fisherfolk={fisherfolk} />
            )}
            {fisherfolk.capture_record && <CaptureSection record={fisherfolk.capture_record} />}

            {/* Stocking Records — aquaculture / mariculture only */}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
                <h2 className="mb-4 text-[14px] font-semibold text-[#1A2B1A]">
                  Stocking Records
                </h2>
                {isLoadingStocking ? (
                  <LoadingSpinner />
                ) : stockingRecords.length === 0 ? (
                  <p className="rounded-lg border border-[#E2E8E2] bg-[#EAF1F5]/30 px-4 py-3 text-[13px] text-[#4A5E4A]">
                    No stocking records on file.
                  </p>
                ) : (
                  <div className="[&_thead_tr]:!bg-[#155E82]">
                    <DataTable columns={STOCKING_COLUMNS} data={stockingData} isLoading={false} />
                  </div>
                )}
              </section>
            )}

            {/* Ponds — aquaculture / mariculture only (Batch 3) */}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[#1A2B1A]">Ponds</h2>
                  {(isAdmin || isEvaluator) && (
                    <div className="flex gap-2">
                      <Button icon={Layers} size="sm" onClick={() => setIsBulkPondModalOpen(true)} variant="secondary">
                        Bulk Add Ponds
                      </Button>
                      <Button icon={Plus} size="sm" onClick={() => setIsPondModalOpen(true)} variant="primary">
                        Add Pond
                      </Button>
                    </div>
                  )}
                </div>
                {isLoadingPonds ? (
                  <LoadingSpinner />
                ) : ponds.length === 0 ? (
                  <p className="rounded-lg border border-[#E2E8E2] bg-[#EAF1F5]/30 px-4 py-3 text-[13px] text-[#4A5E4A]">
                    No ponds on file.
                  </p>
                ) : (
                  <div className="[&_thead_tr]:!bg-[#155E82]">
                    <DataTable columns={POND_COLUMNS} data={pondsData} isLoading={false} />
                  </div>
                )}
              </section>
            )}
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

      {isPondModalOpen && (
        <PondModal
          fisherfolkId={id}
          onClose={() => setIsPondModalOpen(false)}
          onSuccess={fetchPonds}
        />
      )}

      {editingPond && (
        <PondModal
          fisherfolkId={id}
          pond={editingPond}
          onClose={() => setEditingPond(null)}
          onSuccess={fetchPonds}
        />
      )}

      {isBulkPondModalOpen && (
        <BulkPondModal
          fisherfolkId={id}
          existingPondCount={ponds.length}
          onClose={() => setIsBulkPondModalOpen(false)}
          onSuccess={fetchPonds}
        />
      )}

      {deletingPond && (
        <ConfirmDialog
          title="Delete Pond?"
          message={deleteError || `Permanently delete "${deletingPond.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeletePond}
          onCancel={() => { setDeletingPond(null); setDeleteError('') }}
        />
      )}
    </PageLayout>
  )
}

export default FisherfolkDetailPage
