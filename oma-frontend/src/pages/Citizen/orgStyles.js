import { useEffect, useState } from 'react'

// Shared look for the Organization account screens, so the surface and the
// entrance rule are defined once instead of copied per screen.

// White surface lifted off the parchment ground by the staff app's own
// forest-tinted shadow — no hairline box.
export const ORG_SURFACE = 'overflow-hidden rounded-[14px] bg-white shadow-[var(--shadow-xs)]'

// Small label in plain sentence case. (These used to be tracked, uppercase
// micro-headings; that pattern reads as generated, so labels are ordinary text.)
export const ORG_EYEBROW = 'text-[12.5px] font-medium text-cz-text-2'

export const ORG_FIELD_LABEL = 'mb-1.5 block text-[13px] font-medium text-cz-text-2'

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
