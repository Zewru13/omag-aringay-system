import { useEffect, useState } from 'react'
import { ArrowLeft, ClipboardList, Edit, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ActivateCitizenAccountButton from '../../components/ActivateCitizenAccountButton.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import EditFisherfolkModal from './EditFisherfolkModal.jsx'
import PondModal from './PondModal.jsx'

const HISTORY_COLUMNS = [
  { key: 'program_name', label: 'Program' },
  { key: 'program_type', label: 'Type' },
  { key: 'season', label: 'Season' },
  { key: 'year', label: 'Year' },
  { key: 'quantity_given', label: 'Qty Given' },
  { key: 'unit', label: 'Unit' },
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
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value || '-'}</p>
    </div>
  )
}

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
        {record.vessel_type === 'Motorized' && <Field label="Vessel Material" value={record.vessel_material} />}
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

function FisherfolkDetailPage() {
  const { id } = useParams()
  const { isAdmin, isEvaluator } = useAuth()
  const { showToast } = useToast()
  const [fisherfolk, setFisherfolk]       = useState(null)
  const [isLoading, setIsLoading]         = useState(true)
  const [error, setError]                 = useState('')
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen]       = useState(false)
  const [history, setHistory]             = useState([])
  const [isLoadingHistory, setIsLoadingHistory]     = useState(false)
  const [historyError, setHistoryError]   = useState('')
  const [stockingRecords, setStockingRecords]       = useState([])
  const [isLoadingStocking, setIsLoadingStocking]   = useState(false)
  const [ponds, setPonds]                 = useState([])
  const [isLoadingPonds, setIsLoadingPonds] = useState(false)
  const [isPondModalOpen, setIsPondModalOpen] = useState(false)
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
      const response = await api.get(`/interventions/fisherfolk-history/${id}/`)
      setHistory(Array.isArray(response.data) ? response.data : [])
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
      <div className="flex items-center justify-end gap-3 text-[12px] font-medium">
        <button type="button" className="text-[#1B4D2E] hover:underline" onClick={() => setEditingPond(p)}>
          Edit
        </button>
        <button type="button" className="text-[#4A5E4A] hover:underline" onClick={() => toggleActive(p)}>
          {p.is_active ? 'Deactivate' : 'Activate'}
        </button>
        {p.stocking_record_count === 0 && (
          <button type="button" className="text-rose-500 hover:underline" onClick={() => setDeletingPond(p)}>
            Delete
          </button>
        )}
      </div>
    ) : null,
  }))

  return (
    <PageLayout title="Fisherfolk Details" subtitle="View and manage fisherfolk profile and records">
      <div className="space-y-5">
        <Link
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          to="/fisherfolk"
        >
          <ArrowLeft size={16} />
          Back to Fisherfolk Registry
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold text-slate-900">{fisherfolk.full_name}</h1>
                    <StatusPill tone={fisherfolk.is_active ? 'green' : 'rose'}>
                      {fisherfolk.is_active ? 'Active' : 'Inactive'}
                    </StatusPill>
                    {fisherfolk.is_senior_citizen && <StatusPill tone="amber">Senior Citizen</StatusPill>}
                    {(fisherfolk.fisherfolk_type === 'Capture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
                      fisherfolk.has_vessel
                        ? <StatusPill tone="green">With Vessel</StatusPill>
                        : <StatusPill tone="slate">No Vessel</StatusPill>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    LGU Registration Number: {fisherfolk.lgu_registration_number}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">Type: {fisherfolk.fisherfolk_type}</p>
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
                  {(isAdmin || isEvaluator) && (
                    <ActivateCitizenAccountButton
                      citizenAccount={fisherfolk.citizen_account}
                      personLabel={fisherfolk.full_name}
                      onActivated={fetchFisherfolk}
                    />
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

            {fisherfolk.aquaculture_record && <AquacultureSection record={fisherfolk.aquaculture_record} />}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <FacilitySection fisherfolk={fisherfolk} />
            )}
            {fisherfolk.capture_record && <CaptureSection record={fisherfolk.capture_record} />}
            {fisherfolk.vendor_record   && <VendorSection  record={fisherfolk.vendor_record}   />}

            {/* Stocking Records — aquaculture / mariculture only */}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <section className="rounded-2xl border border-slate-100 bg-white p-6">
                <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">
                  Stocking Records
                </h2>
                {isLoadingStocking ? (
                  <LoadingSpinner />
                ) : stockingRecords.length === 0 ? (
                  <p className="py-3 text-sm italic text-slate-400">No stocking records on file.</p>
                ) : (
                  <DataTable columns={STOCKING_COLUMNS} data={stockingData} isLoading={false} />
                )}
              </section>
            )}

            {/* Ponds — aquaculture / mariculture only (Batch 3) */}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <section className="rounded-2xl border border-slate-100 bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Ponds</h2>
                  {(isAdmin || isEvaluator) && (
                    <Button icon={Plus} size="sm" onClick={() => setIsPondModalOpen(true)} variant="primary">
                      Add Pond
                    </Button>
                  )}
                </div>
                {isLoadingPonds ? (
                  <LoadingSpinner />
                ) : ponds.length === 0 ? (
                  <p className="py-3 text-sm italic text-slate-400">No ponds on file.</p>
                ) : (
                  <DataTable columns={POND_COLUMNS} data={pondsData} isLoading={false} />
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
