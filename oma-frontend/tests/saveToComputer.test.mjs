// Saving a backup where the Admin chooses: the browser's Save As window, or the usual download where there is none.
import assert from 'node:assert/strict'

const { askWhereToSave, writeToHandle } = await import(new URL('../src/pages/Backup/saveToComputer.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); n++ }

// --- asking where
const handle = { name: 'my copy.zip' }
let asked = null
const chrome = { async showSaveFilePicker(options) { asked = { options, self: this }; return handle } }
eq(await askWhereToSave('omag-backup-2026-11-28-1505.zip', chrome), { kind: 'picked', handle }, 'the place chosen')
eq(asked.options.suggestedName, 'omag-backup-2026-11-28-1505.zip', 'the name is suggested')
eq(asked.options.types, [{ description: 'Backup file', accept: { 'application/zip': ['.zip'] } }], 'a .zip file')
eq(asked.self === chrome, true, 'called on the window, as a browser requires')

const failing = (name) => ({ showSaveFilePicker: async () => { throw Object.assign(new Error('x'), { name }) } })
eq(await askWhereToSave('a.zip', failing('AbortError')), { kind: 'cancelled' }, 'closing the window cancels')
eq(await askWhereToSave('a.zip', failing('SecurityError')), { kind: 'download' }, 'a browser that will not show it: the usual download')
eq(await askWhereToSave('a.zip', {}), { kind: 'download' }, 'a browser without the window (Firefox, Safari, phones)')
eq(await askWhereToSave('a.zip', undefined), { kind: 'download' }, 'no window at all')

// --- writing
const calls = []
const writable = (fails) => ({
  async write(blob) { calls.push(['write', blob]); if (fails === 'write') throw new Error('disk full') },
  async close() { calls.push(['close']); if (fails === 'close') throw new Error('could not close') },
  async abort() { calls.push(['abort']) },
})
await writeToHandle({ createWritable: async () => writable() }, 'the file')
eq(calls, [['write', 'the file'], ['close']], 'written and closed')

for (const step of ['write', 'close']) {
  calls.length = 0
  await assert.rejects(writeToHandle({ createWritable: async () => writable(step) }, 'the file'))
  eq(calls.at(-1), ['abort'], `a failed ${step} throws and gives up the half-written file`)
}
await assert.rejects(writeToHandle({ createWritable: async () => { throw new Error('not allowed') } }, 'x'), /not allowed/)
n++

console.log(`saveToComputer: ${n} checks passed`)
