import assert from 'node:assert/strict'

const {
  GROUP_OPTIONS, DEFAULT_GROUP, DISPLAY_STATUSES, monitoringParams, groupChildParams, groupSummary, groupHeading, PARCEL_GROUP_COLUMNS, parcelGroupFacts,
} = await import(new URL('../src/pages/Monitoring/monitoringGroups.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── the choices
eq(GROUP_OPTIONS.map((o) => o.value), ['crop', 'farmer', 'parcel', 'none'], 'group-by choices')
eq(DEFAULT_GROUP, 'none', 'default is no grouping')
eq(DISPLAY_STATUSES, ['Due Harvest', 'Ready for Harvest', 'Overdue'], 'display statuses')

// ── the filters sent to the list and to the groups (identical)
const base = { statusFilter: 'Planted,Near Harvest', season: '', year: '', barangay: '', cropType: '', search: '' }
eq(monitoringParams(base), { status: 'Planted,Near Harvest' }, 'default filters')
eq(monitoringParams({ ...base, statusFilter: 'all' }), {}, 'all statuses sends no status')
eq(monitoringParams({ ...base, statusFilter: 'Harvested', season: 'Wet', year: '2026', barangay: 'Alaska', cropType: '3', search: 'ana' }),
  { status: 'Harvested', season: 'Wet', year: '2026', barangay: 'Alaska', crop_type: '3', search: 'ana' }, 'every filter')
for (const label of DISPLAY_STATUSES) {
  eq(monitoringParams({ ...base, statusFilter: label }), { status: 'Near Harvest', display_status: label }, `${label} is a split of Near Harvest`)
}

// ── opening a group: the list scoped to it
eq(groupChildParams('crop', { key: 'c7', id: 7 }), { crop_type: 7 }, 'a crop group')
eq(groupChildParams('farmer', { key: 'f12', id: 12 }), { farmer: 12 }, 'a farmer group')
eq(groupChildParams('farmer', { key: 'o5', id: 5 }), { farmers_organization: 5 }, "an organization's group")
eq(groupChildParams('parcel', { key: 'p9', id: 9 }), { farm_parcel: 9 }, 'a parcel group')
eq(groupChildParams('parcel', { key: 'none', id: null }), { farm_parcel: 'none' }, 'the crops with no parcel')
eq(groupChildParams('farmer', { key: 'none', id: null }), null, 'a group with nothing to open onto')

// ── the group line
eq(groupSummary({ count: 3, area_planted_ha: 4.5, near_harvest: 1 }), '3 records · 4.5 ha · 1 near harvest', 'summary')
eq(groupSummary({ count: 1, area_planted_ha: 2, near_harvest: 0 }), '1 record · 2 ha', 'singular, no near-harvest part')
eq(groupSummary({ count: 2, area_planted_ha: 0, near_harvest: 0 }), '2 records', 'no area recorded')
eq(groupSummary({ count: 2, area_planted_ha: 1.23456, near_harvest: 2 }), '2 records · 1.23 ha · 2 near harvest', 'area rounded to 2 places')
eq(groupHeading('crop', { name: 'Palay (Rice)', barangay: '' }), 'Palay (Rice)', 'crop heading')
eq(groupHeading('farmer', { name: 'Ana Cruz', barangay: 'Alaska' }), 'Ana Cruz · Alaska', 'farmer heading includes the barangay')
eq(groupHeading('parcel', { name: '01-33-02-005-001-02-003', barangay: 'Alaska' }), '01-33-02-005-001-02-003 · Alaska', 'parcel heading includes the barangay')
eq(groupHeading('parcel', { name: 'No farm parcel on file', barangay: '' }), 'No farm parcel on file', 'the no-parcel heading')

// ── "Group by Farm Parcel" as columns
eq(PARCEL_GROUP_COLUMNS, ['Farm parcel', 'Farmer', 'Barangay', 'Area (ha)', 'Ownership', 'Records'], 'parcel group columns')
eq(
  parcelGroupFacts({ id: 7, count: 2, area_planted_ha: 1.5, near_harvest: 1, farmer_name: 'Ana Cruz', rsbsa_number: '01-033-02-019-700001', barangay: 'Alaska', parcel_area_hectares: 2.5, land_ownership: 'Owner' }),
  { farmer: 'Ana Cruz', rsbsa: '01-033-02-019-700001', barangay: 'Alaska', area: '2.50', ownership: 'Owner', records: '2 records · 1.5 ha · 1 near harvest' },
  'a parcel group row',
)
eq(parcelGroupFacts({ id: null, count: 3, area_planted_ha: 0, near_harvest: 0 }), { farmer: '', rsbsa: '', barangay: '', area: '', ownership: '', records: '3 records' }, 'a group with no parcel has only its records')
eq(parcelGroupFacts({ id: 8, count: 1, area_planted_ha: 0, near_harvest: 0 }).area, '', 'a missing area is left blank')

console.log(`monitoringGroups: ${n} checks passed`)
