// Batch 11: shared per-domain config so the citizen self-service components
// (activity log modal, harvest modal, records panel) can stay generic across
// crop (production) and fisheries (stocking) rather than being duplicated.
// Endpoint shapes genuinely differ between the two domains (e.g. crop
// harvest create takes monitoring_record in the body while fisheries
// harvest create is nested under the stocking id in the URL) — that
// asymmetry is captured here once instead of scattered through components.

export const CROP_DOMAIN = {
  key: 'crop',
  lockType: 'crop',
  recordLabel: 'Crop Monitoring Record',
  recordsUrl: '/production/monitoring/',
  logsUrl: (recordId) => `/production/monitoring/${recordId}/logs/`,
  logDetailUrl: (logId) => `/production/monitoring/logs/${logId}/detail/`,
  harvestCreateUrl: () => '/production/create/',
  harvestListUrl: null, // crop harvests aren't listable by monitoring_record — use record.harvest_record_id
  harvestDetailUrl: (harvestId) => `/production/${harvestId}/`,
  creatorField: 'recorded_by',
  activityField: 'activity_type',
  activityChoices: [
    'Fertilizer Application',
    'Pesticide Application',
    'Irrigation',
    'Weeding',
    'Thinning',
    'Field Inspection',
    'Harvesting',
    'Other',
  ],
  activityOtherField: 'activity_type_other_specify',
  notesField: 'notes',
  recordTitle: (r) => `${r.crop_type_name || 'Crop'} — ${r.season || ''} ${r.year || ''}`.trim(),
  recordSubtitle: (r) => r.farm_location_barangay || r.farmer_barangay || '',
}

export const FISHERIES_DOMAIN = {
  key: 'fisheries',
  lockType: 'stocking',
  recordLabel: 'Stocking Record',
  recordsUrl: '/fisheries/stocking/',
  logsUrl: (recordId) => `/fisheries/stocking/${recordId}/logs/`,
  logDetailUrl: (logId) => `/fisheries/stocking/logs/${logId}/detail/`,
  harvestCreateUrl: (recordId) => `/fisheries/stocking/${recordId}/harvests/`,
  harvestListUrl: (recordId) => `/fisheries/stocking/${recordId}/harvests/`,
  harvestDetailUrl: (harvestId) => `/fisheries/stocking/harvests/${harvestId}/detail/`,
  creatorField: 'logged_by',
  activityField: 'activity',
  activityChoices: [
    'Pond Preparation',
    'Stocking',
    'Feed Monitoring',
    'Water Quality Check',
    'Sampling',
    'Disease Control',
    'Pre-Harvest Inspection',
    'Harvesting',
    'Other',
  ],
  activityOtherField: 'activity_other_specify',
  notesField: 'observed_issue',
  recordTitle: (r) => `${r.species_name || 'Stock'} — ${r.season || ''} ${r.year || ''}`.trim(),
  recordSubtitle: (r) => r.pond_location_barangay || '',
}
