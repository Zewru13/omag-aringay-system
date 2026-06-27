import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import Tabs from '../../components/UI/Tabs.jsx'
import Button from '../../components/UI/Button.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CreateAssociationModal from './CreateAssociationModal.jsx'
import EditAssociationModal from './EditAssociationModal.jsx'

const typeTabs = [
  { label: 'Farmers Associations', value: 'farmers' },
  { label: 'Fisherfolk Associations', value: 'fisherfolk' },
]

const columns = [
  { key: 'name',           label: 'ASSOCIATION NAME' },
  { key: 'address_cell',   label: 'ADDRESS' },
  { key: 'contact_person', label: 'CONTACT PERSON' },
  { key: 'contact_number', label: 'CONTACT NUMBER' },
  { key: 'actions_cell',   label: 'ACTIONS' },
]

function AssociationsPage() {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [selectedType, setSelectedType] = useState('farmers')
  const [associations, setAssociations] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editAssociation, setEditAssociation] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchQuery) params.append('search', searchQuery)
        const response = await api.get(`/associations/${selectedType}/?${params.toString()}`)
        if (!cancelled) setAssociations(response.data)
      } catch (error) {
        console.error('Error fetching associations:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedType, searchQuery, refreshKey])

  const handleRowClick = (row) => {
    navigate(`/associations/${selectedType}/${row.id}`)
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
            className="rounded-lg p-1.5 text-[#1E4620] hover:bg-[#f0f7f0] transition-colors"
            title="Edit"
            onClick={(e) => { e.stopPropagation(); setEditAssociation(a) }}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    ),
  }))

  return (
    <PageLayout title="Farmer Association Management" subtitle="Manage all farmer associations in your area.">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <div className="flex-1" />
          {(isAdmin || isEvaluator) && (
            <Button icon={Plus} onClick={() => setShowCreateModal(true)} variant="primary">
              Add Association
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            activeTab={selectedType}
            tabs={typeTabs}
            onChange={(val) => { setSelectedType(val); setSearchQuery('') }}
          />
        </div>

        <SearchBar
          placeholder="Search associations by name or address..."
          value={searchQuery}
          onChange={setSearchQuery}
        />

        <DataTable
          columns={columns}
          data={tableData}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
      </div>

      {showCreateModal && (
        <CreateAssociationModal
          type={selectedType}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editAssociation && (
        <EditAssociationModal
          association={editAssociation}
          type={selectedType}
          onClose={() => setEditAssociation(null)}
          onSuccess={() => { setEditAssociation(null); setRefreshKey((k) => k + 1) }}
        />
      )}
    </PageLayout>
  )
}

export default AssociationsPage
