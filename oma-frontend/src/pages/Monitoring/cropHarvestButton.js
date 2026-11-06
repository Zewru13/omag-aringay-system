// The Record Harvest button of a Crop Monitoring row (beside the three-dot menu, like the harvest button of Aquaculture Monitoring).
// No screen and no network, so it can be tested on its own. It only decides whether the button can be pressed and what its hover text says;
// pressing it opens the one existing Record Harvest form, whose own checks and the server's still apply.
//
// A crop that is already Harvested or a Total Loss cannot be harvested, so the button is greyed out and says so. Otherwise the gate
// (harvestGateInfo of the page: half of the growing time has passed and the planting date is confirmed) decides, and its message is the text.

export function harvestButton(rec, gate) {
  if (rec.status === 'Harvested') return { active: false, title: 'Already harvested' }
  if (rec.status === 'Total Loss') return { active: false, title: 'Harvest not available (Total Loss)' }
  if (gate?.gated) return { active: false, title: gate.message }
  return { active: true, title: 'Record Harvest' }
}
