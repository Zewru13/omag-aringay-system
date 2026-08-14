import { useEffect, useState } from 'react'

// One breakpoint, matched to citizenUI.jsx's own desktop rule (`lg:`,
// 1024px) so the two never drift apart. Screens branch their ENTIRE render
// on this rather than dual-rendering mobile+desktop JSX behind Tailwind's
// `hidden`/`lg:flex` — state and data-fetching stay single-sourced above
// the branch, only the returned markup differs below it.
const QUERY = '(min-width: 1024px)'

export default function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (e) => setIsDesktop(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
