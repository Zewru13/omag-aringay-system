import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const {
  formatBytes, backupSummary, isRunning, formatDate, formatTime, fileNote, notesProblem, restoreProblem, nextAutoDownload, runningMessage,
} = await import(new URL('../src/pages/Backup/backupFormat.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.equal(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

eq(formatBytes(0), '0 B', 'zero')
eq(formatBytes(512), '512 B', 'bytes')
eq(formatBytes(2048), '2.0 KB', 'kilobytes')
eq(formatBytes(5 * 1024 * 1024), '5.0 MB', 'megabytes')
eq(formatBytes(3.5 * 1024 * 1024 * 1024), '3.50 GB', 'gigabytes')
eq(formatBytes(null), '—', 'missing')

eq(backupSummary({ status: 'done', records_count: 1200, files_count: 35, files_skipped: 0 }), '1,200 records · 35 files', 'a finished backup')
eq(backupSummary({ status: 'done', records_count: 1, files_count: 1, files_skipped: 2 }), '1 record · 1 file · 2 files left out', 'singular and left out')
eq(backupSummary({ status: 'running' }), 'Running…', 'running')
eq(backupSummary({ status: 'failed', detail: 'disk full' }), 'disk full', 'failed shows why')
eq(backupSummary({ status: 'failed', detail: '' }), 'It did not finish.', 'failed with no reason')
eq(backupSummary({ kind: 'restore', status: 'done', records_count: 1200, files_count: 35 }), '1,200 records · 35 files put back', 'a finished restore')
eq(backupSummary({ kind: 'restore', status: 'running' }), 'Restoring…', 'a running restore')

eq(isRunning([{ status: 'done' }, { status: 'running' }]), true, 'one is running')
eq(isRunning([{ status: 'done' }]), false, 'none running')
eq(isRunning([]), false, 'empty')

// the date and the time are two columns of the list
eq(formatDate('2026-11-01T07:05:00Z', 'Asia/Manila'), 'Nov 1, 2026', 'date')
eq(formatTime('2026-11-01T07:05:00Z', 'Asia/Manila'), '3:05 PM', 'time')
eq(formatDate(null), '—', 'no date')
eq(formatTime(''), '—', 'no time')

// where the file of a backup is: still online (waiting for its download), downloaded, or nothing to say (a restore, a failed one)
eq(fileNote({ kind: 'manual', status: 'done', has_file: true }), 'Waiting to be downloaded', 'online copy')
eq(fileNote({ kind: 'manual', status: 'done', has_file: false, downloaded_at: '2026-11-01T07:05:00Z' }), 'Downloaded', 'downloaded')
eq(fileNote({ kind: 'manual', status: 'done', has_file: false, downloaded_at: null }), 'No file online', 'an old entry whose file is gone')
eq(fileNote({ kind: 'restore', status: 'done' }), '', 'a restore has no file')
eq(fileNote({ kind: 'manual', status: 'failed' }), '', 'a failed backup has no file')
eq(fileNote({ kind: 'manual', status: 'running' }), '', 'a running backup has no file yet')

// the notes of a backup: a name is needed, the rest is optional
eq(notesProblem({ name: '  ', location: 'x' }), 'Type a name for the backup.', 'no name')
eq(notesProblem({ name: 'October copy', location: '' }), '', 'a name is enough')

// restore: the file is chosen only when the online copy is gone; the password always
eq(restoreProblem({ row: { has_file: false }, file: null, password: 'x' }), 'Choose the backup file from your computer.', 'no file chosen')
eq(restoreProblem({ row: { has_file: false }, file: { name: 'photo.png' }, password: 'x' }), 'The backup file is a .zip file.', 'not a zip')
eq(restoreProblem({ row: { has_file: false }, file: { name: 'oma_backup_1.ZIP' }, password: '' }), 'Type your password.', 'no password')
eq(restoreProblem({ row: { has_file: false }, file: { name: 'oma_backup_1.zip' }, password: 'x' }), '', 'file and password')
eq(restoreProblem({ row: { has_file: true }, file: null, password: 'x' }), '', 'the online copy needs no file')
eq(restoreProblem({ row: { has_file: true }, file: null, password: '' }), 'Type your password.', 'the online copy still needs the password')

// the page downloads by itself the backup it just made, and the safety backup of the restore it just ran
const rows = [
  { id: 9, kind: 'restore', status: 'done', has_file: false },
  { id: 8, kind: 'safety', status: 'done', has_file: true },
  { id: 7, kind: 'manual', status: 'done', has_file: true },
  { id: 6, kind: 'manual', status: 'done', has_file: true },
]
eq(nextAutoDownload(rows, { ids: [6], safety: false })?.id, 6, 'the backup this page made')
eq(nextAutoDownload(rows, { ids: [], safety: true })?.id, 8, 'the safety backup of this page\'s restore')
eq(nextAutoDownload(rows, { ids: [], safety: false }), null, 'nothing asked for: older waiting files are left to the Download button')
eq(nextAutoDownload([{ id: 6, kind: 'manual', status: 'running', has_file: false }], { ids: [6], safety: false }), null, 'not finished yet')

eq(runningMessage([{ kind: 'manual', status: 'running' }]), 'A backup is being made.', 'a backup is running')
eq(runningMessage([{ kind: 'safety', status: 'running' }, { kind: 'restore', status: 'running' }]), 'A restore is running.', 'a restore is running')
eq(runningMessage([{ kind: 'manual', status: 'done' }]), '', 'nothing is running')

// --- the page itself
const page = readFileSync(new URL('../src/pages/Backup/BackupPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(!/Trash2|api\.delete|Delete Backup/.test(page), 'no Delete on the Backup page')
ok(!/backup_system|automatically|every night/i.test(page), 'no automatic backup is promised')
ok(page.includes('/downloaded/'), 'the page tells the server when the file has arrived')
ok(page.includes('/restore/'), 'the page can restore')
ok(/DataTable/.test(page), 'the list is a table')
for (const label of ['NAME', 'DATE', 'TIME', 'LOCATION']) ok(page.includes(`label: '${label}'`), `the list has a ${label} column`)
ok(/CycleField label="Name"/.test(page) && /CycleField label="Location"/.test(page) && /CycleField label="Remarks"/.test(page), 'the notes form is a table of labelled rows')
ok((page.match(/<BackupNotesModal/g) || []).length === 2, 'the same form makes a backup and edits one')

const manual = readFileSync(new URL('../src/pages/Manual/manualContent.js', import.meta.url), 'utf8')
ok(!/every night|latest 14|Delete removes one/.test(manual), 'the manual no longer describes the nightly backup, the 14 kept or Delete')
ok(/Restore/.test(manual), 'the manual explains Restore')

console.log(`backupFormat: ${n} checks passed`)
