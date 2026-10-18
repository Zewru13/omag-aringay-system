import { PHOTO_MAX_BYTES, PHOTO_TYPES } from './photoRules.js'

// PCIC (crop insurance) on a crop, pond, planting or stocking record: a "has PCIC insurance" box and, once it is
// ticked, a photo of the PCIC insurance form. A form keeps this as one `pcic` state object:
//   { insured: boolean, file: File | null (a photo chosen now), url: string (the photo already saved) }
// The box travels with the record (pcicPayload); the photo is uploaded on its own once the record has an id
// (uploadPcicForm), because the record endpoints take JSON.

export const EMPTY_PCIC = { insured: false, file: null, url: '' }

export function pcicStateFrom(record) {
  if (!record) return { ...EMPTY_PCIC }
  return { insured: !!record.has_pcic_insurance, file: null, url: record.pcic_form_photo || '' }
}

export const pcicPayload = (state) => ({ has_pcic_insurance: !!state?.insured })

export function pcicError(state) {
  if (state?.insured && !state.file && !state.url) return 'Upload a photo of the PCIC insurance form.'
  return ''
}

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
}

export function pcicFormUrl(kind, id) {
  if (!FORM_PATHS[kind]) throw new Error(`Unknown PCIC record kind: ${kind}`)
  return FORM_PATHS[kind](id)
}

// Upload the chosen photo for a saved record. Nothing to do unless the box is ticked and a new photo was chosen.
export async function uploadPcicForm(api, kind, id, state) {
  if (!state?.insured || !state.file) return null
  const body = new FormData()
  body.append('photo', state.file)
  const { data } = await api.post(pcicFormUrl(kind, id), body, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data
}
