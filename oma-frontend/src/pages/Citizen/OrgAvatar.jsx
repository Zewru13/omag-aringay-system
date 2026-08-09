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
//
// These seven hexes are SAMPLED from the Organization reference images
// (image10's officer roster and member grid), replacing the approximate
// six-colour set this file shipped with. They are a categorical identity
// palette, deliberately not cz-* theme tokens: they must stay
// distinguishable from each other and they carry no status meaning.
const AVATAR_TINTS = [
  'bg-[#7B341E] text-white',  // MS
  'bg-[#0B3D52] text-white',  // RC
  'bg-[#0E6B8A] text-white',  // ER
  'bg-[#0C7A6B] text-white',  // JD
  'bg-[#2D5A27] text-white',  // AF
  'bg-[#6B3FA0] text-white',  // PB
  'bg-[#8B4513] text-white',  // LM
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
