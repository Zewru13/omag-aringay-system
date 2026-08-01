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
      title: 'Needs attention',
      overdueBadge: 'Overdue',
      overdueBadgeDays: (days) => `Overdue · ${days} ${days === 1 ? 'day' : 'days'}`,
      dueTodayBadge: 'Due today',
      emptyTitle: "You're up to date",
      emptyBody: 'No activities are due right now — check back after your next visit to the field.',
      actionLabel: 'Log this activity',
      contextLine: (crop, barangay, area) => `${crop} · ${barangay} · ${area} ha`,
    },
    myCrops: {
      title: 'My crops',
      empty: "You don't have any crop records on file yet. Visit the office to have one started.",
      progressDayOf: (elapsed, total) => `Day ${elapsed} of ${total}`,
      expectedHarvest: (date) => `Expected harvest: ${date}`,
      harvestShort: (iso) => {
        if (!iso) return ''
        const d = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
          .format(new Date(iso + 'T00:00:00'))
        return `Harvest ~${d}`
      },
      cardMeta: (barangay, area, season) => `${barangay} · ${area} ha · ${season} season`,
      logActivity: 'Log activity',
      viewHistory: 'View history',
      reportDisaster: 'Report disaster',
      seasonYear: (season, year) => `${season} ${year}`,
    },
    secondary: {
      profileTitle: 'My profile',
      harvestResultsTitle: 'Harvest results',
      assistanceTitle: 'Assistance received',
      backToHome: 'Back',
      quickLinksTitle: 'Quick Links',
    },
    history: {
      title: (cropTitle) => `${cropTitle} — history`,
      loading: 'Loading history...',
      loadError: (recordLabel) => `Unable to load your ${recordLabel}s.`,
      activityLogTitle: 'Activity log',
      logActivity: 'Log activity',
      noActivity: 'No activity logged yet.',
      harvestTitle: 'Harvest',
      recordHarvest: 'Record harvest',
      noHarvest: 'No harvest recorded yet.',
      lateSuffix: ' · Late',
      disasterTitle: 'Disasters',
      manageDisasters: 'Report / view',
      activeDisasterCount: (n) => `${n} active`,
    },
  },

  // ── New Fisherfolk home screen (Batch F) ────────────────────────────────
  fisherfolkHome: {
    loading: 'Loading your ponds...',
    loadError: 'Unable to load your ponds.',
    feedToday: {
      title: 'Feed today',
      overdueBadge: 'Overdue',
      dueTodayBadge: 'Due today',
      dueBadge: (count) => `Due today · ${count} pond${count === 1 ? '' : 's'}`,
      emptyTitle: "You're up to date",
      emptyBody: 'No ponds are due for feeding right now.',
      dueSummary: (count) => `${count} pond${count === 1 ? '' : 's'} due for feeding`,
      lastFed: (feedType, qtyKg, date) => `Last fed: ${feedType || 'Unspecified feed'}${qtyKg ? ` · ${qtyKg} kg` : ''} · ${date}`,
      lastFedPond: (pond, feedType, qtyKg) => `${pond}: ${feedType || 'Unspecified feed'}${qtyKg ? ` · ${qtyKg} kg` : ''}`,
      noPriorFeeding: 'No prior feeding logged for this pond yet.',
      noPriorFeedingPond: (pond) => `${pond}: no prior feeding logged yet.`,
      repeatButton: "Repeat yesterday's feeding",
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
      title: 'My ponds',
      empty: "You don't have any ponds on file yet. Visit the office to have one started.",
      unstockedLabel: 'Not currently stocked',
      pondSpecies: (pond, species) => `${pond} · ${species}`,
      areaFingerlings: (area, count) => `${area} ha · ${count} fingerlings`,
      progressDayOf: (elapsed, total) => `Day ${elapsed} of ${total}`,
      logFeeding: 'Log feeding',
      logActivity: 'Log activity',
    },
    secondary: {
      illnessTitle: 'Log illness or mortality',
      disasterTitle: 'Report disaster',
    },
    pondPicker: {
      title: 'Select a Pond',
      subtitle: 'Which pond is this about?',
      disasterSubtitle: 'Which pond does this disaster affect?',
      noPonds: 'No stocked ponds to report against.',
    },
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
    // Rendered under the date buttons so the chosen day is always stated
    // in full, not just implied by which button is lit. Date formatting
    // lives here with the rest of the language-dependent text.
    dateResolved: (iso) => {
      if (!iso) return ''
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      }).format(new Date(iso + 'T00:00:00'))
    },
    selectPlaceholder: 'Select…',
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

  // ── CitizenDisasterScreen ────────────────────────────────────────────────
  // Evaluator-parity batch: report + status-track + recover disasters on the
  // citizen's own record. One screen, two internal modes ('list' shows
  // existing reports with Mark Recovered; 'create' is the report form) —
  // see CitizenDisasterScreen.jsx for why these share one component instead
  // of being split into a modal + a separate history view.
  disaster: {
    title: 'Disasters',
    reportButton: 'Report Disaster',
    backToList: 'Back to list',
    empty: 'No disaster reports on this record.',
    loading: 'Loading disaster reports...',
    loadError: 'Something went wrong loading this — please try again.',
    retry: 'Try again',
    statusActive: 'Active',
    statusRecovered: 'Recovered',
    statusTotalLoss: 'Total Loss',
    totalLossNotice: 'Marked as a total loss — this record\'s production cycle has ended.',
    recoveredOn: (dateStr) => `Recovered ${dateStr}`,
    fields: {
      disasterType: 'Disaster type',
      dateOfOccurrence: 'Date of occurrence',
      areaAffected: 'Area affected (ha)',
      estimatedDamage: 'Estimated damage',
      productionLoss: 'Estimated production loss',
      isTotalLoss: 'This is a total loss',
      isTotalLossHint: 'The crop/stock was completely destroyed and this cycle is ending. This cannot be undone from here — contact the OMAg office to correct it.',
      recoveryNote: 'Recovery note',
      recoveryNoteHint: 'Required unless every recommended response for this disaster has already been logged.',
    },
    errors: {
      dateRequired: 'Date of occurrence is required.',
      specifyType: 'Please specify the disaster type.',
      areaAffectedRequired: 'Area affected is required.',
      areaAffectedInvalid: 'Area affected must be greater than 0.',
      areaAffectedExceeds: (recordArea) => `Area affected cannot exceed the ${recordArea} ha on record.`,
      lockedByOther: 'Someone else is currently logging this record. Please wait.',
      genericSaveError: 'Unable to save disaster report.',
      recoveryNoteRequired: 'A recovery note is required when not all recommended responses have been completed.',
      genericRecoverError: 'Unable to mark this as recovered.',
    },
    submit: 'Submit Report',
    submitSuccess: 'Disaster report submitted.',
    markRecovered: 'Mark Recovered',
    confirmRecovery: 'Confirm Recovery',
    recovering: 'Marking…',
    recoverSuccess: 'Disaster marked as recovered.',
  },

  // ── MyYieldAnalysisSection ──────────────────────────────────────────────
  // ── CitizenProfileScreen ───────────────────────────────────────────────
  // Read-only registry view. Every field label lives here; the screen itself
  // decides whether a row appears at all (see BLANK_VALUES in the component).
  profile: {
    title: 'My Profile',
    roleFarmer: 'Farmer',
    roleFisherfolk: 'Fisherfolk',
    groups: {
      registry: 'REGISTRY IDENTITY',
      contact: 'CONTACT',
    },
    fields: {
      rsbsaNumber: 'RSBSA number',
      fishrNumber: 'FishR number',
      lguRegistrationNumber: 'LGU registration no.',
      barangay: 'Barangay',
      civilStatus: 'Civil status',
      fisherfolkType: 'Fishery activity',
      highestEducation: 'Highest education',
      contactNumber: 'Contact number',
    },
    officeNotice: 'To update any of this information, please visit the OMAg office.',
  },

  yieldAnalysis: {
    loading: 'Loading your yield analysis...',
    empty: 'No harvested or total-loss records yet — this section fills in once a cycle is complete.',
    // Deliberately distinct from `empty` above. Before this, the fetch had
    // no .catch(), so `data` stayed null on failure and fell through to the
    // same "nothing harvested yet" branch — a real outage and an honest
    // empty state rendered identically, with no way for the citizen (or
    // support) to tell them apart.
    loadError: 'Something went wrong loading this — please try again.',
    retry: 'Try again',
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
    distributeToOrg: 'Distribute to All Members',
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

  // ── CitizenDistributeToOrgModal ─────────────────────────────────────────
  distributeAssistance: {
    title: 'Distribute to All Members',
    subtitle: (personLabelLower) => `Create one assistance record for every current ${personLabelLower} member of your organization.`,
    reviewButton: 'Review Distribution',
    confirmButton: 'Confirm & Distribute',
    back: 'Back',
    done: 'Done',
    currentMembers: 'Current members',
    assistanceSummary: 'Assistance',
    willSkip: (count) => `${count} member(s) will be skipped`,
    willFlag: (count) => `${count} member(s) flagged for review`,
    willReceive: (count) => `${count} member(s) will receive a new record. This cannot be undone automatically — review carefully before confirming.`,
    fields: {
      assistanceType: 'Assistance Type',
      dateGiven: 'Date Given',
      quantity: 'Quantity (per member)',
      sourceAgency: 'Source Agency',
      season: 'Season',
      description: 'Description',
      program: 'Attach to a formal program (optional)',
      programHelp: 'A member already enrolled in this program will be skipped, not blocked.',
      programNone: 'No program — standalone record',
    },
    errors: {
      requiredFields: 'Assistance type and date are required.',
      specifySourceAgency: 'Please specify the source agency.',
      previewFailed: 'Failed to preview distribution.',
      distributeFailed: 'Failed to distribute assistance.',
    },
    resultSummary: (created, skipped, errors) => `${created} created · ${skipped} skipped · ${errors} errors`,
    statusCreated: 'Created',
    statusSkipped: 'Skipped',
    statusError: 'Error',
  },
}

export default labels
