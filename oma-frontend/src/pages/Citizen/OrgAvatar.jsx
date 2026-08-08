// Batch 2: initials avatar for organization member / officer lists.
//
// Its own file rather than a second export from OrganizationHomeScreen:
// mixing component and non-component exports in one module breaks React
// Fast Refresh for that module (react-refresh/only-export-components), and
// three screens import this.
//
// The tint is DETERMINISTIC — the same person always gets the same colour,
// on every render and every device. A random pick would reshuffle whenever
// the list re-rendered, which reads as a glitch rather than as identity.
// These six hexes are a categorical identity palette, deliberately not
// cz-* theme tokens: they must stay distinguishable from each other, and
// they carry no status meaning, so they do not belong in the semantic
// token set.
const AVATAR_TINTS = [
  'bg-[#7C3A3A] text-white',
  'bg-[#1C574C] text-white',
  'bg-[#3B6D11] text-white',
  'bg-[#5B3A7C] text-white',
  'bg-[#2C5578] text-white',
  'bg-[#8A5A1B] text-white',
]

function tintFor(key) {
  const s = String(key ?? '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[h % AVATAR_TINTS.length]
}

function initialsOf(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ name, id, size = 40 }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[13px] font-medium ${tintFor(id ?? name)}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}
