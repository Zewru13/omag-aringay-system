// The Backup & Restore page's wording and rules: sizes, dates, what an entry says about itself, what the forms refuse, which file the page downloads by
// itself. No screen and no network, so it can be tested alone.

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

// `timeZone` is only given by the tests; the page shows the browser's own time.
export const formatDate = (value, timeZone) => (value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(new Date(value)) : '—')
export const formatTime = (value, timeZone) => (value
  ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(value)) : '—')

const plural = (n, word) => `${Number(n).toLocaleString('en-US')} ${word}${Number(n) === 1 ? '' : 's'}`

export function backupSummary(row) {
  const restore = row.kind === 'restore'
  if (row.status === 'running') return restore ? 'Restoring…' : 'Running…'
  if (row.status === 'failed') return row.detail || 'It did not finish.'
  if (restore && row.report?.totals) {
    const { written, removed, skipped } = row.report.totals
    return `${written.toLocaleString('en-US')} written · ${removed.toLocaleString('en-US')} removed · ${skipped.toLocaleString('en-US')} skipped`
  }
  const parts = [plural(row.records_count, 'record'), plural(row.files_count, 'file')]
  if (restore) return `${parts.join(' · ')} put back`
  if (row.files_skipped) parts.push(`${plural(row.files_skipped, 'file')} left out`)
  return parts.join(' · ')
}

// Where the file of a finished backup is. A restore, a failed entry and a running one have no file to speak of.
export function fileNote(row) {
  if (row.kind === 'restore' || row.status !== 'done') return ''
  if (row.has_file) return 'Waiting to be downloaded'
  return row.downloaded_at ? 'Downloaded' : 'No file online'
}

export const isRunning = (rows) => rows.some((r) => r.status === 'running')

export function runningMessage(rows) {
  const running = rows.filter((r) => r.status === 'running')
  if (!running.length) return ''
  return running.some((r) => r.kind === 'restore') ? 'A restore is running.' : 'A backup is being made.'
}

// The Location column fills itself with the name of the file once it is saved. A browser never tells a website which folder the
// Admin chose. Until the file is saved the entry's name is only the server's, so nothing is shown.
export const savedFile = (row) => (row.kind !== 'restore' && row.status === 'done' && !row.has_file ? row.file_name || '' : '')

// The name the Save As window suggests, with the day and time of the browser: omag-backup-2026-11-28-1505.zip
export function suggestedFileName(date) {
  const two = (n) => String(n).padStart(2, '0')
  return `omag-backup-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}.zip`
}

export const savedMessage = (row) => `Backup saved. ${plural(row.records_count, 'record')} and ${plural(row.files_count, 'file')} saved to your computer.`

// Under the chosen file's name on the Restore tab. `timeZone` is only given by the tests.
export function takenLine(preview, timeZone) {
  const when = preview.made_at || preview.backup?.created_at
  return `Taken ${formatDate(when, timeZone)} at ${formatTime(when, timeZone)} by ${preview.made_by || preview.backup?.made_by || 'another copy of the system'}`
}

// What to restore. The safe choice comes first and is preselected.
export const RESTORE_SCOPES = [
  {
    id: 'settings', label: 'Settings and lists', button: 'Restore settings',
    text: 'The lists of the settings pages and the signatories. People, farms, ponds and their records are left alone.',
  },
  {
    id: 'everything', label: 'Everything', button: 'Restore everything', danger: true,
    text: 'Also replaces accounts, registrations and all records. Anything recorded since the backup was taken is lost.',
  },
]

// The server of an earlier version does not read the choice and would restore everything. Only a preview that carries the lists
// comes from one that does, so only then may "Settings and lists" be offered.
export const offersSettings = (preview) => Array.isArray(preview?.lists)
export const defaultScope = (preview) => (offersSettings(preview) ? 'settings' : 'everything')
export const previewRows = (preview, scope) => (scope === 'settings' ? preview?.lists : preview?.groups) || []

// The Restore tab: the Admin drops the backup's file (a .zip), sees what it would change, then confirms with their password.
export function restoreFileProblem(file) {
  if (!file) return 'Choose the backup file from your computer.'
  return /\.zip$/i.test(file.name || '') ? '' : 'The backup file is a .zip file.'
}

export function restoreConfirmProblem({ file, password }) {
  return restoreFileProblem(file) || (password ? '' : 'Type your password.')
}

// What the confirm window says is replaced: the records the file holds next to the records held now, of what the restore replaces.
export function confirmCounts(preview, scope) {
  if (scope === 'everything') return preview.records
  const covered = previewRows(preview, scope).filter((row) => !row.kept)
  const sum = (key) => covered.reduce((total, row) => total + row[key], 0)
  return { in_file: sum('in_file'), now: sum('now') }
}

// The result of a restore: what its table says for a row the restore left alone, and how many skipped entries it does not name.
export const keptWords = (scope) => (scope === 'settings' ? 'not in this backup' : 'kept')
export const moreSkipped = (report) => report.totals.skipped - report.skipped.length

// The file the page saves to the computer without being asked: the backup it has just made (`wanted.ids`) or the safety backup of the restore it
// has just run (`wanted.safety`). Other files still online wait for their Download button.
export function nextAutoDownload(rows, wanted) {
  return rows.find((r) => r.status === 'done' && r.has_file && (wanted.ids.includes(r.id) || (wanted.safety && r.kind === 'safety'))) || null
}
