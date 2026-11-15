// The rules of a person's own Assistance page (MyAssistancePage.jsx draws them): the sections, the wording and tone of a status, and
// which records the person can answer. No screen and no network, so they can be tested on their own.

const SECTION_OF = { AWAITING_CONFIRMATION: 'waiting', NOT_RECEIVED: 'follow-up', PENDING: 'scheduled' }
const sectionOf = (record) => SECTION_OF[record.status] || 'history'

// What waits for the person comes first. History takes everything else, so a status the page does not know is still listed.
export const ASSISTANCE_SECTIONS = [
  { key: 'waiting', label: 'Waiting for you', match: (record) => sectionOf(record) === 'waiting' },
  { key: 'follow-up', label: 'Being followed up', match: (record) => sectionOf(record) === 'follow-up' },
  { key: 'scheduled', label: 'Scheduled', match: (record) => sectionOf(record) === 'scheduled' },
  { key: 'history', label: 'History', match: (record) => sectionOf(record) === 'history' },
]

const STATUS = {
  AWAITING_CONFIRMATION: { label: 'Confirm', tone: 'amber' },
  NOT_RECEIVED: { label: 'Not received', tone: 'red' },
  PENDING: { label: 'Scheduled', tone: 'grey' },
  CONFIRMED: { label: 'Received', tone: 'green' },
  RESOLVED: { label: 'Resolved', tone: 'green' },
}

// The status in plain words; one the page does not know is shown as it is, in grey.
export const assistanceStatusLabel = (status) => STATUS[status]?.label || status
export const assistanceTone = (status) => STATUS[status]?.tone || 'grey'

// Only assistance that has reached its date and waits for an answer can be confirmed or reported as not received.
export const canConfirm = (record) => record.status === 'AWAITING_CONFIRMATION'

// Everything the search box may look at.
export const assistanceText = (record) => [record.assistance_type, record.item_type, record.quantity, ...(record.source_agencies || [])].filter(Boolean).join(' ')

// The date the Year filter reads.
export const assistanceDate = (record) => record.date_given

// Newest first; a record with no date goes last. A new list; the one given is left as it is.
export function sortAssistance(records) {
  return [...records].sort((a, b) => {
    if (!a.date_given && !b.date_given) return 0
    if (!a.date_given) return 1
    if (!b.date_given) return -1
    return String(b.date_given).localeCompare(String(a.date_given))
  })
}
