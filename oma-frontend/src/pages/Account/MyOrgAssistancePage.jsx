import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HandHeart } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import ConfirmMembersDialog from '../AssistanceManagement/ConfirmMembersDialog.jsx'
import DistributeAssistanceModal from '../AssistanceManagement/DistributeAssistanceModal.jsx'
import { FARMER_DISTRIBUTION_DOMAIN, FISHERFOLK_DISTRIBUTION_DOMAIN } from '../AssistanceManagement/distributionDomains.js'
import { ConfirmActionBar } from '../AssistanceManagement/OrgConfirmControls.jsx'
import OrgDistributionHistory from '../AssistanceManagement/OrgDistributionHistory.jsx'
import { assistanceGroups, assistanceKey, filterConfirmRecords, groupLabel, isSelectable } from '../AssistanceManagement/orgConfirmSelection.js'
import useConfirmSelection from '../AssistanceManagement/useConfirmSelection.js'
import { FARMERS_ORG_DOMAIN, FISHERFOLK_ORG_DOMAIN } from '../Citizen/orgDomainConfig.js'
import ConfirmedForMembersPanel from '../Organizations/ConfirmedForMembersPanel.jsx'
import AccountPage from './AccountPage.jsx'
import ChooseDistributeWindow from './ChooseDistributeWindow.jsx'
import ListTools from './ListTools.jsx'
import { listOf } from './loadState.js'
import { confirmReview, orgAssistanceDomain, orgAssistanceTab, orgDomain } from './myOrganization.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'
import TabBar from './TabBar.jsx'

// An organization account's Assistance page (`kind` is 'orgFarm' or 'orgFish'), three tabs:
//   To do               assistance still waiting (scheduled, awaiting confirmation, being followed up), the existing distribution list
//   History             assistance received or resolved, the same list
//   Confirm for members the members without a working account whose assistance waits, assistance by assistance (what was given, then
//                       its members): search them, tick them and confirm together (with proof photos), or one by one; under it,
//                       everything the organization already confirmed for its members
// One Distribute assistance button asks first: one member or all members. Every form is the existing window.
const TABS = [{ value: 'todo', label: 'To do' }, { value: 'history', label: 'History' }, { value: 'confirm', label: 'Confirm for members' }]
const NO_RECORDS = []

export default function MyOrgAssistancePage({ kind }) {
  const navigate = useNavigate()
  const { search, pathname } = useLocation()
  const { user } = useAuth()
  const orgRecord = user?.linked_record
  const orgId = orgRecord?.id
  const org = orgDomain(kind)
  const { domain, nameField } = orgAssistanceDomain(kind)
  const config = kind === 'orgFish' ? FISHERFOLK_ORG_DOMAIN : FARMERS_ORG_DOMAIN
  const distribution = kind === 'orgFish' ? FISHERFOLK_DISTRIBUTION_DOMAIN : FARMER_DISTRIBUTION_DOMAIN
  const tab = orgAssistanceTab(search)
  const [historyKey, setHistoryKey] = useState(0)
  const [open, setOpen] = useState(null)   // { kind: 'choose' | 'one' | 'all' | 'confirm', records? }

  // The members' awaiting records this organization may confirm for (only read on the Confirm for members tab).
  const [confirmables, setConfirmables] = useState(NO_RECORDS)
  const [confirmState, setConfirmState] = useState('loading')
  const [confirmVersion, setConfirmVersion] = useState(0)
  useEffect(() => {
    if (tab !== 'confirm') return undefined
    let cancelled = false
    api.get(config.accountlessConfirmablesUrl)
      .then((res) => { if (!cancelled) { setConfirmables(listOf(res)); setConfirmState('ready') } })
      .catch(() => { if (!cancelled) setConfirmState('failed') })
    return () => { cancelled = true }
  }, [tab, config.accountlessConfirmablesUrl, confirmVersion])
  const selection = useConfirmSelection(tab === 'confirm' ? confirmables : NO_RECORDS)
  // The search narrows the members (name, barangay or assistance); what was ticked stays ticked. The rest of the list is one block for each
  // assistance, headed by its type, date, quantity and agency.
  const [memberSearch, setMemberSearch] = useState('')
  const visible = useMemo(() => filterConfirmRecords(confirmables, memberSearch, (r) => r[nameField]), [confirmables, memberSearch, nameField])
  const sections = useMemo(() => assistanceGroups(visible).map((g) => ({ key: g.key, label: groupLabel(g), match: (r) => assistanceKey(r) === g.key })), [visible])

  const reloadAll = useCallback(() => { setHistoryKey((k) => k + 1); setConfirmVersion((v) => v + 1) }, [])
  const switchTab = (next) => navigate(next === 'todo' ? pathname : `${pathname}?tab=${next}`, { replace: true })
  const close = () => setOpen(null)

  const confirmColumns = [
    { key: 'member', label: 'Member', phone: 'title', render: (r) => r[nameField] },
    { key: 'barangay', label: 'Barangay', render: (r) => r.farmer_barangay || r.fisherfolk_barangay },
    { key: 'review', label: 'Status', phone: 'badge', render: (r) => { const s = confirmReview(r); return <StatusBadge tone={s.tone}>{s.text}</StatusBadge> } },
  ]
  const selectable = useMemo(() => ({
    selected: selection.selected,
    canSelect: isSelectable,
    onToggle: (row) => selection.toggle(row.id),
    onToggleAll: selection.toggleEvery,
    onToggleGroup: selection.toggleGroup,
    label: (row) => `Select ${row[nameField]}`,
  }), [selection, nameField])

  return (
    <AccountPage
      title="Assistance"
      helper="Assistance your organization gave to its members."
      action={<Button icon={HandHeart} onClick={() => setOpen({ kind: 'choose' })}>Distribute assistance</Button>}
    >
      <TabBar label="Assistance views" value={tab} onChange={switchTab} tabs={TABS} />

      {tab !== 'confirm' && (
        <OrgDistributionHistory key={tab} domain={domain} group={tab === 'history' ? 'history' : 'current'} refreshKey={historyKey} organizationName={orgRecord?.label || ''} />
      )}

      {tab === 'confirm' && (
        <div className="space-y-4">
          <p className="text-[13px] leading-snug text-text-secondary">
            These members have no working account, so they cannot confirm for themselves. Each assistance is listed with the members it can be
            confirmed for. Tick the ones whose assistance reached them and confirm together with proof photos, or confirm one at a time.
          </p>
          {confirmState === 'ready' && (
            <ConfirmActionBar selection={selection} records={confirmables} onConfirm={() => setOpen({ kind: 'confirm', records: selection.selectedRecords })} />
          )}
          {confirmState === 'ready' && confirmables.length > 0 && <ListTools search={memberSearch} onSearch={setMemberSearch} placeholder="Search members or assistance" />}
          <RecordList
            columns={confirmColumns}
            rows={visible}
            sections={sections}
            state={confirmState}
            onRetry={() => { setConfirmState('loading'); setConfirmVersion((v) => v + 1) }}
            what="the members waiting for a confirmation"
            selectable={selectable}
            actions={(r) => (isSelectable(r) ? [{ label: 'Confirm', onClick: () => setOpen({ kind: 'confirm', records: [r] }) }] : [])}
            empty={memberSearch.trim()
              ? { title: 'No member matches', hint: 'Try another word.' }
              : { title: 'No member is waiting', hint: 'Members without an account show here when their assistance needs confirming.' }}
          />
          <section aria-labelledby="already-confirmed" className="pt-2">
            <h2 id="already-confirmed" className="mb-2 text-[15px] font-semibold text-text-primary">Already confirmed</h2>
            {orgId && <ConfirmedForMembersPanel key={confirmVersion} type={org.type} organizationId={orgId} organizationName={orgRecord?.name || ''} />}
          </section>
        </div>
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
      {open?.kind === 'confirm' && (
        <ConfirmMembersDialog
          url={config.confirmOnBehalfBulkUrl}
          domain={domain}
          records={open.records}
          nameOf={(r) => r[nameField]}
          onClose={close}
          onDone={() => { close(); selection.clear(); reloadAll() }}
        />
      )}
    </AccountPage>
  )
}
