// Settings windows were written with stacked fields whose label carried its own marks ("Name *", "Description (optional)"). The table form marks
// a required field itself, so the marks are read off the label: a trailing star means required, a trailing "(optional)" is dropped.
export function settingsLabel(text, required = false) {
  let label = String(text ?? '').trim()
  let isRequired = required
  if (/\s*\*$/.test(label)) { label = label.replace(/\s*\*$/, ''); isRequired = true }
  label = label.replace(/\s*\(optional\)$/i, '')
  return { label, required: isRequired }
}
