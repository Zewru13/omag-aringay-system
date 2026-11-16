import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart2, TrendingUp } from 'lucide-react'
import PillTabs from '../../components/UI/PillTabs.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import fetchAllPages from '../Citizen/fetchAllPages.js'
import { cycleStatusText } from '../FisheriesRecords/emergencyForceHarvest.js'
import ForecastingTab, { StockingForecastDetailModal } from '../Monitoring/FisheriesForecastingTab.jsx'
import AccountPage from './AccountPage.jsx'
import { searchRows } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { CYCLE_FORECAST_SECTIONS, cycleStatusLabel, cycleText, cycleTitle, sortCycles } from './myCycles.js'
import { countdown, kg, yieldDifference } from './myForecast.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// The fisherfolk's Forecast page: when each cycle still in the water is expected to be harvested (with a countdown) and its estimated
// harvest, then the harvested cycles with the estimate beside what was actually harvested. Details is the existing forecast window. The
// second tab, Yield analysis, is the office's own analysis as it is (view="yield": only that tab). The backend limits both to the
// fisherfolk's own cycles.

const harvested = (rec) => CYCLE_FORECAST_SECTIONS[1].match(rec)

const badgeOf = (rec) => {
  if (!harvested(rec)) return <StatusBadge status={cycleStatusText(rec)}>{cycleStatusLabel(rec)}</StatusBadge>
  const difference = yieldDifference(rec.estimated_harvest_kg, rec.total_harvested_kg)
  return difference ? <StatusBadge tone={difference.tone}>{difference.text}</StatusBadge> : <StatusBadge tone="grey">{cycleStatusLabel(rec)}</StatusBadge>
}

const COLUMNS = [
  { key: 'title', label: 'Species', phone: 'title', render: cycleTitle },
  { key: 'number_of_units', label: 'Ponds and cages', align: 'right', phone: 'hide' },
  {
    key: 'expected', label: 'Expected harvest',
    render: (r) => {
      if (!r.expected_harvest_date) return null
      const when = harvested(r) ? '' : countdown(r.expected_harvest_date)
      return when ? `${formatDate(r.expected_harvest_date)} (${when})` : formatDate(r.expected_harvest_date)
    },
  },
  { key: 'estimate', label: 'Est. harvest', align: 'right', render: (r) => kg(r.estimated_harvest_kg) },
  { key: 'actual_date', label: 'Actual harvest', phone: 'hide', render: (r) => (r.actual_harvest_date ? formatDate(r.actual_harvest_date) : null) },
  { key: 'actual', label: 'Harvested', align: 'right', phone: 'hide', render: (r) => (harvested(r) ? kg(r.total_harvested_kg) : null) },
  { key: 'difference', label: 'Status', phone: 'badge', render: badgeOf },
]

function ForecastList() {
  const [cycles, setCycles] = useState([])
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState(null)

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = () => { setState('loading'); reload() }
  useEffect(() => {
    let cancelled = false
    // The same cycles the office's forecast reads (a lost cycle has nothing to forecast).
    fetchAllPages('/fisheries/stocking/', { status: 'Stocked,Near Harvest,Harvested' })
      .then((rows) => { if (!cancelled) { setCycles(rows); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [version])

  const rows = useMemo(() => sortCycles(searchRows(cycles, search, cycleText)), [cycles, search])

  return (
    <>
      {state === 'ready' && cycles.length > 0 && <ListTools search={search} onSearch={setSearch} placeholder="Search species or place" />}
      <RecordList
        columns={COLUMNS}
        rows={rows}
        sections={CYCLE_FORECAST_SECTIONS}
        state={state}
        onRetry={retry}
        what="your forecast"
        actions={(rec) => [{ label: 'Details', onClick: () => setViewing(rec) }]}
        empty={search.trim()
          ? { title: 'No cycle matches', hint: 'Try another word.' }
          : { title: 'Nothing to forecast yet', hint: 'Start a production cycle to see its expected harvest here.' }}
      />
      {viewing && <StockingForecastDetailModal record={viewing} onClose={() => setViewing(null)} onUpdated={reload} />}
    </>
  )
}

export default function MyFisheriesForecastPage() {
  const [tab, setTab] = useState('forecast')
  return (
    <AccountPage title="Forecast" helper="When each cycle is expected to be harvested, and how past harvests compared.">
      <div className="mb-4">
        <PillTabs
          ariaLabel="Forecast views"
          tabs={[{ id: 'forecast', icon: TrendingUp, label: 'Forecast' }, { id: 'yield_analysis', icon: BarChart2, label: 'Yield analysis' }]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'forecast' ? <ForecastList /> : <ForecastingTab asTab view="yield" />}
    </AccountPage>
  )
}
