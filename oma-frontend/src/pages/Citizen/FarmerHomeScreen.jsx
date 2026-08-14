import { useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, BarChart3, ChevronRight, Clock, FileText, Gift, Home,
  SquarePen, Sprout, User, Wheat,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import useIsDesktop from '../../hooks/useIsDesktop.js'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenDisasterScreen from './CitizenDisasterScreen.jsx'
import CitizenAniScreen from './CitizenAniScreen.jsx'
import CitizenFarmerActivityScreen from './CitizenFarmerActivityScreen.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import FarmerCropHistoryView from './FarmerCropHistoryView.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import { DesktopAssistanceList } from './CitizenDesktopScreens.jsx'
import {
  DesktopBody, DesktopQuickActions, DesktopRailCard, DesktopShell, DesktopSidebar,
  DesktopStatGrid, DesktopTopbar,
} from './CitizenDesktopUI.jsx'
import { labels } from './labels.js'
import {
  CROP_THEME, CitizenBody, CitizenCardGrid, CitizenEmptyState, CitizenHomeBody,
  CitizenHomeHeader, CitizenScreen, CitizenSubHeader, CitizenTabBar, ProgressTrack,
  QuickLinksHeading, SectionHeading, SecondaryRow, SecondaryRows, StatusCard, cycleProgress,
} from './citizenUI.jsx'

// Batch E built this task-first Farmer home screen; this revision re-skins
// it to the citizen visual specification (phone-shaped column at every
// breakpoint, cz-* palette, hairline borders) WITHOUT touching what it
// fetches or what it may do. Every call below still hits the same
// own-record-scoped endpoints, and no permission, validation or
// create/edit capability changed with the re-skin.
export default function FarmerHomeScreen({ record, onLogout }) {
  const { showToast } = useToast()
  const isDesktop = useIsDesktop()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [tasksByRecord, setTasksByRecord] = useState({}) // recordId -> [{...suggestion}]

  const [view, setView] = useState({ kind: 'home' }) // 'home' | 'yield' | 'assistance' | { kind: 'history', record }
  const [disasterScreen, setDisasterScreen] = useState(null) // { record }

  const fetchRecords = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(CROP_DOMAIN.recordsUrl)
      const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
      setRecords(rows)

      const results = await Promise.all(
        rows.map((rec) =>
          api.get(`/production/monitoring/${rec.id}/suggestions/`)
            .then((res) => [rec.id, res.data.suggestions || []])
            .catch(() => [rec.id, []]),
        ),
      )
      setTasksByRecord(Object.fromEntries(results))
    } catch {
      showToast(labels.farmerHome.loadError, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Flatten every record's overdue/due-now suggestions into one task list,
  // each tagged with the crop record it belongs to. Overdue sorts first.
  const needsAttention = records.flatMap((rec) =>
    (tasksByRecord[rec.id] || [])
      .filter((s) => s.status === 'overdue' || s.status === 'due_now')
      .map((s) => ({ ...s, record: rec })),
  ).sort((a, b) => (a.status === b.status ? 0 : a.status === 'overdue' ? -1 : 1))

  const handleLogSuccess = () => { fetchRecords() }

  // AKTIBIDAD and SAKUNA are tabs in the new reference, but both act ON a
  // crop record. With exactly one record the tab goes straight in; with
  // several it opens a picker. It never picks for the user.
  const pickRecordFor = (intent) => {
    // AKTIBIDAD carries its own TANIMAN dropdown (frames 21-26), so it never
    // needs a picker step regardless of how many crops there are.
    if (intent === 'log') { setView({ kind: 'activity' }); return }
    if (records.length === 1) { setDisasterScreen({ record: records[0] }); return }
    setView({ kind: 'picker', intent })
  }

  // Mobile-only tab bar. Declared before the early-returning sub-views so
  // each of them can render it; `active` is null on screens that aren't one
  // of the three destinations, which leaves no tab lit rather than lighting
  // a wrong one.
  const tabBar = (active) => (
    <CitizenTabBar
      theme={CROP_THEME}
      active={active}
      items={[
        { key: 'home', icon: Home, label: labels.tabBar.home, onClick: () => setView({ kind: 'home' }) },
        { key: 'activity', icon: FileText, label: labels.tabBar.farmerActivity, onClick: () => pickRecordFor('log') },
        { key: 'disaster', icon: AlertTriangle, label: labels.tabBar.farmerDisaster, onClick: () => pickRecordFor('disaster') },
        { key: 'harvests', icon: BarChart3, label: labels.tabBar.farmerHarvest, onClick: () => setView({ kind: 'yield' }) },
        { key: 'myInfo', icon: User, label: labels.tabBar.profile, onClick: () => setView({ kind: 'profile' }) },
      ]}
    />
  )

  // ── Desktop POV (UI Base Desktop POV.pdf) ───────────────────────────
  // A genuinely different information architecture from the mobile
  // screens above -- persistent sidebar, topbar, two-column body -- so
  // the whole render branches here rather than reusing the mobile
  // CitizenScreen/CitizenTabBar shell. State and fetching stay
  // single-sourced above this branch; only the returned markup differs.
  if (isDesktop) {
    const D = labels.ffNew.desktop
    const activeKey = view.kind === 'activity' ? 'log'
      : disasterScreen || view.kind === 'picker' ? 'disaster'
        : view.kind === 'yield' ? 'yield'
          : view.kind === 'profile' ? 'profile' : 'home'

    const sidebar = (
      <DesktopSidebar
        theme={CROP_THEME}
        brandIcon={Sprout}
        brandName={D.appNameFarmer}
        brandSub={D.municipality}
        activeKey={activeKey}
        navItems={[
          { key: 'home', icon: Home, label: D.navHome, onClick: () => { setDisasterScreen(null); setView({ kind: 'home' }) } },
          { key: 'log', icon: SquarePen, label: D.navLog, onClick: () => { setDisasterScreen(null); setView({ kind: 'activity' }) } },
          { key: 'disaster', icon: AlertTriangle, label: D.navSakuna, onClick: () => pickRecordFor('disaster') },
          { key: 'yield', icon: BarChart3, label: D.navAni, onClick: () => { setDisasterScreen(null); setView({ kind: 'yield' }) } },
        ]}
        pinnedItem={{ icon: Gift, label: D.navTulong, onClick: () => { setDisasterScreen(null); setView({ kind: 'assistance' }) } }}
      />
    )

    const accountProps = {
      initials: (record.label || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—',
      name: record.label,
      roleLabel: labels.home.recordTypeLabels.FARMER || 'Magsasaka',
      onProfile: () => { setDisasterScreen(null); setView({ kind: 'profile' }) },
      onHelp: () => { setDisasterScreen(null); setView({ kind: 'assistance' }) },
      onLogout,
    }

    // ── Sakuna (disaster) ──────────────────────────────────────────────
    if (disasterScreen) {
      return (
        <DesktopShell
          sidebar={sidebar}
          topbar={<DesktopTopbar theme={CROP_THEME} title={D.navSakuna} onBack={() => setDisasterScreen(null)} account={accountProps} />}
        >
          <DesktopBody
            rail={
              <>
                <DesktopRailCard title={D.selectedCrop}>
                  <p className="text-[14px] font-semibold text-cz-text">
                    {disasterScreen.record.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-cz-text-2">{D.selectedCropHint}</p>
                </DesktopRailCard>
                <DesktopRailCard title={D.cropInsuranceHeading}>
                  <p className="text-[12.5px] leading-[1.55] text-cz-text-2">{D.cropInsuranceBody}</p>
                </DesktopRailCard>
              </>
            }
          >
            <CitizenDisasterScreen
              domain={CROP_DOMAIN}
              theme={CROP_THEME}
              recordId={disasterScreen.record.id}
              record={disasterScreen.record}
              onClose={() => setDisasterScreen(null)}
              onSuccess={handleLogSuccess}
              onLogResponse={({ rule }) => {
                setDisasterScreen(null)
                setView({ kind: 'activity', recordId: String(disasterScreen.record.id), activity: rule.activity_name })
              }}
              bare
            />
          </DesktopBody>
        </DesktopShell>
      )
    }

    // ── Ani ──────────────────────────────────────────────────────────
    if (view.kind === 'yield') {
      return (
        <DesktopShell sidebar={sidebar} topbar={<DesktopTopbar theme={CROP_THEME} title={D.navAni} onBack={() => setView({ kind: 'home' })} account={accountProps} />}>
          <DesktopBody>
            <CitizenAniScreen endpoint="/production/yield-analysis/" bare />
          </DesktopBody>
        </DesktopShell>
      )
    }

    // ── Mag-log ──────────────────────────────────────────────────────
    if (view.kind === 'activity') {
      return (
        <DesktopShell sidebar={sidebar} topbar={<DesktopTopbar theme={CROP_THEME} title={D.navLog} onBack={() => setView({ kind: 'home' })} account={accountProps} />}>
          <DesktopBody
            rail={
              <>
                <DesktopRailCard title={D.selectedCrop}>
                  <p className="text-[13px] text-cz-text-2">{D.selectedCropHint}</p>
                </DesktopRailCard>
                <DesktopRailCard title={D.tandaanHeading}>
                  <ul className="space-y-2 text-[12.5px] leading-[1.5] text-cz-text-2">
                    <li>{D.tandaanEditable}</li>
                    <li>{D.tandaanDateDefault}</li>
                  </ul>
                </DesktopRailCard>
              </>
            }
          >
            <CitizenFarmerActivityScreen
              records={records}
              initialRecordId={view.recordId}
              initialActivity={view.activity}
              onSaved={fetchRecords}
              bare
            />
          </DesktopBody>
        </DesktopShell>
      )
    }

    // ── Tulong Natanggap ───────────────────────────────────────────────
    if (view.kind === 'assistance') {
      return (
        <DesktopShell sidebar={sidebar} topbar={<DesktopTopbar theme={CROP_THEME} title={D.helpAssistance} subtitle={D.helpAssistanceSubtitle} onBack={() => setView({ kind: 'home' })} account={accountProps} />}>
          <div className="px-6 py-5">
            <DesktopAssistanceList endpoint="/interventions/my-beneficiary-history/" />
          </div>
        </DesktopShell>
      )
    }

    // ── Aking Profile ────────────────────────────────────────────────
    if (view.kind === 'profile') {
      return (
        <DesktopShell sidebar={sidebar} topbar={<DesktopTopbar theme={CROP_THEME} title={D.accountProfile} onBack={() => setView({ kind: 'home' })} account={accountProps} />}>
          <div className="px-6 py-5">
            <CitizenProfileScreen record={record} recordType="FARMER" bare />
          </div>
        </DesktopShell>
      )
    }

    // ── Picker (disaster, multiple crops) / History fall back to the
    // existing mobile-built screens for now -- both are secondary paths
    // with no dedicated desktop frame in the reference.
    if (view.kind === 'picker' || view.kind === 'history') {
      // fall through to the mobile branches below unchanged
    } else {
      // ── Simula (home) ─────────────────────────────────────────────
      const activeCrops = records.filter((r) => r.status && r.status !== 'Harvested' && r.status !== 'Total Loss')
      const totalArea = records.reduce((sum, r) => sum + (Number(r.area_planted_ha) || 0), 0)
      const thisYear = new Date().getFullYear()
      const plantedThisYear = records.filter((r) => r.date_planted && new Date(r.date_planted).getFullYear() === thisYear).length

      return (
        <DesktopShell
          sidebar={sidebar}
          topbar={
            <DesktopTopbar
              theme={CROP_THEME}
              greetingName={D.greeting(record.label)}
              metaLine={`Brgy. ${record.barangay || labels.common.unknown} · ${new Date().toLocaleDateString('fil-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`}
              account={accountProps}
            />
          }
        >
          {isLoading ? (
            <p className="px-6 py-5 text-[14px] italic text-cz-text-2">{labels.farmerHome.loading}</p>
          ) : (
            <DesktopBody
              rail={
                <>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{D.quickActions}</p>
                    <DesktopQuickActions
                      items={[
                        { icon: AlertTriangle, label: D.qaSakuna, sublabel: D.qaSakunaSub, onClick: () => pickRecordFor('disaster') },
                        { icon: BarChart3, label: D.qaAni, sublabel: D.qaAniSub, onClick: () => setView({ kind: 'yield' }) },
                        { icon: Gift, label: D.qaTulong, sublabel: D.qaTulongSub, onClick: () => setView({ kind: 'assistance' }) },
                      ]}
                    />
                  </div>
                  <DesktopStatGrid
                    title={D.farmSummary}
                    items={[
                      { value: activeCrops.length, label: D.farmSummaryActiveCrops },
                      { value: needsAttention.length, label: D.farmSummaryNeedsAttention },
                      { value: `${totalArea.toFixed(totalArea % 1 === 0 ? 0 : 2)} ha`, label: D.farmSummaryArea },
                      { value: plantedThisYear, label: D.farmSummaryPlantedThisYear },
                    ]}
                  />
                </>
              }
            >
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{D.needsAttention}</p>
              {needsAttention.length === 0 ? (
                <p className="mb-6 rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4 text-[13px] italic text-cz-text-muted">
                  {labels.farmerHome.needsAttention.emptyBody}
                </p>
              ) : (
                <div className="mb-6 space-y-2">
                  {needsAttention.map((task) => {
                    const isOverdue = task.status === 'overdue'
                    return (
                      <div
                        key={`${task.record.id}-${task.occurrence_key}`}
                        className={`flex items-center gap-3 rounded-[10px] border-l-[3px] px-4 py-3 ${
                          isOverdue ? 'border-cz-danger-accent bg-cz-danger-bg' : 'border-cz-warn-accent bg-cz-warn-bg'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-[14px] font-semibold ${isOverdue ? 'text-cz-danger-title' : 'text-cz-warn-title'}`}>
                            {task.activity_name}
                            <span className="ml-2 text-[12px] font-normal">
                              {isOverdue ? D.overdueTag(Math.abs(task.days_diff ?? 0)) : D.dueNowTag}
                            </span>
                          </p>
                          <p className="text-[12.5px] text-cz-text-2">
                            {task.record.crop_type_name || labels.yieldAnalysis.cropCropLabel} · {task.record.area_planted_ha ?? labels.common.unknown} ha · Brgy. {task.record.farm_location_barangay || labels.common.unknown}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setView({ kind: 'activity', recordId: String(task.record.id), activity: task.activity_name })}
                          className={`shrink-0 rounded-[8px] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 ${
                            isOverdue ? 'bg-cz-danger-accent' : 'bg-cz-warn-accent'
                          }`}
                        >
                          {D.logCta}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{D.activeCrops}</p>
              {records.length === 0 ? (
                <p className="rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4 text-[13px] italic text-cz-text-muted">
                  {labels.farmerHome.myCrops.empty}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {records.map((rec) => {
                    const progress = cycleProgress(rec.date_planted, rec.expected_harvest_date)
                    return (
                      <div key={rec.id} className="rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14.5px] font-semibold text-cz-text">
                              {rec.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                            </p>
                            <p className="truncate text-[12.5px] text-cz-text-2">
                              {rec.area_planted_ha ?? labels.common.unknown} ha · Brgy. {rec.farm_location_barangay || labels.common.unknown} · Itanim: {labels.common.formatDate(rec.date_planted)}
                            </p>
                          </div>
                          <p className="shrink-0 text-right text-[12.5px] text-cz-text-2">
                            {D.expectedHarvest}
                            <br />
                            <span className="font-medium text-cz-text">{labels.common.formatDate(rec.expected_harvest_date)}</span>
                          </p>
                        </div>
                        {progress && (
                          <div className="mt-2.5 flex items-center gap-3">
                            <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-cz-track">
                              <div className="h-full rounded-full bg-cz-crop-fill" style={{ width: `${Math.min(100, progress.pct)}%` }} />
                            </div>
                            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-cz-crop-header">{Math.round(progress.pct)}%</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setView({ kind: 'activity', recordId: String(rec.id) })}
                          className="mt-3 text-[13px] font-semibold text-cz-crop-header hover:underline"
                        >
                          {D.logActivityInline}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </DesktopBody>
          )}
        </DesktopShell>
      )
    }
  }

  // ── Full-screen sub-views ────────────────────────────────────────────

  if (disasterScreen) {
    return (
      <CitizenDisasterScreen
        domain={CROP_DOMAIN}
        theme={CROP_THEME}
        recordId={disasterScreen.record.id}
        record={disasterScreen.record}
        onClose={() => setDisasterScreen(null)}
        onSuccess={handleLogSuccess}
        onLogResponse={({ rule }) => {
          // Log the response activity against the same record. The tick on
          // the checklist then follows from the saved log, not from here.
          setDisasterScreen(null)
          setView({ kind: 'activity', recordId: String(disasterScreen.record.id), activity: rule.activity_name })
        }}
      />
    )
  }

  // ANI is its own screen in the reference (frames 32-33), not a section
  // inside the generic secondary-view shell the old 'yield' branch used.
  if (view.kind === 'yield') {
    return (
      <CitizenAniScreen
        endpoint="/production/yield-analysis/"
        onBack={() => setView({ kind: 'home' })}
        tabBar={tabBar('harvests')}
      />
    )
  }

  if (view.kind === 'activity') {
    return (
      <CitizenFarmerActivityScreen
        records={records}
        initialRecordId={view.recordId}
        initialActivity={view.activity}
        onBack={() => setView({ kind: 'home' })}
        onSaved={fetchRecords}
        tabBar={tabBar('activity')}
      />
    )
  }

  if (view.kind === 'picker') {
    const isLog = view.intent === 'log'
    return (
      <CitizenScreen hasTabBar>
        <CitizenSubHeader
          theme={CROP_THEME}
          title={isLog ? labels.tabBar.farmerActivity : labels.tabBar.farmerDisaster}
          subtitle={labels.ffNew.activeCrops}
          onBack={() => setView({ kind: 'home' })}
        />
        <CitizenBody>
          {records.length === 0 ? (
            <p className="px-1 py-8 text-center text-[13px] italic text-cz-text-muted">{labels.ffNew.noCrops}</p>
          ) : (
            <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
              {records.map((rec, i) => (
                <li key={rec.id} className={i === records.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isLog) setView({ kind: 'activity', recordId: String(rec.id) })
                      else setDisasterScreen({ record: rec })
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cz-page"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${CROP_THEME.circleBg}`}>
                      <Wheat size={17} className={CROP_THEME.circleIcon} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-cz-text">
                        {rec.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-cz-text-2">
                        {rec.area_planted_ha ?? labels.common.unknown} ha · Brgy. {rec.farm_location_barangay || labels.common.unknown}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CitizenBody>
        {tabBar(isLog ? 'activity' : 'disaster')}
      </CitizenScreen>
    )
  }

  if (view.kind === 'history') {
    return (
      <FarmerCropHistoryView
        record={view.record}
        onBack={() => setView({ kind: 'home' })}
        onRecordChanged={fetchRecords}
      />
    )
  }

  if (view.kind === 'profile') {
    return (
      <CitizenProfileScreen
        record={record}
        recordType="FARMER"
        theme={CROP_THEME}
        onBack={() => setView({ kind: 'home' })}
        tabBar={tabBar('myInfo')}
      />
    )
  }

  // 'yield' is handled above by CitizenAniScreen, so this branch is now
  // assistance only -- the shared shell is kept because assistance has no
  // reference frame of its own and is reached from Quick Links, not a tab.
  if (view.kind === 'assistance') {
    return (
      <CitizenScreen hasTabBar>
        <CitizenSubHeader
          theme={CROP_THEME}
          title={labels.farmerHome.secondary.assistanceTitle}
          onBack={() => setView({ kind: 'home' })}
        />
        <CitizenBody>
          <MyAssistanceHistorySection endpoint="/interventions/my-beneficiary-history/" />
        </CitizenBody>
        {tabBar(null)}
      </CitizenScreen>
    )
  }

  // ── Home ─────────────────────────────────────────────────────────────

  // One definition, two presentations: the mobile SecondaryRows list and the
  // >=1024px Quick Links sidebar render from this same array, so the two can
  // never drift out of sync as entries are added.
  const quickLinks = [
    { icon: User, label: labels.farmerHome.secondary.profileTitle, onClick: () => setView({ kind: 'profile' }) },
    { icon: BarChart3, label: labels.farmerHome.secondary.harvestResultsTitle, onClick: () => setView({ kind: 'yield' }) },
    { icon: Gift, label: labels.farmerHome.secondary.assistanceTitle, onClick: () => setView({ kind: 'assistance' }) },
  ]

  const quickLinksAside = (
    <>
      <QuickLinksHeading>{labels.farmerHome.secondary.quickLinksTitle}</QuickLinksHeading>
      {quickLinks.map((l, i) => (
        <SecondaryRow
          key={l.label}
          icon={l.icon}
          label={l.label}
          onClick={l.onClick}
          isLast={i === quickLinks.length - 1}
          hideChevron
        />
      ))}
    </>
  )

  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader
        theme={CROP_THEME}
        name={record.label}
        metaLine={`${labels.farmerHome.rsbsaPrefix} ${record.rsbsa_number || labels.common.unknown} · ${record.barangay || labels.common.unknown}`}
        onLogout={onLogout}
      />

      <CitizenHomeBody aside={isLoading ? null : quickLinksAside}>
        {isLoading ? (
          <p className="text-[15px] italic text-cz-text-2">{labels.farmerHome.loading}</p>
        ) : (
          <>
            {/* NEEDS ATTENTION */}
            <SectionHeading>{labels.farmerHome.needsAttention.title}</SectionHeading>
            {needsAttention.length === 0 ? (
              <CitizenEmptyState
                icon={Sprout}
                iconClass="text-cz-crop-fill"
                title={labels.farmerHome.needsAttention.emptyTitle}
                body={labels.farmerHome.needsAttention.emptyBody}
              />
            ) : (
              needsAttention.map((task) => {
                const isOverdue = task.status === 'overdue'
                return (
                  // UI-basis pass: the card itself is now the tap target with
                  // a trailing chevron, replacing the explicit "Log this
                  // activity" button. The DESTINATION is unchanged — it opens
                  // the same log screen, prefilled with the same activity, via
                  // the same setLogScreen call the button used to make. The
                  // accessible name still says what tapping does, so the
                  // affordance is only visually implicit, not unlabelled.
                  <StatusCard
                    key={`${task.record.id}-${task.occurrence_key}`}
                    tone={isOverdue ? 'danger' : 'warning'}
                    badgeIcon={isOverdue ? AlertCircle : Clock}
                    badgeText={isOverdue
                      ? labels.farmerHome.needsAttention.overdueBadgeDays(Math.abs(task.days_diff ?? 0))
                      : labels.farmerHome.needsAttention.dueTodayBadge}
                    title={task.activity_name}
                    context={labels.farmerHome.needsAttention.contextLine(
                      task.record.crop_type_name || labels.yieldAnalysis.cropCropLabel,
                      task.record.farm_location_barangay || labels.common.unknown,
                      task.record.area_planted_ha ?? labels.common.unknown,
                    )}
                    onCardClick={() => setView({ kind: 'activity', recordId: String(task.record.id), activity: task.activity_name })}
                    cardActionLabel={labels.farmerHome.needsAttention.actionLabel}
                  />
                )
              })
            )}

            {/* MY CROPS */}
            <div className="mt-4">
              <SectionHeading>{labels.ffNew.activeCrops}</SectionHeading>
            </div>
            {records.length === 0 ? (
              <CitizenEmptyState
                icon={Wheat}
                iconClass="text-cz-text-muted"
                title={labels.farmerHome.myCrops.title}
                body={labels.farmerHome.myCrops.empty}
              />
            ) : (
              <CitizenCardGrid>
              {records.map((rec) => {
                const progress = cycleProgress(rec.date_planted, rec.expected_harvest_date)
                return (
                  <div
                    key={rec.id}
                    className="mb-[10px] rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[14px] sm:mb-0"
                  >
                    <div className="flex items-center gap-[10px]">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${CROP_THEME.circleBg}`}>
                        <Wheat size={20} className={CROP_THEME.circleIcon} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[16px] font-semibold text-cz-text">
                            {rec.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                          </p>
                          {rec.status && rec.status !== 'Harvested' && rec.status !== 'Total Loss' && (
                            <span className="shrink-0 rounded-full border-[0.5px] border-cz-crop-header/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-cz-crop-header">
                              {labels.ffNew.activePill}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[12px] text-cz-text-2">
                          {labels.farmerHome.myCrops.cardMeta(
                            rec.farm_location_barangay || labels.common.unknown,
                            rec.area_planted_ha ?? labels.common.unknown,
                            // Display-only lookup on the stored value; falls
                            // back to the raw value if it isn't one of the
                            // two known choices, so an unexpected season
                            // still shows rather than vanishing.
                            labels.harvest.seasonOptions[rec.season] || rec.season || labels.common.unknown,
                          )}
                        </p>
                      </div>
                    </div>

                    {progress && (
                      <>
                        <div className="mt-3 flex items-baseline justify-between gap-2">
                          <span className="text-[12.5px] text-cz-text-2">{labels.ffNew.cropProgress}</span>
                          <span className="text-[15px] font-bold tabular-nums text-cz-crop-header">
                            {Math.round(progress.pct)}%
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <ProgressTrack theme={CROP_THEME} pct={progress.pct} height={8} />
                        </div>
                        <p className="mt-1.5 text-[12px] text-cz-text-2">
                          {labels.ffNew.daysLeft(
                            Math.max(0, progress.total - progress.elapsed),
                            labels.farmerHome.myCrops.harvestShort(rec.expected_harvest_date),
                          )}
                        </p>
                      </>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setView({ kind: 'activity', recordId: String(rec.id) })}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[8px] bg-cz-crop-header px-2 py-[11px] text-white transition-opacity hover:opacity-90"
                      >
                        <FileText size={15} aria-hidden="true" />
                        <span className="text-[14px] font-semibold">{labels.ffNew.logActivity}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisasterScreen({ record: rec })}
                        aria-label={labels.ffNew.reportDisaster}
                        className="flex min-h-[44px] w-[46px] shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong text-cz-text-2 transition-colors hover:bg-cz-page"
                      >
                        <AlertTriangle size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'history', record: rec })}
                      className="mt-2 w-full text-center text-cz-text-2 transition-colors hover:text-cz-text"
                    >
                      <span className="text-[13px]">{labels.farmerHome.myCrops.viewHistory}</span>
                    </button>
                  </div>
                )
              })}
              </CitizenCardGrid>
            )}

            <p className="mt-5 text-center text-[12px] text-cz-text-muted">
              {labels.ffNew.footer(new Date().toLocaleDateString('fil-PH', { year: 'numeric', month: 'long', day: 'numeric' }))}
            </p>

            {/* SECONDARY ROWS — mobile/tablet only; at >=1024px these same
                entries render in the Quick Links sidebar instead. */}
            <div className="lg:hidden">
              <SecondaryRows>
                {quickLinks.map((l, i) => (
                  <SecondaryRow
                    key={l.label}
                    icon={l.icon}
                    label={l.label}
                    onClick={l.onClick}
                    isLast={i === quickLinks.length - 1}
                  />
                ))}
              </SecondaryRows>
            </div>
          </>
        )}
      </CitizenHomeBody>
      {tabBar('home')}
    </CitizenScreen>
  )
}
