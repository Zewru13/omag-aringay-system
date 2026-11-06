import { PHOTO_MAX_BYTES, PHOTO_TYPES } from './photoRules.js'

// PCIC (crop insurance) on a crop, pond, planting or stocking record, or a pond/cage of a production cycle: a "has PCIC insurance" box and, once it is
// ticked, photos of the PCIC insurance form (up to 5: its pages). A form keeps this as one `pcic` state object:
//   { insured: boolean, files: File[] (photos chosen now), photos: [{ id, url }] (the photos already saved), removed: [id] (saved ones to remove) }
// The box travels with the record (pcicPayload); the photos are added and removed on their own once the record has an id
// (uploadPcicForm), because the record endpoints take JSON.

export const MAX_PCIC_PHOTOS = 5
export const EMPTY_PCIC = { insured: false, files: [], photos: [], removed: [] }

export function pcicStateFrom(record) {
  if (!record) return { ...EMPTY_PCIC }
  // `pcic_form_photos` lists every photo; an answer with only the first one's url (`pcic_form_photo`) still works.
  const photos = record.pcic_form_photos || (record.pcic_form_photo ? [{ id: 'main', url: record.pcic_form_photo }] : [])
  return { insured: !!record.has_pcic_insurance, files: [], photos, removed: [] }
}

export const pcicPayload = (state) => ({ has_pcic_insurance: !!state?.insured })
// Start Production Cycle: PCIC is recorded ONCE per cycle (not per pond/cage). The box travels with the cycle; its one document is uploaded to the cycle's
// stocking record afterwards (uploadPcicForm(api, 'stocking', res.data.stocking_record_id, state)).
export const cyclePcicPayload = (state) => ({ pcic_insured: !!state?.insured })
// What the round check icon says in words (screen readers and the hover title).
export const pcicLabel = (insured) => (insured ? 'PCIC insured' : 'Not PCIC insured')

// How many photos the record will have once the form is saved.
export const pcicPhotoCount = (state) => (state?.photos || []).filter((p) => !(state.removed || []).includes(p.id)).length + (state?.files || []).length

export function pcicError(state) {
  if (!state?.insured) return ''
  const count = pcicPhotoCount(state)
  if (count === 0) return 'Upload a photo of the PCIC insurance form.'
  if (count > MAX_PCIC_PHOTOS) return `A record can have up to ${MAX_PCIC_PHOTOS} photos of the PCIC form.`
  return ''
}

// Is there a photo to add or remove?
export const pcicChanged = (state) => (state?.files || []).length > 0 || (state?.removed || []).length > 0

// The saved photos to remove, in the order to send them: the numbered ones first and the main one last (removing the main photo
// promotes the next one, which would change what is left).
export const pcicRemovalOrder = (removed) => [...removed.filter((id) => id !== 'main'), ...removed.filter((id) => id === 'main')]

export function checkPcicFile(file) {
  if (!file) return ''
  if (!PHOTO_TYPES.includes(file.type)) return 'Use a JPG, PNG or WEBP photo.'
  if (file.size > PHOTO_MAX_BYTES) return 'The photo is larger than 5 MB.'
  return ''
}

const FORM_PATHS = {
  crop: (id) => `/farmers/crops/${id}/pcic-form/`,
  pond: (id) => `/fisheries/ponds/${id}/pcic-form/`,
  stocking: (id) => `/fisheries/stocking/${id}/pcic-form/`,
  planting: (id) => `/production/monitoring/${id}/pcic-form/`,
  unit: (id) => `/monitoring/aquaculture-units/${id}/pcic-form/`,   // a pond/cage of an aquaculture production cycle
}

export function pcicFormUrl(kind, id) {
  if (!FORM_PATHS[kind]) throw new Error(`Unknown PCIC record kind: ${kind}`)
  return FORM_PATHS[kind](id)
}

// Save the photo changes of a saved record: remove what was removed, then upload each new photo in turn. Nothing to do unless the box is ticked
// and a photo was added or removed. Returns the last answer of the server (the record with its photos), or null.
export async function uploadPcicForm(api, kind, id, state) {
  if (!state?.insured || !pcicChanged(state)) return null
  const url = pcicFormUrl(kind, id)
  let last = null
  for (const photo of pcicRemovalOrder(state.removed || [])) {
    const { data } = await api.delete(url, { data: { photo } })
    last = data
  }
  for (const file of state.files || []) {
    const body = new FormData()
    body.append('photo', file)
    const { data } = await api.post(url, body, { headers: { 'Content-Type': 'multipart/form-data' } })
    last = data
  }
  return last
}

// The PCIC filter of the crop tables (Crop Records, Crop Monitoring): the value sent as ?pcic= and what the dropdown says.
export const PCIC_FILTER_OPTIONS = [
  { value: '', label: 'All PCIC' },
  { value: 'insured', label: 'PCIC insured' },
  { value: 'not_insured', label: 'Not PCIC insured' },
]

// The PCIC Insured filter of Aquaculture Monitoring: sent as ?pcic= (the select has no label of its own, so each option names the filter).
export const AQUACULTURE_PCIC_OPTIONS = [
  { value: '', label: 'PCIC Insured: All' },
  { value: 'insured', label: 'PCIC Insured: Insured' },
  { value: 'not_insured', label: 'PCIC Insured: Not Insured' },
]
