// Where the red numbered circle of each box of a Help picture goes: beside the box with an arrow pointing at it, inside the
// picture, clear of every box and of the other numbers, and off the words of the page when there is such a place; where there is
// no place beside the box (a crowded or very large one), on the box without an arrow. `words` are the places of the page's text.
// shoot.mjs copies this function into the page, so it uses nothing from outside itself.
export function placeMarkers(boxes, viewport, size = 26, words = []) {
  const r = size / 2
  const edge = r + 2
  const marks = []
  const inside = (cx, cy) => cx >= edge && cy >= edge && cx <= viewport.w - edge && cy <= viewport.h - edge
  const free = (cx, cy) => marks.every((m) => Math.hypot(m.cx - cx, m.cy - cy) >= size + 3)
  const distance = (cx, cy, box) => Math.hypot(Math.max(box.x - cx, 0, cx - (box.x + box.w)), Math.max(box.y - cy, 0, cy - (box.y + box.h)))
  const clear = (cx, cy) => boxes.every((box) => distance(cx, cy, box) >= r + 2)
  const offWords = (cx, cy) => words.every((word) => distance(cx, cy, word) >= r - 3)          // a grazing edge hides nothing
  const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high))

  // the places beside a box, best first: above, left, right, below; near first, then farther
  const besides = (box) => {
    const along = [Math.min(box.w / 2, 22), box.w / 2, box.w - Math.min(box.w / 2, 22)]
    const down = [box.h / 2, Math.min(box.h / 2, 16)]
    const places = []
    for (const gap of [18, 32, 48]) {
      for (const dx of along) places.push({ cx: box.x + dx, cy: box.y - gap - r, side: 'above' })
      for (const dy of down) places.push({ cx: box.x - gap - r, cy: box.y + dy, side: 'left' })
      for (const dy of down) places.push({ cx: box.x + box.w + gap + r, cy: box.y + dy, side: 'right' })
      for (const dx of along) places.push({ cx: box.x + dx, cy: box.y + box.h + gap + r, side: 'below' })
    }
    return places
  }
  const arrowFor = ({ cx, cy, side }, box) => {
    if (side === 'above') return { x1: cx, y1: cy + r, x2: cx, y2: box.y }
    if (side === 'below') return { x1: cx, y1: cy - r, x2: cx, y2: box.y + box.h }
    if (side === 'left') return { x1: cx + r, y1: cy, x2: box.x, y2: cy }
    return { x1: cx - r, y1: cy, x2: box.x + box.w, y2: cy }
  }

  // on the box: its top right corner, else the nearest free place to that corner, looking farther ring by ring
  const onBox = (box) => {
    const startX = clamp(box.x + box.w, edge, viewport.w - edge)
    const startY = clamp(box.y, edge, viewport.h - edge)
    for (let ring = 0; ring < 80; ring += 1) {
      const steps = ring === 0 ? 1 : ring * 8
      for (let k = 0; k < steps; k += 1) {
        const angle = Math.PI - (k / steps) * Math.PI * 2
        const cx = clamp(startX + Math.cos(angle) * ring * 12, edge, viewport.w - edge)
        const cy = clamp(startY + Math.sin(angle) * ring * 12, edge, viewport.h - edge)
        if (free(cx, cy)) return { cx, cy }
      }
    }
    return { cx: startX, cy: startY }
  }

  for (const box of boxes) {
    const open = besides(box).filter((p) => inside(p.cx, p.cy) && free(p.cx, p.cy) && clear(p.cx, p.cy))
    const place = open.find((p) => offWords(p.cx, p.cy)) || open[0]
    if (place) marks.push({ cx: place.cx, cy: place.cy, arrow: arrowFor(place, box) })
    else marks.push({ ...onBox(box), arrow: null })
  }
  return marks
}
