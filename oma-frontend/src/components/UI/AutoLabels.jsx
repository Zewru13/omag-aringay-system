import { useEffect } from 'react'

// Many forms draw a <label> above a box without tying the two together (no `for`, the box is not inside the label), so a screen reader announces an
// unnamed box and tapping the label does not focus it. This connects them once, for every form: a label with no `for` that does not wrap a control is
// pointed at the first text box / dropdown / text area that follows it in the same block (and stops at the next label). Boxes that already have a
// label, an aria-label or aria-labelledby are left alone. Runs on the screen as it changes; changes nothing visible.
const CONTROL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea'
let counter = 0

const isNamed = (control) => {
  if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || control.closest('label')) return true
  return Boolean(control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`))
}

function connectLabels(root = document) {
  root.querySelectorAll('label:not([for])').forEach((label) => {
    if (label.querySelector(CONTROL) || !label.textContent.trim()) return
    for (let el = label.nextElementSibling; el; el = el.nextElementSibling) {
      if (el.tagName === 'LABEL') return
      const control = el.matches(CONTROL) ? el : el.querySelector(CONTROL)
      if (!control) continue
      if (isNamed(control)) return
      if (!control.id) { counter += 1; control.id = `auto-field-${counter}` }
      label.setAttribute('for', control.id)
      return
    }
  })
}

// A box inside a table cell is named by its column (the cell's data-label on the phone cards, else the heading above that column).
function nameTableControls(root = document) {
  root.querySelectorAll('td').forEach((cell) => {
    const controls = [...cell.querySelectorAll(CONTROL)].filter((c) => !isNamed(c) && !c.getAttribute('title'))
    if (!controls.length) return
    let text = cell.getAttribute('data-label') || ''
    if (!text) {
      const table = cell.closest('table')
      const head = table?.tHead?.rows?.[0]?.cells?.[cell.cellIndex]
      text = head ? head.textContent : ''
    }
    text = text.replace(/\s+/g, ' ').replace(/\(optional\)|\*/gi, '').trim()
    if (text) controls.forEach((c) => c.setAttribute('aria-label', text))
  })
}

export default function AutoLabels() {
  useEffect(() => {
    let timer = 0
    const run = () => { timer = 0; connectLabels(); nameTableControls() }
    const observer = new MutationObserver(() => { if (!timer) timer = setTimeout(run, 60) })
    observer.observe(document.body, { childList: true, subtree: true })
    run()
    return () => { observer.disconnect(); if (timer) clearTimeout(timer) }
  }, [])
  return null
}
