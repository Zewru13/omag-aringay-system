import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CreateAssociationModal from './CreateAssociationModal.jsx'
import EditAssociationModal from './EditAssociationModal.jsx'

const columns = [
  { key: 'name',           label: 'ASSOCIATION NAME' },
  { key: 'address_cell',   label: 'ADDRESS' },
  { key: 'contact_person', label: 'CONTACT PERSON' },
  { key: 'contact_number', label: 'CONTACT NUMBER' },
  { key: 'actions_cell',   label: 'ACTIONS' },
]

function AssociationsPage({ asTab = false }) {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [associations, setAssociations] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editAssociation, setEditAssociation] = useState(null)
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
        const response = await api.get(`/associations/farmers/?${params.toString()}`)
        if (!cancelled) {
          setAssociations(Array.isArray(response.data) ? response.data : (response.data?.results || []))
          setTotalCount(typeof response.data?.count === 'number' ? response.data.count : 0)
        }
      } catch (error) {
        console.error('Error fetching associations:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [searchQuery, page, refreshKey])

  const handleRowClick = (row) => {
    navigate(`/associations/farmers/${row.id}`)
  }

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    setRefreshKey((k) => k + 1)
  }

  const tableData = associations.map((a) => ({
    ...a,
    address_cell: [a.street_address, a.barangay].filter(Boolean).join(', ') || '—',
    actions_cell: (
      <div className="flex items-center gap-1">
        {(isAdmin || isEvaluator) && (
          <button
            type="button"
            className="rounded-lg p-1.5 text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
            title="Edit"
            onClick={(e) => { e.stopPropagation(); setEditAssociation(a) }}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    ),
  }))

  const actionBtn = (isAdmin || isEvaluator) ? (
    <button
      className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
      onClick={() => setShowCreateModal(true)}
    >
      <Plus size={16} />
      Add Association
    </button>
  ) : null

  const innerContent = (
    <>
      {asTab && actionBtn && (
        <div className="flex justify-end mb-3">{actionBtn}</div>
      )}

      <div className="bg-white border border-[#E2E8E2] rounded-xl px-4 py-[10px] mb-4 flex items-center gap-2.5">
        <SearchBar
          placeholder="Search associations by name or address..."
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

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
        <CreateAssociationModal
          type="farmers"
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editAssociation && (
        <EditAssociationModal
          association={editAssociation}
          type="farmers"
          onClose={() => setEditAssociation(null)}
          onSuccess={() => { setEditAssociation(null); setRefreshKey((k) => k + 1) }}
        />
      )}
    </>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Farmer Association Management"
      subtitle="Manage all farmer associations in your area."
      action={actionBtn}
    >
      {innerContent}
    </PageLayout>
  )
}

export default AssociationsPage
