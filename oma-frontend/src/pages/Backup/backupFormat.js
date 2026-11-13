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

export const notesProblem = (form) => ((form.name || '').trim() ? '' : 'Type a name for the backup.')

// The Restore tab: the Admin drops the backup's file (a .zip), sees what it would change, then confirms with their password.
export function restoreFileProblem(file) {
  if (!file) return 'Choose the backup file from your computer.'
  return /\.zip$/i.test(file.name || '') ? '' : 'The backup file is a .zip file.'
}

export function restoreConfirmProblem({ file, password }) {
  return restoreFileProblem(file) || (password ? '' : 'Type your password.')
}

// What a restore would do to one group of records: the file's count next to the count now. A group the file leaves out (the audit trail of a backup
// made without it) is kept as it is.
export function restoreChange({ in_file: inFile, now, kept }) {
  if (kept) return { text: 'Kept as it is', tone: 'kept' }
  const diff = Number(inFile) - Number(now)
  if (diff === 0) return { text: 'No change', tone: 'same' }
  const n = Math.abs(diff).toLocaleString('en-US')
  return diff > 0 ? { text: `${n} put back`, tone: 'added' } : { text: `${n} removed`, tone: 'removed' }
}

// The one line under the file's name: how much the file holds, and how much the system holds now.
export function restoreHeadline({ records, files }) {
  return `${plural(records.in_file, 'record')} and ${plural(files.in_file, 'file')} in this backup. The system holds ${plural(records.now, 'record')} now.`
}

// The file the page saves to the computer without being asked: the backup it has just made (`wanted.ids`) or the safety backup of the restore it
// has just run (`wanted.safety`). Other files still online wait for their Download button.
export function nextAutoDownload(rows, wanted) {
  return rows.find((r) => r.status === 'done' && r.has_file && (wanted.ids.includes(r.id) || (wanted.safety && r.kind === 'safety'))) || null
}

// The running clock of the lock screen: seconds as m:ss (h:mm:ss from an hour).
export function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
