import { useEffect, useState } from 'react'
import { headerDateTime } from './headerAccount.js'

// Today's date and the time, in the top bar. Its own component, so the clock's updates redraw only this.
export default function HeaderClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <time dateTime={now.toISOString()} className="min-w-0 truncate text-[13px] font-medium tabular-nums text-text-secondary">
      {headerDateTime(now)}
    </time>
  )
}
