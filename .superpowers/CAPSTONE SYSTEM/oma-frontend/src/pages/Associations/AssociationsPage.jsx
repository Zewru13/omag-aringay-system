import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import Tabs from '../../components/UI/Tabs.jsx'
import Button from '../../components/UI/Button.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import CreateAssociationModal from './CreateAssociationModal.jsx'

const typeTabs = [
  { label: 'Farmers Associations', value: 'farmers' },
  { label: 'Fisherfolk Associations', value: 'fisherfolk' },
]

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'member_count_pill', label: 'Members' },
  { key: 'equipment_count_pill', label: 'Equipment' },
  { key: 'status_pill', label: 'Status' },
]

function AssociationsPage() {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [selectedType, setSelectedType] = useState('farmers')
  const [associations, setAssociations] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
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
    member_count_pill: <StatusPill tone="slate">{a.member_count}</StatusPill>,
    equipment_count_pill: <StatusPill tone="slate">{a.equipment_count}</StatusPill>,
    status_pill: (
      <StatusPill tone={a.is_active ? 'green' : 'slate'}>
        {a.is_active ? 'Active' : 'Inactive'}
      </StatusPill>
    ),
  }))

  return (
    <PageLayout title="Associations & Cooperatives" subtitle="Manage farmers and fisherfolk associations and cooperatives">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <div className="flex-1" />
          {(isAdmin || isEvaluator) && (
            <Button icon={Plus} onClick={() => setShowCreateModal(true)} variant="primary">
              Create Association
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
          placeholder="Search by name or barangay..."
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
    </PageLayout>
  )
}

export default AssociationsPage
