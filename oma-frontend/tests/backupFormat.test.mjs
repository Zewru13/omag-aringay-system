import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const {
  formatBytes, backupSummary, isRunning, formatDate, formatTime, fileNote, notesProblem, restoreFileProblem, restoreConfirmProblem,
  nextAutoDownload, runningMessage, suggestedFileName, savedMessage, takenLine, RESTORE_SCOPES, offersSettings, defaultScope,
  previewRows, confirmCounts, keptWords, moreSkipped,
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

// restore: the file is dropped on the Restore tab (a .zip), then the password confirms
eq(restoreFileProblem(null), 'Choose the backup file from your computer.', 'no file chosen')
eq(restoreFileProblem({ name: 'photo.png' }), 'The backup file is a .zip file.', 'not a zip')
eq(restoreFileProblem({ name: 'oma_backup_1.ZIP' }), '', 'a zip')
eq(restoreConfirmProblem({ file: { name: 'oma_backup_1.zip' }, password: '' }), 'Type your password.', 'no password')
eq(restoreConfirmProblem({ file: null, password: 'x' }), 'Choose the backup file from your computer.', 'no file')
eq(restoreConfirmProblem({ file: { name: 'oma_backup_1.zip' }, password: 'x' }), '', 'file and password')

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

// the Save As window suggests a name with the day and time (the browser's own time)
eq(suggestedFileName(new Date(2026, 10, 28, 15, 5)), 'omag-backup-2026-11-28-1505.zip', 'suggested name')
eq(suggestedFileName(new Date(2026, 0, 3, 7, 9)), 'omag-backup-2026-01-03-0709.zip', 'with leading zeroes')
eq(savedMessage({ records_count: 1200, files_count: 35 }), 'Backup saved. 1,200 records and 35 files saved to your computer.', 'saved')
eq(savedMessage({ records_count: 1, files_count: 1 }), 'Backup saved. 1 record and 1 file saved to your computer.', 'saved, singular')

eq(takenLine({ made_at: '2026-11-28T07:05:00Z', made_by: 'maria' }, 'Asia/Manila'), 'Taken Nov 28, 2026 at 3:05 PM by maria', 'taken when and by whom')
eq(takenLine({ backup: { created_at: '2026-11-28T07:05:00Z', made_by: 'juan' } }, 'Asia/Manila'), 'Taken Nov 28, 2026 at 3:05 PM by juan', 'from the history entry on an older server')

// what to restore: the safe choice first and preselected, and only once the server can do it
eq(JSON.stringify(RESTORE_SCOPES.map((s) => [s.id, s.label, s.button, Boolean(s.danger)])),
  JSON.stringify([['settings', 'Settings and lists', 'Restore settings', false], ['everything', 'Everything', 'Restore everything', true]]), 'two choices')
eq(RESTORE_SCOPES[0].text, 'The lists of the settings pages and the signatories. People, farms, ponds and their records are left alone.', 'what settings means')
eq(RESTORE_SCOPES[1].text, 'Also replaces accounts, registrations and all records. Anything recorded since the backup was taken is lost.', 'what everything means')
const newServer = { lists: [{ key: 'production.seedsource' }], groups: [{ key: 'farmers' }] }
eq(offersSettings(newServer), true, 'the new server sends the lists')
eq(offersSettings({ groups: [] }), false, 'the old server does not, and would ignore the choice')
eq(offersSettings(null), false, 'nothing read yet')
eq(defaultScope(newServer), 'settings', 'the safe choice is preselected')
eq(defaultScope({ groups: [] }), 'everything', 'the old server only restores everything')
eq(previewRows(newServer, 'settings')[0].key, 'production.seedsource', 'one row per list')
eq(previewRows(newServer, 'everything')[0].key, 'farmers', 'one row per group')

eq(backupSummary({ kind: 'restore', status: 'done', records_count: 120, files_count: 0, report: { totals: { written: 1200, removed: 3, skipped: 1 } } }),
  '1,200 written · 3 removed · 1 skipped', 'a restore says what it did')

// the confirm window says how much is replaced: what the file holds next to what the system holds now
const counted = {
  records: { in_file: 1200, now: 1300 }, groups: [],
  lists: [{ in_file: 10, now: 12, kept: false }, { in_file: null, now: 5, kept: true }, { in_file: 2, now: 1, kept: false }],
}
eq(JSON.stringify(confirmCounts(counted, 'everything')), JSON.stringify({ in_file: 1200, now: 1300 }), 'everything: all the records a restore replaces')
eq(JSON.stringify(confirmCounts(counted, 'settings')), JSON.stringify({ in_file: 12, now: 13 }), 'settings: the entries of the lists the file covers')
eq(keptWords('everything'), 'kept', 'what Everything leaves alone')
eq(keptWords('settings'), 'not in this backup', 'a list the file does not cover')
eq(moreSkipped({ totals: { skipped: 205 }, skipped: new Array(200) }), 5, 'more than the result names')
eq(moreSkipped({ totals: { skipped: 1 }, skipped: [{}] }), 0, 'all named')

// --- the page itself: two tabs, Create backup and Restore
const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const page = source('pages/Backup/BackupPage.jsx')
const createTab = source('pages/Backup/CreateBackupTab.jsx')
const history = source('pages/Backup/BackupHistory.jsx')
const notesWindow = source('pages/Backup/BackupNotesModal.jsx')
const everyScreen = [page, createTab, history, notesWindow].join('\n')
ok(!/Trash2|api\.delete|Delete Backup/.test(everyScreen), 'no Delete on the Backup page')
ok(!/backup_system|automatically|every night/i.test(createTab + history + notesWindow), 'no automatic backup is promised')
ok(page.includes('title="Backup & Restore"'), 'the page is called Backup & Restore')
ok(page.includes('<PillTabs') && /id: 'create', label: 'Create backup'/.test(page) && /id: 'restore', label: 'Restore'/.test(page), 'two tabs')
ok(/useSearchParams/.test(page) && /get\('tab'\) === 'restore'/.test(page), 'the tab is in the address')
ok(createTab.includes('Saves one file (.zip) holding every record below and every uploaded file. You choose where it goes. Keep it somewhere off this computer.'), 'what the Create backup tab says')
ok(createTab.includes('Two things this file cannot hold'), 'the yellow box')
ok(createTab.includes('The system itself') && createTab.includes('The program and the design of the database are in the project&rsquo;s code; this file holds records and uploaded files.'), 'its first item')
ok(createTab.includes('Server settings and keys') && createTab.includes('Such as the e-mail and file storage keys, which are kept on the server.'), 'its second item')
ok(createTab.includes('amber'), 'the box is yellow')
ok(createTab.indexOf('<BackupGroups') < createTab.indexOf('Two things this file cannot hold') && createTab.indexOf('Two things this file cannot hold') < createTab.indexOf('<BackupHistory'), 'cards, then the box, then the history')
ok(createTab.includes('Download backup'), 'the button is Download backup')
ok(!/Import backup file|ImportFileModal|backups\/import/.test(everyScreen), 'there is no Import backup file: Restore takes the file')

// the place is asked for at the click, before the backup starts; cancelling starts nothing
const startBackup = page.slice(page.indexOf('const startBackup'), page.indexOf('const saveNotes'))
ok(startBackup.indexOf('askWhereToSave(') > -1 && startBackup.indexOf('askWhereToSave(') < startBackup.indexOf("api.post('/backups/'"), 'asked before the backup starts')
ok(startBackup.indexOf('await ') === startBackup.indexOf('await askWhereToSave('), 'nothing is awaited before it, or the browser would refuse')
ok(startBackup.includes("if (place.kind === 'cancelled') return false"), 'cancelling starts nothing')
ok(/=== false/.test(notesWindow), 'and keeps the notes window open')
const downloading = page.slice(page.indexOf('const download = useCallback'), page.indexOf('const refresh'))
ok(downloading.indexOf('writeToHandle(') > -1 && downloading.indexOf('writeToHandle(') < downloading.indexOf('/downloaded/`, { file_name: place.handle.name }'), 'the online copy goes only after the file is written')
ok(page.includes('The backup could not be saved to the file you chose. It is still online: press Download to try again.'), 'a file that cannot be written keeps the online copy')
ok((page.match(/askWhereToSave\(/g) || []).length === 2, 'the history Download asks where too')
ok(page.includes('savedMessage('), 'says what was saved')
ok(page.includes("'Creating backup'") && page.includes("'Restoring data'"), 'the lock window titles')
ok(history.includes('View result'), 'a finished restore can be read again')
// --- the Restore tab: on the page, no popup
const restoreTab = source('pages/Backup/RestoreTab.jsx')
const confirmWindow = source('pages/Backup/RestoreConfirmWindow.jsx')
const resultView = source('pages/Backup/RestoreResult.jsx')
ok(!existsSync(new URL('../src/pages/Backup/RestoreModal.jsx', import.meta.url)), 'the Restore popup is gone')
ok(page.includes('<RestoreTab') && !page.includes('RestoreModal'), 'the page restores on its Restore tab')
for (const words of [
  'Add a backup file to see what it would change. Nothing is written until you confirm.',
  'Drag a backup file here, or browse for a .zip file saved from this page.',
  'Change file', 'Remove', 'Checking what would change…', 'In this backup', 'In the system now', '>Records<',
  'The server is still being updated. Settings and lists will be available in a few minutes.',
]) ok(restoreTab.includes(words), `the Restore tab says: ${words}`)
ok(restoreTab.includes('takenLine(') && restoreTab.includes('Browse files'), 'when and by whom the file was taken; or browse for it')
ok(restoreTab.includes("'/backups/restore/preview/'"), 'adding a file only previews it')
ok(restoreTab.includes('const choices = offersSettings(preview) ? RESTORE_SCOPES : RESTORE_SCOPES.filter((s) => s.id === \'everything\')'), '"Settings and lists" is offered only when the server can do it')
ok(restoreTab.includes('setScope(defaultScope(r.data))'), 'the safe choice is preselected')
ok(/variant="danger"/.test(restoreTab) && restoreTab.includes('{choice.button}'), 'the restore button is red and says what it restores')
ok(restoreTab.includes('danger') && restoreTab.includes('rose'), 'Everything is in red')
for (const words of ['Are you sure you want to restore?', 'type="password"', '>No<', 'Yes, restore']) ok(confirmWindow.includes(words), `the confirm window has: ${words}`)
ok(confirmWindow.includes("'/backups/restore/'") && confirmWindow.includes("body.append('scope', scope)"), 'the request says what to restore')
ok(confirmWindow.includes('confirmCounts(') && confirmWindow.includes('choice.text'), 'it says what will be replaced')
ok(confirmWindow.includes('ModalShell') && confirmWindow.includes('FormTable.jsx') && /<FormCell/.test(confirmWindow), 'a table form like every other window')
ok(/variant="danger"/.test(confirmWindow), 'Yes, restore is red')
for (const words of ['Restore complete', 'Written', 'Removed', 'Skipped', 'keptWords(', 'moreSkipped(', 'entry.detail']) ok(resultView.includes(words), `the result has: ${words}`)
ok(page.includes('<RestoreResult'), 'View result opens the same result')

// while a backup is being made or saved, or a restore is running, the Admin cannot leave or use the rest of the system
const lockScreen = readFileSync(new URL('../src/components/UI/WorkLockScreen.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const leaveGuard = readFileSync(new URL('../src/hooks/useLeaveGuard.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(page.includes('useLeaveGuard(locked)') && /locked && <WorkLockScreen/.test(page), 'the page locks itself while a backup, a download or a restore is going on')
ok(page.includes('const locked = busy || savingId !== null'), 'a running backup/restore and a file being saved both lock it')
ok(/createPortal/.test(lockScreen) && /fixed inset-0 z-\[100\]/.test(lockScreen), 'the lock covers the whole screen, the menu and the top bar included')
ok(/role="alertdialog"/.test(lockScreen) && /Please wait/.test(lockScreen) && /do not close or leave/i.test(lockScreen), 'it says to wait and not to leave')
ok(/inert/.test(lockScreen), 'nothing behind it can be reached with the keyboard either')
ok(leaveGuard.includes("'beforeunload'") && leaveGuard.includes("'popstate'"), 'closing the tab, reloading and the Back button are held while it is on')
ok(/export default function useLeaveGuard\(active\)/.test(leaveGuard) && /removeEventListener\('beforeunload'/.test(leaveGuard), 'it lets go the moment the work is done')
ok(page.includes("'/backups/summary/'"), 'the Create backup tab shows what a backup holds, from the server')
const groupsFile = source('pages/Backup/BackupGroups.jsx')
ok(groupsFile.includes('Include the Audit Log and notification history') && page.includes('include_audit'), 'the audit trail is an optional tick')
const sidebar = readFileSync(new URL('../src/components/Layout/Sidebar.jsx', import.meta.url), 'utf8')
ok(sidebar.includes('label: "Backup & Restore"') && !sidebar.includes('label: "Backup" }'), 'the menu entry is Backup & Restore')
ok(/DataTable/.test(history), 'the list is a table')
for (const label of ['NAME', 'DATE', 'TIME', 'LOCATION']) ok(history.includes(`label: '${label}'`), `the list has a ${label} column`)
ok(/CycleField label="Name"/.test(notesWindow) && /CycleField label="Location"/.test(notesWindow) && /CycleField label="Remarks"/.test(notesWindow), 'the notes form is a table of labelled rows')
ok((page.match(/<BackupNotesModal/g) || []).length === 2, 'the same form makes a backup and edits one')

const manual = readFileSync(new URL('../src/pages/Manual/manualContent.js', import.meta.url), 'utf8')
ok(!/every night|latest 14|Delete removes one/.test(manual), 'the manual no longer describes the nightly backup, the 14 kept or Delete')
ok(/Restore/.test(manual), 'the manual explains Restore')

// the lock screen box: an animated emblem (spinning arc, rings, a floating icon) instead of a bar and a clock
const lock2 = readFileSync(new URL('../src/components/UI/WorkLockScreen.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const css2 = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(!/progressbar|work-bar|Working for|formatElapsed|setInterval/.test(lock2), 'no moving bar and no running clock')
ok(!/workBar|\.work-bar/.test(css2), 'the old bar animation is gone')
for (const cls of ['work-backdrop', 'work-card', 'work-arc', 'work-ring', 'work-icon', 'work-dot']) ok(lock2.includes(cls), `the box uses ${cls}`)
ok(/variant/.test(lock2) && /HardDriveDownload/.test(lock2) && /History/.test(lock2) && /Download/.test(lock2), 'the emblem shows a picture that fits the work: making a backup, saving the file, or a restore')
ok(/createPortal/.test(lock2) && /inert/.test(lock2) && /role="alertdialog"/.test(lock2), 'it still covers everything and holds the page')
ok(/aria-hidden="true"/.test(lock2) && /Please wait/.test(lock2) && /do not close or leave/i.test(lock2), 'it still says to wait and not to leave, and the decoration is hidden from screen readers')
for (const frames of ['workCardIn', 'workFade', 'workSpin', 'workRing', 'workFloat', 'workDot']) ok(css2.includes(`@keyframes ${frames}`), `${frames} is defined`)
ok(/\.work-card\s*{[^}]*cubic-bezier\(0\.23, 1, 0\.32, 1\)/.test(css2), 'the box comes in with a strong ease-out')
ok(/\.work-card\s*{[^}]*animation: workCardIn 2\d\dms/.test(css2) && /\.work-backdrop\s*{[^}]*animation: workFade/.test(css2), 'the entrance is under 300ms')
ok(/prefers-reduced-motion[\s\S]*\.work-arc[\s\S]*\.work-ring/.test(css2), 'every motion stands still for people who ask for less motion')
const pageSrc = readFileSync(new URL('../src/pages/Backup/BackupPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(/<WorkLockScreen[^>]*variant=/.test(pageSrc), 'the page tells the box which work is going on')

console.log(`backupFormat: ${n} checks passed`)
