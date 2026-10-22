import { useEffect, useState } from 'react'
import { Building2, ClipboardCheck, HandHeart, HandHelping, Package, UserCog, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { DonutCard, MonthlyBarsCard } from './HomeChartCards.jsx'
import { assistanceTypeSlices, memberSlices, monthlyCounts } from './homeCharts.js'
import { FARMERS_ORG_DOMAIN, FISHERFOLK_ORG_DOMAIN } from './orgDomainConfig.js'

// Home tab of the organization phone shell: four summary tiles, an attention card for members waiting on a
// confirmation, and quick actions, laid out like the farmer and fisherfolk phone Homes. Presentation only: it reads
// the same organization-scoped endpoints the older organization home read (the backend limits each to this
// organization), and every action opens the page that does the work.

const rows = (res) => (Array.isArray(res.data) ? res.data : (res.data?.results || []))

function StatTile({ value, label, tone }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-[15px] py-[16px]">
      <p className={`text-[22px] font-bold leading-[1.15] ${tone}`}>{value}</p>
      <p className="mt-2.5 text-[11.5px] text-cz-text-2">{label}</p>
    </div>
  )
}

function QuickAction({ icon: Icon, label, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-[14px] text-left transition-colors hover:bg-cz-page"
    >
      <span className={`flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px] ${tone.pale}`}>
        <Icon size={18} className={tone.text} aria-hidden="true" />
      </span>
      <span className="text-[14px] font-semibold text-cz-text">{label}</span>
    </button>
  )
}

export default function OrgPhoneHome() {
  const navigate = useNavigate()
  const { user, isFisherfolkOrg } = useAuth()
  const { showToast } = useToast()
  const domain = isFisherfolkOrg ? FISHERFOLK_ORG_DOMAIN : FARMERS_ORG_DOMAIN
  const orgId = user?.linked_record?.id
  const assistancePath = isFisherfolkOrg ? '/fisheries-assistance' : '/crop-assistance'
  // The organization's own colour: crop green for a farmers' organization, fisheries blue for a fisherfolk one.
  const tone = isFisherfolkOrg
    ? { text: 'text-cz-fish-header', pale: 'bg-cz-fish-pale', solid: 'bg-cz-fish-header', band: 'border-cz-fish-300' }
    : { text: 'text-cz-crop-header', pale: 'bg-cz-crop-pale', solid: 'bg-cz-crop-header', band: 'border-cz-crop-300' }

  const [isLoading, setIsLoading] = useState(true)
  const [members, setMembers] = useState([])
  const [officers, setOfficers] = useState([])
  const [history, setHistory] = useState([])
  const [confirmables, setConfirmables] = useState([])

  useEffect(() => {
    if (!orgId) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const [m, o, h, c] = await Promise.all([
          api.get(domain.membersUrl(orgId)),
          api.get(domain.officersUrl(orgId)),
          api.get(domain.historyUrl),
          api.get(domain.accountlessConfirmablesUrl),
        ])
        if (cancelled) return
        setMembers(rows(m))
        setOfficers(rows(o))
        setHistory(rows(h))
        setConfirmables(rows(c))
      } catch {
        if (!cancelled) showToast('Failed to load your organization.', 'error')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  const thisYear = String(new Date().getFullYear())
  const activeMembers = members.filter((m) => domain.rowIsActive(m)).length
  const reportedThisYear = history.filter((r) => String(r.date_given || '').startsWith(thisYear)).length
  // Members whose awaiting record still needs the organization (a request already sent is waiting on OMAg).
  const needConfirmation = confirmables.filter((r) => r.latest_request_status !== 'PENDING').length
  const chartColor = isFisherfolkOrg ? '#155E82' : '#1B4D2E'

  return (
    <PageLayout title="Home">
      {isLoading ? (
        <p className="text-[15px] italic text-cz-text-2">Loading your organization…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={activeMembers} label="Active members" tone={tone.text} />
            <StatTile value={`${officers.filter((o) => o.is_member !== false).length} of ${domain.officerPositions.length}`} label="Officer positions filled" tone={tone.text} />
            <StatTile value={reportedThisYear} label="Assistance given this year" tone={tone.text} />
            <StatTile value={needConfirmation} label="Members awaiting confirmation" tone={tone.text} />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <DonutCard title="Members" slices={memberSlices(members, (m) => domain.rowIsActive(m))} unit="members" emptyText="No members to chart yet." />
            <MonthlyBarsCard
              title={`Assistance reported in ${thisYear}`}
              hint="Records per month"
              months={monthlyCounts(history, (r) => r.date_given, thisYear)}
              color={chartColor}
              emptyText="No assistance reported this year yet."
            />
            <DonutCard title="Assistance by type" slices={assistanceTypeSlices(history)} unit="records" emptyText="No assistance reported yet." />
          </div>

          {needConfirmation > 0 && (
            <div className={`rounded-[12px] border bg-cz-surface px-[15px] py-[15px] ${tone.band}`}>
              <p className="text-[15px] font-bold leading-[1.3] text-cz-text">
                {needConfirmation === 1 ? '1 member is waiting for a confirmation' : `${needConfirmation} members are waiting for a confirmation`}
              </p>
              <p className="mt-1 text-[11.5px] text-cz-text-2">These members have no working account, so you can confirm for them.</p>
              <button
                type="button"
                onClick={() => navigate(`${assistancePath}?tab=confirm`)}
                className={`mt-3 w-full rounded-[8px] px-5 py-[11px] transition-opacity hover:opacity-90 ${tone.solid}`}
              >
                <span className="text-[13px] font-semibold text-white">Confirm for Members</span>
              </button>
            </div>
          )}

          <div className="space-y-2 lg:grid lg:grid-cols-3 lg:gap-2 lg:space-y-0">
            <QuickAction icon={HandHeart} label="Distribute assistance" tone={tone} onClick={() => navigate(assistancePath)} />
            <QuickAction icon={Users} label="Members" tone={tone} onClick={() => navigate('/my-organization')} />
            <QuickAction icon={UserCog} label="Officers" tone={tone} onClick={() => navigate('/my-organization?tab=officers')} />
            <QuickAction icon={Package} label="Equipment" tone={tone} onClick={() => navigate('/my-organization?tab=equipment')} />
            <QuickAction icon={HandHelping} label="Borrowed equipment" tone={tone} onClick={() => navigate('/my-organization?tab=borrowed')} />
            <QuickAction icon={ClipboardCheck} label="Confirm for members" tone={tone} onClick={() => navigate(`${assistancePath}?tab=confirm`)} />
          </div>

          {members.length === 0 && (
            <p className="flex items-start gap-2 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4 text-[13px] italic text-cz-text-muted">
              <Building2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              Your organization has no members yet. Open Members to add the first one.
            </p>
          )}
        </div>
      )}
    </PageLayout>
  )
}
