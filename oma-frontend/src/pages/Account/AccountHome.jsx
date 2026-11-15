import { useCallback, useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { formatDate, formatDateWithWeekday } from '../../utils/dateFormat.js'
import fetchAllPages from '../Citizen/fetchAllPages.js'
import { FARMERS_ORG_DOMAIN, FISHERFOLK_ORG_DOMAIN } from '../Citizen/orgDomainConfig.js'
import AccountPage from './AccountPage.jsx'
import { accountKind } from './accountNav.js'
import { failedText, greeting, homeActive, homeSources, homeSummary } from './homeData.js'
import { EmptyNote, LoadFailed, LoadingRows } from './ListStates.jsx'
import { listOf, settleAll } from './loadState.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'
import TodoCard from './TodoCard.jsx'
import { capTodos, farmerTodos, fisherfolkTodos, orgTodos } from './todoRules.js'

// Home of a farmer, fisherfolk or organization account. In this order: what needs the person today (each with the button that
// opens the page where it is done), then what is active, then three summary figures. It only reads: the endpoints are the ones the
// account's own pages use, and the backend limits each to this account's records. Every part is loaded on its own (settleAll), so one
// failure is shown as a failure and never as "none" or as zero.

const ALL_CROPS = 'Planted,Near Harvest,Harvested,Total Loss'
const ALL_CYCLES = 'Stocked,Near Harvest,Late,Harvested,Total Loss'

// How each part is read. The member's loans come grouped by organization; Home only needs the loans.
function loaders(kind, orgId) {
  const org = kind === 'orgFish' ? FISHERFOLK_ORG_DOMAIN : FARMERS_ORG_DOMAIN
  const orgType = kind === 'orgFish' ? 'fisherfolk' : 'farmers'
  const memberLoans = () => api.get('/organizations/my-equipment/').then((res) => listOf(res).flatMap((group) => group.loans || []))
  if (kind === 'farmer') {
    return {
      assistance: () => api.get('/interventions/my-beneficiary-history/'),
      crops: () => fetchAllPages('/production/monitoring/', { status: ALL_CROPS }),
      parcels: () => api.get('/farmers/me/parcels/'),
      loans: memberLoans,
    }
  }
  if (kind === 'fisherfolk') {
    return {
      assistance: () => api.get('/interventions/my-fisherfolk-beneficiary-history/'),
      cycles: () => fetchAllPages('/fisheries/stocking/', { status: ALL_CYCLES }),
      loans: memberLoans,
    }
  }
  return {
    members: () => api.get(org.membersUrl(orgId)),
    confirmables: () => api.get(org.accountlessConfirmablesUrl),
    loans: () => api.get(`/organizations/${orgType}/${orgId}/equipment-loans/`),
  }
}

// The activities each active crop suggests next ({ cropId: [...] }); null when any of them could not be read.
async function loadSuggestions(crops) {
  const active = homeActive('farmer', { crops })
  const { data, failed } = await settleAll(Object.fromEntries(active.map((crop) => [
    crop.id, () => api.get(`/production/monitoring/${crop.id}/suggestions/`).then((res) => res.data?.suggestions || []),
  ])))
  return failed.length ? null : data
}

async function loadHome(kind, { isMember, orgId }) {
  const all = loaders(kind, orgId)
  const wanted = homeSources(kind, { isMember })
  const { data: raw, failed } = await settleAll(Object.fromEntries(wanted.map((name) => [name, all[name]])))
  const data = Object.fromEntries(wanted.map((name) => [name, raw[name] === null ? null : listOf(raw[name])]))
  if (kind === 'farmer' && data.crops) {
    data.suggestions = await loadSuggestions(data.crops)
    if (data.suggestions === null) failed.push('suggestions')
  }
  return { data, failed }
}

const CROP_STATUS = { Planted: 'Growing', 'Near Harvest': 'Ready to harvest' }
const CROP_COLUMNS = [
  { key: 'crop_type_name', label: 'Crop', phone: 'title' },
  { key: 'area', label: 'Area (ha)', align: 'right', phone: 'hide', render: (r) => (r.area_planted_ha != null ? Number(r.area_planted_ha).toFixed(2) : null) },
  { key: 'farm_location_barangay', label: 'Location' },
  { key: 'harvest', label: 'Harvest date', render: (r) => formatDate(r.expected_harvest_date) },
  { key: 'status', label: 'Status', phone: 'badge', render: (r) => <StatusBadge status={r.status}>{CROP_STATUS[r.status] || r.status}</StatusBadge> },
]

const cycleReady = (r) => r.force_harvest || r.is_near_harvest || r.status === 'Near Harvest'
const CYCLE_COLUMNS = [
  { key: 'species', label: 'Species', phone: 'title', render: (r) => [r.species_name, r.production_cycle_no ? `Cycle #${r.production_cycle_no}` : null].filter(Boolean).join(', ') },
  { key: 'number_of_units', label: 'Ponds and cages', align: 'right', phone: 'hide' },
  { key: 'place', label: 'Location', render: (r) => [r.culture_type, r.pond_location_barangay].filter(Boolean).join(', ') },
  { key: 'harvest', label: 'Harvest date', render: (r) => formatDate(r.expected_harvest_date) },
  {
    key: 'status', label: 'Status', phone: 'badge',
    render: (r) => (cycleReady(r)
      ? <StatusBadge tone="amber">Ready to harvest</StatusBadge>
      : <StatusBadge status={r.status}>{r.status === 'Stocked' ? 'Growing' : r.status}</StatusBadge>),
  },
]

const LIST = {
  farmer: {
    source: 'crops', heading: 'My crops', columns: CROP_COLUMNS,
    actions: (r) => [{ label: 'Details', to: `/crop-monitoring?record=${r.id}` }],
    empty: { title: 'No crops yet', hint: 'Your crops appear here once the office registers them.' },
  },
  fisherfolk: {
    source: 'cycles', heading: 'My cycles', columns: CYCLE_COLUMNS,
    actions: (r) => [{ label: 'Details', to: `/fisheries-monitoring?cycle=${r.production_cycle}` }],
    empty: { title: 'No cycles yet', hint: 'Start a production cycle to see it here.', link: { label: 'Start a cycle', to: '/fisheries-monitoring' } },
  },
}

const SECTION = 'mb-2 text-[14px] font-semibold text-text-primary'
const LINK_BUTTON = 'press-scale inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-primary px-4 text-[14px] font-semibold text-white transition-colors hover:bg-primary-hover'

export default function AccountHome() {
  const auth = useAuth()
  const { user } = auth
  const kind = accountKind(auth)
  const orgId = user?.linked_record?.id
  const isMember = (user?.linked_record?.organization_names?.length || 0) > 0
  const isOrg = kind === 'orgFarm' || kind === 'orgFish'
  const [home, setHome] = useState({ state: 'loading', data: {}, failed: [] })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => { setHome({ state: 'loading', data: {}, failed: [] }); setAttempt((n) => n + 1) }, [])

  useEffect(() => {
    let cancelled = false
    loadHome(kind, { isMember, orgId }).then((loaded) => { if (!cancelled) setHome({ state: 'ready', ...loaded }) })
    return () => { cancelled = true }
  }, [kind, isMember, orgId, attempt])

  const { data, failed } = home
  const hello = greeting(kind, user?.linked_record?.label || user?.full_name)
  const todos = kind === 'farmer' ? farmerTodos(data)
    : kind === 'fisherfolk' ? fisherfolkTodos(data)
      : orgTodos(data, { assistancePath: kind === 'orgFish' ? '/fisheries-assistance' : '/crop-assistance' })
  const { shown, more } = capTodos(todos)
  const list = LIST[kind]
  const active = homeActive(kind, data)
  const orgDomain = kind === 'orgFish' ? FISHERFOLK_ORG_DOMAIN : FARMERS_ORG_DOMAIN
  const summary = homeSummary(kind, data, { isActive: orgDomain.rowIsActive })

  return (
    <AccountPage title={hello.title} helper={`${hello.line} · ${formatDateWithWeekday(new Date())}`}>
      {home.state === 'loading' ? <LoadingRows count={4} /> : (
        <div className="space-y-6">
          {failed.length > 0 && <LoadFailed what={failedText(failed)} onRetry={retry} />}

          <section aria-labelledby="home-todo">
            <h2 id="home-todo" className={SECTION}>To do today{todos.length > 0 ? ` (${todos.length})` : ''}</h2>
            {shown.length > 0 ? (
              <>
                <ul className="space-y-2">{shown.map((todo) => <TodoCard key={todo.key} todo={todo} />)}</ul>
                {more > 0 && <p className="mt-2 px-1 text-[13px] text-text-secondary">and {more} more</p>}
              </>
            ) : failed.length === 0 ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-4 text-[14px] text-text-primary">
                <CircleCheck size={18} className="shrink-0 text-primary" aria-hidden="true" />
                Nothing needs you today.
              </p>
            ) : (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-4 text-[14px] text-text-secondary">Nothing to show from what could be loaded.</p>
            )}
          </section>

          {list && data[list.source] && (
            <section aria-labelledby="home-active">
              <h2 id="home-active" className={SECTION}>{list.heading} ({active.length})</h2>
              {active.length === 0 ? (
                <EmptyNote title={list.empty.title} hint={list.empty.hint}>
                  {list.empty.link && <Link to={list.empty.link.to} className={LINK_BUTTON}>{list.empty.link.label}</Link>}
                </EmptyNote>
              ) : <RecordList columns={list.columns} rows={active} actions={list.actions} />}
            </section>
          )}

          {isOrg && data.members && data.members.length === 0 && (
            <EmptyNote title="No members yet" hint="Add your first member to start recording assistance and lending equipment.">
              <Link to="/my-organization" className={LINK_BUTTON}>Add a member</Link>
            </EmptyNote>
          )}

          <section aria-labelledby="home-summary">
            <h2 id="home-summary" className={SECTION}>Summary</h2>
            <ul className="grid grid-cols-3 gap-2 sm:gap-3">
              {summary.map((item) => (
                <li key={item.label} className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-3 sm:px-4">
                  <p className="text-[20px] font-bold leading-tight text-text-primary">{item.value === null ? '—' : item.value}</p>
                  <p className="mt-1 text-[13px] leading-snug text-text-secondary">{item.label}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </AccountPage>
  )
}
