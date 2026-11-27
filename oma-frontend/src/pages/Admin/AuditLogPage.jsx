import { useSearchParams } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import AuditActivityTab from './AuditActivityTab.jsx'
import AuditHistoryTab from './AuditHistoryTab.jsx'
import { historyTarget } from './auditLog.js'

// Admin > Audit Log: All Activity, and the history of one farmer, fisherfolk or cooperative. The tab, and whom a history shows, are
// in the address, so a "View history" link opens it and Back returns.
const TABS = [
  { id: 'all', label: 'All Activity' },
  { id: 'farmer', label: 'Farmer History' },
  { id: 'fisherfolk', label: 'Fisherfolk History' },
  { id: 'cooperative', label: 'Cooperative History' },
]

function AuditLogPage() {
  const [params, setParams] = useSearchParams()
  const { tab, kind, id } = historyTarget(params)

  return (
    <PageLayout title="Audit Log">
      <div className="space-y-4">
        <PillTabs ariaLabel="Audit Log views" tabs={TABS} value={tab} onChange={(id) => setParams(id === 'all' ? {} : { tab: id })} />
        {tab === 'all'
          ? <AuditActivityTab />
          : <AuditHistoryTab key={tab} tab={tab} kind={kind} id={id} />}
      </div>
    </PageLayout>
  )
}

export default AuditLogPage
