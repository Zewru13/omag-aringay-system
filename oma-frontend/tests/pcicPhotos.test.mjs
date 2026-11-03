import assert from 'node:assert/strict'

const { EMPTY_PCIC, MAX_PCIC_PHOTOS, pcicStateFrom, pcicPhotoCount, pcicError, pcicChanged, pcicRemovalOrder, uploadPcicForm, checkPcicFile } =
  await import(new URL('../src/utils/pcic.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const photo = (id) => ({ id, url: `https://x/${id}.png` })
const file = (name = 'a.png') => ({ name, type: 'image/png', size: 1000 })

// the state of a record: its photos, newest list from the server (or just the single old url)
eq(MAX_PCIC_PHOTOS, 5, 'up to five photos')
eq(pcicStateFrom(null), EMPTY_PCIC, 'no record')
eq(pcicStateFrom({ has_pcic_insurance: true, pcic_form_photos: [photo('main'), photo(7)], pcic_form_photo: 'https://x/main.png' }),
  { insured: true, files: [], photos: [photo('main'), photo(7)], removed: [] }, 'a record with two photos')
eq(pcicStateFrom({ has_pcic_insurance: true, pcic_form_photo: 'https://x/main.png' }).photos, [{ id: 'main', url: 'https://x/main.png' }], 'an older answer with one url')
eq(pcicStateFrom({ has_pcic_insurance: false, pcic_form_photos: [] }).photos, [], 'not insured, no photos')

// how many photos the record will have once saved
const state = (over = {}) => ({ ...EMPTY_PCIC, insured: true, ...over })
eq(pcicPhotoCount(state()), 0, 'none')
eq(pcicPhotoCount(state({ photos: [photo('main'), photo(2)], files: [file()], removed: [2] })), 2, 'saved minus removed plus new')

// an insured record needs at least one photo and at most five
eq(pcicError(state()), 'Upload a photo of the PCIC insurance form.', 'insured with no photo')
eq(pcicError(state({ files: [file()] })), '', 'one new photo')
eq(pcicError(state({ photos: [photo('main')], removed: ['main'] })), 'Upload a photo of the PCIC insurance form.', 'every saved photo removed')
eq(pcicError(state({ files: [1, 2, 3, 4, 5, 6].map((i) => file(`${i}.png`)) })), 'A record can have up to 5 photos of the PCIC form.', 'six photos')
eq(pcicError(state({ files: [1, 2, 3, 4, 5].map((i) => file(`${i}.png`)) })), '', 'five photos')
eq(pcicError({ ...EMPTY_PCIC }), '', 'not insured needs nothing')

// something to save?
eq(pcicChanged(state()), false, 'nothing changed')
eq(pcicChanged(state({ files: [file()] })), true, 'a new photo')
eq(pcicChanged(state({ removed: [3] })), true, 'a removed photo')

// removing: the numbered photos first, the main one last (removing it promotes the next, which would renumber what is left)
eq(pcicRemovalOrder(['main', 5, 3]), [5, 3, 'main'], 'main last')
eq(pcicRemovalOrder([]), [], 'nothing to remove')

// the upload: removals, then each new photo in turn; nothing when not insured or nothing changed
const calls = []
const api = {
  delete: async (url, config) => { calls.push(['delete', url, config.data.photo]); return { data: { ok: 'deleted' } } },
  post: async (url, body) => { calls.push(['post', url, body.get('photo').name]); return { data: { ok: 'posted' } } },
}
class FakeFormData { constructor() { this.m = {} } append(k, v) { this.m[k] = v } get(k) { return this.m[k] } }
globalThis.FormData = FakeFormData
const out = await uploadPcicForm(api, 'pond', 4, state({ photos: [photo('main'), photo(8)], removed: ['main', 8], files: [file('x.png'), file('y.png')] }))
eq(calls, [
  ['delete', '/fisheries/ponds/4/pcic-form/', 8], ['delete', '/fisheries/ponds/4/pcic-form/', 'main'],
  ['post', '/fisheries/ponds/4/pcic-form/', 'x.png'], ['post', '/fisheries/ponds/4/pcic-form/', 'y.png'],
], 'removals first, then the new photos in order')
eq(out, { ok: 'posted' }, 'the last answer')
calls.length = 0
eq(await uploadPcicForm(api, 'pond', 4, { ...EMPTY_PCIC, files: [file()] }), null, 'not insured: nothing sent')
eq(await uploadPcicForm(api, 'pond', 4, state()), null, 'nothing changed: nothing sent')
eq(calls, [], 'no calls')

eq(checkPcicFile(file()), '', 'a good file')
eq(checkPcicFile({ type: 'application/pdf', size: 10 }), 'Use a JPG, PNG or WEBP photo.', 'a pdf')

console.log(`pcicPhotos: ${n} checks passed`)
