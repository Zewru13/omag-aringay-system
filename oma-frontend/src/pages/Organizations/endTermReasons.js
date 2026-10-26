// Why an officer's term is ended early: Migrated, Transferred Registration, or Others (written out). Pure rules for the End Term window.
export const END_TERM_REASONS = ['Migrated', 'Transferred Registration']
export const END_TERM_OTHER_LABEL = 'Others'
export const END_TERM_OTHER_MAX = 200

// What the End Term request sends, and what is wrong with the choice ('' when nothing). `choice` is one of END_TERM_REASONS or the
// combobox's own "Other" value; `otherText` is what was typed for Others.
export function endTermRequest(choice, otherText) {
  if (!choice) return { problem: 'Choose why this term is ending early.' }
  if (END_TERM_REASONS.includes(choice)) return { problem: '', body: { reason: choice } }
  const text = (otherText || '').trim()
  if (!text) return { problem: 'Say what the reason is.' }
  if (text.length > END_TERM_OTHER_MAX) return { problem: `Keep the reason to ${END_TERM_OTHER_MAX} characters or fewer.` }
  return { problem: '', body: { reason: END_TERM_OTHER_LABEL, reason_other: text } }
}
