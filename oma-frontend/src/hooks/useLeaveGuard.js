import { useEffect } from 'react'

// Holds the browser on this page while `active` is true (a backup is being made or saved, a restore is running): closing the tab or reloading asks first,
// and the Back button stays on the page. The moment `active` turns false everything is let go. (The links and buttons of the rest of the system are held
// by WorkLockScreen.)
export default function useLeaveGuard(active) {
  useEffect(() => {
    if (!active) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const stay = () => window.history.pushState(null, '', window.location.href)
    stay()
    window.addEventListener('beforeunload', warn)
    window.addEventListener('popstate', stay)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('popstate', stay)
    }
  }, [active])
}
