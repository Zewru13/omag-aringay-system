// The PCIC INSURED cell of Aquaculture Monitoring. PCIC insurance is kept per pond / cage, so a row (a production cycle) shows one tick per
// pond or cage of its cycle; a row with none (an older record, or a culture system without ponds/cages) shows its own single tick.
// No screen and no network.

export const PCIC_UNIT_LIMIT = 4   // ponds / cages listed in the cell before "+N more"

// units: [{ id, label, insured }] from the server (`pcic_units`); recordInsured: the stocking record's own flag (used only when there are no units).
export function pcicUnitsCell(units, recordInsured, limit = PCIC_UNIT_LIMIT) {
  const list = Array.isArray(units) ? units : []
  if (list.length === 0) {
    const insured = recordInsured ? 1 : 0
    return { mode: 'record', shown: [], hiddenCount: 0, hiddenText: '', insured, total: 1, summary: insured ? 'insured' : 'not insured' }
  }
  const insured = list.filter((u) => u.insured).length
  const shown = list.slice(0, limit)
  const hidden = list.slice(limit)
  const hiddenInsured = hidden.filter((u) => u.insured).length
  return {
    mode: 'units',
    shown,
    hiddenCount: hidden.length,
    hiddenText: hidden.length ? `+${hidden.length} more (${hiddenInsured ? `${hiddenInsured} insured` : 'none insured'})` : '',
    insured,
    total: list.length,
    summary: `${insured} of ${list.length} insured`,
  }
}
