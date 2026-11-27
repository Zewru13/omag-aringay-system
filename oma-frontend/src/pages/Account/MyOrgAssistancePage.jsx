import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HandHeart } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import DistributeAssistanceModal from '../AssistanceManagement/DistributeAssistanceModal.jsx'
import { FARMER_DISTRIBUTION_DOMAIN, FISHERFOLK_DISTRIBUTION_DOMAIN } from '../AssistanceManagement/distributionDomains.js'
import OrgDistributionHistory from '../AssistanceManagement/OrgDistributionHistory.jsx'
import { FARMERS_ORG_DOMAIN, FISHERFOLK_ORG_DOMAIN } from '../Citizen/orgDomainConfig.js'
import ConfirmedForMembersPanel from '../Organizations/ConfirmedForMembersPanel.jsx'
import AccountPage from './AccountPage.jsx'
import ChooseDistributeWindow from './ChooseDistributeWindow.jsx'
import { orgAssistanceDomain, orgAssistanceTab, orgDomain } from './myOrganization.js'
import TabBar from './TabBar.jsx'

// An organization account's Assistance page (`kind` is 'orgFarm' or 'orgFish'), two tabs:
//   Scheduled   what is still to be claimed, with its date, time and place (the existing distribution list)
//   History     assistance received, the same list; under it, what was confirmed for members back when receipt was confirmed
// The organization records what it gives: members are told when and where, and nobody confirms. Someone who did not claim it can be
// taken off the list. One Distribute assistance button asks first: one member or all members. Every form is the existing window.
const TABS = [{ value: 'todo', label: 'Scheduled' }, { value: 'history', label: 'History' }]

export default function MyOrgAssistancePage({ kind }) {
  const navigate = useNavigate()
  const { search, pathname } = useLocation()
  const { user } = useAuth()
  const orgRecord = user?.linked_record
  const orgId = orgRecord?.id
  const org = orgDomain(kind)
  const { domain } = orgAssistanceDomain(kind)
  const config = kind === 'orgFish' ? FISHERFOLK_ORG_DOMAIN : FARMERS_ORG_DOMAIN
  const distribution = kind === 'orgFish' ? FISHERFOLK_DISTRIBUTION_DOMAIN : FARMER_DISTRIBUTION_DOMAIN
  const tab = orgAssistanceTab(search)
  const [historyKey, setHistoryKey] = useState(0)
  const [open, setOpen] = useState(null)   // { kind: 'choose' | 'one' | 'all' }

  const reloadAll = () => setHistoryKey((k) => k + 1)
  const switchTab = (next) => navigate(next === 'todo' ? pathname : `${pathname}?tab=${next}`, { replace: true })
  const close = () => setOpen(null)

  return (
    <AccountPage
      title="Assistance"
      helper="Assistance your cooperative gave to its members."
      action={<Button icon={HandHeart} onClick={() => setOpen({ kind: 'choose' })}>Distribute assistance</Button>}
    >
      <TabBar label="Assistance views" value={tab} onChange={switchTab} tabs={TABS} />

      <OrgDistributionHistory key={tab} domain={domain} group={tab === 'history' ? 'history' : 'current'} refreshKey={historyKey} organizationName={orgRecord?.label || ''} />
      {tab === 'history' && orgId && (
        <ConfirmedForMembersPanel type={org.type} organizationId={orgId} organizationName={orgRecord?.name || ''} heading="Earlier confirmations" />
      )}

      {open?.kind === 'choose' && <ChooseDistributeWindow onClose={close} onChoose={(who) => setOpen({ kind: who })} />}
      {open?.kind === 'one' && (
        <DistributeAssistanceModal domain={distribution} mode="people" memberUrl={config.memberSearchUrl(orgId)} onClose={close} onSuccess={reloadAll} />
      )}
      {open?.kind === 'all' && (
        <DistributeAssistanceModal
          domain={distribution}
          fixedOrg={{ id: orgId, name: orgRecord?.label, barangay: orgRecord?.barangay }}
          onClose={close}
          onSuccess={reloadAll}
        />
      )}
    </AccountPage>
  )
}
