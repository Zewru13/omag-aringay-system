// The Backup page's wording: sizes, what a finished / running / failed backup says about itself. No screen and no network, so it can be tested alone.

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

const plural = (n, word) => `${Number(n).toLocaleString('en-US')} ${word}${Number(n) === 1 ? '' : 's'}`

export function backupSummary(row) {
  if (row.status === 'running') return 'Running…'
  if (row.status === 'failed') return row.detail || 'It did not finish.'
  const parts = [plural(row.records_count, 'record'), plural(row.files_count, 'file')]
  if (row.files_skipped) parts.push(`${plural(row.files_skipped, 'file')} left out`)
  return parts.join(' · ')
}

export const isRunning = (rows) => rows.some((r) => r.status === 'running')
