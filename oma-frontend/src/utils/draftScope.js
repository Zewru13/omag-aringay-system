import { clearDraft, fieldValues, isFieldDraft, loadDraft, restoreField, saveDraft } from './drafts.js'

// The draft of one form built from several separate fields (hooks/useDraftForm.js is its React side): which fields there are, when to write
// them to this browser, and what to do when the form is saved, discarded or left. A class so the bookkeeping that changes while the form is
// on screen stays out of render code, and so it can be tested with a fake storage and a fake clock.
export const SAVE_AFTER_MS = 400

// localStorage, or nothing when the browser blocks it (a form then just works without a draft).
export const browserStorage = () => { try { return localStorage } catch { return null } }

export class DraftScope {
  constructor({ storage, key, enabled = true, delay = SAVE_AFTER_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.storage = storage
    this.key = key
    this.enabled = enabled
    this.delay = delay
    // Called as plain functions: a browser's setTimeout / clearTimeout throw "Illegal invocation" when called as a method of this object.
    this.setTimer = (fn, ms) => setTimer(fn, ms)
    this.clearTimer = (id) => clearTimer(id)
    this.fields = new Map()   // field -> { value, initial, reset }
    this.stopped = false      // set once the form is saved or discarded: nothing more is written until the person types again
    this.timer = null
    const saved = enabled ? loadDraft(storage, key) : null
    this.saved = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null
  }

  get restored() { return this.saved !== null }

  // What a field starts with: its saved value when it fits, else its own starting value.
  restore(field, initial) { return restoreField(this.saved, field, initial) }

  register(field, value, initial, reset) { this.fields.set(field, { value, initial, reset }) }

  resume() { this.stopped = false }

  // Write the draft now: only while some field differs from its start; a form back at blank leaves nothing behind.
  persist() {
    if (!this.enabled || this.stopped) return
    if (isFieldDraft(this.fields)) saveDraft(this.storage, this.key, fieldValues(this.fields))
    else clearDraft(this.storage, this.key)
  }

  // Write it a moment from now (a burst of keystrokes is one write).
  schedule() {
    this.clearTimer(this.timer)
    this.timer = this.setTimer(() => this.persist(), this.delay)
  }

  // The form was saved: drop the draft and write nothing more until the person types again.
  clear() {
    this.stopped = true
    this.clearTimer(this.timer)
    clearDraft(this.storage, this.key)
  }

  // Start over: every field back to its start, draft wiped.
  discard() {
    this.clear()
    this.fields.forEach((entry) => entry.reset())
  }

  // The form is going away: leaving within the delay still keeps what was typed.
  leave() {
    this.clearTimer(this.timer)
    this.persist()
  }
}
