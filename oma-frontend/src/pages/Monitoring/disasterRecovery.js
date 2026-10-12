// Whether a disaster's "Mark Recovered" action is offered. The server decides (can_recover): a crop or pond that is already
// harvested, or a total loss, has nothing left to recover, so its disaster stays in the history only. Older answers
// without the flag fall back to the plain rule.
export const canRecoverDisaster = (d) => (typeof d?.can_recover === 'boolean'
  ? d.can_recover
  : d?.status === 'Active' && !d?.is_total_loss)

// The sentence shown instead of the action (empty when the disaster can be recovered or is already recovered).
export const recoveryBlockedNote = (d) => (d?.status === 'Active' && !canRecoverDisaster(d)
  ? (d.recovery_block_reason || 'This disaster cannot be marked as recovered.')
  : '')

// What a disaster's status cell says. A total loss says so; an Active one that can no longer be recovered (its crop or
// stock is already harvested) says "History only", because it stays in the list as a record and nothing more can be done.
export const disasterStatusLabel = (d) => {
  if (d?.is_total_loss) return 'Total loss'
  if (d?.status === 'Active' && !canRecoverDisaster(d)) return 'History only'
  return d?.status || ''
}
