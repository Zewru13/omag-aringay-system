import assert from 'node:assert/strict'
import fs from 'node:fs'

// The crop Log Activity window (Crop Monitoring): renamed from Record Activity, laid out as a table like Fisheries' Log Activity, opens
// filled in from the schedule (no Get Suggestions step), with a Type of Fertilizer dropdown fed by Crop Settings.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const page = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
const start = page.indexOf('function ViewLogsModal')
const window_ = page.slice(start, page.indexOf('\nfunction ', start + 30))   // just this component

// ── the name
eq(page.includes("label: 'Log Activity'"), true, 'the three-dot menu says Log Activity')
eq(/Record Activity/.test(page), false, 'no Record Activity left on the page')
const details = read('../src/pages/Monitoring/cropDetails.js')
eq(details.includes("{ key: 'activity', label: 'Log Activity' }"), true, 'the crop details window offers Log Activity')
eq(/Record Activity/.test(details), false, 'and not Record Activity')
eq(window_.includes('title="Log Activity"'), true, 'the window title')

// ── a floating table form, like the fisheries one
eq(window_.includes('maxWidth="max-w-5xl"'), true, 'a wide floating window')
eq(window_.includes('<LogTable label="Activity details"'), true, 'the activity is a table')
eq(/<LogTh required[^>]*>Date<\/LogTh>/.test(window_) && /<LogTh required[^>]*>Activity<\/LogTh>/.test(window_), true, 'one labelled column per field')
eq(window_.includes('crop-log-fertilizer-table') && window_.includes('crop-log-pest-table') && window_.includes('crop-log-remedy-table'), true, 'the fertilizer, pest/disease and remedy details are tables too')

// ── opens filled in: no Get Suggestions step, no "are you sure" pop-up before saving
eq(/Get Suggestions/.test(page), false, 'no Get Suggestions button')
eq(/SuggestionsModal/.test(page.replace('DisasterResponsesModal', '')), false, 'the schedule window is gone')
eq(window_.includes('suggestedStep(scheduleSteps)'), true, 'the form follows the schedule')
eq(window_.includes('Use Suggested Activity'), true, 'a link back to the suggestion')
eq(/title="Confirm Action"/.test(window_), false, 'no confirmation before saving a log')
eq(window_.includes('onLogAdded()') && window_.includes('onClose()'), true, 'a saved log closes the window')

// ── disaster responses are still reachable, only when the crop has an active disaster
eq(page.includes('function DisasterResponsesModal'), true, 'the disaster responses window stays')
eq(window_.includes('activeDisasters.length > 0 && !isHarvested'), true, 'its button shows only with an active disaster')
eq(window_.includes('Mark as Recovered'), true, 'and Mark as Recovered stays')

// ── the type of fertilizer: a dropdown of the Fertilizer entries of Crop Settings, with Other
eq(window_.includes("/production/input-types/"), true, 'the list comes from Crop Settings > Input Types')
eq(window_.includes("t.input_type === 'Fertilizer' && t.is_active"), true, 'only the active Fertilizer entries')
eq(/placeholder="e\.g\. 14-14-14 NPK/.test(page), false, 'the free-text box is gone')
eq(window_.includes('options={fertilizerNames}'), true, 'the dropdown options')

console.log(`ok - ${n} assertions`)
