import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The fisherfolk profile (Admin / Focal Person): the same hero, grouped cards and View cards as the farmer profile, in the fisheries blue.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { fisherfolkChips } = await import(new URL('../src/pages/Fisheries/fisherfolkProfile.js', import.meta.url).href)

eq(fisherfolkChips({}), [], 'nothing to say')
eq(fisherfolkChips({ is_pwd: true, is_4ps_beneficiary: true, is_icc_ip_member: true, icc_ip_name: 'Kankanaey', is_senior_citizen: true }).map((c) => c.key), ['pwd', 'fourps', 'icc_ip', 'senior'], 'the classifications, in the same order as a farmer')
eq(fisherfolkChips({ is_icc_ip_member: true, icc_ip_name: 'Kankanaey' })[0].label, 'ICC/IP Member — Kankanaey', 'the group')
eq(fisherfolkChips({ fisherfolk_type: 'Capture', has_vessel: true }).map((c) => [c.key, c.label, c.tone]), [['vessel', 'With Vessel', 'green']], 'a capture fisherfolk with a vessel')
eq(fisherfolkChips({ fisherfolk_type: 'Mariculture', has_vessel: false }).map((c) => [c.key, c.label, c.tone]), [['vessel', 'No Vessel', 'slate']], 'a mariculture fisherfolk without one')
eq(fisherfolkChips({ fisherfolk_type: 'Aquaculture', has_vessel: false }), [], 'no vessel line for aquaculture')
eq(fisherfolkChips({ is_affected_by_disaster: true }).map((c) => [c.key, c.tone]), [['disaster', 'rose']], 'affected by a disaster')
ok(fisherfolkChips({ is_pwd: true, fisherfolk_type: 'Capture', has_vessel: true, is_affected_by_disaster: true }).every((c) => c.label && c.meaning && c.tone && c.icon), 'every chip is complete')

const page = read('src/pages/Fisheries/FisherfolkDetailPage.jsx')
ok(/<ProfileHero/.test(page) && /accent="#155E82"/.test(page), 'the hero, in the fisheries blue')
ok(/title="Personal Information"/.test(page) && /title="Contact &amp; Address"|title="Contact & Address"/.test(page), 'cards: Personal Information, Contact & Address')
ok(/title="Registration"|title="Registration &amp; IDs"|title="Registration & IDs"/.test(page), 'a card for the registration numbers (RSBSA, Fish-R, Boat-R)')
ok(/title=\{\(fisherfolk\.organization_names \|\| \[\]\)\.length > 1 \? 'Organizations' : 'Organization'\}/.test(page), 'the organizations have a card')
ok(!/Reference Information|lg:sticky/.test(page), 'the old Reference Information card and the sticky columns are gone')
ok(/title="Aquaculture Record"/.test(page) && /title="Capture Record"/.test(page), 'the aquaculture and capture records are InfoCards')
ok(/<ViewSection[\s\S]{0,200}title="Stocking Records"/.test(page) && /<ViewSection[\s\S]{0,200}title="Ponds"/.test(page), 'Stocking Records and Ponds stay View cards')
ok(/Fisheries Records|Fishery Records/.test(page), 'the records are labelled')

console.log(`fisherfolkProfile: ${n} checks passed`)
