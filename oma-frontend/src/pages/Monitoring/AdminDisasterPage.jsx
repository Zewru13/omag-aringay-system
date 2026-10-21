import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, Plus, Printer, Users } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import GroupedDisasterTable from './GroupedDisasterTable.jsx'
import { disasterStatusLabel } from './disasterRecovery.js'
import { groupDisasterRows } from './disasterGroups.js'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import FormField from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { fmtLong } from '../FisheriesRecords/stockingHelpers.js'
import { ChooseCropsModal, MultiCropDisasterModal } from './MultiCropDisaster.jsx'
import DisasterLogDetailsModal from './DisasterLogDetailsModal.jsx'
import { FARMER_LOG, FISHERIES_LOG, downloadLog, fetchAllStocks, printLog } from './disasterReportDocument.js'
import { FISHERFOLK_DISASTER_TYPES } from './fisheriesDisasterConstants.js'
import FisherfolkStockDisasterModal from './FisherfolkStockDisasterModal.jsx'

// ADMIN > DISASTER: one module, two use cases on the existing records (no new disaster models):
//   Farmer Disaster    - every CropDisasterReport (GET /production/disaster-logs/); Log Disaster = choose a
//                        farmer and their crop record, then the existing crop disaster form.
//   Fisheries Disaster - every FisheriesDisasterReport, including those fisherfolk submit when they log
//                        (GET /fisheries/disaster-reports/); Log Disaster = choose a fisherfolk and their
//                        stock, then the same full aquaculture form the fisherfolk uses.
// ?tab=farmer|fisheries picks the use case; ?report=<id> opens a Fisheries log (notification links).

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)
const CROP_TYPES = ['Drought', 'Flood', 'Typhoon', 'Strong Winds', 'Pest Outbreak', 'Other']
const SUBMISSION_TONES = { SUBMITTED: 'green', DRAFT: 'amber' }
const STATUS_TONES = { Active: 'amber', Recovered: 'green' }

const fmtDateTime = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '—')
const listOf = (data) => (Array.isArray(data) ? data : (data?.results || []))

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// Paginated, filtered list from one of the two disaster-log endpoints.
function usePagedLogs(url, filters, version) {
  const [state, setState] = useState({ rows: [], count: 0, isLoading: true, error: '' })
  useEffect(() => {
    let cancelled = false
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null))
    api.get(url, { params })
      .then((r) => { if (!cancelled) setState({ rows: r.data.results || [], count: r.data.count || 0, isLoading: false, error: '' }) })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, isLoading: false, error: 'Failed to load disaster logs.' })) })
    return () => { cancelled = true }
  }, [url, JSON.stringify(filters), version]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

function Filters({ search, setSearch, barangay, setBarangay, type, setType, types, status, setStatus, year, setYear, placeholder }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-[260px] flex-1 items-center rounded-xl border border-slate-300 bg-white">
        <SearchBar value={search} onChange={setSearch} placeholder={placeholder} />
      </div>
      <FilterPanel activeCount={[barangay, type, status, year].filter(Boolean).length}>
        <div className="w-48"><BarangaySelect value={barangay} onChange={e => setBarangay(e.target.value)} includeAllOption /></div>
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={type} onChange={e => setType(e.target.value)} aria-label="Disaster type">
          <option value="">All Disaster Types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Recovered">Recovered</option>
        </select>
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" value={year} onChange={e => setYear(e.target.value)} aria-label="Year">
          <option value="">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </FilterPanel>
    </div>
  )
}

// Step 1 of Log Disaster: choose the farmer / fisherfolk (searched from the existing registries).
function ChoosePersonModal({ title, label, searchUrl, onClose, onChoose }) {
  const [q, setQ] = useState('')
  const query = useDebounced(q)
  const [results, setResults] = useState([])
  useEffect(() => {
    let cancelled = false
    if (!query.trim()) return undefined
    api.get(searchUrl, { params: { search: query.trim() } })
      .then(r => { if (!cancelled) setResults(listOf(r.data).slice(0, 15)) })
      .catch(() => { if (!cancelled) setResults([]) })
    return () => { cancelled = true }
  }, [query, searchUrl])
  const shown = query.trim() ? results : []
  return (
    <ModalShell title={title} subtitle={`Step 1 of 3 — choose the ${label.toLowerCase()}`} icon={Users} onClose={onClose} maxWidth="max-w-md"
      footer={<Button type="button" variant="outline" onClick={onClose}>Cancel</Button>}>
      <FormField label={label} required>
        <div className="flex items-center rounded-xl border border-slate-300 bg-white">
          <SearchBar value={q} onChange={setQ} placeholder={`Search ${label.toLowerCase()} by name…`} />
        </div>
      </FormField>
      <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200" data-testid="person-results">
        {shown.map(p => (
          <li key={p.id}>
            <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]" onClick={() => onChoose(p)}>
              <span className="font-medium">{p.full_name}</span>
              <span className="ml-2 text-slate-400">{[p.fisherfolk_type, p.barangay].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="px-4 py-3 text-sm text-slate-400">{query.trim() ? 'No matches.' : 'Type a name to search.'}</li>}
      </ul>
    </ModalShell>
  )
}

// ─── Fisheries Disaster ───────────────────────────────────────────────────────

function FisheriesDisasterTab({ openLog }) {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [year, setYear] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const debounced = useDebounced(search)
  const { rows, count, isLoading, error } = usePagedLogs('/fisheries/disaster-reports/',
    { search: debounced, barangay, disaster_type: type, status, year, page }, version)
  const [busyId, setBusyId] = useState(null)
  const [step, setStep] = useState(null)   // {name:'person'} | {name:'form', person, stocks (null while loading)}

  const setFilter = (fn) => (v) => { fn(v); setPage(1) }
  const act = async (id, fn, failMsg) => {
    setBusyId(id)
    try { await fn() } catch (err) { showToast(err?.message || failMsg, 'error') } finally { setBusyId(null) }
  }

  // The same Log Disaster form a fisherfolk uses, with EVERY active stock of the chosen fisherfolk (all pages)
  // - never another fisherfolk's; the backend checks that again on save.
  const choosePerson = async (person) => {
    setStep({ name: 'form', person, stocks: null })
    let stocks = []
    try {
      const [loaded, eligibility] = await Promise.all([
        fetchAllStocks({ fisherfolk: person.id, status: 'Stocked,Near Harvest' }),
        api.get('/monitoring/fisherfolk-disasters/eligibility/', { params: { fisherfolk: person.id } }),
      ])
      if (!eligibility.data.can_log_disaster) {
        // No pond, cage or stock on record: no disaster can be logged for this fisherfolk (the rule their own screen applies).
        setStep(null)
        showToast(eligibility.data.message, 'error')
        return
      }
      stocks = loaded
    } catch {
      showToast('Could not check this fisherfolk\'s ponds, cages and stocks. Please try again.', 'error')
      setStep(null)
      return
    }
    setStep(prev => (prev?.name === 'form' && prev.person.id === person.id ? { ...prev, stocks } : prev))
  }
  const onLogged = (log) => { setStep(null); setVersion(v => v + 1); if (log?.id) openLog(log.id) }

  const data = useMemo(() => rows.map(r => ({
    ...r,
    stock_cell: r.affected_stock || <span className="text-slate-400">Not linked to a stock</span>,
    date_fmt: fmtLong(r.date_of_occurrence),
    volume_fmt: r.volume_lost_kg != null ? `${Number(r.volume_lost_kg).toLocaleString()} kg` : '—',
    status_cell: (
      <span className="flex flex-col items-start gap-1">
        <StatusPill tone={SUBMISSION_TONES[r.submission_status] || 'slate'}>{r.submission_label}</StatusPill>
        <span className={`text-[11px] font-semibold ${r.status === 'Active' && r.can_recover !== false ? 'text-amber-700' : r.status === 'Active' ? 'text-slate-600' : 'text-green-700'}`} title={r.recovery_block_reason || undefined}>{disasterStatusLabel(r)}</span>
      </span>
    ),
    logged_fmt: fmtDateTime(r.submitted_at || r.date_reported),
    actions_cell: (
      <RowActions actions={[
        { key: 'view', label: 'View Details', icon: Eye, onClick: () => openLog(r.id) },
        { key: 'print', label: 'Print Disaster Log', icon: Printer, disabled: busyId === r.id, onClick: () => act(r.id, () => printLog(FISHERIES_LOG, r.id), 'The disaster log could not be printed.') },
        { key: 'download', label: 'Download Disaster Log', icon: Download, disabled: busyId === r.id, onClick: () => act(r.id, () => downloadLog(FISHERIES_LOG, r.id, r.pdf_filename), 'The PDF could not be generated.') },
      ]} />
    ),
  })), [rows, busyId]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupDisasterRows(data, { idKey: 'fisherfolk_id', nameKey: 'fisherfolk_name', barangayKey: 'fisherfolk_barangay' }), [data])

  return (
    <div className="space-y-4" data-testid="fisheries-disaster-tab">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Fisheries Disasters</h2>
          <p className="text-xs text-slate-500">All fisherfolk aquaculture disaster logs, including those fisherfolk submit when they log.</p>
        </div>
        <Button className="shrink-0 whitespace-nowrap" onClick={() => setStep({ name: 'person' })}><Plus size={15} className="mr-1" /> Log Disaster</Button>
      </div>
      <Filters search={search} setSearch={setFilter(setSearch)} barangay={barangay} setBarangay={setFilter(setBarangay)}
        type={type} setType={setFilter(setType)} types={FISHERFOLK_DISASTER_TYPES} status={status} setStatus={setFilter(setStatus)}
        year={year} setYear={setFilter(setYear)} placeholder="Search fisherfolk, species, disaster or reference no.…" />
      {error ? <ErrorMessage message={error} /> : (
        <>
          <GroupedDisasterTable personLabel="Fisherfolk" groups={groups} isLoading={isLoading} onOpen={(row) => openLog(row.id)}
            emptyText="No fisheries disasters found."
            columns={[
              { key: 'report_number', label: 'Reference No.' }, { key: 'stock_cell', label: 'Affected Stock / Pond' }, { key: 'date_fmt', label: 'Date' },
              { key: 'disaster_type_label', label: 'Disaster' }, { key: 'volume_fmt', label: 'Volume Lost' },
              { key: 'status_cell', label: 'Status' }, { key: 'logged_fmt', label: 'Logged / Submitted' }, { key: 'actions_cell', label: 'Actions' },
            ]} />
          <PaginationBar page={page} totalCount={count} pageSize={20} onPageChange={setPage} />
        </>
      )}

      {step?.name === 'person' && (
        <ChoosePersonModal title="Log Fisheries Disaster" label="Fisherfolk" searchUrl="/fisheries/fisherfolk/"
          onClose={() => setStep(null)} onChoose={choosePerson} />
      )}
      {step?.name === 'form' && (
        <FisherfolkStockDisasterModal stocks={step.stocks} fisherfolk={step.person}
          onClose={() => setStep(null)} onSaved={onLogged} />
      )}
    </div>
  )
}

// ─── Farmer Disaster ──────────────────────────────────────────────────────────

function FarmerDisasterTab() {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [year, setYear] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const debounced = useDebounced(search)
  const { rows, count, isLoading, error } = usePagedLogs('/production/disaster-logs/',
    { search: debounced, barangay, disaster_type: type, status, year, page }, version)
  const [busyId, setBusyId] = useState(null)
  const [viewingId, setViewingId] = useState(null)
  const [step, setStep] = useState(null)

  const setFilter = (fn) => (v) => { fn(v); setPage(1) }
  const act = async (id, fn, failMsg) => {
    setBusyId(id)
    try { await fn() } catch (err) { showToast(err?.message || failMsg, 'error') } finally { setBusyId(null) }
  }

  const choosePerson = async (person) => {
    setStep({ name: 'record', person, options: null })
    try {
      const r = await api.get('/production/monitoring/', { params: { farmer: person.id } })
      setStep({ name: 'record', person, options: listOf(r.data).filter(c => c.status !== 'Harvested').map(c => ({
        ...c, label: `${c.crop_type_name || 'Crop'}${c.season ? ` · ${c.season} ${c.year}` : ''} — planted ${fmtLong(c.date_planted)}${c.farm_location_barangay ? ` · ${c.farm_location_barangay}` : ''}`,
      })) })
    } catch {
      showToast('Failed to load this farmer\'s crop records.', 'error')
      setStep({ name: 'record', person, options: [] })
    }
  }

  const data = useMemo(() => rows.map(r => ({
    ...r,
    date_fmt: fmtLong(r.date_of_occurrence),
    area_fmt: r.area_affected_ha != null ? `${Number(r.area_affected_ha).toLocaleString()} ha` : '—',
    status_cell: <span title={r.recovery_block_reason || undefined}><StatusPill tone={r.status === 'Active' && r.can_recover === false ? 'slate' : (STATUS_TONES[r.status] || 'slate')}>{disasterStatusLabel(r)}</StatusPill></span>,
    logged_fmt: fmtDateTime(r.date_reported),
    actions_cell: (
      <RowActions actions={[
        { key: 'view', label: 'View Details', icon: Eye, onClick: () => setViewingId(r.id) },
        { key: 'print', label: 'Print Disaster Log', icon: Printer, disabled: busyId === r.id, onClick: () => act(r.id, () => printLog(FARMER_LOG, r.id), 'The disaster log could not be printed.') },
        { key: 'download', label: 'Download Disaster Log', icon: Download, disabled: busyId === r.id, onClick: () => act(r.id, () => downloadLog(FARMER_LOG, r.id, r.pdf_filename), 'The PDF could not be generated.') },
      ]} />
    ),
  })), [rows, busyId]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupDisasterRows(data, { idKey: 'farmer_id', nameKey: 'farmer_name', barangayKey: 'location' }), [data])

  return (
    <div className="space-y-4" data-testid="farmer-disaster-tab">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Farmer Disasters</h2>
          <p className="text-xs text-slate-500">All disaster logs on farmers' crop records.</p>
        </div>
        <Button className="shrink-0 whitespace-nowrap" onClick={() => setStep({ name: 'person' })}><Plus size={15} className="mr-1" /> Log Disaster</Button>
      </div>
      <Filters search={search} setSearch={setFilter(setSearch)} barangay={barangay} setBarangay={setFilter(setBarangay)}
        type={type} setType={setFilter(setType)} types={CROP_TYPES} status={status} setStatus={setFilter(setStatus)}
        year={year} setYear={setFilter(setYear)} placeholder="Search farmer, crop, disaster or reference no.…" />
      {error ? <ErrorMessage message={error} /> : (
        <>
          <GroupedDisasterTable personLabel="Farmer" groups={groups} isLoading={isLoading} onOpen={(row) => setViewingId(row.id)}
            emptyText="No crop disasters found."
            columns={[
              { key: 'report_number', label: 'Reference No.' }, { key: 'crop', label: 'Crop' },
              { key: 'location', label: 'Location' }, { key: 'date_fmt', label: 'Date' }, { key: 'disaster_type_label', label: 'Disaster' },
              { key: 'area_fmt', label: 'Area Affected' }, { key: 'status_cell', label: 'Status' }, { key: 'logged_fmt', label: 'Date Logged' },
              { key: 'actions_cell', label: 'Actions' },
            ]} />
          <PaginationBar page={page} totalCount={count} pageSize={20} onPageChange={setPage} />
        </>
      )}

      {viewingId && <DisasterLogDetailsModal key={viewingId} kind="farmer" logId={viewingId} onClose={() => setViewingId(null)} />}
      {step?.name === 'person' && (
        <ChoosePersonModal title="Log Farmer Disaster" label="Farmer" searchUrl="/farmers/" onClose={() => setStep(null)} onChoose={choosePerson} />
      )}
      {step?.name === 'record' && (
        <ChooseCropsModal title="Log Farmer Disaster" subtitle={`Step 2 of 3 — ${step.person.full_name}: choose the affected crops`} crops={step.options}
          onBack={() => setStep({ name: 'person' })} onClose={() => setStep(null)}
          onContinue={(chosen) => setStep({ name: 'form', person: step.person, options: step.options, crops: chosen })} />
      )}
      {step?.name === 'form' && (
        // One form for every chosen crop (it posts to /production/disasters/multi/, one report per crop).
        <MultiCropDisasterModal crops={step.crops}
          onBack={() => setStep({ name: 'record', person: step.person, options: step.options })}
          onClose={() => setStep(null)} onSuccess={() => setVersion(v => v + 1)} />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDisasterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const reportId = Number(searchParams.get('report')) || null
  // The sidebar's Disaster group (Crop Disaster / Fisheries Disaster) is the only navigation between the two
  // views, so there is no in-page switcher: ?tab=fisheries (or an opened ?report=) is Fisheries, anything else Crop.
  const tab = searchParams.get('tab') === 'fisheries' || reportId ? 'fisheries' : 'farmer'
  const openLog = (id) => setSearchParams({ tab: 'fisheries', report: String(id) }, { replace: true })
  const closeLog = () => setSearchParams({ tab: 'fisheries' }, { replace: true })

  return (
    <PageLayout
      title={tab === 'fisheries' ? 'Fisheries Disaster' : 'Crop Disaster'}
      subtitle={tab === 'fisheries' ? 'Disaster logs of fisherfolk aquaculture stocks' : "Disaster logs of farmers' crops"}
    >
      <div className="space-y-5">
        {tab === 'farmer' && <FarmerDisasterTab />}
        {tab === 'fisheries' && <FisheriesDisasterTab openLog={openLog} />}
      </div>
      {reportId && <DisasterLogDetailsModal key={reportId} kind="fisheries" logId={reportId} onClose={closeLog} />}
    </PageLayout>
  )
}
