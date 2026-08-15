function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Circular initials avatar for a person's name, used in per-member outcome
// lists where a photo isn't available.
function AvatarInitials({ name, className = '' }) {
  return (
    <div
      className={`w-9 h-9 rounded-full bg-[#EFEDE6] text-[#5A6B5C] flex items-center justify-center text-[12px] font-semibold shrink-0 ${className}`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  )
}

export default AvatarInitials
