// Search and filters for an organization's own lists (members, equipment, officers). Each item is
// { id, name, attrs: { status, position, ... } }. The search looks at the NAME only; every word must match, in any
// order, ignoring case and commas. A filter value of '' means "all"; otherwise the attribute must equal it exactly.

const words = (text) => String(text ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean)

export const filterOrgItems = (items, { query = '', filters = {} } = {}) => {
  if (!Array.isArray(items)) return []
  const wanted = words(query)
  const active = Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  return items.filter((item) => {
    if (wanted.length > 0) {
      const name = String(item.name ?? '').toLowerCase().replace(/-/g, ' ')
      if (!name || !wanted.every((word) => name.includes(word.replace(/-/g, ' ')))) return false
    }
    return active.every(([key, value]) => item.attrs?.[key] === value)
  })
}

// The distinct values of one attribute that are present in the list, in first-seen order (for a filter's choices).
export const filterOptions = (items, key) => {
  if (!Array.isArray(items)) return []
  const seen = []
  items.forEach((item) => {
    const value = item.attrs?.[key]
    if (value !== undefined && value !== null && value !== '' && !seen.includes(value)) seen.push(value)
  })
  return seen
}
