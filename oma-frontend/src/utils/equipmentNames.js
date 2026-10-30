// The equipment dropdowns (a farmer's machinery, an organization's equipment) are fed by Crop Settings > Equipment Types (farmers) and
// Fisheries Settings > Equipment Types (fisherfolk organizations). The server stores a fixed list of names (plus "Other" with its own text),
// so a name added in Settings is saved as "Other" with that name: nothing changes on the server and the name reads the same everywhere.
// No screen and no network.

const OTHER = 'Other'

// The names a dropdown offers: the ones from Settings when there are any, otherwise the built-in list (also what shows while Settings
// loads or if it cannot be reached). "Other" is never in the list: the dropdown adds it itself.
export function equipmentOptions(fromSettings, builtIn) {
  const names = Array.isArray(fromSettings) ? fromSettings.filter((n) => n && n !== OTHER) : []
  return names.length > 0 ? names : builtIn.filter((n) => n !== OTHER)
}

// What the server is sent for a chosen name: a name it knows as it is, anything else (or "Other" with the typed name) as Other + that name.
export function equipmentToServer(name, otherText, known) {
  const typed = (otherText || '').trim()
  if (name === OTHER) return { name: OTHER, other: typed }
  if (known.includes(name)) return { name, other: '' }
  return { name: OTHER, other: String(name || '').trim() }
}
