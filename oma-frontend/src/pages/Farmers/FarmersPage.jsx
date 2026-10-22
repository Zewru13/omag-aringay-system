import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import RsbsaImportModal from '../../components/RsbsaImportModal.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
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
  { key: 'farmer_type', label: 'Farmer Type' },
  { key: 'status', label: 'Status' },
  { key: 'date_registered_display', label: 'Date Registered' },
]

function normalizeList(responseData) {
  if (Array.isArray(responseData)) return responseData
  if (Array.isArray(responseData?.results)) return responseData.results
  return []
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

const filterSelectCls =
  'border border-[#E2E8E2] rounded-lg px-3 py-[7px] text-[13px] bg-[#F9FAF9] text-[#1A2B1A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

function FarmersPage({ asTab = false }) {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [farmers, setFarmers] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [gender, setGender] = useState('all')
  const [farmerType, setFarmerType] = useState('all')
  const [seniorOnly, setSeniorOnly] = useState(false)
  const [filterICC, setFilterICC] = useState(false)
  const [filterPWD, setFilterPWD] = useState(false)
  const [registeredFrom, setRegisteredFrom] = useState('')
  const [registeredTo, setRegisteredTo] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  // The list is requested again on every filter, search and page change, and a slow earlier answer can arrive
  // after a newer one. Only the newest request may write to the table; otherwise a stale unfiltered answer
  // replaces the filtered list (under-60s showing under "Senior Citizens Only").
  const latestRequest = useRef(0)

  // The list's filters (without its page), shared by the list request and the harvest comparison above it.
  const listFilterParams = () => {
    const params = new URLSearchParams()
    if (search.trim())    params.set('search', search.trim())
    if (status !== 'all') params.set('status', status)
    if (gender !== 'all') params.set('gender', gender)
    if (farmerType !== 'all') params.set('is_farm_laborer', farmerType)
    if (seniorOnly)       params.set('is_senior', 'true')
    if (filterICC)        params.set('is_icc_ip', 'true')
    if (filterPWD)        params.set('is_pwd', 'true')
    if (registeredFrom)   params.set('registered_from', registeredFrom)
    if (registeredTo)     params.set('registered_to', registeredTo)
    return params
  }

  const fetchFarmers = async (pageNum = page) => {
    const requestId = ++latestRequest.current
    setIsLoading(true)
    setError('')
    try {
      const params = listFilterParams()
      params.set('page', pageNum)
      const response = await api.get(`/farmers/?${params.toString()}`)
      if (requestId !== latestRequest.current) return   // a newer request has been sent; this answer is out of date
      setFarmers(normalizeList(response.data))
      setTotalCount(typeof response.data?.count === 'number' ? response.data.count : 0)
    } catch {
      if (requestId === latestRequest.current) setError('Unable to load farmer records.')
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    fetchFarmers(1)
  }, [search, status, gender, farmerType, seniorOnly, filterICC, filterPWD, registeredFrom, registeredTo])

  useEffect(() => {
    fetchFarmers(page)
  }, [page])

  const activeFilterCount = [
    status !== 'all',
    gender !== 'all',
    farmerType !== 'all',
    seniorOnly,
    filterICC,
    filterPWD,
    Boolean(registeredFrom),
    Boolean(registeredTo),
  ].filter(Boolean).length

  const tableData = useMemo(() => farmers.map((farmer) => {
    const ageVal = calcAge(farmer.birthdate)
    return {
      ...farmer,
      full_name: farmer.full_name,
      // Real semantics (farmers/models.py): is_farm_laborer distinguishes a
      // farmworker (farmworker=YES, farmer!=YES in the RSBSA/BFAR import)
      // from a farm operator — not from a land OWNER. Land ownership
      // (Owner/Tenant/Lessee) is tracked per-FarmParcel, not per-farmer, so
      // a non-laborer farmer may be a tenant, not an owner; "Farm Operator"
      // is accurate where "Owner" would not be.
      farmer_type: (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
          farmer.is_farm_laborer
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {farmer.is_farm_laborer ? 'Farm Laborer' : 'Farm Operator'}
        </span>
      ),
      age: (
        <span className="inline-flex items-center gap-1">
          {ageVal}
          {farmer.is_senior_citizen && (
            <span className="text-amber-500 font-bold leading-none" title="Senior Citizen">·</span>
          )}
        </span>
      ),
      status: farmer.is_active ? 'Active' : 'Inactive',
      date_registered_display: formatDate(farmer.date_registered),
    }
  }), [farmers])

  const handleFarmerCreated = () => {
    setSuccessMessage('Farmer registered successfully.')
    fetchFarmers(1)
    setPage(1)
  }

  const actionBtn = (isAdmin || isEvaluator) ? (
    <div className="flex items-center gap-2">
      <button
        className="flex items-center gap-1.5 border border-[#D8E2D8] bg-white hover:bg-[#F5F7F5] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
        onClick={() => setIsImportModalOpen(true)}
        type="button"
      >
        <Upload size={16} />
        Import Farmers
      </button>
      <button
        className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
        onClick={() => setIsAddModalOpen(true)}
        type="button"
      >
        <Plus size={16} />
        Register Farmer
      </button>
    </div>
  ) : null

  const innerContent = (
    <>

      {/* Search + filters */}
      <FilterPanel
        actions={actionBtn}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, RSBSA, or barangay"
        activeCount={activeFilterCount}
      >
        <select className={filterSelectCls} onChange={(e) => setStatus(e.target.value)} value={status}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className={filterSelectCls} onChange={(e) => setGender(e.target.value)} value={gender}>
          <option value="all">All Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <select className={filterSelectCls} onChange={(e) => setFarmerType(e.target.value)} value={farmerType}>
          <option value="all">All Farmer Types</option>
          <option value="false">Farm Operator</option>
          <option value="true">Farm Laborer</option>
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
        <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={filterICC}
            onChange={(e) => { setFilterICC(e.target.checked); setPage(1) }}
            className="w-4 h-4 rounded accent-[#1B4D2E] cursor-pointer border-slate-300"
          />
          <span className="text-[13px] text-[#4A5E4A]">ICC/IP Members Only</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={filterPWD}
            onChange={(e) => { setFilterPWD(e.target.checked); setPage(1) }}
            className="w-4 h-4 rounded accent-[#1B4D2E] cursor-pointer border-slate-300"
          />
          <span className="text-[13px] text-[#4A5E4A]">PWD Only</span>
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-[#4A5E4A]">
          Registered From
          <input
            type="date"
            className={filterSelectCls}
            value={registeredFrom}
            onChange={(e) => setRegisteredFrom(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-[#4A5E4A]">
          Registered To
          <input
            type="date"
            className={filterSelectCls}
            value={registeredTo}
            onChange={(e) => setRegisteredTo(e.target.value)}
          />
        </label>
      </FilterPanel>


      {successMessage && (
        <div className="rounded-lg border border-[#C8D5C8] bg-[#EBF5EE] px-4 py-3 text-[13px] font-medium text-[#1B4D2E] mb-4">
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
        data={tableData}
        isLoading={isLoading}
        onRowClick={(farmer) => navigate(`/farmers/${farmer.id}`)}
        phoneTitleKey="full_name"
        phoneOpenLabel="Open farmer profile"
      />

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
      />

      {isAddModalOpen && (
        <AddFarmerModal
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={handleFarmerCreated}
        />
      )}

      {isImportModalOpen && (
        <RsbsaImportModal
          onClose={() => setIsImportModalOpen(false)}
          onCommitted={() => fetchFarmers(1)}
        />
      )}
    </>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Farmer Registry"
      subtitle="Registered farmers and their farm parcels"
    >
      {innerContent}
    </PageLayout>
  )
}

export default FarmersPage
