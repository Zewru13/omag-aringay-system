import { useEffect, useState } from 'react'

// Below Tailwind's `md` (768px), where the admin layout also drops its persistent sidebar. Tablets and
// desktops keep the full layout; only a phone gets the citizen-style shell (see CitizenPhoneShell).
const QUERY = '(max-width: 767px)'

export default function useIsPhone() {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (e) => setIsPhone(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isPhone
}
