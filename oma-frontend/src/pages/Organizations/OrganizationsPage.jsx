import { useEffect, useState } from 'react'
import { Pencil, Plus, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CreateOrganizationModal from './CreateOrganizationModal.jsx'
import EditOrganizationModal from './EditOrganizationModal.jsx'

const columns = [
  { key: 'name',           label: 'ORGANIZATION NAME' },
  { key: 'address_cell',   label: 'ADDRESS' },
  { key: 'contact_person', label: 'CONTACT PERSON' },
  { key: 'contact_number', label: 'CONTACT NUMBER' },
  { key: 'actions_cell',   label: 'ACTIONS' },
]

function OrganizationsPage({ asTab = false }) {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [organizations, setOrganizations] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editOrganization, setEditOrganization] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchQuery) params.append('search', searchQuery)
        params.set('page', page)
        const response = await api.get(`/organizations/farmers/?${params.toString()}`)
        if (!cancelled) {
          setOrganizations(Array.isArray(response.data) ? response.data : (response.data?.results || []))
          setTotalCount(typeof response.data?.count === 'number' ? response.data.count : 0)
        }
      } catch (error) {
        console.error('Error fetching organizations:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [searchQuery, page, refreshKey])

  const handleRowClick = (row) => {
    navigate(`/organizations/farmers/${row.id}`)
  }

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    setRefreshKey((k) => k + 1)
  }

  const tableData = organizations.map((a) => ({
    ...a,
    address_cell: [a.street_address, a.barangay].filter(Boolean).join(', ') || '—',
    actions_cell: (
      <div className="flex items-center gap-1">
        {(isAdmin || isEvaluator) && (
          <button
            type="button"
            className="rounded-lg p-1.5 text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
            title="Edit"
            onClick={(e) => { e.stopPropagation(); setEditOrganization(a) }}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    ),
  }))

  const actionBtn = (isAdmin || isEvaluator) ? (
    <div className="flex items-center gap-2">
      <button
        className="flex items-center gap-1.5 border border-[#E2E8E2] hover:bg-[#F0F4F0] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
        onClick={() => setShowImportModal(true)}
      >
        <Upload size={16} />
        Import File
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
      {asTab && actionBtn && (
        <div className="flex justify-end mb-3">{actionBtn}</div>
      )}

      <FilterPanel
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search organizations by name or address..."
      />

      <DataTable
        columns={columns}
        data={tableData}
        isLoading={isLoading}
        onRowClick={handleRowClick}
      />

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
      />

      {showCreateModal && (
        <CreateOrganizationModal
          type="farmers"
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editOrganization && (
        <EditOrganizationModal
          organization={editOrganization}
          type="farmers"
          onClose={() => setEditOrganization(null)}
          onSuccess={() => { setEditOrganization(null); setRefreshKey((k) => k + 1) }}
        />
      )}

      {showImportModal && (
        <ImportFileModal
          title="Import Farmers Organizations"
          subtitle="Upload a spreadsheet to register multiple organizations at once."
          importUrl="/organizations/farmers/import/"
          templateUrl="/organizations/farmers/import/template/"
          templateFilename="farmers_organizations_import_template.xlsx"
          helpText="Each row creates one new Farmers Organization. Registration Number identifies duplicates, so it's required for every row."
          onClose={() => setShowImportModal(false)}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Farmer Organization Management"
      subtitle="Manage all farmer organizations in your area."
      action={actionBtn}
    >
      {innerContent}
    </PageLayout>
  )
}

export default OrganizationsPage
