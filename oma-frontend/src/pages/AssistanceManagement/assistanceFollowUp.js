// What differs between the crop and the fisheries assistance windows that follow up a record (Mark Resolved, Report Not Received): the endpoints,
// the draft keys (kept as they were, so a draft typed before still opens) and which field names the recipient. Written once; the windows are shared.
export const FOLLOW_UP = {
  crop: {
    resolveUrl: (id) => `/interventions/beneficiaries/${id}/mark-resolved/`,
    reportUrl: (id) => `/interventions/beneficiaries/${id}/report-not-received/`,
    draftKey: (kind, id) => `crop-assistance-${kind}:${id}`,
    recipientName: (record) => record.farmer_full_name,
    recipientLabel: 'Farmer',
  },
  fisheries: {
    resolveUrl: (id) => `/interventions/fisherfolk-beneficiaries/${id}/mark-resolved/`,
    reportUrl: (id) => `/interventions/fisherfolk-beneficiaries/${id}/report-not-received/`,
    draftKey: (kind, id) => `fisheries-assistance-${kind}:${id}`,
    recipientName: (record) => record.fisherfolk_full_name,
    recipientLabel: 'Fisherfolk',
  },
}

export const followUpFor = (domain) => FOLLOW_UP[domain] || FOLLOW_UP.crop

// PendingOnlyEditMixin raises a plain ValidationError(str), which DRF serializes as a bare array, not {detail: ...}: that shape is read too, or the
// specific "cannot be edited" reason would collapse into the generic fallback.
export function extractErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (Array.isArray(data) && data.length) return String(data[0])
  if (data?.detail) return data.detail
  return fallback
}
