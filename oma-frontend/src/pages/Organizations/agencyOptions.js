// Registration Agency choices for an organization, per type. Mirrors the
// backend models exactly (associations/models.py REGISTRATION_AGENCY_CHOICES):
// FarmersOrganization accepts SEC / CDA / DOLE; FisherfolkOrganization also
// accepts BFAR. The serializers enforce those model choices, so offering BFAR
// on a Farmers Organization would be rejected by the server — keep this in step
// with the models, not the other way round.
const BASE = [
  { value: 'SEC', label: 'SEC — Securities and Exchange Commission' },
  { value: 'CDA', label: 'CDA — Cooperative Development Authority' },
  { value: 'DOLE', label: 'DOLE — Department of Labor and Employment' },
]
const BFAR = { value: 'BFAR', label: 'BFAR — Bureau of Fisheries and Aquatic Resources' }

export function agencyOptionsFor(type) {
  return type === 'fisherfolk' ? [...BASE, BFAR] : BASE
}

// Display label for a stored agency code ("CDA" -> "CDA — Cooperative ...");
// an unrecognized or blank value falls back to itself / an em dash.
export function agencyLabel(code) {
  if (!code) return '—'
  return [...BASE, BFAR].find((o) => o.value === code)?.label || code
}
