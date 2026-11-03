import assert from 'node:assert/strict'

const { pcicUnitsCell, PCIC_UNIT_LIMIT } = await import(new URL('../src/pages/FisheriesRecords/pcicUnits.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const unit = (i, insured) => ({ id: i, label: `Pond ${i}`, insured })

eq(PCIC_UNIT_LIMIT, 4, 'four ponds or cages are listed before "more"')

// a cycle with ponds / cages: one tick each
eq(pcicUnitsCell([unit(1, true), unit(2, false)], false), {
  mode: 'units', shown: [unit(1, true), unit(2, false)], hiddenCount: 0, hiddenText: '', insured: 1, total: 2, summary: '1 of 2 insured',
}, 'two units, one insured')
eq(pcicUnitsCell([unit(1, false)], true).mode, 'units', 'units win over the record flag')
eq(pcicUnitsCell([unit(1, false)], true).insured, 0, 'the record flag does not count for a cycle with units')

// more than the limit: the first ones, and what the rest are
const six = [unit(1, true), unit(2, true), unit(3, false), unit(4, false), unit(5, true), unit(6, false)]
const many = pcicUnitsCell(six, false)
eq([many.shown.length, many.hiddenCount, many.hiddenText, many.summary], [4, 2, '+2 more (1 insured)', '3 of 6 insured'], 'six units')
eq(pcicUnitsCell(six, false, 6).hiddenCount, 0, 'a larger limit shows them all')
eq(pcicUnitsCell(six.slice(0, 5).map((u) => ({ ...u, insured: false })), false).hiddenText, '+1 more (none insured)', 'the hidden ones are all uninsured')

// no ponds / cages (an older record, or another culture system): the record's own tick
eq(pcicUnitsCell([], true), { mode: 'record', shown: [], hiddenCount: 0, hiddenText: '', insured: 1, total: 1, summary: 'insured' }, 'no units, insured record')
eq(pcicUnitsCell(undefined, false), { mode: 'record', shown: [], hiddenCount: 0, hiddenText: '', insured: 0, total: 1, summary: 'not insured' }, 'no units at all, not insured')
eq(pcicUnitsCell(null, undefined).insured, 0, 'nothing known is not insured')

console.log(`pcicUnits: ${n} checks passed`)
