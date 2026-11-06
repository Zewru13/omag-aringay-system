import { useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import AddButton from '../../components/UI/AddButton.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import DateRangeFields from '../../components/UI/DateRangeFields.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import OwnershipCell from '../../components/UI/OwnershipCell.jsx'
import PcicCell from '../../components/UI/PcicCell.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { AQUACULTURE_PCIC_OPTIONS } from '../../utils/pcic.js'
import StartProductionCycleModal from '../Monitoring/StartProductionCycleModal.jsx'
import {
  EMPTY_FILTERS, PAGE_SIZE, RECORD_COLUMNS, activeFilterCount, applyProblem, countLabel, filtersChanged, recordRow, recordsParams,
} from './aquacultureRecords.js'

// Aquaculture Records (Fisheries Management > Aquaculture Records), laid out like Crop Records: a search bar with the Filters button and
// the Start Production Cycle button, the production cycles in a table, and pagination. Production cycles are made here (the same
// Start Production Cycle form Aquaculture Monitoring used to open) and watched in Aquaculture Monitoring: both read the same records
// (GET /fisheries/stocking/), so a new cycle shows in both. The filter lists come from the existing records
// (GET /fisheries/stocking/filter-options/); what is picked is a draft until Apply Filters, Reset Filters clears it.

const filterSelectCls =
  'rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none max-md:w-full'

const NO_OPTIONS = {
  ownerships: [], cycles: [], species: [], fisherfolk: [], barangays: [], pond_locations: [], culture_types: [], organizations: [],
}

function FilterSelect({ label, all, value, onChange, children }) {
  return (
    <select className={filterSelectCls} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{all}</option>
      {children}
    </select>
  )
}

export default function AquacultureRecordsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [draft, setDraft] = useState(EMPTY_FILTERS)        // what the panel shows
  const [applied, setApplied] = useState(EMPTY_FILTERS)    // what the table uses
  const [options, setOptions] = useState(NO_OPTIONS)
  const [showStartCycle, setShowStartCycle] = useState(false)
  const [reload, setReload] = useState(0)

  const pick = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }))
  const problem = applyProblem(draft)

  // The table shows the answer to the request of the current page, search and applied filters. An answer to an older request is never
  // used (its key no longer matches), and "loading" is simply "no answer for the current key yet".
  const key = useMemo(() => `${reload}|${JSON.stringify(recordsParams({ filters: applied, search: debouncedSearch, page }))}`, [applied, debouncedSearch, page, reload])
  const [result, setResult] = useState({ key: null, records: [], count: 0, failed: false })
  useEffect(() => {
    let cancelled = false
    api.get('/fisheries/stocking/', { params: recordsParams({ filters: applied, search: debouncedSearch, page }) })
      .then((r) => {
        if (cancelled) return
        setResult({ key, records: Array.isArray(r.data) ? r.data : (r.data.results || []), count: typeof r.data?.count === 'number' ? r.data.count : 0, failed: false })
      })
      .catch(() => { if (!cancelled) setResult({ key, records: [], count: 0, failed: true }) })
    return () => { cancelled = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const isLoading = result.key !== key
  const records = result.records
  const totalCount = result.count
  const error = result.failed && !isLoading ? 'Failed to load the production cycles.' : ''

  // The dropdown lists, from the existing records; read again after a cycle is started (it may bring a new cycle name, location or organization).
  useEffect(() => {
    let cancelled = false
    api.get('/fisheries/stocking/filter-options/')
      .then((r) => { if (!cancelled) setOptions({ ...NO_OPTIONS, ...r.data }) })
      .catch(() => { /* the filters stay empty; the table still works */ })
    return () => { cancelled = true }
  }, [reload])

  const apply = () => { if (problem) return; setApplied(draft); setPage(1) }
  const reset = () => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPage(1) }

  const rows = useMemo(() => records.map((rec) => {
    const row = recordRow(rec)
    return {
      id: rec.id,
      ownership_cell: <OwnershipCell record={rec} />,
      cycle_cell: (
        <span className="block">
          <span className="block">{row.cycle}</span>
          {row.cycleNo && <span className="block text-[11px] text-[#7A8E7A]">{row.cycleNo}</span>}
        </span>
      ),
      species_cell: <span className="font-medium">{row.species}</span>,
      fisherfolk_cell: row.fisherfolk,
      barangay_cell: row.barangay,
      pond_location_cell: row.pondLocation,
      culture_type_cell: row.cultureType,
      organization_cell: row.organization,
      date_stocked_cell: row.dateStocked,
      pcic_cell: <PcicCell insured={row.insured} photos={rec.pcic_form_photos} url={rec.pcic_form_photo} />,
    }
  }), [records])

  return (
    <PageLayout title="Aquaculture Records">
      <div className="space-y-4">
        <FilterPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}   // a new search starts from the first page
          searchPlaceholder="Search by fisherfolk, RSBSA no., species, or barangay..."
          activeCount={activeFilterCount(applied)}
          actions={<AddButton onClick={() => setShowStartCycle(true)}>Start Production Cycle</AddButton>}
        >
          <FilterSelect label="Ownership" all="All Ownerships" value={draft.ownership} onChange={pick('ownership')}>
            {options.ownerships.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Cycle" all="All Cycles" value={draft.cycle} onChange={pick('cycle')}>
            {options.cycles.map((c) => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
          <FilterSelect label="Species" all="All Species" value={draft.species} onChange={pick('species')}>
            {options.species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Fisherfolk" all="All Fisherfolk" value={draft.fisherfolk} onChange={pick('fisherfolk')}>
            {options.fisherfolk.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Barangay" all="All Barangays" value={draft.barangay} onChange={pick('barangay')}>
            {options.barangays.map((b) => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
          <FilterSelect label="Pond/Cage Location" all="All Pond/Cage Locations" value={draft.pondLocation} onChange={pick('pondLocation')}>
            {options.pond_locations.map((b) => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
          <FilterSelect label="Culture Type" all="All Culture Types" value={draft.cultureType} onChange={pick('cultureType')}>
            {options.culture_types.map((c) => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
          <FilterSelect label="Organization" all="All Organizations" value={draft.organization} onChange={pick('organization')}>
            {options.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </FilterSelect>
          <select className={filterSelectCls} value={draft.pcic} onChange={(e) => pick('pcic')(e.target.value)} aria-label="PCIC insured">
            {AQUACULTURE_PCIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <DateRangeFields label="Stocked" from={draft.stockedFrom} to={draft.stockedTo} onFromChange={pick('stockedFrom')} onToChange={pick('stockedTo')} />
          <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-[#F0F4F0] pt-3">
            {filtersChanged(draft, applied) && !problem && <span className="mr-auto text-[12px] text-[#7A8E7A]">Press Apply Filters to update the table.</span>}
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-[#E2E8E2] bg-white px-4 py-2 text-[13px] font-medium text-[#4A5E4A] transition-colors hover:bg-[#F0F4F0] max-md:min-h-[40px] max-md:flex-1"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={Boolean(problem)}
              className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-[40px] max-md:flex-1"
            >
              Apply Filters
            </button>
          </div>
        </FilterPanel>

        {error && <ErrorMessage message={error} />}

        {!isLoading && !error && <p className="text-[12px] text-[#7A8E7A]" role="status" data-testid="record-count">{countLabel(totalCount)}</p>}

        <DataTable
          columns={RECORD_COLUMNS}
          data={rows}
          isLoading={isLoading}
          phoneTitleKey="species_cell"
          phoneSubtitleKey="fisherfolk_cell"
          emptyState={(
            <div className="py-12 text-center">
              <p className="text-[14px] font-medium text-[#4A5E4A]">No production cycles found</p>
              <p className="text-[13px] text-[#7A8E7A]">Try adjusting your search or filters, or press Start Production Cycle to add one.</p>
            </div>
          )}
        />

        <PaginationBar page={page} totalCount={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {showStartCycle && (
        <StartProductionCycleModal
          onClose={() => setShowStartCycle(false)}
          onSuccess={() => { setShowStartCycle(false); setPage(1); setReload((n) => n + 1) }}
        />
      )}
    </PageLayout>
  )
}
