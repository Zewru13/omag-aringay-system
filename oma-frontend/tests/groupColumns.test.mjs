import assert from 'node:assert/strict'

const { GROUP_KINDS, groupColumnLabels, groupCells, groupGridClass, groupPhoneLines, personFacts } =
  await import(new URL('../src/utils/groupColumns.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── Every kind has one label per cell, so the header lines up with the row. ──
for (const kind of GROUP_KINDS) {
  const sample = { name: 'X', key: 'f1', id: 1, parcels: 1, area_hectares: 1, crops: 1, count: 1, area_planted_ha: 1, near_harvest: 0, farmers: 1 }
  eq(groupCells(kind, sample).length, groupColumnLabels(kind).length, `${kind}: cells match labels`)
  assert.match(groupGridClass(kind), /^sm:grid-cols-\[/, `${kind} grid class`); n++
}

// ── Crop Records by farmer: name and personal columns, then the counts. ──
eq(groupColumnLabels('parcels:farmer'), ['Farmer', 'RSBSA No.', 'Barangay', 'Contact No.', 'Parcels', 'Area (ha)', 'Crops'], 'parcels by farmer labels')
const ana = { key: 'f1', id: 1, name: 'Ana Parcelo', barangay: 'Alaska', rsbsa_number: '01-033-02-019-000900', contact_number: '09171112222', parcels: 2, area_hectares: 6.5, crops: 3 }
eq(groupCells('parcels:farmer', ana), ['Ana Parcelo', '01-033-02-019-000900', 'Alaska', '09171112222', '2', '6.50', '3'], 'parcels by farmer cells')
eq(groupCells('parcels:farmer', { ...ana, rsbsa_number: '', contact_number: '', barangay: '' }).slice(1, 4), ['—', '—', '—'], 'a missing fact shows a dash')
eq(groupCells('parcels:farmer', { ...ana, area_hectares: 0, crops: 0 }).slice(4), ['2', '0.00', '0'], 'zero area and crops are shown as numbers')

// ── By barangay / by land ownership: how many farmers the group holds. ──
eq(groupColumnLabels('parcels:barangay'), ['Barangay', 'Farmers', 'Parcels', 'Area (ha)', 'Crops'], 'parcels by barangay labels')
eq(groupColumnLabels('parcels:ownership'), ['Land ownership', 'Farmers', 'Parcels', 'Area (ha)', 'Crops'], 'parcels by ownership labels')
eq(groupCells('parcels:barangay', { name: 'Alaska', farmers: 4, parcels: 7, area_hectares: 12.345, crops: 5 }), ['Alaska', '4', '7', '12.35', '5'], 'parcels by barangay cells')   // rounds to 2 places

// ── Crop Monitoring by crop and by farmer. ──
eq(groupColumnLabels('monitoring:crop'), ['Crop', 'Farmers', 'Records', 'Area planted (ha)', 'Near harvest'], 'monitoring by crop labels')
eq(groupCells('monitoring:crop', { name: 'Rice', farmers: 3, count: 4, area_planted_ha: 5.5, near_harvest: 1 }), ['Rice', '3', '4', '5.50', '1'], 'monitoring by crop cells')
eq(groupColumnLabels('monitoring:farmer'), ['Farmer', 'RSBSA No.', 'Barangay', 'Contact No.', 'Records', 'Area planted (ha)', 'Near harvest'], 'monitoring by farmer labels')
eq(groupCells('monitoring:farmer', { key: 'f9', name: 'Ben Dizon', barangay: 'Poblacion', rsbsa_number: '01-033-02-006-000100', contact_number: '', count: 2, area_planted_ha: 1.25, near_harvest: 0 }),
  ['Ben Dizon', '01-033-02-006-000100', 'Poblacion', '—', '2', '1.25', '0'], 'monitoring by farmer cells')
// An organization (or a record with no farmer) has no personal facts of its own: dashes, not blanks.
eq(groupCells('monitoring:farmer', { key: 'o3', name: 'Alaska Growers', barangay: 'Alaska', rsbsa_number: '', contact_number: '', count: 1, area_planted_ha: 1, near_harvest: 0 }).slice(0, 4),
  ['Alaska Growers', '—', 'Alaska', '—'], 'organization group cells')

// ── Phone: the same facts stacked (identity line, then counts line). ──
eq(groupPhoneLines('parcels:farmer', ana), { title: 'Ana Parcelo', identity: '01-033-02-019-000900 · Alaska · 09171112222', counts: '2 parcels · 6.5 ha · 3 crops' }, 'phone parcels by farmer')
eq(groupPhoneLines('parcels:barangay', { name: 'Alaska', farmers: 1, parcels: 1, area_hectares: 0, crops: 0 }), { title: 'Alaska', identity: '', counts: '1 farmer · 1 parcel · 0 crops' }, 'phone parcels by barangay (singular)')
eq(groupPhoneLines('monitoring:crop', { name: 'Rice', farmers: 2, count: 3, area_planted_ha: 4, near_harvest: 2 }), { title: 'Rice', identity: '', counts: '2 farmers · 3 records · 4 ha · 2 near harvest' }, 'phone monitoring by crop')
eq(groupPhoneLines('monitoring:farmer', { key: 'f1', name: 'Ben', barangay: 'Poblacion', rsbsa_number: '', contact_number: '', count: 1, area_planted_ha: 0, near_harvest: 0 }).identity, 'Poblacion', 'phone identity skips missing facts')

// ── Forecasting: the person's facts come off the group's first record. ──
eq(personFacts([{ personRsbsa: '01-1', personBarangay: 'Alaska', personContact: '0917' }, { personRsbsa: '', personBarangay: '', personContact: '' }]), { rsbsa: '01-1', barangay: 'Alaska', contact: '0917' }, 'person facts from the first record that has them')
eq(personFacts([{ personRsbsa: '', personBarangay: 'Baracbac', personContact: '' }, { personRsbsa: '01-2', personBarangay: '', personContact: '0918' }]), { rsbsa: '01-2', barangay: 'Baracbac', contact: '0918' }, 'each fact comes from the first record that has it')
eq(personFacts([]), { rsbsa: '', barangay: '', contact: '' }, 'no records, no facts')

console.log(`groupColumns: ${n} assertions passed`)
