import { useEffect } from 'react'

// The Fisheries Management pages use the fisheries "Tide" blue and nothing else (index.css [data-domain-theme="fisheries"]): the brand green
// becomes tide blue, and the status colors (green, amber, red) become shades of it, so the pages keep one color of their own. Set on <html>
// so it also reaches the modals, which portal to <body>; removed when the page unmounts.
export default function useFisheriesTheme() {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-domain-theme', 'fisheries')
    return () => root.removeAttribute('data-domain-theme')
  }, [])
}
