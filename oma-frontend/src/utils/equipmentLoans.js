// Pure helpers for an organization's equipment: conditions, unit figures, loan state and the return breakdown.

export const CONDITIONS = ['Good', 'Needs Repair', 'Not Operational', 'Broken', 'Lost']
// Lines in these conditions can be repaired (Good needs nothing, Lost cannot be repaired).
export const REPAIRABLE = ['Needs Repair', 'Not Operational', 'Broken']

const OUT = ['BORROWED', 'RETURN_PENDING']

// How many units a line has, how many are out on loan and how many can be lent right now.
export const unitsSummary = (line) => ({
  total: Number(line?.quantity) || 0,
  available: Number(line?.available) || 0,
  onLoan: Number(line?.on_loan) || 0,
})

export const defaultBreakdown = (quantity) => [{ condition: 'Good', quantity }]

// The units that came back, by condition, must add up to the loan's units (each part a whole number, 0 or more).
export const validateBreakdown = (parts, quantity) => {
  if (!Array.isArray(parts) || parts.length === 0) return { ok: false, message: 'Enter the units that came back.' }
  let sum = 0
  for (const part of parts) {
    if (!CONDITIONS.includes(part?.condition)) return { ok: false, message: 'Choose a condition for every part.' }
    const raw = part.quantity === '' || part.quantity === null || part.quantity === undefined ? 0 : Number(part.quantity)
    if (!Number.isInteger(raw) || raw < 0) return { ok: false, message: 'Each number must be a whole number, 0 or more.' }
    sum += raw
  }
  if (sum !== quantity) return { ok: false, message: `The units must add up to ${quantity} (now ${sum}).` }
  return { ok: true, message: '' }
}

// Out on loan with a return-by date before today (dates are YYYY-MM-DD, which compare as text).
export const isOverdue = (loan, todayIso) => Boolean(
  loan && OUT.includes(loan.status) && loan.due_date && todayIso && loan.due_date < todayIso,
)

const STATUS_LABELS = {
  REQUESTED: 'Requested',
  BORROWED: 'Borrowed',
  RETURN_PENDING: 'Return pending',
  RETURNED: 'Returned',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}
export const loanStatusLabel = (status) => STATUS_LABELS[status] || status

export const openRequestCount = (loans) => (Array.isArray(loans) ? loans.filter((l) => l.status === 'REQUESTED').length : 0)

// The server's message for a failed request, else the fallback.
export const apiMessage = (err, fallback) => {
  const data = err?.response?.data
  if (typeof data === 'string') return data
  if (data?.detail) return String(data.detail)
  const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
  return (typeof first === 'string' && first) || fallback
}


// The name a line of equipment is shown under ("Other" lines carry their own text).
export const equipmentLabel = (line) => (
  line?.equipment_name === 'Other' && line.equipment_name_other ? `Other — ${line.equipment_name_other}` : line?.equipment_name
)

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Lines of the same equipment (one per condition, or per batch) become one entry that opens onto its lines.
// Each group: { id, label, lines (Good first), total, onLoan, available, conditions, summary }.
export const groupEquipment = (lines) => {
  if (!Array.isArray(lines)) return []
  const order = (condition) => { const i = CONDITIONS.indexOf(condition); return i < 0 ? CONDITIONS.length : i }
  const groups = new Map()
  lines.forEach((line) => {
    const id = `${line.equipment_name}|${line.equipment_name_other || ''}`
    if (!groups.has(id)) groups.set(id, { id, label: equipmentLabel(line), lines: [] })
    groups.get(id).lines.push(line)
  })
  return [...groups.values()].map((group) => {
    const sorted = [...group.lines].sort((a, b) => order(a.condition) - order(b.condition))
    const total = sorted.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)
    const byCondition = []
    sorted.forEach((l) => {
      const found = byCondition.find((c) => c.condition === l.condition)
      if (found) found.units += Number(l.quantity) || 0
      else byCondition.push({ condition: l.condition, units: Number(l.quantity) || 0 })
    })
    return {
      ...group,
      lines: sorted,
      total,
      onLoan: sorted.reduce((sum, l) => sum + (Number(l.on_loan) || 0), 0),
      available: sorted.reduce((sum, l) => sum + (Number(l.available) || 0), 0),
      conditions: byCondition.map((c) => c.condition),
      summary: `${plural(total, 'unit')} · ${byCondition.map((c) => `${c.units} ${c.condition}`).join(', ')}`,
    }
  })
}

// Splits a request for `quantity` units over lines ({ id, available }) in order: [{ id, quantity }], or null when the
// lines cannot supply that many (or the number is not a positive whole number).
export const allocateUnits = (lines, quantity) => {
  if (!Array.isArray(lines) || !Number.isInteger(quantity) || quantity < 1) return null
  const result = []
  let left = quantity
  for (const line of lines) {
    const take = Math.min(left, Number(line.available) || 0)
    if (take > 0) { result.push({ id: line.id, quantity: take }); left -= take }
    if (left === 0) return result
  }
  return null
}

// The colour of a condition's pill.
export const conditionTone = (condition) => {
  if (condition === 'Good') return 'green'
  if (condition === 'Needs Repair') return 'amber'
  if (condition === 'Lost') return 'slate'
  return 'rose'
}
