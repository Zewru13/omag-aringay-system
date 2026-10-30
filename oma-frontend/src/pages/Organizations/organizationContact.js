// Small pure helpers of the organization pages (the registration and edit forms, and the row menu of the organization tables).

// The contact person is one full-name box. An older record saved as "Last, First" is shown as "First Last".
export function contactFullName(stored) {
  const text = String(stored ?? '').trim()
  if (!text) return ''
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.join(' ')
}

// Where "Add assistance" in an organization's row menu goes: the assistance page of its kind, which opens Distribute with this organization chosen.
export const assistanceLink = (type, id) => `${type === 'fisherfolk' ? '/fisheries-assistance' : '/crop-assistance'}?distribute=${id}`
