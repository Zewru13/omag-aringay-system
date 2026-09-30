import { useEffect, useMemo, useState } from 'react'
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
  // True only for the first ~0.7s after the screen mounts: gates the row
  // entrance so it plays once on arrival and never for rows revealed later.
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 700)
    return () => clearTimeout(t)
  }, [])

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
        <p className="rounded-[14px] bg-white p-6 text-center text-[13px] text-cz-text-muted shadow-[var(--shadow-xs)]">
          {labels.orgHome.membersEmpty}
        </p>
      ) : (
        // A list, not a card grid: one member per row is denser to scan, and the
        // pills (position, Main, Inactive) sit under the barangay where they
        // stay readable at phone width.
        <ul className="overflow-hidden rounded-[14px] bg-white shadow-[var(--shadow-xs)]">
          {filtered.map((m, idx) => {
            const personId = domain.rowPersonId(m)
            const position = positionOfPerson(personId)
            const isActive = domain.rowIsActive(m)
            // Read-only: a member is "main" for THIS organization when it is
            // their one main membership. Only shown while active — the
            // backend clears the flag on deactivation, this just doesn't
            // rely on that.
            const isMain = isActive && domain.rowIsMain(m)
            // First paint only, first 8 rows: rows a search reveals later
            // never animate, since typing in the box is a frequent action.
            const enters = intro && idx < 8
            return (
              <li
                key={m.id}
                style={enters ? { '--i': idx } : undefined}
                className={`flex items-center gap-3.5 border-t-[0.5px] border-cz-border px-4 py-3 first:border-t-0 ${enters ? 'org-rise' : ''} ${isActive ? '' : 'opacity-55'}`}
              >
                <OrgAvatar name={domain.rowName(m)} theme={theme} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-cz-text">{domain.rowName(m)}</p>
                  <p className="truncate text-[13px] text-cz-text-2">
                    {domain.rowBarangay(m) ? `Brgy. ${domain.rowBarangay(m)}` : labels.common.unknown}
                  </p>
                  {(position || isMain || !isActive) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {position && (
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${theme.tileSelectedBg} ${theme.tileSelectedText}`}>
                          {position}
                        </span>
                      )}
                      {isMain && (
                        <span
                          title={labels.orgHome.mainBadgeTitle}
                          className="inline-block rounded-full bg-cz-badge-green px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#15803D]"
                        >
                          {labels.orgHome.mainBadge}
                        </span>
                      )}
                      {!isActive && (
                        <span className="inline-block rounded-full bg-cz-tile-slate-bg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-cz-tile-slate-fg">
                          {labels.orgMemberActive.inactiveBadge}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTarget({ row: m, targetActive: !isActive })}
                  title={isActive ? labels.orgMemberActive.deactivateAction : labels.orgMemberActive.activateAction}
                  className="press-scale flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cz-text-muted transition-colors hover:bg-cz-page"
                >
                  <Power size={16} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
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
