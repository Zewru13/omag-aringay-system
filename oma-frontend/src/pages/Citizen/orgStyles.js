import { useEffect, useState } from 'react'

// Shared look for the Organization account screens, so the surface and the
// entrance rule are defined once instead of copied per screen.

// White surface lifted off the parchment ground by the staff app's own
// forest-tinted shadow — no hairline box.
export const ORG_SURFACE = 'overflow-hidden rounded-[14px] bg-white shadow-[var(--shadow-xs)]'

export const ORG_EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-cz-text-2'

// Gate for a list's first-paint entrance. True from mount until `ms` after
// `ready` first becomes true (pass `!isLoading` for lists that arrive with
// data), then false for good — so rows animate once when they first appear
// and never for anything a later search, filter or refresh puts on screen.
export function useOrgIntro(ready = true, ms = 700) {
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    if (!ready) return undefined
    const t = setTimeout(() => setIntro(false), ms)
    return () => clearTimeout(t)
  }, [ready, ms])
  return intro
}
