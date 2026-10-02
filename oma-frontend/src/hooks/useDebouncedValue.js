import { useEffect, useState } from 'react'

// The value, but only after it has stopped changing for `delay` ms. Lets a
// search box drive a server request without firing one per keystroke.
export default function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
