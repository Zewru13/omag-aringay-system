import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import RsbsaImportModal from '../../components/RsbsaImportModal.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import HarvestComparisonCard from '../../components/dashboard/HarvestComparisonCard.jsx'
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
  { key: 'fishr_number',            label: 'FishR No.' },
  { key: 'rsbsa_number',            label: 'RSBSA No.' },
  { key: 'full_name',               label: 'Full Name' },
  { key: 'fisherfolk_type',         label: 'Type' },
  { key: 'activity_badges',         label: 'Activities' },
  { key: 'barangay',                label: 'Barangay' },
  { key: 'age',                     label: 'Age' },
  { key: 'status',                  label: 'Status' },
  { key: 'date_registered_disp',    label: 'Date Registered' },
]

const mutedBadgeCls = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500'

const ACTIVITY_BADGES = [
  { key: 'is_aquaculture',     label: 'AQ',  tone: 'bg-emerald-100 text-emerald-700' },
  { key: 'is_capture_fishery', label: 'CF',  tone: 'bg-blue-100 text-blue-700' },
  { key: 'is_mariculture',     label: 'MC',  tone: 'bg-cyan-100 text-cyan-700' },
  { key: 'is_inland_fishery',  label: 'IF',  tone: 'bg-indigo-100 text-indigo-700' },
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
  const [registeredFrom, setRegisteredFrom] = useState('')
  const [registeredTo,   setRegisteredTo]   = useState('')
  const [page,        setPage]        = useState(1)
  const [isLoading,   setIsLoading]   = useState(true)
  const [error,       setError]       = useState('')
  const [showAdd,     setShowAdd]     = useState(false)
  const [showImport,  setShowImport]  = useState(false)
  const [successMsg,  setSuccessMsg]  = useState('')
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
    if (typeFilter !== 'all') params.set('fisherfolk_type', typeFilter)
    if (seniorOnly)       params.set('is_senior', 'true')
    if (filterPWD)        params.set('is_pwd', 'true')
    if (filter4Ps)        params.set('is_4ps', 'true')
    if (registeredFrom)   params.set('registered_from', registeredFrom)
    if (registeredTo)     params.set('registered_to', registeredTo)
    return params
  }

  const fetchFisherfolk = async (pageNum = page) => {
    const requestId = ++latestRequest.current
    setIsLoading(true); setError('')
    try {
      const params = listFilterParams()
      params.set('page', pageNum)
      const r = await api.get(`/fisheries/fisherfolk/?${params.toString()}`)
      if (requestId !== latestRequest.current) return   // a newer request has been sent; this answer is out of date
      setFisherfolk(normalizeList(r.data))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      if (requestId === latestRequest.current) setError('Unable to load fisherfolk records.')
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    fetchFisherfolk(1)
  }, [search, status, gender, typeFilter, seniorOnly, filterPWD, filter4Ps, registeredFrom, registeredTo])

  useEffect(() => { fetchFisherfolk(page) }, [page])

  const activeFilterCount = [
    status !== 'all',
    gender !== 'all',
    typeFilter !== 'all',
    seniorOnly,
    filterPWD,
    filter4Ps,
    Boolean(registeredFrom),
    Boolean(registeredTo),
  ].filter(Boolean).length

  const tableData = useMemo(() => fisherfolk.map((f) => {
    const ageVal = calcAge(f.birthdate)
    return {
      ...f,
      fishr_number: f.fishr_number
        ? f.fishr_number
        : <span className={mutedBadgeCls}>No FishR</span>,
      rsbsa_number: f.rsbsa_number || '—',
      full_name: f.full_name,
      activity_badges: (
        <span className="inline-flex flex-wrap gap-1">
          {ACTIVITY_BADGES.map((b) => f[b.key] ? (
            <span key={b.key} className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${b.tone}`}>
              {b.label}
            </span>
          ) : null)}
        </span>
      ),
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
    <div className="flex items-center gap-2">
      <button
        className="flex items-center gap-1.5 border border-[#D8E2D8] bg-white hover:bg-[#F5F7F5] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
        onClick={() => setShowImport(true)}
        type="button"
      >
        <Upload size={16} />
        Import Fisherfolk
      </button>
      <button
        className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
        onClick={() => setShowAdd(true)}
        type="button"
      >
        <Plus size={16} />
        Register Fisherfolk
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
        searchPlaceholder="Search by name, RSBSA No., FishR No., or barangay"
        activeCount={activeFilterCount}
      >
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
          <option value="Capture">Capture Fishery</option>
          <option value="Mariculture">Mariculture</option>
          <option value="Inland">Inland Fishery</option>
          <option value="Unspecified">Not Yet Classified</option>
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

      <HarvestComparisonCard url="/fisheries/fisherfolk/harvest-comparison/" listQuery={listFilterParams().toString()} noun="fisherfolk" nounOne="fisherfolk" />

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
        phoneTitleKey="full_name"
        phoneOpenLabel="Open fisherfolk profile"
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

      {showImport && (
        <RsbsaImportModal
          onClose={() => setShowImport(false)}
          onCommitted={() => fetchFisherfolk(1)}
        />
      )}
    </>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Fisherfolk Registry"
      subtitle="Registered fisherfolk and their records"
    >
      {innerContent}
    </PageLayout>
  )
}

export default FisherfolkPage
