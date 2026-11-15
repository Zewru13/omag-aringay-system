// Whether Record Harvest may open for a crop, and the reason when it may not. Used by the office's Crop Monitoring page and by the
// farmer's own pages. No screen and no network, so it can be tested on its own (`today` is for tests; pages leave it out).
import { harvestGate } from './harvestReport.js'

const todayISO = () => new Date().toISOString().slice(0, 10)

export function harvestGateInfo(row, today = todayISO()) {
  // Record Harvest opens once half of the growing time has passed (today); before that the crop is harvested with Force Harvest.
  const growth = harvestGate(row.date_planted, row.expected_harvest_date, today)
  if (growth.gated) return { gated: true, message: growth.message }
  if (row.date_planted_is_estimated) {
    return {
      gated: true,
      message: 'This record’s planting date is an estimate (imported from a registry record, ' +
        'not a confirmed field date). Harvest cannot be recorded until a staff member confirms or ' +
        'corrects the real planting date.',
    }
  }
  return { gated: false, message: null }
}
