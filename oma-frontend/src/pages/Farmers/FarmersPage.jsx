import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import AddFarmerModal from './AddFarmerModal.jsx'

function calcAge(birthdate) {
  if (!birthdate) return ''
  const birth = new Date(birthdate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

const columns = [
  { key: 'rsbsa_number', label: 'RSBSA Number' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'age', label: 'Age' },
  { key: 'commodity', label: 'Commodity' },
  { key: 'status', label: 'Status' },
  { key: 'date_registered_display', label: 'Date Registered' },
]

function normalizeList(responseData) {
  if (Array.isArray(responseData)) {
    return responseData
  }

  if (Array.isArray(responseData?.results)) {
    return responseData.results
  }

  return []
}

function formatDate(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function FarmersPage() {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [farmers, setFarmers] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [gender, setGender] = useState('all')
  const [seniorOnly, setSeniorOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const fetchFarmers = async () => {
    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()

      if (search.trim()) {
        params.set('search', search.trim())
      }

      if (status !== 'all') {
        params.set('status', status)
      }

      if (gender !== 'all') {
        params.set('gender', gender)
      }

      if (seniorOnly) {
        params.set('is_senior', 'true')
      }

      const queryString = params.toString()
      const response = await api.get(`/farmers/${queryString ? `?${queryString}` : ''}`)
      setFarmers(normalizeList(response.data))
      setPage(1)
    } catch {
      setError('Unable to load farmer records.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchFarmers()
  }, [search, status, gender, seniorOnly])

  const tableData = useMemo(() => farmers.map((farmer) => {
    const ageVal = calcAge(farmer.birthdate)
    return {
      ...farmer,
      age: (
        <span className="inline-flex items-center gap-1">
          {ageVal}
          {farmer.is_senior_citizen && (
            <span className="text-amber-500 font-bold leading-none" title="Senior Citizen">·</span>
          )}
        </span>
      ),
      commodity: farmer.commodity || '',
      status: farmer.is_active ? 'Active' : 'Inactive',
      date_registered_display: formatDate(farmer.date_registered),
    }
  }), [farmers])

  const totalPages = Math.max(1, Math.ceil(tableData.length / 15))
  const paginatedData = tableData.slice((page - 1) * 15, page * 15)

  const handleFarmerCreated = () => {
    setSuccessMessage('Farmer registered successfully.')
    fetchFarmers()
  }

  return (
    <PageLayout title="Farmers" subtitle="Registered farmers and their farm parcels">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:flex-wrap">
            <SearchBar
              onChange={setSearch}
              placeholder="Search by name, RSBSA, or barangay"
              value={search}
            />
            <select
              className={`${baseInputClasses} md:w-36`}
              onChange={(e) => setStatus(e.target.value)}
              value={status}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              className={`${baseInputClasses} md:w-36`}
              onChange={(e) => setGender(e.target.value)}
              value={gender}
            >
              <option value="all">All Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                checked={seniorOnly}
                className="h-4 w-4 accent-green-600"
                type="checkbox"
                onChange={(e) => setSeniorOnly(e.target.checked)}
              />
              Senior Citizens Only
            </label>
          </div>

          {(isAdmin || isEvaluator) && (
            <Button
              icon={Plus}
              onClick={() => setIsAddModalOpen(true)}
              variant="primary"
            >
              Register Farmer
            </Button>
          )}
        </div>

        {successMessage && (
          <div className="rounded-md border border-green-200 bg-[#f0f7f0] px-4 py-3 text-sm font-medium text-[#1E4620]">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <DataTable
          columns={columns}
          data={paginatedData}
          isLoading={isLoading}
          onRowClick={(farmer) => navigate(`/farmers/${farmer.id}`)}
        />

        <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600">
          <p>
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={page === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {isAddModalOpen && (
        <AddFarmerModal
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={handleFarmerCreated}
        />
      )}
    </PageLayout>
  )
}

export default FarmersPage
