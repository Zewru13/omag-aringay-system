import { useEffect, useState } from 'react'
import {
  Building2, Cake, CalendarDays, ClipboardList, Edit, FileText, Fish, GraduationCap, Heart, IdCard, Layers, MapPin, Pencil, Phone, Plus, Power, Sprout, Trash2, User, UserRound, Users, Waves,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ActivateCitizenAccountButton from '../../components/ActivateCitizenAccountButton.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { AvatarBox, FieldItem, InfoCard, ProfileHero, SectionTitle, initialsOf, withChipIcons } from '../../components/Profile/ProfileKit.jsx'
import ViewSection from '../../components/UI/ViewSection.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import PcicCell from '../../components/UI/PcicCell.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import AssistanceHistoryModal from '../../components/AssistanceHistoryModal.jsx'
import { formatDate as formatSharedDate } from '../../utils/dateFormat.js'
import { displayFisherfolkType } from '../../utils/fisherfolkType.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { ageText } from '../Farmers/farmerProfile.js'
import EditFisherfolkModal from './EditFisherfolkModal.jsx'
import { fisherfolkChips } from './fisherfolkProfile.js'
import PondModal from './PondModal.jsx'
import BulkPondModal from './BulkPondModal.jsx'

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
  { key: 'pcic_cell',       label: 'PCIC INSURED' },
  { key: 'status_pill',     label: 'STATUS' },
  { key: 'actions_cell',    label: 'ACTIONS' },
]

const formatDate = (value) => formatSharedDate(value, { empty: '' })

function fmtShort(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(v + 'T00:00:00'),
  )
}

const otherLabel = (value, specify) => (value === 'Other' && specify ? `Other — ${specify}` : value)

function AquacultureSection({ record }) {
  return (
    <InfoCard icon={Fish} title="Aquaculture Record" accent="#155E82" soft="#EAF1F5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <FieldItem label="Culture Type" value={otherLabel(record.culture_type, record.culture_type_other_specify)} />
        <FieldItem label="Species Cultured" value={otherLabel(record.species_cultured, record.species_cultured_other_specify)} />
        <FieldItem label="Area (ha)" value={record.area_hectares} />
        <FieldItem label="Fingerlings Stocked" value={record.fingerlings_stocked} />
        <FieldItem label="Production Volume (kg)" value={record.production_volume_kg} />
      </div>
    </InfoCard>
  )
}

function FacilitySection({ fisherfolk }) {
  const hasAny = fisherfolk.facility_location || fisherfolk.pond_area_ha || fisherfolk.number_of_ponds ||
    fisherfolk.water_source || fisherfolk.number_of_cages || fisherfolk.cage_dimensions
  if (!hasAny) return null
  return (
    <InfoCard icon={Waves} title="Facility Profile" accent="#155E82" soft="#EAF1F5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {fisherfolk.facility_location && <FieldItem label="Facility Location" value={fisherfolk.facility_location} />}
        {fisherfolk.pond_area_ha && <FieldItem label="Pond Area (ha)" value={fisherfolk.pond_area_ha} />}
        {fisherfolk.number_of_ponds != null && <FieldItem label="Number of Ponds" value={fisherfolk.number_of_ponds} />}
        {fisherfolk.water_source && <FieldItem label="Water Source" value={fisherfolk.water_source} />}
        {fisherfolk.number_of_cages != null && <FieldItem label="Number of Cages" value={fisherfolk.number_of_cages} />}
        {fisherfolk.cage_dimensions && <FieldItem label="Cage Dimensions" value={fisherfolk.cage_dimensions} />}
      </div>
    </InfoCard>
  )
}

function CaptureSection({ record }) {
  return (
    <InfoCard icon={Fish} title="Capture Record" accent="#155E82" soft="#EAF1F5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <FieldItem label="Vessel Type" value={record.vessel_type} />
        {record.vessel_type === 'Motorized' && <FieldItem label="Vessel Material" value={otherLabel(record.vessel_material, record.vessel_material_other_specify)} />}
        <FieldItem label="Vessel Reg. Number" value={record.vessel_registration_number} />
        <FieldItem label="Fishing Gear Type" value={record.fishing_gear_type} />
        <FieldItem label="Fishing Ground" value={record.fishing_ground} />
        <FieldItem label="Avg. Catch / Trip (kg)" value={record.average_catch_per_trip_kg} />
      </div>
    </InfoCard>
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
  const navigate = useNavigate()
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
    pcic_cell: <PcicCell insured={p.has_pcic_insurance} photos={p.pcic_form_photos} url={p.pcic_form_photo} />,
    status_pill: <StatusPill tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Inactive'}</StatusPill>,
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

  // The actions are icons (hover for the name); they sit in the hero.
  const actions = fisherfolk && (
    <>
      <Button icon={ClipboardList} onClick={openHistory} variant="outline" iconOnly>View Assistance History</Button>
      <Button icon={FileText} onClick={handleGenerateReport} variant="outline" isLoading={isGeneratingReport} iconOnly>Generate Report</Button>
      {(isAdmin || isEvaluator) && (
        <Button icon={Edit} onClick={() => setIsEditModalOpen(true)} variant="primary" iconOnly>Edit Profile</Button>
      )}
      {(isAdmin || isEvaluator) && (
        <ActivateCitizenAccountButton
          citizenAccount={fisherfolk.citizen_account}
          personLabel={fisherfolk.full_name}
          onActivated={fetchFisherfolk}
          iconOnly
        />
      )}
    </>
  )

  return (
    <PageLayout title="Fisherfolk Details" subtitle="View and manage fisherfolk profile and records">
      <div className="space-y-5">
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
            <ProfileHero
              label="Fisherfolk Profile"
              labelIcon={Fish}
              ariaLabel="Fisherfolk profile"
              accent="#155E82"
              avatar={<AvatarBox initials={initialsOf(fisherfolk.full_name)} accent="#155E82" soft="#EAF1F5" />}
              name={fisherfolk.full_name}
              idLabel="RSBSA No."
              idValue={fisherfolk.rsbsa_number}
              meta={[
                { icon: Fish, text: displayFisherfolkType(fisherfolk.fisherfolk_type) },
                { icon: MapPin, text: [fisherfolk.barangay, fisherfolk.municipality].filter(Boolean).join(', ') },
                { icon: CalendarDays, text: fisherfolk.date_registered ? `Registered ${formatDate(fisherfolk.date_registered)}` : '' },
              ]}
              chips={withChipIcons(fisherfolkChips(fisherfolk))}
              actions={actions}
            />

            <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
              <div className="space-y-4">
                <InfoCard icon={User} title="Personal Information" accent="#155E82" soft="#EAF1F5">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
                    {fisherfolk.prefix && <FieldItem icon={User} label="Prefix" value={fisherfolk.prefix} />}
                    <FieldItem icon={User} label="First Name" value={fisherfolk.first_name} />
                    <FieldItem icon={User} label="Middle Name" value={fisherfolk.middle_name} />
                    <FieldItem icon={User} label="Last Name" value={fisherfolk.last_name} />
                    <FieldItem icon={UserRound} label="Gender" value={fisherfolk.gender} />
                    <FieldItem icon={Cake} label="Birthdate" value={formatDate(fisherfolk.birthdate)} hint={ageText(fisherfolk.birthdate)} />
                    <FieldItem icon={Heart} label="Civil Status" value={fisherfolk.civil_status} />
                    <FieldItem icon={GraduationCap} label="Highest Education" value={fisherfolk.highest_education} />
                  </div>
                </InfoCard>

                <InfoCard icon={MapPin} title="Contact & Address" accent="#155E82" soft="#EAF1F5">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
                    <FieldItem icon={Phone} label="Contact Number" value={fisherfolk.contact_number} />
                    <FieldItem icon={MapPin} label="Barangay" value={fisherfolk.barangay} />
                    <FieldItem icon={MapPin} label="Municipality" value={fisherfolk.municipality} />
                  </div>
                </InfoCard>

                <InfoCard icon={IdCard} title="Registration & IDs" accent="#155E82" soft="#EAF1F5">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
                    <FieldItem icon={IdCard} label="RSBSA Number" value={fisherfolk.rsbsa_number} />
                    <FieldItem icon={IdCard} label="Fish Registration No. (Fish-R)" value={fisherfolk.fish_registration_number} />
                    <FieldItem icon={IdCard} label="Boat Registration No. (Boat-R)" value={fisherfolk.boat_registration_number} />
                    <FieldItem icon={IdCard} label="PhilSys / National ID No." value={fisherfolk.philsys_number} />
                    <FieldItem icon={CalendarDays} label="Date Registered" value={formatDate(fisherfolk.date_registered)} />
                  </div>
                </InfoCard>
              </div>

              <div className="space-y-4">
                {/* A fisherfolk may belong to more than one organization at once (unlike a farmer): a list of names (organization_names). */}
                <InfoCard icon={Users} title={(fisherfolk.organization_names || []).length > 1 ? 'Organizations' : 'Organization'} accent="#155E82" soft="#EAF1F5">
                  {fisherfolk.organization_names?.length > 0 ? (
                    <ul className="space-y-2">
                      {fisherfolk.organization_names.map((name) => (
                        <li key={name} className="flex items-center gap-2.5 rounded-lg border border-[#E2E8E2] px-3 py-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF1F5] text-[#155E82]"><Building2 size={14} aria-hidden="true" /></span>
                          <span className="min-w-0 text-[13.5px] font-medium text-[#1A2B1A]">{name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] italic text-[#A8BCA8]">Not part of any organization.</p>
                  )}
                </InfoCard>
              </div>
            </div>

            <SectionTitle icon={Fish} accent="#155E82">Fisheries Records</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-2">
              {fisherfolk.aquaculture_record && <AquacultureSection record={fisherfolk.aquaculture_record} />}
              {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <FacilitySection fisherfolk={fisherfolk} />
            )}
              {fisherfolk.capture_record && <CaptureSection record={fisherfolk.capture_record} />}
            </div>

            {/* Stocking Records and Ponds — aquaculture / mariculture only: a card each; View opens the table in a floating window */}
            {(fisherfolk.fisherfolk_type === 'Aquaculture' || fisherfolk.fisherfolk_type === 'Mariculture') && (
              <div className="grid gap-3 md:grid-cols-2">
                <ViewSection
                  title="Stocking Records" icon={Sprout} count={stockingRecords.length} noun="stocking record" isLoading={isLoadingStocking}
                  accent="#155E82" soft="#EAF1F5" subtitle="Every stocking of this fisherfolk. Open a row to monitor it."
                >
                {isLoadingStocking ? (
                  <LoadingSpinner />
                ) : stockingRecords.length === 0 ? (
                  <p className="rounded-lg border border-[#E2E8E2] bg-[#EAF1F5]/30 px-4 py-3 text-[13px] text-[#4A5E4A]">
                    No stocking records on file.
                  </p>
                ) : (
                  <div className="[&_thead_tr]:!bg-[#155E82]">
                    <DataTable
                      columns={STOCKING_COLUMNS}
                      data={stockingData}
                      isLoading={false}
                      onRowClick={(row) => navigate(`/fisheries-monitoring?tab=stocking&record=${row.id}`)}
                      rowClickLabel={(row) => `Open ${row.species_name} stocking record`}
                      phoneTitleKey="species_name"
                      phoneOpenLabel="Monitor"
                      phoneOpenHidden={(row) => row.status === 'Harvested'}
                    />
                  </div>
                )}
                </ViewSection>

                <ViewSection
                  title="Ponds" icon={Waves} count={ponds.length} noun="pond" isLoading={isLoadingPonds}
                  accent="#155E82" soft="#EAF1F5" subtitle="The ponds on file for this fisherfolk." maxWidth="max-w-4xl"
                >
                  {(isAdmin || isEvaluator) && (
                    <div className="mb-3 flex flex-wrap justify-end gap-2">
                      <Button icon={Layers} size="sm" onClick={() => setIsBulkPondModalOpen(true)} variant="secondary">
                        Bulk Add Ponds
                      </Button>
                      <Button icon={Plus} size="sm" onClick={() => setIsPondModalOpen(true)} variant="primary">
                        Add Pond
                      </Button>
                    </div>
                  )}
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
                </ViewSection>
              </div>
            )}
          </>
        )}
      </div>

      {isHistoryModalOpen && (
        <AssistanceHistoryModal
          domain="fisheries"
          error={historyError}
          history={history}
          isLoading={isLoadingHistory}
          person={{ name: fisherfolk?.full_name, rsbsa: fisherfolk?.rsbsa_number, barangay: fisherfolk?.barangay }}
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
