import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { assistanceName, confirmedRecords, confirmedReportSpec } = await import(new URL('../src/pages/Organizations/confirmedAssistances.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// One row of the Confirmed for Members table: an assistance with the members of it the organization confirmed.
const group = {
  id: 'b1', assistance_type: 'Seeds', item: 'Palay (Rice)', quantity: '5 sack', source_agencies: ['DA'], date_given: '2026-08-01',
  confirmed_at: '2026-08-05T09:30:00+08:00', member_count: 2,
  members: [
    { request_id: 11, record_id: 101, name: 'Ben Cruz', rsbsa: '01-033-02-019-000002', barangay: 'Alaska', confirmed_at: '2026-08-05T09:30:00+08:00', confirmed_by: 'Org Officer', photo_urls: [] },
    { request_id: 10, record_id: 100, name: 'Ana Reyes', rsbsa: '01-033-02-019-000001', barangay: 'Dulao', confirmed_at: '2026-08-05T09:30:00+08:00', confirmed_by: 'Org Officer', photo_urls: [] },
  ],
}

// the name of the assistance
eq(assistanceName(group), 'Seeds — Palay (Rice)', 'the type and the item')
eq(assistanceName({ assistance_type: 'Cash Assistance', item: '' }), 'Cash Assistance', 'a type with no item')
eq(assistanceName({ assistance_type: '', item: '' }), 'Assistance', 'nothing at all')

// the records a report is made of: every confirmed member (bulk) or one member (individual)
const all = confirmedRecords(group)
eq(all.map((r) => [r.id, r.name, r.barangay, r.assistance_type, r.item, r.quantity, r.date_given]),
  [[101, 'Ben Cruz', 'Alaska', 'Seeds', 'Palay (Rice)', '5 sack', '2026-08-01'], [100, 'Ana Reyes', 'Dulao', 'Seeds', 'Palay (Rice)', '5 sack', '2026-08-01']], 'bulk: every confirmed member')
eq(confirmedRecords(group, group.members[1]).map((r) => r.name), ['Ana Reyes'], 'individual: just that member')
eq(all[0].source_agencies, ['DA'], 'the source agencies come from the assistance')

// the report
const bulk = confirmedReportSpec({ domain: 'crop', group, organizationName: 'Alaska Farmers' })
eq(bulk.title, 'ASSISTANCE DISTRIBUTION REPORT', 'the assistance distribution report')
eq(bulk.header.find(([k]) => k === 'Date Confirmed')?.[1], 'Aug 5, 2026', 'dated by the confirmation')
eq(bulk.header.find(([k]) => k === 'Cooperative')?.[1], 'Alaska Farmers', 'names the cooperative')
const beneficiaries = bulk.sections.find((s) => s.title === 'Beneficiaries').table
eq(beneficiaries.rows.length, 2, 'bulk lists both members')
eq(beneficiaries.rows.map((r) => r[1]), ['Ana Reyes', 'Ben Cruz'], 'in name order')
ok(beneficiaries.rows.every((r) => r.includes('Seeds — Palay (Rice)')), 'each row names the assistance with its item')
const individual = confirmedReportSpec({ domain: 'fisheries', group, member: group.members[0], organizationName: 'Alaska Farmers' })
eq(individual.sections.find((s) => s.title === 'Beneficiaries').table.rows.length, 1, 'individual lists one member')
eq(individual.header.find(([k]) => k === 'Sector')?.[1], 'Fisheries (Fisherfolk)', 'the sector follows the domain')

// the screen: a table of assistances, each opening its members, with the reports in the row menus
const panel = readFileSync(new URL('../src/pages/Organizations/ConfirmedForMembersPanel.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(panel.includes('/assistances/'), 'the table reads the grouped endpoint')
ok(/<DataTable/.test(panel) && /renderExpanded/.test(panel), 'a table whose rows open to show who was confirmed')
ok(/Print Report/.test(panel) && /Download Report/.test(panel), 'Print Report and Download Report')
ok(!/groupBatches/.test(panel), 'the old per-batch cards are gone')

console.log(`confirmedAssistances: ${n} checks passed`)
