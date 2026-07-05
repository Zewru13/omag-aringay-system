import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import AddFisherfolkModal from './AddFisherfolkModal.jsx'

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
  { key: 'fishr_number',          label: 'FishR No.' },
  { key: 'full_name',             label: 'Full Name' },
  { key: 'fisherfolk_type',       label: 'Type' },
  { key: 'barangay',              label: 'Barangay' },
  { key: 'age',                   label: 'Age' },
  { key: 'status',                label: 'Status' },
  { key: 'date_registered_disp',  label: 'Date Registered' },
]

function normalizeList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return []
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(value))
}

const filterSelectCls =
  'border border-[#E2E8E2] rounded-lg px-3 py-[7px] text-[13px] bg-[#F9FAF9] text-[#1A2B1A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

function FisherfolkPage({ asTab = false }) {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [fisherfolk,  setFisherfolk]  = useState([])
  const [totalCount,  setTotalCount]  = useState(0)
  const [search,      setSearch]      = useState('')
  const [status,      setStatus]      = useState('all')
  const [gender,      setGender]      = useState('all')
  const [typeFilter,  setTypeFilter]  = useState('all')
  const [seniorOnly,  setSeniorOnly]  = useState(false)
  const [filterPWD,   setFilterPWD]   = useState(false)
  const [filter4Ps,   setFilter4Ps]   = useState(false)
  const [page,        setPage]        = useState(1)
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState('')
  const [showAdd,     setShowAdd]     = useState(false)
  const [successMsg,  setSuccessMsg]  = useState('')

  const fetchFisherfolk = async (pageNum = page) => {
    setIsLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (search.trim())    params.set('search', search.trim())
      if (status !== 'all') params.set('status', status)
      if (gender !== 'all') params.set('gender', gender)
      if (typeFilter !== 'all') params.set('fisherfolk_type', typeFilter)
      if (seniorOnly)       params.set('is_senior', 'true')
      if (filterPWD)        params.set('is_pwd', 'true')
      if (filter4Ps)        params.set('is_4ps', 'true')
      params.set('page', pageNum)
      const r = await api.get(`/fisheries/fisherfolk/?${params.toString()}`)
      setFisherfolk(normalizeList(r.data))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      setError('Unable to load fisherfolk records.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    fetchFisherfolk(1)
  }, [search, status, gender, typeFilter, seniorOnly, filterPWD, filter4Ps])

  useEffect(() => { fetchFisherfolk(page) }, [page])

  const tableData = useMemo(() => fisherfolk.map((f) => {
    const ageVal = calcAge(f.birthdate)
    return {
      ...f,
      fishr_number: f.fishr_number || '—',
      age: (
        <span className="inline-flex items-center gap-1">
          {ageVal}
          {f.is_senior_citizen && (
            <span className="text-amber-500 font-bold leading-none" title="Senior Citizen">·</span>
          )}
        </span>
      ),
      status: f.is_active ? 'Active' : 'Inactive',
      date_registered_disp: formatDate(f.date_registered),
    }
  }), [fisherfolk])

  const handleCreated = () => {
    setSuccessMsg('Fisherfolk registered successfully.')
    fetchFisherfolk(1); setPage(1)
  }

  const actionBtn = (isAdmin || isEvaluator) ? (
    <button
      className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
      onClick={() => setShowAdd(true)}
      type="button"
    >
      <Plus size={16} />
      Register Fisherfolk
    </button>
  ) : null

  const innerContent = (
    <>
      {asTab && actionBtn && (
        <div className="flex justify-end mb-3">{actionBtn}</div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-[#E2E8E2] rounded-xl px-4 py-[10px] mb-4 flex items-center gap-2.5 flex-wrap">
        <SearchBar
          onChange={setSearch}
          placeholder="Search by name, LGU Reg. No., FishR No., or barangay"
          value={search}
        />
        <select className={filterSelectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select className={filterSelectCls} value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="all">All Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <select className={filterSelectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="Aquaculture">Aquaculture</option>
          <option value="Capture">Capture</option>
          <option value="Vendor">Vendor</option>
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
            checked={filterPWD}
            onChange={(e) => { setFilterPWD(e.target.checked); setPage(1) }}
            className="w-4 h-4 rounded accent-[#1B4D2E] cursor-pointer border-slate-300"
          />
          <span className="text-[13px] text-[#4A5E4A]">PWD Only</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={filter4Ps}
            onChange={(e) => { setFilter4Ps(e.target.checked); setPage(1) }}
            className="w-4 h-4 rounded accent-[#1B4D2E] cursor-pointer border-slate-300"
          />
          <span className="text-[13px] text-[#4A5E4A]">4Ps Only</span>
        </label>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-[#C8D5C8] bg-[#EBF5EE] px-4 py-3 text-[13px] font-medium text-[#1B4D2E] mb-4">
          {successMsg}
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
        onRowClick={(row) => navigate(`/fisheries/${row.id}`)}
      />

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
      />

      {showAdd && (
        <AddFisherfolkModal
          onClose={() => setShowAdd(false)}
          onSuccess={handleCreated}
        />
      )}
    </>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Fisherfolk Registry"
      subtitle="Registered fisherfolk and their records"
      action={actionBtn}
    >
      {innerContent}
    </PageLayout>
  )
}

export default FisherfolkPage
