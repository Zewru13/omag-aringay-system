import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
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

const filterSelectCls =
  'border border-[#E2E8E2] rounded-lg px-3 py-[7px] text-[13px] bg-[#F9FAF9] text-[#1A2B1A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

function FarmersPage() {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [farmers, setFarmers] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [gender, setGender] = useState('all')
  const [seniorOnly, setSeniorOnly] = useState(false)
  const [filterICC, setFilterICC] = useState('')
  const [filterPWD, setFilterPWD] = useState('')
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

      if (filterICC) {
        params.set('is_icc_ip', filterICC)
      }

      if (filterPWD) {
        params.set('is_pwd', filterPWD)
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
  }, [search, status, gender, seniorOnly, filterICC, filterPWD])

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
    <PageLayout
      title="Farmer Registry"
      subtitle="Registered farmers and their farm parcels"
      action={(isAdmin || isEvaluator) && (
        <button
          className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
          onClick={() => setIsAddModalOpen(true)}
          type="button"
        >
          <Plus size={16} />
          Register Farmer
        </button>
      )}
    >
      {/* Filter bar */}
      <div className="bg-white border border-[#E2E8E2] rounded-xl px-4 py-[10px] mb-4 flex items-center gap-2.5 flex-wrap">
        <SearchBar
          onChange={setSearch}
          placeholder="Search by name, RSBSA, or barangay"
          value={search}
        />
        <select
          className={filterSelectCls}
          onChange={(e) => setStatus(e.target.value)}
          value={status}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          className={filterSelectCls}
          onChange={(e) => setGender(e.target.value)}
          value={gender}
        >
          <option value="all">All Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <label className="flex items-center gap-2 text-[13px] text-[#4A5E4A] cursor-pointer">
          <input
            checked={seniorOnly}
            className="h-4 w-4 accent-[#1B4D2E]"
            type="checkbox"
            onChange={(e) => setSeniorOnly(e.target.checked)}
          />
          Senior Citizens Only
        </label>
        <select
          value={filterICC}
          onChange={(e) => setFilterICC(e.target.value)}
          className={filterSelectCls}
        >
          <option value="">ICC/IP: All</option>
          <option value="true">ICC/IP Member</option>
          <option value="false">Non-ICC/IP</option>
        </select>
        <select
          value={filterPWD}
          onChange={(e) => setFilterPWD(e.target.value)}
          className={filterSelectCls}
        >
          <option value="">PWD: All</option>
          <option value="true">With Disability (PWD)</option>
          <option value="false">Without Disability</option>
        </select>
      </div>

      {successMessage && (
        <div className="rounded-lg border border-[#C8E6C9] bg-[#EBF5EE] px-4 py-3 text-[13px] font-medium text-[#1B4D2E] mb-4">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700 mb-4">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={paginatedData}
        isLoading={isLoading}
        onRowClick={(farmer) => navigate(`/farmers/${farmer.id}`)}
      />

      <div className="flex items-center justify-between bg-white border border-[#E2E8E2] rounded-xl px-4 py-3 text-[13px] text-[#4A5E4A] mt-4">
        <p>
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            className="border border-[#C8D5C8] text-[#4A5E4A] px-3 py-1.5 rounded-lg text-[13px] hover:bg-[#F5F7F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Previous
          </button>
          <button
            className="border border-[#C8D5C8] text-[#4A5E4A] px-3 py-1.5 rounded-lg text-[13px] hover:bg-[#F5F7F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={page === totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            type="button"
          >
            Next
          </button>
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
