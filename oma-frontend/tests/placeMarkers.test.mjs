// Where the red numbered circles of the Help pictures go: beside their box with an arrow, inside the picture, never on another
// number; on a crowded screen, on the box itself without an arrow.
import assert from 'node:assert/strict'

const { placeMarkers } = await import(new URL('../scripts/manual/placeMarkers.mjs', import.meta.url).href)
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const SIZE = 26
const VIEW = { w: 1280, h: 800 }
const inside = (m, view) => m.cx - SIZE / 2 >= 0 && m.cy - SIZE / 2 >= 0 && m.cx + SIZE / 2 <= view.w && m.cy + SIZE / 2 <= view.h
const apart = (marks) => marks.every((a, i) => marks.every((b, j) => i === j || Math.hypot(a.cx - b.cx, a.cy - b.cy) >= SIZE))
const circleHits = (m, box) => {
  const dx = Math.max(box.x - m.cx, 0, m.cx - (box.x + box.w))
  const dy = Math.max(box.y - m.cy, 0, m.cy - (box.y + box.h))
  return Math.hypot(dx, dy) < SIZE / 2
}
const touches = (point, box) => point.x >= box.x - 1 && point.x <= box.x + box.w + 1 && point.y >= box.y - 1 && point.y <= box.y + box.h + 1
const check = (boxes, view, label) => {
  const marks = placeMarkers(boxes, view, SIZE)
  ok(marks.length === boxes.length, `${label}: every box gets its number`)
  ok(marks.every((m) => inside(m, view)), `${label}: every number is inside the picture`)
  ok(apart(marks), `${label}: no number is on another`)
  marks.forEach((m, i) => {
    if (!m.arrow) return
    assert.ok(boxes.every((box) => !circleHits(m, box)), `${label}: a number with an arrow stands clear of every box`)
    assert.ok(touches({ x: m.arrow.x2, y: m.arrow.y2 }, boxes[i]), `${label}: its arrow ends on its own box`)
    assert.ok(Math.hypot(m.arrow.x2 - m.arrow.x1, m.arrow.y2 - m.arrow.y1) >= 8, `${label}: and can be seen`)
  })
  n++
  return marks
}

const lone = check([{ x: 600, y: 400, w: 120, h: 40 }], VIEW, 'a lone button')
ok(lone[0].arrow && lone[0].cy < 400, 'it has an arrow from above')
const top = check([{ x: 600, y: 4, w: 120, h: 40 }], VIEW, 'a button at the top edge')
ok(top[0].arrow && top[0].cy > 4, 'its number comes from another side')
const corner = check([{ x: 1230, y: 4, w: 46, h: 40 }], VIEW, 'a button in the corner')
ok(corner[0].arrow, 'still with an arrow')
const whole = check([{ x: 2, y: 2, w: 1276, h: 796 }], VIEW, 'a box as large as the picture')
ok(whole[0].arrow === null, 'its number sits on it')
check(Array.from({ length: 12 }, (_, i) => ({ x: 20 + i * 44, y: 6, w: 40, h: 34 })), VIEW, 'a crowded row at the top')
check(Array.from({ length: 16 }, (_, i) => ({ x: 14, y: 60 + i * 40, w: 220, h: 38 })), VIEW, 'a crowded menu at the left')
check([{ x: 0, y: 0, w: 390, h: 844 }, { x: 10, y: 10, w: 370, h: 40 }, { x: 10, y: 54, w: 370, h: 40 }], { w: 390, h: 844 }, 'a phone picture')

// the words on the page: a number stays off them when there is room beside the box, and still gets a place when there is none
const button = { x: 600, y: 400, w: 120, h: 40 }
const above = { x: 540, y: 326, w: 240, h: 64 }
const [moved] = placeMarkers([button], VIEW, SIZE, [above])
ok(moved.arrow && !circleHits(moved, above), 'it moves off the words above the button')
const [still] = placeMarkers([button], VIEW, SIZE, [{ x: 0, y: 0, w: 1280, h: 800 }])
ok(still.arrow && !circleHits(still, button), 'words everywhere: still beside its box, with its arrow')

// many mixed layouts, the same every run
let seed = 7
const random = (limit) => { seed = (seed * 48271) % 2147483647; return seed % limit }
for (let layout = 0; layout < 60; layout += 1) {
  const boxes = Array.from({ length: 3 + random(14) }, () => {
    const w = 24 + random(300)
    const h = 20 + random(90)
    return { x: random(VIEW.w - w), y: random(VIEW.h - h), w, h }
  })
  check(boxes, VIEW, `layout ${layout}`)
}

console.log(`placeMarkers: ${n} checks passed`)
