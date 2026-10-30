import { useEffect, useState } from 'react'
import { Pencil, Plus, Upload, Eye, HandHeart } from 'lucide-react'
import RowActions from '../../components/UI/RowActions.jsx'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import PrintReportButton from '../../components/PrintReportButton.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import DateRangeFields from '../../components/UI/DateRangeFields.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { dateRangeParams } from '../../utils/dateRange.js'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { assistanceLink } from '../Organizations/organizationContact.js'
import CreateOrganizationModal from '../Organizations/CreateOrganizationModal.jsx'
import EditOrganizationModal from '../Organizations/EditOrganizationModal.jsx'

const columns = [
  { key: 'name',           label: 'ORGANIZATION NAME' },
  { key: 'address_cell',   label: 'ADDRESS' },
  { key: 'contact_person', label: 'CONTACT PERSON' },
  { key: 'contact_number', label: 'CONTACT NUMBER' },
  { key: 'actions_cell',   label: 'ACTIONS' },
]

function FisherfolkOrganizationsPage({ asTab = false }) {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [organizations,      setOrganizations]      = useState([])
  const [totalCount,        setTotalCount]        = useState(0)
  const [page,              setPage]              = useState(1)
  const [isLoading,         setIsLoading]         = useState(false)
  const [searchQuery,       setSearchQuery]       = useState('')
  const [barangay, setBarangay] = useState('')
  const [registeredFrom, setRegisteredFrom] = useState('')
  const [registeredTo, setRegisteredTo] = useState('')
  const [showCreateModal,   setShowCreateModal]   = useState(false)
  const [membersImport, setMembersImport] = useState(null)   // { file, organization }: the members file chosen on the registration form
  const [showImportModal,   setShowImportModal]   = useState(false)
  const [editOrganization,   setEditOrganization]   = useState(null)
  const [refreshKey,        setRefreshKey]        = useState(0)

  useEffect(() => { setPage(1) }, [searchQuery, barangay, registeredFrom, registeredTo])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchQuery) params.append('search', searchQuery)
        if (barangay) params.append('barangay', barangay)
        Object.entries(dateRangeParams(registeredFrom, registeredTo, 'registered_from', 'registered_to')).forEach(([k, v]) => params.append(k, v))
        params.set('page', page)
        const r = await api.get(`/organizations/fisherfolk/?${params.toString()}`)
        if (!cancelled) {
          setOrganizations(Array.isArray(r.data) ? r.data : (r.data?.results || []))
          setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
        }
      } catch (err) {
        console.error('Error fetching fisherfolk organizations:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [searchQuery, barangay, registeredFrom, registeredTo, page, refreshKey])

  const handleRowClick = (row) => {
    navigate(`/organizations/fisherfolk/${row.id}`)
  }

  const handleCreateSuccess = ({ importFile, organization } = {}) => {
    setShowCreateModal(false)
    setRefreshKey((k) => k + 1)
    // A members file attached on the form is read now, in the Import Members window of the new organization (preview first).
    if (importFile && organization?.id) setMembersImport({ file: importFile, organization })
  }

  const tableData = organizations.map((a) => ({
    ...a,
    address_cell: [a.street_address, a.barangay].filter(Boolean).join(', ') || '—',
    actions_cell: (
      <RowActions actions={[
        (isAdmin || isEvaluator) && { key: 'edit', label: 'Edit organization', icon: Pencil, onClick: () => setEditOrganization(a) },
        { key: 'view', label: 'View organization profile', icon: Eye, onClick: () => handleRowClick(a) },
        (isAdmin || isEvaluator) && { key: 'assist', label: 'Add assistance', icon: HandHeart, onClick: () => navigate(assistanceLink('fisherfolk', a.id)) },
      ]} />
    ),
  }))

  const actionBtn = (isAdmin || isEvaluator) ? (
    <div className="flex flex-wrap items-center gap-2">
      <PrintReportButton kind="fisherfolk_orgs" filters={{ search: searchQuery, barangay, registeredFrom, registeredTo }} />
      <button
        className="flex items-center gap-1.5 border border-[#E2E8E2] hover:bg-[#F0F4F0] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
        onClick={() => setShowImportModal(true)}
      >
        <Upload size={16} />
        Import Organizations
      </button>
      <button
        className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
        onClick={() => setShowCreateModal(true)}
      >
        <Plus size={16} />
        Add Organization
      </button>
    </div>
  ) : null

  const innerContent = (
    <>

      <FilterPanel
        actions={actionBtn}
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search organizations by name or address..."
        activeCount={[barangay, registeredFrom, registeredTo].filter(Boolean).length}
      >
        <div className="w-full sm:w-44">
          <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
        </div>
        <DateRangeFields label="Registered" from={registeredFrom} to={registeredTo} onFromChange={setRegisteredFrom} onToChange={setRegisteredTo} />
      </FilterPanel>

      <DataTable
        columns={columns}
        data={tableData}
        isLoading={isLoading}
        onRowClick={handleRowClick}
        phoneTitleKey="name"
        phoneOpenLabel="Open organization profile"
      />

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
      />

      {showCreateModal && (
        <CreateOrganizationModal
          type="fisherfolk"
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editOrganization && (
        <EditOrganizationModal
          organization={editOrganization}
          type="fisherfolk"
          onClose={() => setEditOrganization(null)}
          onSuccess={() => { setEditOrganization(null); setRefreshKey((k) => k + 1) }}
        />
      )}

      {membersImport && (
        <ImportFileModal
          title="Import Members"
          subtitle={`Add already-registered fisherfolk to ${membersImport.organization.name} from the file you attached.`}
          importUrl={`/organizations/fisherfolk/${membersImport.organization.id}/members/import/`}
          templateUrl={`/organizations/fisherfolk/${membersImport.organization.id}/members/import/template/`}
          templateFilename="fisherfolk_organization_members_import_template.xlsx"
          undoType="fisherfolk_org_members"
          initialFile={membersImport.file}
          onClose={() => setMembersImport(null)}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {showImportModal && (
        <ImportFileModal
          title="Import Fisherfolk Organizations"
          subtitle="Upload a spreadsheet to register multiple organizations at once."
          importUrl="/organizations/fisherfolk/import/"
          templateUrl="/organizations/fisherfolk/import/template/"
          templateFilename="fisherfolk_organizations_import_template.xlsx"
          undoType="fisherfolk_org"
          helpText="Each row creates one new Fisherfolk Organization. Registration Number identifies duplicates, so it's required for every row."
          onClose={() => setShowImportModal(false)}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Fisherfolk Organization Management"
      subtitle="Manage all fisherfolk organizations in your area."
    >
      {innerContent}
    </PageLayout>
  )
}

export default FisherfolkOrganizationsPage
