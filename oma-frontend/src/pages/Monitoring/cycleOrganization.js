// The Organization box of Start Production Cycle follows the selected fisherfolk's organization membership (the same records as Add Member on
// the organization). The form loads the fisherfolk's active organizations; these rules say what is filled in and what the box says. No screen,
// no network, so they can be tested on their own. The server still checks that the organization chosen is an active membership of the fisherfolk.

// The organization to fill in by itself: the only one the fisherfolk belongs to, as the text value of a <select>. With none the box stays
// blank, and with several the Admin chooses the right one.
export const organizationChoice = (options) => (Array.isArray(options) && options.length === 1 ? String(options[0].id) : '')

// What the box shows while no organization is chosen.
export function organizationPlaceholder({ hasFisherfolk, loading, count }) {
  if (!hasFisherfolk) return 'Select Fisherfolk first'
  if (loading) return 'Loading organizations…'
  if (count === 0) return 'No registered organizations'
  return 'Select Organization'
}

// The line under the box when the choice is the Admin's.
export const organizationHint = (count) => (count > 1 ? `This fisherfolk belongs to ${count} organizations - choose the one for this cycle.` : '')
