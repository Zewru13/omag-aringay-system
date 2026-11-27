// The two tabs of every Assistance page: Current (assistance that is scheduled, plus older cases still needing follow-up) and History
// (assistance that was received or resolved). The server takes the same two words as a status filter (interventions/distributions.py
// STATUS_GROUPS). No screen and no network, so it can be tested on its own.

export const CURRENT_STATUSES = ['PENDING', 'AWAITING_CONFIRMATION', 'NOT_RECEIVED']
export const HISTORY_STATUSES = ['CONFIRMED', 'RESOLVED']

export const ASSISTANCE_TABS = [{ key: 'current', label: 'Current' }, { key: 'history', label: 'History' }]

export const inGroup = (status, group) => (group === 'current' ? CURRENT_STATUSES : HISTORY_STATUSES).includes(status)

export const groupOfStatus = (status) => (CURRENT_STATUSES.includes(status) ? 'current' : HISTORY_STATUSES.includes(status) ? 'history' : '')

// The tab a ?tab= link opens. The old words (needs-follow-up, upcoming, confirm, all) open Current.
export const tabFromParam = (param) => (param === 'history' ? 'history' : 'current')

export const emptyAssistanceText = (group) => (group === 'history' ? 'No assistance has been received yet.' : 'No assistance is scheduled.')
