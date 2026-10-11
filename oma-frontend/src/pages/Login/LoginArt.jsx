import { useId } from 'react'

// The login page's picture: farm terraces (Field green) meeting the water (Tide blue) at a shoreline. Drawn from the
// two palette ramps the whole app already uses, so the login belongs to the same system as the screens after it.
// The contour lines draw themselves once on load (stroke-dashoffset, see .login-draw in index.css); nothing loops.

// A wavy horizontal line across `width`, centred on y, as an SVG path. Deterministic, so the picture never changes
// between renders.
const wave = (width, y, amp, phase, step = 80) => {
  const points = []
  for (let x = 0; x <= width + step; x += step) points.push([x, y + Math.sin(x / step * 1.15 + phase) * amp])
  return points.reduce((d, [x, py], i) => {
    if (i === 0) return `M${x} ${py.toFixed(1)}`
    const [px, ppy] = points[i - 1]
    const mx = (px + x) / 2
    return `${d} C${mx.toFixed(1)} ${ppy.toFixed(1)} ${mx.toFixed(1)} ${py.toFixed(1)} ${x} ${py.toFixed(1)}`
  }, '')
}

const W = 640

// Terrace contours (field) from the top of the art down to the shoreline.
const terraces = Array.from({ length: 9 }, (_, i) => ({
  d: wave(W, 320 + i * 29, 8 + i * 1.5, i * 0.7),
  opacity: 0.1 + i * 0.045,
}))

// Ripples (tide) below the shoreline.
const ripples = Array.from({ length: 6 }, (_, i) => ({
  d: wave(W, 598 + i * 26, 3 + i * 0.7, i * 1.3, 64),
  opacity: 0.38 - i * 0.04,
}))

const shoreline = wave(W, 556, 10, 0.4)

export default function LoginArt({ className = '', variant = 'panel' }) {
  // `panel` fills the desktop side panel; `banner` is the short strip above the phone form.
  const view = variant === 'banner' ? '0 392 640 230' : '0 0 640 800'
  // Unique gradient ids: the panel and the phone banner are both in the page, and a gradient defined inside a
  // display:none copy does not resolve for the other one.
  const uid = useId().replace(/:/g, '')
  const fieldId = `login-field-${uid}`
  const tideId = `login-tide-${uid}`
  return (
    <svg
      className={className}
      viewBox={view}
      preserveAspectRatio={variant === 'banner' ? 'xMidYMid slice' : 'xMidYMax slice'}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={fieldId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#163318" />
          <stop offset="1" stopColor="#1B4D2E" />
        </linearGradient>
        <linearGradient id={tideId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#155E82" />
          <stop offset="1" stopColor="#0E3C56" />
        </linearGradient>
      </defs>

      <rect width={W} height="800" fill={`url(#${fieldId})`} />

      {terraces.map((t, i) => (
        <path
          key={i} d={t.d} pathLength="1" className="login-draw" style={{ '--i': i }}
          stroke="#9FC2A4" strokeOpacity={t.opacity} strokeWidth="1.5" strokeLinecap="round"
        />
      ))}

      {/* the water: everything below the shoreline */}
      <path d={`${shoreline} L${W + 80} 800 L0 800 Z`} fill={`url(#${tideId})`} />
      <path d={shoreline} pathLength="1" className="login-draw" style={{ '--i': 9 }} stroke="#9BC1CF" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />

      {ripples.map((r, i) => (
        <path
          key={i} d={r.d} pathLength="1" className="login-draw" style={{ '--i': 10 + i }}
          stroke="#9BC1CF" strokeOpacity={r.opacity} strokeWidth="1.5" strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
