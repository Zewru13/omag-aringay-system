import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, HelpCircle, Home, Leaf } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import useIsDesktop from '../../hooks/useIsDesktop.js'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenDisasterScreen from './CitizenDisasterScreen.jsx'
import FarmerAniScreen from './FarmerAniScreen.jsx'
import FarmerAssistanceList from './FarmerAssistanceList.jsx'
import FarmerCropPicker from './FarmerCropPicker.jsx'
import FarmerHomeView from './FarmerHomeView.jsx'
import CitizenFarmerActivityScreen from './CitizenFarmerActivityScreen.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import CitizenHelpScreen from './CitizenHelpScreen.jsx'
import FarmerCropHistoryView from './FarmerCropHistoryView.jsx'
import { DesktopShell, useSidebarCollapsed } from './CitizenDesktopUI.jsx'
import { FarmerChromeContext } from './farmerChromeContext.js'
import {
  FarmerDesktopBody, FarmerDesktopSidebar, FarmerDesktopTopbar, FarmerRailCard, FarmerTabBar,
} from './FarmerChrome.jsx'
import { labels } from './labels.js'
import { CROP_THEME } from './citizenUI.jsx'

// Batch E built this task-first Farmer home screen; this revision re-skins
// it to the citizen visual specification (phone-shaped column at every
// breakpoint, cz-* palette, hairline borders) WITHOUT touching what it
// fetches or what it may do. Every call below still hits the same
// own-record-scoped endpoints, and no permission, validation or
// create/edit capability changed with the re-skin.
export default function FarmerHomeScreen({ record, onLogout }) {
  const { showToast } = useToast()
  const isDesktop = useIsDesktop()
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [tasksByRecord, setTasksByRecord] = useState({}) // recordId -> [{...suggestion}]

  const [view, setView] = useState({ kind: 'home' }) // 'home' | 'yield' | 'assistance' | { kind: 'history', record }
  const [disasterScreen, setDisasterScreen] = useState(null) // { record }
  // Which crop the AKTIBIDAD form currently points at; the desktop rail card names it.
  const [activityRecordId, setActivityRecordId] = useState(null)

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

  const [parcelTotal, setParcelTotal] = useState(null)
  useEffect(() => {
    let cancelled = false
    api.get('/farmers/me/parcels/')
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        if (!cancelled) setParcelTotal(rows.length)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Flatten every record's overdue/due-now suggestions into one task list,
  // each tagged with the crop record it belongs to. Overdue sorts first.
  const needsAttention = records.flatMap((rec) =>
    (tasksByRecord[rec.id] || [])
      .filter((s) => s.status === 'overdue' || s.status === 'due_now')
      .map((s) => ({ ...s, record: rec })),
  ).sort((a, b) => (a.status === b.status ? 0 : a.status === 'overdue' ? -1 : 1))

  // Home summary tiles. Citizens cannot list their parcels directly, so the
  // parcel count is the distinct parcels behind their own crop records.
  const activeCrops = records.filter((r) => r.status && r.status !== 'Harvested' && r.status !== 'Total Loss')
  const totalArea = records.reduce((sum, r) => sum + (Number(r.area_planted_ha) || 0), 0)
  const now = new Date()
  const harvestsThisMonth = records.filter((r) => {
    const d = r.actual_harvest_date ? new Date(r.actual_harvest_date) : null
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  // The farmer's real registered parcels (own parcels only, see
  // farmers/me/parcels/). The distinct parcels behind crop records is only the
  // fallback while that loads or if it fails — most records carry no parcel link.
  const parcelCount = parcelTotal ?? new Set(records.map((r) => r.farm_parcel).filter(Boolean)).size

  // One suggestion per crop card: the most pressing not-yet-done activity
  // (overdue, then due now, then the next upcoming one). Nothing is shown when
  // the backend returns none, e.g. an estimated planting date.
  const SUGGESTION_ORDER = { overdue: 0, due_now: 1, upcoming: 2 }
  const suggestionFor = (rec) => (tasksByRecord[rec.id] || [])
    .filter((s) => s.status in SUGGESTION_ORDER)
    .sort((x, y) => SUGGESTION_ORDER[x.status] - SUGGESTION_ORDER[y.status] || x.day_after_planting - y.day_after_planting)[0]

  const attentionCount = new Set(needsAttention.map((t) => t.record.id)).size

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

  const pickCrop = (rec) => {
    setView({ kind: 'home' })
    setDisasterScreen({ record: rec })
  }

  // Results cards link to that crop's history. The analysis row is not the
  // monitoring record the history screen needs, and citizens cannot fetch a
  // single record by id, so it is looked up in the citizen's own list — with
  // every status, since a total-loss crop is left out of the default list.
  const openCropHistory = async (analysisRow) => {
    let full = records.find((r) => r.id === analysisRow.id)
    if (!full) {
      try {
        const r = await api.get(CROP_DOMAIN.recordsUrl, { params: { status: 'Planted,Near Harvest,Harvested,Total Loss' } })
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        full = rows.find((x) => x.id === analysisRow.id)
      } catch { /* falls through to the toast below */ }
    }
    if (!full) {
      showToast(labels.farmerHome.history.loadError(CROP_DOMAIN.recordLabel.toLowerCase()), 'error')
      return
    }
    setDisasterScreen(null)
    setView({ kind: 'history', record: full, from: 'yield' })
  }

  // Mobile-only tab bar. Declared before the early-returning sub-views so
  // each of them can render it; `active` is null on screens that aren't one
  // of the three destinations, which leaves no tab lit rather than lighting
  // a wrong one.
  const accountInitials = (record.label || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—'
  const T = labels.farmerChrome.tabs
  const tabBar = (active) => (
    <FarmerTabBar
      active={active}
      items={[
        { key: 'home', icon: Home, label: T.home, onClick: () => { setDisasterScreen(null); setView({ kind: 'home' }) } },
        { key: 'activity', icon: FileText, label: T.activity, onClick: () => { setDisasterScreen(null); pickRecordFor('log') } },
        { key: 'disaster', icon: AlertTriangle, label: T.disaster, onClick: () => pickRecordFor('disaster') },
        { key: 'harvests', icon: Leaf, label: T.results, onClick: () => { setDisasterScreen(null); setView({ kind: 'yield' }) } },
        { key: 'assistance', icon: HelpCircle, label: T.assistance, onClick: () => { setDisasterScreen(null); setView({ kind: 'assistance' }) } },
      ]}
    />
  )

  // History "I-edit" / "Mag-log ng gawain": both open the Farmer Log-activity
  // screen on this crop; an entry id opens that entry for editing.
  const editLog = (rec) => (logId) => setView({
    kind: 'activity', recordId: String(rec.id), logId: logId ? String(logId) : undefined,
  })

  const homeProps = {
    isLoading,
    records,
    suggestionFor,
    stats: {
      parcels: parcelCount,
      activeCrops: activeCrops.length,
      area: `${totalArea.toFixed(totalArea % 1 === 0 ? 0 : 1)} ha`,
      harvestsThisMonth,
    },
    attentionCount,
    onSeeAttention: () => {
      const first = needsAttention[0]
      if (first) setView({ kind: 'activity', recordId: String(first.record.id), activity: first.activity_name })
    },
    onLog: (rec, activity) => setView({ kind: 'activity', recordId: String(rec.id), activity }),
    onDisaster: (rec) => setDisasterScreen({ record: rec }),
  }

  // ── Desktop POV (UI Base Desktop POV.pdf) ───────────────────────────
  // A genuinely different information architecture from the mobile
  // screens above -- persistent sidebar, topbar, two-column body -- so
  // the whole render branches here rather than reusing the mobile
  // CitizenScreen/CitizenTabBar shell. State and fetching stay
  // single-sourced above this branch; only the returned markup differs.
  if (isDesktop) {
    const D = labels.ffNew.desktop
    const N = labels.farmerChrome.nav
    const activeKey = view.kind === 'activity' ? 'log'
      : disasterScreen || view.kind === 'picker' ? 'disaster'
        : view.kind === 'yield' || view.kind === 'history' ? 'yield'
          : view.kind === 'assistance' ? 'assistance' : view.kind === 'home' ? 'home' : null

    const sidebar = (
      <FarmerDesktopSidebar
        collapsed={sidebarCollapsed}
        activeKey={activeKey}
        navItems={[
          { key: 'home', icon: Home, label: N.home, onClick: () => { setDisasterScreen(null); setView({ kind: 'home' }) } },
          { key: 'log', icon: FileText, label: N.log, onClick: () => { setDisasterScreen(null); setView({ kind: 'activity' }) } },
          { key: 'disaster', icon: AlertTriangle, label: N.disaster, onClick: () => pickRecordFor('disaster') },
          { key: 'yield', icon: Leaf, label: N.results, onClick: () => { setDisasterScreen(null); setView({ kind: 'yield' }) } },
          { key: 'assistance', icon: HelpCircle, label: N.assistance, onClick: () => { setDisasterScreen(null); setView({ kind: 'assistance' }) } },
        ]}
      />
    )

    const accountProps = {
      initials: accountInitials,
      name: record.label,
      roleLabel: labels.home.recordTypeLabelsCapitalized.FARMER,
      onProfile: () => { setDisasterScreen(null); setView({ kind: 'profile' }) },
      onHelp: () => { setDisasterScreen(null); setView({ kind: 'help' }) },
      onLogout,
    }

    // ── Sakuna (disaster) ──────────────────────────────────────────────
    if (disasterScreen) {
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} account={accountProps} />}>
          <CitizenDisasterScreen
            variant="farmer"
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
        </DesktopShell>
      )
    }

    // ── Crop picker (Sakuna with several crops) ────────────────────────
    if (view.kind === 'picker') {
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} account={accountProps} />}>
          <FarmerCropPicker records={records} onPick={pickCrop} bare />
        </DesktopShell>
      )
    }

    // ── Ani ──────────────────────────────────────────────────────────
    if (view.kind === 'yield') {
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} account={accountProps} />}>
          <FarmerAniScreen bare onViewHistory={openCropHistory} />
        </DesktopShell>
      )
    }

    // ── Mag-log ──────────────────────────────────────────────────────
    if (view.kind === 'activity') {
      const railRecord = records.find((r) => String(r.id) === String(activityRecordId))
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} account={accountProps} />}>
          <FarmerDesktopBody
            rail={
              <>
                <FarmerRailCard title={D.selectedCrop}>
                  {railRecord ? (
                    <>
                      <p className="text-[15px] font-semibold text-cz-text">
                        {railRecord.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                      </p>
                      <p className="mt-1.5 text-[12px] text-cz-text-2">
                        {railRecord.area_planted_ha ?? labels.common.unknown} ha · Brgy. {railRecord.farm_location_barangay || labels.common.unknown}
                      </p>
                    </>
                  ) : (
                    <p className="text-[12px] text-cz-text-2">{D.selectedCropHint}</p>
                  )}
                </FarmerRailCard>
                <FarmerRailCard title={D.tandaanHeading}>
                  <ul className="space-y-3 pl-[22px] text-[12px] leading-[1.55] text-cz-text-2">
                    <li>{D.tandaanEditable}</li>
                    <li>{D.tandaanDateDefault}</li>
                  </ul>
                </FarmerRailCard>
              </>
            }
          >
            <CitizenFarmerActivityScreen
              records={records}
              initialRecordId={view.recordId}
              initialActivity={view.activity}
              initialLogId={view.logId}
              onRecordChange={setActivityRecordId}
              onSaved={fetchRecords}
              bare
            />
          </FarmerDesktopBody>
        </DesktopShell>
      )
    }

    // ── Tulong ───────────────────────────────────────────────────────
    if (view.kind === 'assistance') {
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} account={accountProps} />}>
          <FarmerAssistanceList bare />
        </DesktopShell>
      )
    }

    // ── Aking Profile ────────────────────────────────────────────────
    if (view.kind === 'profile') {
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} title={D.accountProfile} onBack={() => setView({ kind: 'home' })} account={accountProps} />}>
          <div className="px-6 py-5">
            <CitizenProfileScreen record={record} recordType="FARMER" onHelp={accountProps.onHelp} bare />
          </div>
        </DesktopShell>
      )
    }

    // ── Tulong (Help) ────────────────────────────────────────────────────
    if (view.kind === 'help') {
      const H = labels.farmerHelp
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} title={H.title} subtitle={H.subtitle} onBack={() => setView({ kind: 'home' })} account={accountProps} />}>
          <CitizenHelpScreen theme={CROP_THEME} L={H} bare />
        </DesktopShell>
      )
    }

    // ── Crop history (from an Ani card) ──────────────────────────────
    if (view.kind === 'history') {
      return (
        <DesktopShell collapsed={sidebarCollapsed} sidebar={sidebar} topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} account={accountProps} />}>
          <FarmerCropHistoryView
            bare
            record={view.record}
            onBack={() => setView({ kind: view.from || 'home' })}
            onRecordChanged={fetchRecords}
            onEditLog={editLog(view.record)}
          />
        </DesktopShell>
      )
    }

    // ── Simula (home) ─────────────────────────────────────────────
    return (
      <DesktopShell
        collapsed={sidebarCollapsed}
        sidebar={sidebar}
        topbar={<FarmerDesktopTopbar onToggleSidebar={toggleSidebar} account={accountProps} />}
      >
        <FarmerHomeView bare {...homeProps} />
      </DesktopShell>
    )
  }

  // Everything below is the phone/tablet render tree (and the desktop
  // picker/history fall-through). Wrapped so one provider can hand the
  // Farmer header — including to Profile and Help, which this file does not
  // modify — its avatar-menu handlers.
  const renderMobile = () => {
  // ── Full-screen sub-views ────────────────────────────────────────────

  if (disasterScreen) {
    return (
      <CitizenDisasterScreen
        variant="farmer"
        domain={CROP_DOMAIN}
        theme={CROP_THEME}
        recordId={disasterScreen.record.id}
        record={disasterScreen.record}
        tabBar={tabBar('disaster')}
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
      <FarmerAniScreen
        onViewHistory={openCropHistory}
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
        initialLogId={view.logId}
        onSaved={fetchRecords}
        tabBar={tabBar('activity')}
      />
    )
  }

  if (view.kind === 'picker') {
    return <FarmerCropPicker records={records} onPick={pickCrop} tabBar={tabBar('disaster')} />
  }

  if (view.kind === 'history') {
    return (
      <FarmerCropHistoryView
        record={view.record}
        onBack={() => setView({ kind: view.from || 'home' })}
        onRecordChanged={fetchRecords}
        onEditLog={editLog(view.record)}
        tabBar={tabBar('harvests')}
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
        onHelp={() => setView({ kind: 'help' })}
        tabBar={tabBar('myInfo')}
      />
    )
  }

  if (view.kind === 'help') {
    return (
      <CitizenHelpScreen
        theme={CROP_THEME}
        L={labels.farmerHelp}
        onBack={() => setView({ kind: 'profile' })}
        tabBar={tabBar(null)}
      />
    )
  }

  if (view.kind === 'assistance') {
    return <FarmerAssistanceList tabBar={tabBar('assistance')} />
  }

  // ── Home ─────────────────────────────────────────────────────────────
  return <FarmerHomeView {...homeProps} tabBar={tabBar('home')} />
  }

  const chrome = {
    initials: accountInitials,
    onProfile: () => { setDisasterScreen(null); setView({ kind: 'profile' }) },
    onHelp: () => { setDisasterScreen(null); setView({ kind: 'help' }) },
    onLogout,
  }

  return (
    <FarmerChromeContext.Provider value={chrome}>
      {renderMobile()}
    </FarmerChromeContext.Provider>
  )
}
