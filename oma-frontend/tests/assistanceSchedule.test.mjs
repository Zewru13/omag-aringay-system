// Assistance is scheduled, not confirmed: every distribution asks for the date, time and place; it reads Scheduled, then Received;
// nobody has a Confirm button; staff and the cooperative can take an unclaimed person off; and an assistance notification opens the
// person's Assistance page. No screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const at = (p) => new URL(p, import.meta.url)
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const load = (p) => import(at(p).href)

const { makeAssistanceForm, assistanceFormProblem, assistanceLines, organizationRequest, peopleRequest } = await load('../src/pages/AssistanceManagement/distributeFlow.js')
const {
  STATUS_LABELS, SUMMARY_TONE, EDITABLE_STATUSES, canRemove, timeText, scheduleText, extractErrorMessage,
} = await load('../src/pages/AssistanceManagement/assistanceStatus.js')
const { ASSISTANCE_SECTIONS, assistanceStatusLabel, assistanceTone } = await load('../src/pages/Account/myAssistance.js')
const { farmerTodos, fisherfolkTodos, orgTodos } = await load('../src/pages/Account/todoRules.js')
const { notificationRoute } = await load('../src/components/Layout/notificationRoutes.js')
const { orgAssistanceTab, orgView } = await load('../src/pages/Account/myOrganization.js')
const { ORG_ASSISTANCE_STATUSES } = await load('../src/pages/Reports/orgAssistanceReport.js')

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── the form asks for the date, the time and the place
const TODAY = '2026-11-27'
const filled = (over = {}) => ({
  ...makeAssistanceForm(TODAY), assistance_type: 'Cash Assistance', source_agencies: ['DA'], cash_amount: '500',
  distribution_time: '09:00', distribution_place: 'Barangay Hall', ...over,
})
eq([makeAssistanceForm(TODAY).distribution_time, makeAssistanceForm(TODAY).distribution_place], ['', ''], 'blank to start')
eq(assistanceFormProblem(filled(), { today: TODAY }), '', 'a complete form')
eq(assistanceFormProblem(filled({ distribution_time: '' }), { today: TODAY }), 'Enter the time of the distribution.', 'the time is required')
eq(assistanceFormProblem(filled({ distribution_place: '   ' }), { today: TODAY }), 'Enter the place of the distribution.', 'the place is required')
eq(assistanceFormProblem({ ...filled(), distribution_time: undefined, distribution_place: undefined }, { today: TODAY }), 'Enter the time of the distribution.', 'an older draft has neither')
const [, second] = assistanceLines(filled(), [{ ...makeAssistanceForm(TODAY), assistance_type: 'Training' }])
eq([second.distribution_time, second.distribution_place], ['09:00', 'Barangay Hall'], 'one schedule for every assistance of a distribution')
const sent = peopleRequest(filled({ distribution_place: '  Barangay Hall  ' }), { idsKey: 'farmer_ids', ids: [1] })
eq([sent.distribution_time, sent.distribution_place], ['09:00', 'Barangay Hall'], 'sent for chosen people')
eq(organizationRequest(filled(), {}).distribution_place, 'Barangay Hall', 'and for a cooperative')

// ── what the statuses are called
eq([STATUS_LABELS.PENDING, STATUS_LABELS.CONFIRMED], ['Scheduled', 'Received'], 'Scheduled, then Received')
eq([SUMMARY_TONE.Scheduled, SUMMARY_TONE.Received], ['amber', 'green'], 'their colours')
eq([...EDITABLE_STATUSES].sort(), ['AWAITING_CONFIRMATION', 'CONFIRMED', 'PENDING'], 'staff may fix a scheduled or received entry')
eq([canRemove({ status: 'PENDING' }), canRemove({ status: 'CONFIRMED', confirmed_at: null }), canRemove({ status: 'CONFIRMED', confirmed_at: '2026-10-01T00:00:00Z' }), canRemove({ status: 'RESOLVED' })],
  [true, true, false, false], 'an unclaimed person can be taken off; a receipt confirmed earlier stays')
eq([timeText('00:05'), timeText('12:00'), timeText('14:30:00'), timeText(null)], ['12:05 AM', '12:00 PM', '2:30 PM', ''], 'times in words')
eq(scheduleText({ date_given: '2026-11-28', distribution_time: '09:00', distribution_place: 'Barangay Hall' }), 'Nov 28, 2026 · 9:00 AM · Barangay Hall', 'when and where')
eq(scheduleText({ date_given: '2026-11-28' }), 'Nov 28, 2026', 'an older record has only the date')
eq(extractErrorMessage({ response: { data: ['This record cannot be edited'] } }, 'x'), 'This record cannot be edited', 'the server reason is kept')

// ── the person's own page: nothing to confirm
eq(ASSISTANCE_SECTIONS.map((s) => s.key), ['scheduled', 'follow-up', 'history'], 'scheduled first')
eq([assistanceStatusLabel('PENDING'), assistanceTone('PENDING'), assistanceStatusLabel('CONFIRMED')], ['Scheduled', 'amber', 'Received'], 'their words')

// ── Home: a scheduled distribution is something to go and claim
const scheduled = { id: 4, status: 'PENDING', assistance_type: 'Seeds', quantity: '2 sack', date_given: '2026-11-28', distribution_time: '09:00', distribution_place: 'Barangay Hall' }
for (const [todos, route] of [[farmerTodos({ assistance: [scheduled] }), '/crop-assistance'], [fisherfolkTodos({ assistance: [scheduled] }), '/fisheries-assistance']]) {
  eq(todos.map((t) => [t.title, t.detail, t.actions]), [['Claim your assistance: Seeds, 2 sack', 'Nov 28, 2026 · 9:00 AM · Barangay Hall', [{ label: 'View assistance', primary: true, to: route }]]], `claim it (${route})`)
}
eq(farmerTodos({ assistance: [{ ...scheduled, status: 'CONFIRMED' }] }), [], 'nothing once received')
eq(orgTodos({ confirmables: [{ id: 1 }], loans: [] }, { assistancePath: '/crop-assistance' }), [], 'a cooperative has nothing to confirm')

// ── cooperative links and report filters
eq([orgAssistanceTab('?tab=confirm'), orgAssistanceTab('?tab=history'), orgAssistanceTab('')], ['history', 'history', 'todo'], 'an old Confirm link opens History')
eq(orgView('?tab=confirmed').page, 'assistance-history', 'as does the old Confirmed for Members link')
eq(ORG_ASSISTANCE_STATUSES, [['received', 'Received'], ['scheduled', 'Scheduled']], 'the report filters')

// ── notifications open the right page
eq(notificationRoute({ record_type: 'beneficiary', record_id: 3 }, { isCitizen: true }), '/crop-assistance', 'a farmer sees their assistance')
eq(notificationRoute({ record_type: 'ff_beneficiary' }, { isCitizen: true, isFisherfolk: true }), '/fisheries-assistance', 'and a fisherfolk')
eq(notificationRoute({ record_type: 'crop' }, { isCitizen: true }), '/my-account', 'other citizen notices stay on Home')
eq(notificationRoute({ record_type: 'beneficiary' }, {}), '/crop-assistance', 'staff go to Crop Assistance')

// ── the confirmation screens are gone
for (const file of ['ConfirmMembersDialog.jsx', 'ConfirmReceivedDialog.jsx', 'ConfirmReceivedModal.jsx', 'ConfirmedReportModal.jsx', 'OrgConfirmControls.jsx',
  'useConfirmSelection.js', 'orgConfirmSelection.js', 'AssistanceFollowUpModals.jsx', 'assistanceFollowUp.js']) {
  eq(fs.existsSync(at(`../src/pages/AssistanceManagement/${file}`)), false, `${file} is removed`)
}
const GONE = /confirm-received|confirm-on-behalf|report-not-received|mark-resolved|accountless-confirmables|accountlessConfirmables|confirmOnBehalf(Bulk)?Url|not_received_count/
const walk = (dir) => fs.readdirSync(at(dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`]))
eq(walk('../src/').filter((f) => /\.(js|jsx)$/.test(f) && !f.includes('/Manual/') && !/help(Content|Answers)\.js$/.test(f) && GONE.test(read(f))), [], 'no screen calls a removed address')

// ── every window that saves a distribution or edits one shows where and when
eq(['Distribution Time', 'Distribution Place'].every((label) => read('../src/pages/AssistanceManagement/AssistanceDetailsFields.jsx').includes(`aria-label="${label}"`)), true, 'the Distribute window asks')
eq(['Distribution Time', 'Distribution Place'].every((label) => read('../src/pages/AssistanceManagement/AssistanceEditSections.jsx').includes(`aria-label="${label}"`)), true, 'so does Edit')
eq(/assistance-removals/.test(read('../src/pages/AssistanceManagement/DistributionsTable.jsx')), true, 'staff can take an unclaimed person off')

console.log(`assistanceSchedule: ${n} checks passed`)
