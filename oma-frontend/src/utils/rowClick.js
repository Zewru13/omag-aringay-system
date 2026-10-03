// Clickable table rows: spread rowClickProps(open, label) onto a <tr> (or row card) to make the whole row open
// something. Keyboard accessible (focusable; Enter / Space), and safe around the row's own controls:
//   - a click on a button, link, form control or menu inside the row does NOT open the row (it performs its
//     own action instead);
//   - a click that only bubbles through React from a portal (a menu or modal opened from this row, rendered
//     elsewhere in the DOM) does NOT open the row either.
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="menu"], [role="menuitem"], [data-no-row-click]'

export function rowClickProps(open, label) {
  return {
    tabIndex: 0,
    'data-row-clickable': '',
    ...(label ? { 'aria-label': label } : {}),
    onClick: (e) => {
      if (!e.currentTarget.contains(e.target)) return
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
      open()
    },
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
  }
}
