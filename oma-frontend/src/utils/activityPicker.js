// Which activities the crop "Add activity" picker offers, and in which group, from the server's schedule status
// (GET /production/monitoring/<id>/suggestions/ -> suggestions[{ activity_name, day_after_planting, status }]).
//
//   suggested: scheduled activities that have a step due now or overdue and not yet done, earliest step first.
//   other:     activities with no schedule for this crop, and scheduled ones whose remaining steps are only upcoming.
//   hidden:    scheduled activities whose every step is done (unless that is the activity of the log being edited).
//
// The picker only guides: the server still accepts a repeated or early activity.

export function groupActivityOptions({ allTypes, suggestions, editingType = '' }) {
  const stepsByName = new Map()
  for (const step of suggestions || []) {
    if (!stepsByName.has(step.activity_name)) stepsByName.set(step.activity_name, [])
    stepsByName.get(step.activity_name).push(step)
  }

  const names = [...new Set(allTypes || [])]
  const suggested = []
  const other = []
  for (const name of names) {
    const steps = stepsByName.get(name)
    if (!steps || steps.length === 0) { other.push(name); continue }
    const waiting = steps.filter((s) => s.status === 'due_now' || s.status === 'overdue')
    if (waiting.length > 0) {
      suggested.push({ name, firstDay: Math.min(...waiting.map((s) => s.day_after_planting)) })
    } else if (steps.every((s) => s.status === 'done')) {
      if (name === editingType) other.push(name)
    } else {
      other.push(name)
    }
  }

  suggested.sort((a, b) => a.firstDay - b.firstDay || a.name.localeCompare(b.name))
  return { suggested: suggested.map((s) => s.name), other }
}

// The day of the earliest overdue step of `activityType`, or null. A late log picked from the dropdown (not from a
// suggestion card) is tied to that step as its target day, exactly as a late log started from a suggestion is;
// without it the server cannot match a log made long after the step's window and the step would stay overdue.
export function overdueStepDay(activityType, suggestions) {
  if (!activityType) return null
  const days = (suggestions || [])
    .filter((s) => s.activity_name === activityType && s.status === 'overdue')
    .map((s) => s.day_after_planting)
  return days.length > 0 ? Math.min(...days) : null
}
