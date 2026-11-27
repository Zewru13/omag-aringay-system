// The words of the Audit Log page and its details window. No screen and no network.

// every action the server records (auditlog/models.py): its name on screen and the colour of its pill
const ACTIONS = {
  CREATE: ['Create', 'green'],
  UPDATE: ['Update', 'blue'],
  DELETE: ['Delete', 'rose'],
  APPROVE: ['Approve', 'green'],
  REJECT: ['Reject', 'rose'],
  IMPORT: ['Import', 'blue'],
  DOWNLOAD: ['Download', 'slate'],
  SIGN_IN: ['Sign in', 'slate'],
  SIGN_OUT: ['Sign out', 'slate'],
  SIGN_IN_FAILED: ['Failed sign-in', 'rose'],
  BACKUP: ['Backup', 'blue'],
  RESTORE: ['Restore', 'blue'],
}

export const ACTION_OPTIONS = [
  { label: 'All Actions', value: '' },
  ...Object.entries(ACTIONS).map(([value, [label]]) => ({ value, label })),
]

// every module the server records, in its order (auditlog/modules.py)
const MODULES = [
  'Registration', 'Cooperatives', 'Crop Management', 'Fisheries Management', 'Assistance', 'Disaster', 'Reports', 'Crop Settings',
  'Fisheries Settings', 'Activity Settings', 'Assistance Settings', 'Classification Settings', 'Harvest Unit Settings', 'User Management',
  'Signatories', 'Backup & Restore', 'Sign-in & Account',
]
export const MODULE_OPTIONS = [{ label: 'All modules', value: '' }, ...MODULES.map((name) => ({ label: name, value: name }))]

// The numbers to offer under the list: the first and the last page and the ones around the page shown, '…' where some are skipped.
export function pageNumbers(current, total) {
  const run = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
  if (total <= 5) return run(1, total)
  if (current <= 3) return [...run(1, 4), '…', total]
  if (current >= total - 2) return [1, '…', ...run(total - 3, total)]
  return [1, '…', ...run(current - 1, current + 1), '…', total]
}

export function showingText(page, size, total) {
  const n = (value) => value.toLocaleString('en-US')
  const first = (page - 1) * size + 1
  return `Showing ${n(first)} to ${n(Math.min(page * size, total))} of ${n(total)} ${total === 1 ? 'entry' : 'entries'}`
}

// Whom an entry is about (entries made before this was kept have nobody). A row links to a history only when it is about exactly one.
export const peopleOf = (entry) => entry?.details?.people || []
// When more records were changed than are listed, the others may be about other people, so the row names nobody.
export const rowPerson = (entry) => (peopleOf(entry).length === 1 && !entry.details.more ? peopleOf(entry)[0] : null)

const COOPERATIVE_KINDS = ['farmers-cooperative', 'fisherfolk-cooperative']
const TABS = ['all', 'farmer', 'fisherfolk', 'cooperative']

export function historyLink({ kind, id }) {
  return COOPERATIVE_KINDS.includes(kind)
    ? `/audit-log?tab=cooperative&kind=${kind}&id=${id}`
    : `/audit-log?tab=${kind}&id=${id}`
}

// The tab, and on a history tab whom it shows, as written in the address. Anything unreadable means nobody is picked.
export function historyTarget(params) {
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'all'
  const id = Number(params.get('id'))
  let kind = ''
  if (tab === 'farmer' || tab === 'fisherfolk') kind = tab
  if (tab === 'cooperative' && COOPERATIVE_KINDS.includes(params.get('kind'))) kind = params.get('kind')
  return kind && Number.isInteger(id) && id > 0 ? { tab, kind, id } : { tab, kind: '', id: null }
}

export const actionLabel = (action) => ACTIONS[action]?.[0] || action
export const actionTone = (action) => ACTIONS[action]?.[1] || 'slate'

const CHANGED = { created: 'added', updated: 'changed', deleted: 'deleted' }
export const changeHeading = ({ record, name, change }) => `${record} ${CHANGED[change] || change}: ${name}`

export const shownValue = (value) => (value === null || value === undefined || value === '' ? '—' : value)

export function moreText(more) {
  if (!more) return ''
  return more === 1
    ? '1 more record was changed and is not listed here.'
    : `${more.toLocaleString('en-US')} more records were changed and are not listed here.`
}

// Entries from before details were kept have none, and so do actions that change no record (a sign-in, a download).
export const noDetailsText = () => 'There are no further details for this entry. Sign-ins, downloads and entries made before details were kept have none.'
