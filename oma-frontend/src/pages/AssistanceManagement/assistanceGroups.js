// The two tabs of every Assistance page: Current (assistance that is scheduled, awaiting confirmation or needs follow-up) and History
// (assistance that was received / confirmed or resolved). The server takes the same two words as a status filter (interventions/distributions.py
// STATUS_GROUPS). No screen and no network, so it can be tested on its own.

export const CURRENT_STATUSES = ['PENDING', 'AWAITING_CONFIRMATION', 'NOT_RECEIVED']
export const HISTORY_STATUSES = ['CONFIRMED', 'RESOLVED']

export const ASSISTANCE_TABS = [{ key: 'current', label: 'Current' }, { key: 'history', label: 'History' }]

export const inGroup = (status, group) => (group === 'current' ? CURRENT_STATUSES : HISTORY_STATUSES).includes(status)

export const groupOfStatus = (status) => (CURRENT_STATUSES.includes(status) ? 'current' : HISTORY_STATUSES.includes(status) ? 'history' : '')

// The tab a ?tab= link opens. The old words (needs-follow-up, upcoming, all) open Current; `confirm` (an organization's Confirm for Members
// list, which is part of Current) only where `allowConfirm`.
export const tabFromParam = (param, { allowConfirm = false } = {}) => {
  if (param === 'history') return 'history'
  if (param === 'confirm' && allowConfirm) return 'confirm'
  return 'current'
}

export const emptyAssistanceText = (group) => (group === 'history'
  ? 'No assistance has been received or confirmed yet.'
  : 'Nothing is waiting: no assistance is scheduled, awaiting confirmation or needing follow-up.')
