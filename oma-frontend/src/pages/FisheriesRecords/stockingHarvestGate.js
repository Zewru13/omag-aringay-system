// Whether Record Harvest may open for a production cycle (a stocking record), and the reason when it may not. Used by the office's
// Aquaculture Monitoring page and by the fisherfolk's own pages and Home. Mirrors core.utils.harvest_gate_status on the backend (the
// real enforcement — this is client-side UX only, to explain the gate before the form is even opened). `today` is for tests.
import { harvestGateStatus, todayLocalISO } from './stockingHelpers.js'

export function stockingHarvestGate(rec, today = todayLocalISO()) {
  if (rec.date_stocked_is_estimated) {
    return {
      gated: true,
      message: 'This record’s stocking date is an estimate, not a confirmed field date. Harvest ' +
        'cannot be recorded until a staff member confirms or corrects the real stocking date.',
    }
  }
  // Force Harvest (fish mortality / disease in the cycle's Health Log) lifts the waiting period; the
  // backend applies the same exemption.
  if (rec.force_harvest) return { gated: false, message: null }
  // Normal harvest: active once >= 50% of this record's own Stocking Date -> Expected Harvest Date has elapsed.
  return harvestGateStatus(rec.date_stocked, rec.expected_harvest_date, today)
}
