import assert from 'node:assert/strict'

const { EMPTY_PCIC, pcicStateFrom, pcicPayload, pcicError, checkPcicFile, pcicFormUrl, uploadPcicForm } =
  await import(new URL('../src/utils/pcic.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const file = (type = 'image/png', size = 1000, name = 'pcic.png') => ({ type, size, name })

// a new record starts uninsured
eq(EMPTY_PCIC, { insured: false, file: null, url: '' }, 'empty state')

// an existing record: the box and the saved photo's address
eq(pcicStateFrom({ has_pcic_insurance: true, pcic_form_photo: '/media/pcic_forms/pond/a.png' }),
  { insured: true, file: null, url: '/media/pcic_forms/pond/a.png' }, 'insured record')
eq(pcicStateFrom({ has_pcic_insurance: false, pcic_form_photo: null }), { insured: false, file: null, url: '' }, 'uninsured record')
eq(pcicStateFrom(null), { insured: false, file: null, url: '' }, 'no record')

// what goes to the record's own endpoint: only the box (the photo travels separately)
eq(pcicPayload({ insured: true, file: file(), url: '' }), { has_pcic_insurance: true }, 'payload insured')
eq(pcicPayload({ insured: false, file: null, url: '' }), { has_pcic_insurance: false }, 'payload uninsured')

// ticking the box needs a photo, new or already saved
eq(pcicError({ insured: false, file: null, url: '' }), '', 'not insured: nothing to upload')
eq(pcicError({ insured: true, file: null, url: '' }), 'Upload a photo of the PCIC insurance form.', 'insured without a photo')
eq(pcicError({ insured: true, file: file(), url: '' }), '', 'insured with a new photo')
eq(pcicError({ insured: true, file: null, url: '/media/x.png' }), '', 'insured with a saved photo')

// the photo rules: jpg/png/webp, 5 MB
eq(checkPcicFile(file('image/png', 1000)), '', 'png ok')
eq(checkPcicFile(file('image/jpeg', 1000)), '', 'jpeg ok')
eq(checkPcicFile(file('image/webp', 1000)), '', 'webp ok')
eq(checkPcicFile(file('application/pdf', 1000)), 'Use a JPG, PNG or WEBP photo.', 'pdf refused')
eq(checkPcicFile(file('image/png', 6 * 1024 * 1024)), 'The photo is larger than 5 MB.', 'too large')
eq(checkPcicFile(null), '', 'no file is not an error here')

// where each record's form goes
eq(pcicFormUrl('crop', 7), '/farmers/crops/7/pcic-form/', 'crop')
eq(pcicFormUrl('pond', 8), '/fisheries/ponds/8/pcic-form/', 'pond')
eq(pcicFormUrl('stocking', 9), '/fisheries/stocking/9/pcic-form/', 'stocking')
eq(pcicFormUrl('planting', 10), '/production/monitoring/10/pcic-form/', 'planting')
assert.throws(() => pcicFormUrl('boat', 1), /Unknown PCIC record kind/); n++

// uploading: only when insured and a new file was chosen
const calls = []
const api = { post: async (url, body, config) => { calls.push({ url, body, config }); return { data: { ok: true } } } }
await uploadPcicForm(api, 'pond', 8, { insured: true, file: null, url: '/media/x.png' })
await uploadPcicForm(api, 'pond', 8, { insured: false, file: file(), url: '' })
eq(calls.length, 0, 'nothing to upload: no call')
await uploadPcicForm(api, 'pond', 8, { insured: true, file: file(), url: '' })
eq(calls.length, 1, 'one upload')
eq(calls[0].url, '/fisheries/ponds/8/pcic-form/', 'goes to the pond endpoint')
eq(calls[0].body instanceof FormData, true, 'sent as form data')
eq(calls[0].body.has('photo'), true, 'the photo is in the "photo" field')

console.log(`pcic: ${n} checks passed`)
