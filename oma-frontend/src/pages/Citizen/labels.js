// Batch E — every user-facing string on the citizen self-service pages
// (src/pages/Citizen/**), centralized here as named keys. The client has
// not yet decided between English, Tagalog, and Ilocano (La Union is
// predominantly Ilocano-speaking) for this audience, so nothing below may
// be hardcoded inside a component — every citizen-facing label, button,
// heading, empty state, and error message renders from this file. When
// the client decides, swapping languages is a ONE-FILE change here, not a
// component-by-component refactor.
//
// NOT included here: activity/assistance-type CHOICE VALUES (e.g.
// 'Fertilizer Application', 'Pest Control') defined in citizenDomainConfig.js
// and orgDomainConfig.js. Those are stored verbatim in the database and
// matched against staff-side data (e.g. the suggestion engine compares
// activity_type against CropActivityStage.stage_name) — translating the
// VALUE would silently break that matching and staff/citizen data
// consistency. Only genuinely decorative/instructional UI text belongs here.

export const labels = {
  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    saveChanges: 'Save Changes',
    edit: 'Edit',
    close: 'Close',
    unknown: '—',
    loggedByStaff: 'Logged by staff',
    // The caller renders the locker's name in its own <strong> tag, so
    // these are the surrounding text only, not a full templated sentence.
    lockedByOtherSuffix: 'is currently logging this record. Please wait',
    lockedByOtherMinutes: (mins) => ` (~${mins} min)`,
    genericSaveError: 'Failed to save. Please try again.',
  },

  header: {
    appName: 'OMAg Aringay',
    tagline: 'Self-Service Account',
    logOut: 'Log Out',
  },

  home: {
    greeting: (name) => `Welcome, ${name}`,
    subtitle: (recordTypeLabel) => `Self-service account for your ${recordTypeLabel} record with the Office of the Municipal Agriculturist.`,
    notLinked: "Your account isn't linked to a record yet. Please visit the office for assistance.",
    recordTypeLabels: {
      FARMER: 'farmer',
      FISHERFOLK: 'fisherfolk',
      FARMERS_ORG: 'farmers organization',
      FISHERFOLK_ORG: 'fisherfolk organization',
    },
    recordTypeLabelsCapitalized: {
      FARMER: 'Farmer',
      FISHERFOLK: 'Fisherfolk',
      FARMERS_ORG: 'Farmers Organization',
      FISHERFOLK_ORG: 'Fisherfolk Organization',
    },
    recordTypeFallback: 'Record',
    // Legacy tab-bar labels (still used for Fisherfolk/Organization roles
    // this batch — only the Farmer role gets the new task-first layout).
    tabs: {
      overview: 'Overview',
      myCropRecords: 'My Crop Records',
      myStockingRecords: 'My Stocking Records',
      myYieldAnalysis: 'My Yield Analysis',
      myAssistanceHistory: 'My Assistance History',
      reportAssistance: 'Report Assistance',
    },
    overviewFields: {
      name: 'Name',
      recordType: 'Record Type',
      rsbsaNumber: 'RSBSA Number',
      registrationNumber: 'Registration Number',
      barangay: 'Barangay',
    },
  },

  // ── New Farmer home screen (Batch E) ──────────────────────────────────
  farmerHome: {
    rsbsaPrefix: 'RSBSA',
    headerGreeting: 'Welcome back',
    loading: 'Loading your crop records...',
    loadError: 'Unable to load your crop records.',
    needsAttention: {
      title: 'Needs Attention',
      overdueBadge: 'Overdue',
      dueTodayBadge: 'Due Today',
      emptyTitle: "You're up to date",
      emptyBody: 'No activities are due right now — check back after your next visit to the field.',
      actionLabel: 'Log This Activity',
      contextLine: (crop, barangay, area) => `${crop} · ${barangay} · ${area} ha`,
    },
    myCrops: {
      title: 'My Crops',
      empty: "You don't have any crop records on file yet. Visit the office to have one started.",
      progressDayOf: (elapsed, total) => `Day ${elapsed} of ${total}`,
      expectedHarvest: (date) => `Expected harvest: ${date}`,
      logActivity: 'Log Activity',
      viewHistory: 'View History',
      seasonYear: (season, year) => `${season} ${year}`,
    },
    secondary: {
      harvestResultsTitle: 'Harvest Results',
      harvestResultsSubtitle: 'Your yield analysis, read-only',
      assistanceTitle: 'Assistance Received',
      assistanceSubtitle: 'Your beneficiary history, read-only',
      backToHome: 'Back',
    },
    history: {
      title: (cropTitle) => `${cropTitle} — History`,
      loading: 'Loading history...',
      activityLogTitle: 'Activity Log',
      logActivity: 'Log Activity',
      noActivity: 'No activity logged yet.',
      harvestTitle: 'Harvest',
      recordHarvest: 'Record Harvest',
      noHarvest: 'No harvest recorded yet.',
    },
  },

  // ── New Fisherfolk home screen (Batch F) ────────────────────────────────
  fisherfolkHome: {
    loading: 'Loading your ponds...',
    loadError: 'Unable to load your ponds.',
    feedToday: {
      title: 'Feed Today',
      overdueBadge: 'Overdue',
      dueTodayBadge: 'Due Today',
      emptyTitle: "You're up to date",
      emptyBody: 'No ponds are due for feeding right now.',
      dueSummary: (count) => `${count} pond${count === 1 ? '' : 's'} due for feeding`,
      lastFed: (feedType, qtyKg, date) => `Last fed: ${feedType || 'Unspecified feed'}${qtyKg ? ` · ${qtyKg} kg` : ''} · ${date}`,
      noPriorFeeding: 'No prior feeding logged for this pond yet.',
      repeatButton: "Repeat Yesterday's Feeding",
      logSeparatelyLink: 'or log each pond separately',
    },
    confirmGuard: {
      title: 'Confirm Feeding Log',
      body: 'This will log the following for each pond, dated today:',
      pondLine: (pondName, feedType, qtyKg) => `${pondName}: ${feedType || 'Unspecified feed'}${qtyKg ? ` · ${qtyKg} kg` : ''}`,
      confirmButton: 'Confirm & Log All',
      cancelButton: 'Cancel',
      skippedNote: (count) => `${count} pond${count === 1 ? '' : 's'} skipped — no prior feeding entry to repeat. Log ${count === 1 ? 'it' : 'them'} manually below.`,
      partialSuccess: (ok, total) => `Logged ${ok} of ${total} ponds.`,
    },
    myPonds: {
      title: 'My Ponds',
      empty: "You don't have any ponds on file yet. Visit the office to have one started.",
      unstockedLabel: 'Not currently stocked',
      speciesArea: (species, area) => `${species} · ${area} ha`,
      fingerlings: (count) => `${count} fingerlings`,
      progressDayOf: (elapsed, total) => `Day ${elapsed} of ${total}`,
      expectedHarvest: (date) => `Expected harvest: ${date}`,
      logFeeding: 'Log Feeding',
      logActivity: 'Log Activity',
    },
    secondary: {
      illnessTitle: 'Log Illness or Mortality',
      illnessSubtitle: 'Report a health issue in a pond',
    },
    pondPicker: {
      title: 'Select a Pond',
      subtitle: 'Which pond is this about?',
      noPonds: 'No stocked ponds to report against.',
    },
  },

  // ── MyRecordsPanel (legacy record list — still used for Fisherfolk) ───
  myRecordsPanel: {
    loading: (recordLabel) => `Loading your ${recordLabel}s...`,
    loadError: (recordLabel) => `Unable to load your ${recordLabel}s.`,
    detailLoadError: 'Unable to load activity/harvest history.',
    empty: (recordLabel) => `You don't have any ${recordLabel}s on file yet. Visit the office to have one started.`,
    activityLogTitle: 'Activity Log',
    logActivity: 'Log Activity',
    noActivity: 'No activity logged yet.',
    harvestTitle: 'Harvest',
    recordHarvest: 'Record Harvest',
    noHarvest: 'No harvest recorded yet.',
    lateSuffix: ' · Late',
  },

  // ── CitizenActivityLogModal ────────────────────────────────────────────
  activityLog: {
    titleNew: 'Log Activity',
    titleEdit: 'Edit Activity Log',
    // Shown when opened from a "Needs Attention" task card — the header
    // confirms context instead of asking the user to (re)select it.
    prefilledSubtitle: (cropTitle) => `Logging for ${cropTitle}`,
    fields: {
      activity: 'Activity',
      dateOfActivity: 'Date of Activity',
      dateHint: 'When the activity was actually performed.',
      notes: 'Notes',
      notesFisheries: 'Notes / Observations',
      plantCondition: 'Plant Condition',
      fertilizerType: 'Fertilizer / Input Type',
      quantityApplied: 'Quantity Applied',
      quantityUnit: 'Unit',
      pestDiseaseName: 'Pest / Disease Name',
      areaAffected: 'Area Affected (ha)',
      severity: 'Severity',
      // Batch F — fisheries-domain conditional fields
      waterFishCondition: 'Water / Fish Condition',
      feedType: 'Feed Type',
      feedQuantity: 'Feed Quantity (kg)',
      feedBrand: 'Feed Brand',
      mortalityCount: 'Mortality Count',
      vetConsulted: 'Vet Consulted',
      treatmentApplied: 'Treatment Applied',
      outcome: 'Outcome',
      recommendations: 'Recommendations',
    },
    outcomeOptions: {
      Recovered: 'Recovered',
      Ongoing: 'Ongoing',
      'Losses Incurred': 'Losses Incurred',
    },
    dateShortcuts: {
      today: 'Today',
      yesterday: 'Yesterday',
      pickDate: 'Pick a date',
    },
    plantConditionOptions: {
      Good: 'Good',
      Fair: 'Fair',
      Poor: 'Poor',
    },
    severityOptions: {
      Low: 'Low',
      Medium: 'Medium',
      High: 'High',
    },
    quantityUnitOptions: {
      kg: 'kg',
      bags: 'bags',
      liters: 'liters',
      sacks: 'sacks',
      pieces: 'pieces',
    },
    errors: {
      dateRequired: 'Date of activity is required.',
      specifyActivity: 'Please specify the activity.',
      specifyFeedType: 'Please specify the feed type.',
      lockedByOther: 'Someone else is currently logging this record. Please wait.',
      areaAffectedRequired: 'Area affected is required.',
      areaAffectedInvalid: 'Area affected must be greater than 0.',
      areaAffectedExceeds: (recordArea) => `Area affected cannot exceed the ${recordArea} ha on record.`,
    },
    submitNew: 'Save Log',
    submitEdit: 'Save Changes',
    successNew: 'Activity log added.',
    successEdit: 'Activity log updated.',
  },

  // ── CitizenHarvestModal ────────────────────────────────────────────────
  harvest: {
    titleNew: 'Record Harvest',
    titleEdit: 'Edit Harvest',
    fields: {
      season: 'Season',
      year: 'Year',
      cropName: 'Crop Name',
      harvestStartDate: 'Harvest Start Date',
      harvestEndDate: 'Harvest End Date',
      areaHarvested: 'Area Harvested (ha)',
      volume: 'Volume (kg)',
      unitOfMeasure: 'Unit of Measure',
      harvestDate: 'Harvest Date',
      quantity: 'Quantity (kg)',
      avgBodyWeight: 'Avg. Body Weight (kg)',
      areaOrUnits: 'Area / Units Harvested',
      areaOrUnitsHint: 'e.g. Pond 2, 3 cages',
      isFinal: 'This is the final harvest for this cycle',
      earlyLateReason: 'Reason if more than 7 days early/late',
      earlyLateReasonHint: 'Only required if flagged',
      notes: 'Notes',
    },
    unitOptions: {
      kg: 'Kilograms (kg)',
      bags: 'Bags (50 kg/bag)',
      cavan: 'Cavan (50 kg/cavan)',
      sacks: 'Sacks',
      pieces: 'Pieces/Heads',
      bundles: 'Bundles',
      boxes: 'Boxes',
      other: 'Other',
    },
    errors: {
      lockedByOther: 'Someone else is currently logging this record. Please wait.',
      genericSaveError: 'Unable to save harvest.',
    },
    submitNew: 'Record Harvest',
    submitEdit: 'Save Changes',
    successNew: 'Harvest recorded.',
    successEdit: 'Harvest record updated.',
  },

  // ── MyYieldAnalysisSection ──────────────────────────────────────────────
  yieldAnalysis: {
    loading: 'Loading your yield analysis...',
    empty: 'No harvested or total-loss records yet — this section fills in once a cycle is complete.',
    columns: {
      estimatedKg: 'Estimated (kg)',
      actualKg: 'Actual (kg)',
      variance: 'Variance',
      activities: 'Activities',
    },
    totalLossBadge: 'Total Loss',
    cropCropLabel: 'Crop',
    cropDateLabel: 'Date Planted',
    fisheriesCropLabel: 'Species',
    fisheriesDateLabel: 'Date Stocked',
  },

  // ── MyAssistanceHistorySection ─────────────────────────────────────────
  assistanceHistory: {
    loading: 'Loading your assistance history...',
    empty: 'No assistance records on file yet.',
    columns: {
      type: 'Type',
      quantity: 'Quantity',
      dateReceived: 'Date Received',
      remarks: 'Remarks',
    },
    programDistribution: 'Program Distribution',
  },

  // ── MyOrgReportingSection ───────────────────────────────────────────────
  orgReporting: {
    reportForMemberTitle: 'Report Assistance for a Member',
    searchPlaceholder: (personLabelLower) => `Search this organization's ${personLabelLower} members by name...`,
    searching: 'Searching...',
    noMembersFound: 'No members found.',
    reportAssistance: 'Report Assistance',
    clearSelection: 'Clear selection',
    historyTitle: 'Your Reporting History',
    loading: 'Loading...',
    historyEmpty: "You haven't reported any assistance yet.",
    columns: {
      type: 'Type',
      quantity: 'Quantity',
      dateGiven: 'Date Given',
    },
    programDistribution: 'Program Distribution',
    errors: {
      loadHistoryFailed: 'Unable to load your reporting history.',
    },
  },

  // ── CitizenReportAssistanceModal ────────────────────────────────────────
  reportAssistance: {
    titleNew: 'Report Assistance',
    titleEdit: 'Edit Assistance Report',
    fields: {
      assistanceType: 'Assistance Type',
      dateGiven: 'Date Given',
      quantityAmount: 'Quantity / Amount',
      quantityPlaceholder: 'e.g. 2 bags, 1 unit',
      sourceAgency: 'Source Agency',
      season: 'Season',
      program: 'Attach to a formal program (optional)',
      programHelp: 'Leave unselected to log this as a standalone record, same as today.',
      programNone: 'No program — standalone record',
      remarks: 'Remarks',
    },
    errors: {
      requiredFields: 'Assistance type, quantity, and date are required.',
      specifySourceAgency: 'Please specify the source agency.',
      genericSaveError: 'Failed to save.',
    },
    submitNew: 'Report Assistance',
    submitEdit: 'Save Changes',
    successNew: 'Assistance reported.',
    successEdit: 'Assistance report updated.',
  },
}

export default labels
