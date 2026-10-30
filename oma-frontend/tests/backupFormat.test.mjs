import assert from 'node:assert/strict'

const { formatBytes, backupSummary, isRunning } = await import(new URL('../src/pages/Backup/backupFormat.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.equal(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

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

eq(isRunning([{ status: 'done' }, { status: 'running' }]), true, 'one is running')
eq(isRunning([{ status: 'done' }]), false, 'none running')
eq(isRunning([]), false, 'empty')

console.log(`backupFormat: ${n} checks passed`)
