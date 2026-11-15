import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart2, TrendingUp } from 'lucide-react'
import PillTabs from '../../components/UI/PillTabs.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import fetchAllPages from '../Citizen/fetchAllPages.js'
import { ForecastDetailModal, YieldAnalysisTab } from '../Forecasting/ForecastingPage.jsx'
import AccountPage from './AccountPage.jsx'
import { searchRows } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { cropStatusLabel } from './myCrops.js'
import { FORECAST_SECTIONS, countdown, forecastText, kg, yieldDifference } from './myForecast.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// The farmer's Forecast page: when each crop still in the field is expected to be harvested (with a countdown) and its estimated
// yield, then the harvested crops with the estimate beside what was actually harvested. Details is the existing forecast window.
// The second tab, Yield analysis, is the existing one as it is (it explains missed activities). The backend limits both to the
// farmer's own crops.

const badgeOf = (crop) => {
  if (crop.status !== 'Harvested') return <StatusBadge status={crop.status}>{cropStatusLabel(crop)}</StatusBadge>
  const difference = yieldDifference(crop.estimated_yield_kg, crop.actual_yield_kg)
  return difference ? <StatusBadge tone={difference.tone}>{difference.text}</StatusBadge> : <StatusBadge tone="grey">Harvested</StatusBadge>
}

const COLUMNS = [
  { key: 'crop_type_name', label: 'Crop', phone: 'title', render: (r) => r.crop_type_name || 'Crop' },
  { key: 'area', label: 'Area (ha)', align: 'right', phone: 'hide', render: (r) => (r.area_planted_ha != null ? Number(r.area_planted_ha).toFixed(2) : null) },
  {
    key: 'expected', label: 'Expected harvest',
    render: (r) => {
      if (!r.expected_harvest_date) return null
      const when = r.status === 'Harvested' ? '' : countdown(r.expected_harvest_date)
      return when ? `${formatDate(r.expected_harvest_date)} (${when})` : formatDate(r.expected_harvest_date)
    },
  },
  { key: 'estimate', label: 'Est. yield', align: 'right', render: (r) => kg(r.estimated_yield_kg) },
  { key: 'actual_date', label: 'Actual harvest', phone: 'hide', render: (r) => (r.actual_harvest_date ? formatDate(r.actual_harvest_date) : null) },
  { key: 'actual', label: 'Actual yield', align: 'right', phone: 'hide', render: (r) => kg(r.actual_yield_kg) },
  { key: 'difference', label: 'Status', phone: 'badge', render: badgeOf },
]

function ForecastList() {
  const [crops, setCrops] = useState([])
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState(null)

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = () => { setState('loading'); reload() }
  useEffect(() => {
    let cancelled = false
    // Growing crops first, the soonest expected harvest first, then the harvested ones: the order a forecast is read in.
    fetchAllPages('/production/monitoring/', { status: 'Planted,Near Harvest,Harvested', ordering: 'forecast' })
      .then((rows) => { if (!cancelled) { setCrops(rows); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [version])

  const rows = useMemo(() => searchRows(crops, search, forecastText), [crops, search])

  return (
    <>
      {state === 'ready' && crops.length > 0 && <ListTools search={search} onSearch={setSearch} placeholder="Search crop or place" />}
      <RecordList
        columns={COLUMNS}
        rows={rows}
        sections={FORECAST_SECTIONS}
        state={state}
        onRetry={retry}
        what="your forecast"
        actions={(crop) => [{ label: 'Details', onClick: () => setViewing(crop) }]}
        empty={search.trim()
          ? { title: 'No crop matches', hint: 'Try another word.' }
          : { title: 'Nothing to forecast yet', hint: 'Your crops appear here once the office registers them.' }}
      />
      {viewing && <ForecastDetailModal record={viewing} onClose={() => setViewing(null)} onUpdated={reload} />}
    </>
  )
}

export default function MyForecastPage() {
  const [tab, setTab] = useState('forecast')
  return (
    <AccountPage title="Forecast" helper="When each crop is expected to be harvested, and how past harvests compared.">
      <div className="mb-4">
        <PillTabs
          ariaLabel="Forecast views"
          tabs={[{ id: 'forecast', icon: TrendingUp, label: 'Forecast' }, { id: 'yield_analysis', icon: BarChart2, label: 'Yield analysis' }]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'forecast' ? <ForecastList /> : <YieldAnalysisTab />}
    </AccountPage>
  )
}
