// The rules of the fisherfolk profile screen: the chips under the name. A fisherfolk gets the same classification chips as a farmer, then a vessel line
// (capture and mariculture only) and a disaster line. No screen and no network, so they can be tested alone.
import { classificationChips } from '../Farmers/farmerProfile.js'

export function fisherfolkChips(fisherfolk) {
  const chips = [...classificationChips(fisherfolk)]
  if (fisherfolk?.fisherfolk_type === 'Capture' || fisherfolk?.fisherfolk_type === 'Mariculture') {
    chips.push(fisherfolk.has_vessel
      ? { key: 'vessel', label: 'With Vessel', meaning: 'Has a fishing vessel.', tone: 'green', icon: 'ship' }
      : { key: 'vessel', label: 'No Vessel', meaning: 'Has no fishing vessel on record.', tone: 'slate', icon: 'ship' })
  }
  if (fisherfolk?.is_affected_by_disaster) {
    chips.push({ key: 'disaster', label: 'Affected by Disaster', meaning: 'A disaster affecting this fisherfolk is on record.', tone: 'rose', icon: 'alert' })
  }
  return chips
}
