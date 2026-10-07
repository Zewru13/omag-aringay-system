// What the shared Import File modal shows for a response `{ summary, rows }`, whichever import produced it. The older
// imports (organizations, assistance, crop records, fisheries) report ready / duplicate_in_file / duplicate_in_database /
// invalid and keep exactly their old tiles and tabs; the member and equipment imports add their own statuses.

export const STATUS_META = {
  ready: { tone: 'green', preview: 'Will Create', done: 'Created', tile: 'Ready to Create', tab: null },
  already_member: { tone: 'amber', preview: 'Already a Member', done: 'Skipped — Already a Member', tile: 'Already a Member', tab: 'Already a Member' },
  already_exists: { tone: 'amber', preview: 'Already Exists', done: 'Skipped — Already Exists', tile: 'Already Exists', tab: 'Already Exists' },
  duplicate_in_file: { tone: 'amber', preview: 'Duplicate In File', done: 'Skipped — Duplicate', tile: 'Duplicate in File', tab: 'In-File Dupe' },
  duplicate_in_database: { tone: 'amber', preview: 'Already Exists', done: 'Skipped — Already Exists', tile: 'Already Exists', tab: 'Already Exists' },
  not_found: { tone: 'rose', preview: 'Not Found', done: 'Not Found', tile: 'Not Found', tab: 'Not Found' },
  needs_main_choice: { tone: 'amber', preview: 'Needs Main Choice', done: 'Skipped — Needs Main Choice', tile: 'Needs Main Choice', tab: 'Needs Main Choice' },
  invalid: { tone: 'rose', preview: 'Invalid', done: 'Invalid', tile: 'Invalid Rows', tab: 'Invalid' },
}

// Display order of the statuses present in a summary.
const ORDER = ['ready', 'already_member', 'already_exists', 'duplicate_in_file', 'duplicate_in_database', 'not_found', 'needs_main_choice', 'invalid']

const present = (summary) => ORDER.filter((key) => summary && Object.prototype.hasOwnProperty.call(summary, key))

// The tiles above the row list: one per status the response reports (zeros included), the first one reading
// "Created" once the import has been confirmed.
export function summaryTiles(summary, step) {
  return present(summary).map((key) => ({
    label: key === 'ready' && step === 'done' ? 'Created' : STATUS_META[key].tile,
    value: summary[key],
  }))
}

// The filter tabs: "All n", then one per status with at least one row.
export function filterTabs(summary, rowCount, step) {
  const tabs = [{ key: 'all', label: `All ${rowCount}` }]
  for (const key of present(summary)) {
    if (!summary[key]) continue
    const meta = STATUS_META[key]
    const text = key === 'ready' ? (step === 'done' ? meta.done : meta.preview) : meta.tab
    tabs.push({ key, label: `${summary[key]} ${text}` })
  }
  return tabs
}
