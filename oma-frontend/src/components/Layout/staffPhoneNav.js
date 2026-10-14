// The staff phone's five bottom tabs, built from the sidebar's own groups so the two menus can never drift apart:
// whatever the sidebar offers shows up in exactly one tab's sheet. Pure (no React), so it can be tested.
//
//   Home        goes straight to the dashboard
//   Registry    farmers, fisherfolk and their organizations
//   Monitoring  crop and fisheries monitoring, and forecasting
//   Assistance  assistance given, and disaster reports
//   More        reports and (administrators only) the admin settings
export function buildPhoneTabs({ dashboard, groups, disaster, reports, admin, isAdmin }) {
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]))
  const pick = (...keys) => keys.map((key) => byKey[key]).filter(Boolean)
  return [
    { key: 'home', label: 'Home', leaf: dashboard },
    { key: 'registry', label: 'Registry', sheetTitle: 'Registry', groups: pick('registration', 'organization-management') },
    { key: 'monitoring', label: 'Monitoring', sheetTitle: 'Monitoring', groups: pick('crop-management', 'fisheries-management', 'forecasting') },
    { key: 'assistance', label: 'Assistance', sheetTitle: 'Assistance and disaster', groups: [...pick('assistance-management'), disaster] },
    { key: 'more', label: 'More', sheetTitle: 'More', groups: [reports, ...(isAdmin ? [admin] : [])] },
  ]
}
