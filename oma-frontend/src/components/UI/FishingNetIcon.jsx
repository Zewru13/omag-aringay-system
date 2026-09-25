// A hand-held fish-catching (landing / scoop) net: a long handle, an oval rim, and a mesh bag.
// The icon set in use (lucide-react) has no fishing net (only a hook and a rod), so this is a small
// inline SVG drawn in the same style: 24px grid, `currentColor` stroke, sized via `size` - it can be
// dropped in wherever a lucide icon is used and takes its colour from the surrounding text colour.
function FishingNetIcon({ size = 16, className, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <g strokeWidth="1.9">
        {/* rim */}
        <ellipse cx="15" cy="7" rx="6.5" ry="2.5" />
        {/* net bag */}
        <path d="M8.5 7C9 14 12 17.5 15 17.5C18 17.5 21 14 21.5 7" />
        {/* handle */}
        <path d="M8.6 8L2.5 21.5" />
      </g>
      {/* mesh */}
      <g strokeWidth="1.3">
        <path d="M11.6 9.4L13.6 17M18.4 9.4L16.4 17" />
        <path d="M9.6 12Q15 14.4 20.4 12" />
      </g>
    </svg>
  )
}

export default FishingNetIcon
