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
