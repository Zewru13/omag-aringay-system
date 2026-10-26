import assert from 'node:assert/strict'

const { END_TERM_REASONS, END_TERM_OTHER_LABEL, END_TERM_OTHER_MAX, endTermRequest } = await import(new URL('../src/pages/Organizations/endTermReasons.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

eq(END_TERM_REASONS, ['Migrated', 'Transferred Registration'], 'the listed reasons')
eq(END_TERM_OTHER_LABEL, 'Others', 'the other choice')
eq(endTermRequest('', ''), { problem: 'Choose why this term is ending early.' }, 'a reason is required')
eq(endTermRequest(undefined, 'x'), { problem: 'Choose why this term is ending early.' }, 'nothing chosen')
eq(endTermRequest('Migrated', ''), { problem: '', body: { reason: 'Migrated' } }, 'Migrated')
eq(endTermRequest('Transferred Registration', 'ignored'), { problem: '', body: { reason: 'Transferred Registration' } }, 'a listed reason ignores stray text')
eq(endTermRequest('Other', ''), { problem: 'Say what the reason is.' }, 'Others needs its text')
eq(endTermRequest('Other', '   '), { problem: 'Say what the reason is.' }, 'blank text is not a reason')
eq(endTermRequest('Other', '  Moved abroad  '), { problem: '', body: { reason: 'Others', reason_other: 'Moved abroad' } }, 'Others with its text, trimmed')
eq(endTermRequest('Other', 'x'.repeat(END_TERM_OTHER_MAX)).problem, '', 'the longest allowed')
eq(endTermRequest('Other', 'x'.repeat(END_TERM_OTHER_MAX + 1)).problem, `Keep the reason to ${END_TERM_OTHER_MAX} characters or fewer.`, 'too long')

console.log(`ok - ${n} assertions`)
