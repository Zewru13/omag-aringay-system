// Where the button in a notification's window goes, by its record_type. No screen and no network.
//
// Staff: crop / stocking / fisherfolk_disaster activity, harvest and disaster; beneficiary / ff_beneficiary assistance; and the
// four registry types of a citizen's profile-change request (answered in the window itself; the button opens the record).
// Older notices of confirmations that no longer exist lead to the assistance they were about.
export const STAFF_ROUTES = {
  crop: '/crop-monitoring',
  stocking: '/fisheries-monitoring?tab=stocking',
  // Disaster management moved out of Fisheries Monitoring into Admin > Disaster > Fisheries Disaster.
  fisherfolk_disaster: '/disaster?tab=fisheries',
  // A fisherfolk "logged a fisheries disaster" (submitted to Admin): opens that log (record_id) in
  // Admin > Disaster > Fisheries Disaster.
  fisheries_disaster_report: (id) => `/disaster?tab=fisheries${id ? `&report=${id}` : ''}`,
  // Fisheries production-cycle events (record_id = the production cycle): open that cycle's details.
  fisheries_cycle_started: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  fisheries_force_harvest: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  // The emergency Force Harvest (record_id = the saved harvest): opens its details window.
  fisheries_emergency_force_harvest: (id) => `/fisheries-monitoring?tab=stocking${id ? `&forced=${id}` : ''}`,
  fisheries_harvest_reminder_7d: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  fisheries_harvest_reminder_3d: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  beneficiary: '/crop-assistance',
  ff_beneficiary: '/fisheries-assistance',
  beneficiary_obo: '/crop-assistance?tab=history',
  ff_beneficiary_obo: '/fisheries-assistance?tab=history',
  beneficiary_obo_confirmed: '/reports?tab=organization_assistance',
  ff_beneficiary_obo_confirmed: '/reports?tab=organization_assistance',
  FARMER: (id) => (id ? `/farmers/${id}` : ''),
  FISHERFOLK: (id) => (id ? `/fisheries/${id}` : ''),
  FARMERS_ORG: (id) => (id ? `/organizations/farmers/${id}` : ''),
  FISHERFOLK_ORG: (id) => (id ? `/organizations/fisherfolk/${id}` : ''),
}

// Fisherfolk accounts have no category tabs on Fisheries Monitoring; their disaster list has its own page.
export const FISHERFOLK_RECORD_TYPE_ROUTES = {
  stocking: '/fisheries-monitoring',
  fisherfolk_disaster: '/disaster',
  fisheries_cycle_started: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_force_harvest: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_emergency_force_harvest: (id) => `/fisheries-monitoring${id ? `?forced=${id}` : ''}`,
  fisheries_harvest_reminder_7d: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_3d: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_30d: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_today: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_overdue: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
}

// A citizen account may open only its own pages: every staff address would end on "Access Denied". An assistance notice opens
// their Assistance page (where it is claimed), a loan their borrowed equipment, an answer about their profile their profile, and
// a farmer's crop notices their crops; anything else just lands on their Home.
const CITIZEN_HOME = '/my-account'
const CITIZEN_ROUTES = {
  beneficiary: '/crop-assistance', ff_beneficiary: '/fisheries-assistance',
  FARMER: '/my-profile', FISHERFOLK: '/my-profile', FARMERS_ORG: '/my-profile', FISHERFOLK_ORG: '/my-profile',
}
const COOPERATIVE_ACCOUNTS = ['FARMERS_ORG', 'FISHERFOLK_ORG']

const resolve = (route, id) => (typeof route === 'function' ? route(id) : route)

export function notificationRoute(notification, { isCitizen = false, isFarmer = false, isFisherfolk = false, linkedRecordType = '' } = {}) {
  const type = notification.record_type || ''
  if (isCitizen && type === 'equipment_loan') {
    return COOPERATIVE_ACCOUNTS.includes(linkedRecordType) ? '/my-organization?tab=borrowed' : '/my-equipment'
  }
  if (isFisherfolk && FISHERFOLK_RECORD_TYPE_ROUTES[type]) return resolve(FISHERFOLK_RECORD_TYPE_ROUTES[type], notification.record_id)
  if (isFarmer && (type === 'crop' || type.startsWith('crop_harvest_reminder_'))) return '/crop-monitoring'
  if (isCitizen) return CITIZEN_ROUTES[type] || CITIZEN_HOME
  return resolve(STAFF_ROUTES[type] || '', notification.record_id)   // an unknown type goes nowhere
}
