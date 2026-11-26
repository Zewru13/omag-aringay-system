// Disaster response suggestions are gone: no button or window in Log Activity, no "all responses done" prompt at harvest, no
// response guides in the settings. Recovery stays, and always asks how it recovered.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const crop = read('src/pages/Monitoring/CropMonitoringPage.jsx')
ok(!/DisasterResponses|Disaster responses|disaster_response|disaster_rule|DisasterRule/.test(crop), 'crop monitoring has no response suggestions')
ok(!/recommended responses?/i.test(crop), 'and no wording about them')
ok(/Mark as Recovered/.test(crop) && /recovery_note/.test(crop), 'Mark as Recovered stays')
ok(/Disaster Remedy|showRemedyFields/.test(crop), 'logging a disaster remedy stays')
ok(/api\.get\(`\/production\/monitoring\/\$\{record\.id\}\/suggestions\/`\)/.test(crop), 'Log Activity still fills itself in from the schedule')

const fish = read('src/pages/FisheriesRecords/StockingMonitoringModals.jsx')
ok(!/disaster_response|all_rules_done|ResolvableDisaster|resolvableDisaster/i.test(fish), 'the fisheries harvest window has no response prompt')

const disease = read('src/pages/FisheriesSettings/DiseaseSettingsPage.jsx')
ok(!/disease-response-guides|Response Guide|response guide|recommended.treatment/i.test(disease), 'disease settings keep the disease list only')
ok(/disease-types/.test(disease) && /Add Disease Type/.test(disease), 'the disease list stays')

const farmer = read('src/pages/Monitoring/FarmerDisasterPage.jsx')
ok(/if \(!note\.trim\(\)\) \{ showToast\('A recovery note is required\.', 'error'\); return \}/.test(farmer), 'the farmer is asked how it recovered')
ok(/<FormField label="Recovery Note" required>/.test(farmer), 'and the box says it is required')

console.log(`noDisasterResponses: ${n} checks passed`)
