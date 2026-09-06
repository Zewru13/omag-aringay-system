import { useMemo, useState } from 'react'
import { Plus, Power, Search } from 'lucide-react'
import OrgAvatar from './OrgAvatar.jsx'
import OrgSetMemberActiveDialog from './OrgSetMemberActiveDialog.jsx'
import { OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'
import { labels } from './labels.js'

// Organization Reference rebuild — Mga Kasapi (image2): header with a real
// count, "+Magdagdag" button, a search bar, and a CARD GRID (not the old
// single-column list) — avatar, name, barangay, position badge if an
// officer, and one action icon.
//
// The reference's member card carries no per-member "report assistance"
// icon at all — this screen used to have one (a Gift icon opening its own
// modal), which is exactly one of the three code paths the Report
// Assistance consolidation removed. Reporting for a specific member is
// still fully possible; it just goes through the dashboard's "Mag-report ng
// Tulong" tile -> chooser -> "Para sa Isang Miyembro" form, which has its
// own Kasapi picker covering every member, same as the reference draws it.
export default function OrgMembersScreen({
  domain, orgId, orgName, members, officerByPosition, onBack, tabBar, onNav, onRefresh,
}) {
  const theme = domain.dashboardTheme
  const [search, setSearch] = useState('')
  const [activeTarget, setActiveTarget] = useState(null) // { row, targetActive }

  const positionOfPerson = (personId) => {
    const hit = Object.entries(officerByPosition).find(([, o]) => domain.officerPersonId(o) === personId)
    return hit ? hit[0] : null
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const name = (domain.rowName(m) || '').toLowerCase()
      const barangay = (domain.rowBarangay(m) || '').toLowerCase()
      return name.includes(q) || barangay.includes(q)
    })
  }, [members, search, domain])

  return (
    <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={onNav} tabBar={tabBar} wide>
      {/* Reference (image2) shows no back-link on this screen — reached via
          the "Tingnan >" stat card, it behaves like a sibling destination,
          not a sub-form; Home nav (sidebar/tab bar) already covers "back". */}
      <OrgPageHeader title={labels.orgHome.membersHeading} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-cz-text-2">{labels.orgHome.membersCountLine(members.length, filtered.length)}</p>
        <button
          type="button"
          onClick={() => onNav('addMember')}
          className={`flex min-h-[40px] items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 ${theme.solidBtn}`}
        >
          <Plus size={16} aria-hidden="true" /> {labels.orgHome.addMemberShort}
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cz-text-muted" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.orgHome.membersSearchPlaceholder}
          className={`min-h-[46px] w-full rounded-[12px] border-[0.5px] border-cz-border-strong bg-white pl-10 pr-3.5 text-[14px] text-cz-text outline-none ${theme.focusBorder}`}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[12px] border-[0.5px] border-cz-border bg-white p-6 text-center text-[13px] text-cz-text-muted">
          {labels.orgHome.membersEmpty}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => {
            const personId = domain.rowPersonId(m)
            const position = positionOfPerson(personId)
            const isActive = domain.rowIsActive(m)
            return (
              <div
                key={m.id}
                className={`relative rounded-[12px] border-[0.5px] border-cz-border bg-white p-4 transition-opacity ${isActive ? '' : 'opacity-50'}`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTarget({ row: m, targetActive: !isActive })}
                  title={isActive ? labels.orgMemberActive.deactivateAction : labels.orgMemberActive.activateAction}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-cz-text-muted transition-colors hover:bg-cz-page"
                >
                  <Power size={15} aria-hidden="true" />
                </button>
                <OrgAvatar name={domain.rowName(m)} theme={theme} size={44} />
                <p className="mt-2.5 truncate text-[15px] font-semibold text-cz-text">
                  {domain.rowName(m)}
                  {!isActive && (
                    <span className="ml-1.5 shrink-0 rounded-[5px] bg-cz-tile-slate-bg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-cz-tile-slate-fg align-middle">
                      {labels.orgMemberActive.inactiveBadge}
                    </span>
                  )}
                </p>
                <p className="truncate text-[13px] text-cz-text-2">
                  {domain.rowBarangay(m) ? `Brgy. ${domain.rowBarangay(m)}` : labels.common.unknown}
                </p>
                {position && (
                  <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${theme.tileSelectedBg} ${theme.tileSelectedText}`}>
                    {position}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeTarget && (
        <OrgSetMemberActiveDialog
          domain={domain}
          orgId={orgId}
          row={activeTarget.row}
          targetActive={activeTarget.targetActive}
          heldPosition={positionOfPerson(domain.rowPersonId(activeTarget.row))}
          onClose={() => setActiveTarget(null)}
          onSuccess={() => { setActiveTarget(null); onRefresh() }}
        />
      )}
    </OrgShell>
  )
}
