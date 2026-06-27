import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import Tabs from '../../components/UI/Tabs.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import RegisterFisherfolkModal from './RegisterFisherfolkModal.jsx'

const typeTabs = [
  { label: 'All', value: 'all' },
  { label: 'Aquaculture', value: 'aquaculture' },
  { label: 'Capture', value: 'capture' },
  { label: 'Mariculture', value: 'mariculture' },
  { label: 'Inland', value: 'inland' },
  { label: 'Vendor', value: 'vendor' },
]

const columns = [
  { key: 'lgu_registration_number', label: 'LGU Number' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'fisherfolk_type', label: 'Type' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'age', label: 'Age' },
  { key: 'status_label', label: 'Status' },
  { key: 'date_registered_fmt', label: 'Date Registered' },
]

function formatDate(dateString) {
  if (!dateString) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateString))
}

function calcAge(birthdate) {
  if (!birthdate) return ''
  const birth = new Date(birthdate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function FisheriesPage() {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [fisheries, setFisheries] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [gender, setGender] = useState('all')
  const [seniorOnly, setSeniorOnly] = useState(false)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchQuery) params.append('search', searchQuery)
        if (selectedType !== 'all') params.append('type', selectedType)
        if (selectedStatus !== 'all') params.append('status', selectedStatus)
        if (gender !== 'all') params.append('gender', gender)
        if (seniorOnly) params.append('is_senior', 'true')
        const response = await api.get(`/fisheries/?${params.toString()}`)
        if (!cancelled) setFisheries(response.data)
      } catch (error) {
        console.error('Error fetching fisheries:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [searchQuery, selectedType, selectedStatus, gender, seniorOnly, refreshKey])

  const handleRowClick = (row) => {
    navigate(`/fisheries/${row.id}`)
  }

  const handleRegisterSuccess = () => {
    setShowRegisterModal(false)
    setRefreshKey((k) => k + 1)
  }

  const tableData = fisheries.map((f) => ({
    ...f,
    age: calcAge(f.birthdate),
    status_label: f.is_active ? 'Active' : 'Inactive',
    date_registered_fmt: formatDate(f.date_registered),
  }))

  return (
    <PageLayout title="Fisheries" subtitle="Registered fisherfolk and their fishing records">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <div className="flex-1" />
          {(isAdmin || isEvaluator) && (
            <Button icon={Plus} onClick={() => setShowRegisterModal(true)} variant="primary">
              Register Fisherfolk
            </Button>
          )}
        </div>

        {/* Type Tabs + Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:flex-wrap">
          <Tabs tabs={typeTabs} activeTab={selectedType} onChange={setSelectedType} />

          <div className="flex flex-wrap items-center gap-3">
            <select
              className={`${baseInputClasses} md:w-36`}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              className={`${baseInputClasses} md:w-36`}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="all">All Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                checked={seniorOnly}
                className="h-4 w-4 accent-gbreen-600"
                type="checkbox"
                onChange={(e) => setSeniorOnly(e.target.checked)}
              />
              Senior Citizens Only
            </label>
          </div>
        </div>

        {/* Search */}
        <SearchBar
          placeholder="Search by name, LGU number, or barangay..."
          value={searchQuery}
          onChange={setSearchQuery}
        />

        {/* Table */}
        <DataTable
          columns={columns}
          data={tableData}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
      </div>

      {showRegisterModal && (
        <RegisterFisherfolkModal
          onClose={() => setShowRegisterModal(false)}
          onSuccess={handleRegisterSuccess}
        />
      )}
    </PageLayout>
  )
}

export default FisheriesPage
