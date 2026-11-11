// Batch E — every user-facing string on the citizen self-service pages
// (src/pages/Citizen/**), centralized here as named keys. Nothing below may
// be hardcoded inside a component — every citizen-facing label, button,
// heading, empty state, and error message renders from this file, so
// changing the portal's wording is a ONE-FILE change here rather than a
// component-by-component refactor.
//
// LANGUAGE: English only. (The portal used to be written in Tagalog; the key
// names such as navSakuna, qaTulong and farmerAni are kept so no component
// had to change, but every value is English now.)
//
// NOT included here: activity/assistance-type CHOICE VALUES (e.g.
// 'Fertilizer Application', 'Pest Control') defined in citizenDomainConfig.js
// and orgDomainConfig.js. Those are stored verbatim in the database and
// matched against staff-side data (e.g. the suggestion engine compares
// activity_type against CropActivityStage.stage_name) — changing the
// VALUE would silently break that matching and staff/citizen data
// consistency. Where a map below is keyed BY such a value (outcomeOptions,
// plantConditionOptions, severityOptions), only the displayed text is
// written here; the key is left exactly as the database stores it.

// Locale for every date rendered on the citizen screens. Single constant so
// the portal's date language is a one-file change as well.
export const DATE_LOCALE = ['en-PH']

export const labels = {
  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    saveChanges: 'Save changes',
    edit: 'Edit',
    close: 'Close',
    toggleSidebar: 'Toggle sidebar',
    unknown: '—',
    loggedByStaff: 'Logged by staff',
    // The caller renders the locker's name in its own <strong> tag, so
    // these are the surrounding text only, not a full templated sentence.
    lockedByOtherSuffix: 'is currently logging this. Please wait',
    lockedByOtherMinutes: (mins) => ` (~${mins} min)`,
    genericSaveError: 'Could not save. Please try again.',
    // Batch 2: shared short-date renderer for anywhere a stored ISO date is
    // shown to a citizen. Goes through DATE_LOCALE like every other date on
    // these screens, so a raw '2026-08-09' never reaches the page.
    formatDate: (iso) => {
      if (!iso) return '—'
      const d = new Date(`${iso}T00:00:00`)
      if (Number.isNaN(d.getTime())) return iso
      return new Intl.DateTimeFormat(DATE_LOCALE, {
        day: 'numeric', month: 'short', year: 'numeric',
      }).format(d)
    },
  },

  header: {
    appName: 'OMAg Aringay',
    tagline: 'My Account',
    logOut: 'Log out',
    profileNav: 'My Profile',
  },

  // ── Mobile tab bar (< 640px only) ──────────────────────────────────────
  // New farmer/fisheries reference: FIVE tabs, and the two domains carry
  // DIFFERENT sets — a farmer logs activities and reports disasters, a
  // fisherfolk logs feeding and reports pond health.
  tabBar: {
    ariaLabel: 'Main navigation',
    home: 'HOME',
    // Farmer
    farmerActivity: 'ACTIVITY',
    farmerDisaster: 'DISASTER',
    farmerHarvest: 'HARVEST',
    // Fisherfolk
    fishLog: 'LOG',
    fishHealth: 'HEALTH',
    fishReport: 'REPORT',
    // Both
    profile: 'PROFILE',

    // Superseded by the five-tab sets above, still consumed by the current
    // three-tab wiring in FarmerHomeScreen/FisherfolkHomeScreen. They go
    // when those screens are rebuilt and their tabs are re-pointed.
    harvests: 'Harvests',
    myInfo: 'My info',
  },

  // Farmer citizen redesign (2026-09-29): chrome copy.
  farmerChrome: {
    tabs: {
      home: 'Home',
      activity: 'Report activity',
      disaster: 'Report disaster',
      results: 'Harvest results',
      assistance: 'Assistance',
    },
    nav: {
      home: 'Home',
      log: 'Log',
      disaster: 'Disaster',
      results: 'Harvest',
      assistance: 'Assistance',
    },
    menu: {
      viewProfile: 'View Profile',
      help: 'Help',
      logout: 'Log out',
    },
  },

  // Farmer disaster form addition.
  farmerDisaster: {
    totalLoss: 'This is a total loss.',
    reportNew: '+ Report a disaster',
    affectedMeta: (date, ha, crop) => [date, `${ha} ha affected`, crop].filter(Boolean).join(' · '),
  },

  // Farmer harvest (results) screen additions.
  farmerAni: {
    none: 'None',
    viewHistory: 'View history',
  },

  // Farmer Home screen.
  farmerHomeNew: {
    statParcels: 'Farm parcels',
    statActiveCrops: 'Active crops',
    statArea: 'Total area',
    statHarvestsThisMonth: 'Harvests this month',
    attentionTitle: (n) => `${n} crop${Number(n) === 1 ? '' : 's'} need${Number(n) === 1 ? 's' : ''} attention`,
    attentionBody: 'You have tasks scheduled for today.',
    attentionCta: 'View',
    active: 'Active',
    parcel: (n) => `Parcel ${n}`,
    suggestionsTitle: 'Activity Suggestions',
    suggestionNext: (activity) => `${activity} is recommended next.`,
    logThis: 'Log this',
  },

  // Farmer assistance screen.
  farmerAssistance: {
    awaitingHeading: 'Awaiting your confirmation',
    upcomingHeading: 'Upcoming',
    receivedHeading: 'Received',
    awaitingPill: 'Awaiting Confirmation',
    upcomingPill: 'Upcoming',
    confirmedPill: 'Confirmed',
    notReceivedPill: 'Not Received',
    resolvedPill: 'Resolved',
    confirmCta: 'Confirm received',
    notReceivedCta: 'Not received',
    expectedOn: (d) => `Expected on ${d}`,
    confirmedOn: (d) => `Confirmed ${d}`,
    days: (n) => `${n} day${Number(n) === 1 ? '' : 's'}`,
    confirmTitle: 'Confirm assistance',
    proofPhoto: 'Proof photo (optional)',
    note: 'Note',
    cancel: 'Cancel',
    confirm: 'Confirm',
    reportTitle: 'Not received',
    reason: 'Reason',
    submit: 'Submit',
  },

  // Farmer crop history screen.
  farmerHistory: {
    back: 'Back to results',
    activities: 'Activities',
    logActivity: 'Log an activity',
    disasters: 'Disasters',
    lastHarvest: 'Last harvest',
    edit: 'Edit',
    recordHarvest: 'Record harvest',
    harvestMeta: (date, mt) => `${date} · ${mt} MT`,
  },

  // New farmer/fisheries screens.
  ffNew: {
    greetingMorning: 'Good morning,',
    headerMeta: (brgy, rsbsa) => `Brgy. ${brgy} · RSBSA ${rsbsa}`,
    footer: (dateText) => `${dateText} · OMAg Aringay`,

    needsAttention: 'Needs Attention',
    badgeOverdue: 'OVERDUE',
    badgeDueToday: 'DUE TODAY',
    overdueDays: (n) => `${n} day${Number(n) === 1 ? '' : 's'} overdue`,

    activeCrops: 'ACTIVE CROPS',
    activePill: 'ACTIVE',
    cropProgress: 'Progress to harvest',
    daysLeft: (n, dateText) => `${n} day${Number(n) === 1 ? '' : 's'} left · ${dateText}`,
    logActivity: 'Log Activity',
    reportDisaster: 'Report Disaster',

    myPonds: 'MY PONDS',
    feedingNow: 'Feeding Now',
    pondCount: (n) => `${n} pond`,
    lastFeed: (dateText, feed, qty) => `Last feeding: ${dateText} · ${feed} · ${qty}`,
    pondProgress: 'Progress',
    fingerlings: (n) => `${n} fingerlings`,
    noStock: 'No stock',
    needsFeeding: 'Needs feeding',
    logActivityCta: '+ Log Activity',

    // Every record already carries an owner, so an empty state here means
    // the office has not registered anything for this person yet.
    noCrops: 'No crops registered yet. Please contact the Office of the Municipal Agriculturist.',
    noPonds: 'No ponds registered yet. Please contact the Office of the Municipal Agriculturist.',
    allClear: 'Nothing needs action today.',

    // The reference tags every history row with who logged it, as a pill,
    // not only the staff-logged ones. Both states are backed: the log
    // serializers expose recorded_by / logged_by, compared against the
    // citizen's own user id.
    loggedByStaff: 'LOGGED BY STAFF',
    loggedByYou: 'LOGGED BY YOU',

    // Log screen. The reference draws THREE activity cards, but the system
    // supports nine and six of the others are in active use (Sampling 64,
    // Pond Preparation 20, Stocking 19 ...). Copying it literally would make
    // those unloggable, so the three keep their prominent cards and 'More'
    // reveals the rest. Nothing is lost; the reference's shape is kept.
    // ── Desktop shell ─────────────────────────────────────────────────
    // A genuinely different desktop information architecture: persistent
    // left sidebar, topbar, two-column body with a right rail.
    desktop: {
      appNameFarmer: 'OMAg Farmer',
      appNameFisherfolk: 'OMAg Fisherfolk',
      municipality: 'Aringay, La Union',

      navHome: 'Home',
      navLog: 'Log',
      navSakuna: 'Disaster',
      navKaramdaman: 'Illness',
      navAni: 'Harvest',
      navTulong: 'Assistance Received',

      greeting: (name) => `Good evening, ${name}!`,
      greetingMorning: (name) => `Good morning, ${name}!`,

      accountProfile: 'My Profile',
      accountHelp: 'Help',
      accountLogout: 'Log out',

      needsAttention: 'Needs Attention',
      overdueTag: (n) => `${n} day${Number(n) === 1 ? '' : 's'} overdue`,
      dueNowTag: 'Now',
      logCta: 'Log',

      activeCrops: 'Active Crops',
      activePonds: 'My Ponds',
      cycleProgress: 'Growing season progress',
      expectedHarvest: 'Expected Harvest',
      logActivityInline: '+ Log Activity',

      quickActions: 'Quick Actions',
      qaSakuna: 'Disaster Report',
      qaSakunaSub: 'Report crop damage',
      qaSakunaSubFish: 'Fish kill, flood, pollution',
      qaAni: 'Harvest Results',
      qaAniSub: 'History of all harvests',
      qaAniSubFish: 'History per pond',
      qaKaramdaman: 'Illness / Mortality',
      qaKaramdamanSub: 'Log illness or mortality',
      qaTulong: 'Assistance Received',
      qaTulongSub: 'Seeds, fertilizer, and equipment',
      qaTulongSubFish: 'Fingerlings, nets, and equipment',

      farmSummary: 'Farm Summary',
      farmSummaryActiveCrops: 'Active Crops',
      farmSummaryNeedsAttention: 'Needs Attention',
      farmSummaryArea: 'Total Area',
      farmSummaryPlantedThisYear: 'Planted This Year',

      fisherySummary: 'Fishery Summary',
      fisherySummaryActivePonds: 'Active Ponds',
      fisherySummaryTotalFish: 'Total Fish',
      fisherySummaryArea: 'Total Area',
      fisherySummaryEmptyPonds: 'Empty Ponds',

      selectedCrop: 'Selected Crop',
      selectedCropHint: 'Select a crop to see its details.',
      selectedPond: 'Selected Pond',
      selectedPondHint: 'Select a pond to see its details.',

      cropInsuranceHeading: 'CROP INSURANCE',
      cropInsuranceBody: 'After submitting, contact OMAg about a PCIC crop insurance claim.',
      fishInsuranceHeading: 'FISH INSURANCE',
      fishInsuranceBody: 'After submitting, contact BFAR or OMAg about a fish loss insurance claim.',

      tandaanHeading: 'REMINDERS',
      tandaanEditable: 'You can edit any entry on your record, including those logged by field staff.',
      tandaanDateDefault: 'The date defaults to today. Use “Yesterday” for an activity that was not recorded right away.',
      tandaanFeedDaily: 'Feed Monitoring is for daily logging.',
      tandaanDiseaseUnusual: 'Use Disease Control for unusual situations.',
      loggedByYouNote: 'You will be logging this yourself. You can change any entry, even those made by field staff.',

      helpAssistance: 'ASSISTANCE RECEIVED',
      helpAssistanceSubtitle: 'Most recent first',
      assistanceSummary: 'Assistance Summary',
      assistanceTotalCount: 'Total Assistance',
      assistanceRecordedEntries: 'Recorded entries',
      assistanceProvidedBy: 'Provided By',
      assistanceReadOnly: 'Read-only · For questions, contact OMAg',
      assistanceInfoHeading: 'INFORMATION',
      assistanceInfoBody: 'This list is updated automatically by OMAg whenever you receive new assistance. For questions, contact the office.',
      assistanceInfoBodyFish: 'This list is updated automatically by OMAg and BFAR whenever you receive new assistance.',
      assistanceEmpty: 'No assistance has been recorded for you yet.',
      assistanceAwaitingBadge: 'Confirm received',
      assistanceConfirmReceived: 'I received it',
      assistanceReportNotReceived: 'I have not received it',
      assistanceReasonLabel: 'Reason',
      assistanceReasonPlaceholder: 'Describe why you have not received it yet…',
      assistanceReasonRequired: 'A reason is required.',
      assistanceReportSubmit: 'Submit Report',
      assistanceCancel: 'Cancel',
      assistanceConfirmedToast: 'Confirmed as received.',
      assistanceReportedToast: 'Reported as not received.',
      assistanceActionFailed: 'Something went wrong. Please try again.',
      assistanceNotReceivedNote: 'You reported that you have not received this. OMAg is following up.',

      karamdamanTitle: 'Illness / Mortality',
      karamdamanSubtitle: 'For unusual situations only — this is not a regular feeding log',
      karamdamanPond: 'Pond',
      karamdamanType: 'Type of Illness',
      karamdamanMortality: 'Number Dead',
      karamdamanCause: 'Possible Cause',
      karamdamanCauseOtherPlaceholder: 'Describe the cause…',
      karamdamanDisposal: 'Disposal Method',
      karamdamanDisposalOtherPlaceholder: 'Describe the method…',
      karamdamanTreatment: 'Treatment Given',
      karamdamanTreatmentPlaceholder: 'Enter the action or treatment you took…',
      karamdamanTreatmentHint: 'This is free text. With or without a suggestion, you decide what you did',
      karamdamanConsulted: 'Did you consult a veterinarian or BFAR?',
      karamdamanConsultedYes: 'Yes, already talked to them',
      karamdamanConsultedNo: 'Not yet',
      karamdamanConsultedScheduled: 'Scheduled',
      karamdamanSave: 'Save Record',
      karamdamanMahalaga: 'IMPORTANT',
      karamdamanMahalagaBody: 'This screen is for unusual illness and mortality only. It is not an ordinary feeding log. For regular feeding, use Log Activity.',
      karamdamanVetContact: 'VETERINARY CONTACT',
      karamdamanVetContactBody: 'For emergency advice from BFAR, contact OMAg and you will be referred to the right expert.',

      profileGovIds: 'Government IDs and Account Information',
      profileGovIdsNote: 'To correct any ID number, contact OMAg or BFAR.',
      profileFieldsPending: 'Fields That Need a Request',
      profileFieldsPendingNote: 'The office reviews these changes before applying them. They cannot be changed again while a request is pending.',
      profileRequestBtn: 'Request',
      profileContactHeading: 'Contact Number — Changes Immediately',
      profileContactNote: 'Does not need office approval',
      profileChangeBtn: 'Change',
      profileAccountInfo: 'Account Information',

      feedMonitoring: 'Feed Monitoring',
      diseaseControl: 'Disease Control',
      waterCondition: 'Water Condition',
      fishCondition: 'Fish Condition',
      feedTypeField: 'Feed Type',
      feedBrand: 'Feed Brand / Name',
      feedBrandHint: 'e.g. Tateh, Shur-Gain, local feed — or describe it if there is no brand',
      feedAmount: 'Amount (kg)',
    },

    // ── Disaster / Report additions ───────────────────────────────────
    sakuna: {
      // Domain-specific: crop says "crop", fisheries says "pond".
      introCrop: 'Report damage to your crop. You can report a Total Loss if the crop was completely destroyed.',
      introFisheries: 'Report a disaster at your pond. You can report a Total Loss if the pond was completely destroyed.',
      viewHistory: 'View reported disasters',

      damageLevel: 'DAMAGE LEVEL',
      // Semantic, not decorative: Low is tinted green, Medium amber and
      // High red, so the band reads at a glance.
      damageOptions: { Low: 'Low', Medium: 'Medium', High: 'High' },

      // Recovery is a two-step: the button appears once every
      // recommendation is logged, and only then does it open the required
      // reason. Keeping the reason behind the button stops a half-filled
      // box sitting under every active disaster.
      markRecovered: 'Mark as Recovered',
      recoverQuestion: 'How did it recover?',
      recoverRequired: '(This is required.)',
      recoverConfirm: 'Confirm',
      recoverBack: 'Back',
      recoveredLabel: 'Recovered',

      reportedTitle: 'Reported!',
      reportedBody: 'The disaster has been recorded. The recommendations are shown above.',
      reportAnother: 'Report another',
    },

    // ── My Profile ────────────────────────────────────────────────────
    profile: {
      title: 'My Profile',
      subtitle: 'Information from the OMAg registry',
      editCta: 'Edit Profile',

      verifiedFarmer: 'Registered Farmer',
      verifiedFisherfolk: 'Registered Fisherfolk',

      rsbsa: 'RSBSA NUMBER',
      // The registry number is the identity key the whole system joins on;
      // it is never a self-service edit, hence the standing note.
      rsbsaNote: 'Cannot be changed. Contact OMAg to have it corrected.',
      fullName: 'FULL NAME',
      barangay: 'BARANGAY',
      contact: 'CONTACT NUMBER',
      identityNameEyebrow: 'NAME',

      // This row is labelled differently per domain: "Fishery" for
      // fisherfolk, "Type" for farmer -- kept as two keys rather than one
      // shared string so each side reads as drawn.
      activityTypeMiniFisherfolk: 'FISHERY',
      activityTypeMiniFarmer: 'TYPE',
      farmLaborer: 'Farm Laborer',
      regularFarmer: 'Farmer',

      // Role pill in the identity card cover.
      roleBadgeFarmer: 'Farmer',
      roleBadgeFisherfolk: 'Fisherfolk',
      roleSubtitleFarmer: 'Farmer',
      roleSubtitleFisherfolk: 'Fisherfolk',

      // Field-status legend (three fixed states). This is deliberately its
      // own copy from labels.farmerHelp.behaviors* -- that block is the Help
      // screen's legend, a different screen with different wording; this is
      // the profile screen's own legend bar sitting directly under the
      // identity row.
      legendInstant: 'Instant Change',
      legendApproval: 'Needs Approval',
      legendLocked: 'Cannot Be Changed',

      personalInfoHeading: 'Personal Information',
      referenceInfoHeading: 'Reference Information',
      referenceInfoReadOnlyNote: 'Reference Information (Read-only)',
      birthdateLabel: 'Date of Birth',
      civilStatusLabel: 'Civil Status',
      educationLabelDesktop: 'Education Level',
      educationLabelMobile: 'Highest Education Level',
      statusFlagsLabel: 'Status Flags',
      pwdLabel: 'PWD',
      fourPsLabel: '4Ps Beneficiary',
      // Always shown, even when empty -- see CitizenProfileScreen's
      // Reference Information card, which renders this row unconditionally
      // rather than hiding it under the hide-empty rule the other rows use.
      organizationLabel: 'Organization',
      organizationNone: 'Not a member of any organization',
      civilStatusOptions: {
        Single: 'Single',
        Married: 'Married',
        Widowed: 'Widowed',
        Separated: 'Separated',
      },

      requestModalCurrentLabel: 'Current',
      requestModalNewLabel: 'New value',
      requestModalSubmit: 'Submit request',
      contactEditSave: 'Save',
      contactEditCancel: 'Cancel',

      // Pending-change panel (ProfileChangeRequest).
      pendingHeading: 'Pending Review',
      pendingRequested: (value) => `Requested change to: ${value}`,
      pendingSubmitted: (dateText) => `Submitted: ${dateText}`,
      pendingNote: 'Waiting for approval. It cannot be changed again while waiting.',

      footerLine1: 'For questions, please contact the',
      footerLine2: 'Office of the Municipal Agriculturist · Aringay, La Union',

      helpRowLabel: 'Help',

      // Edit sheet. Kept to exactly what the backend supports, and says
      // plainly which changes are instant and which need review.
      editTitle: 'Edit Profile',
      editSubtitle: 'Only some parts can be changed by you directly.',
      editContactLabel: 'CONTACT NUMBER',
      editContactNote: 'Changes immediately.',
      editReviewHeading: 'NEEDS APPROVAL',
      editReviewNote: 'Changes to your name and barangay are reviewed by OMAg first.',
      editFirstName: 'FIRST NAME',
      editMiddleName: 'MIDDLE NAME',
      editLastName: 'LAST NAME',
      editBarangay: 'BARANGAY',
      editSave: 'Save',
      editCancel: 'Cancel',
      editSubmitted: 'Your request has been submitted.',
      editContactSaved: 'Your contact number has been updated.',
      editNothing: 'Nothing was changed.',
      editPendingBlocked: 'A request for this part is already pending.',

      // Password card — voluntary, not a forced first-login step. Staff
      // already generated and relayed the first password in person; this
      // is just a genuinely reachable way to set a new one, any time.
      passwordCardHeading: 'Password',
      passwordCardNote: 'Optional. You can change your password any time — it is not required.',
      passwordCurrentLabel: 'CURRENT PASSWORD',
      passwordNewLabel: 'NEW PASSWORD',
      passwordConfirmLabel: 'CONFIRM NEW PASSWORD',
      passwordChangeCta: 'Change Password',
      passwordMismatch: 'The new password and the confirmation do not match.',
      passwordChanged: 'Your password has been changed. Please log in again with your new password.',
    },

    // ── Harvest Results ───────────────────────────────────────────────
    // Backward-looking only. The intro says so explicitly because the same
    // numbers feed the staff-side forecasting screens, and a citizen must
    // not read this as a prediction or a promise.
    ani: {
      title: 'Harvest Results',
      subtitle: 'Actual compared with the estimate made at planting',
      intro: 'This shows how each past crop turned out — no forecast or promise for the future. The estimated harvest is based on the area planted and the typical yield per hectare.',

      meta: (ha, brgy, dateText) => [ha ? `${ha} ha` : null, brgy ? `Brgy. ${brgy}` : null, dateText]
        .filter(Boolean).join(' · '),

      actual: 'Actual harvest',
      estimated: 'Estimated at planting',

      // The same "slightly below" sentence is used for a -7% and a -20%
      // card, so there is one below-estimate string, not a severity ladder.
      verdictAbove: 'The actual harvest was above the estimate — a good result for this crop.',
      verdictBelow: 'The actual harvest was slightly below the estimate. This is the result for this crop.',
      verdictOnTarget: 'The actual harvest matched the estimate for this crop.',
      verdictNoEstimate: 'No estimated harvest was recorded for this crop, so there is nothing to compare.',
      verdictTotalLoss: 'This crop was recorded as completely destroyed, so it is not compared with the estimate.',

      factorsHeading: 'POSSIBLE RELATED FACTORS',
      // scheduled_day is a day offset from planting; the month it fell in is
      // derived here from date_planted + offset rather than asking the
      // backend for a second representation.
      factorItem: (activity, monthText) => `${activity}${monthText ? ` (${monthText})` : ''} — not logged`,
      factorsFootnote: 'This is listed for information only — it does not confirm that this is the reason for the difference.',

      empty: 'No harvest has been recorded yet. The result will appear here after your harvest is recorded.',
      loadError: 'Harvest results cannot be loaded right now. Please try again later.',
    },

    // ── Farmer ACTIVITY screen ────────────────────────────────────────
    // Structurally different from the fisherfolk log: a CROP dropdown
    // (not cards), a 2x2 grid of activity pills (not icon rows), three
    // date pills where the third reveals a picker, per-type fields, and a
    // collapsible history at the bottom.
    farmerLog: {
      title: 'Log Activity',
      cropHeading: 'Crop',
      cropOption: (name, ha, brgy) => `${name} — ${ha} ha, Brgy. ${brgy}`,

      activityHeading: 'Type of Activity',
      // Keys are the values actually stored in activity_type. Three of the
      // four are already in live data and in the serializer's own
      // special-casing ('Pest Control', 'Disease Control'); the citizen form
      // previously offered 'Pesticide Application', which matched neither,
      // so a citizen's pest log silently skipped the area-affected rule.
      types: {
        'Fertilizer Application': 'Fertilizer Application',
        'Pest Control': 'Pest Control',
        'Disease Control': 'Plant Disease Control',
        'Water Quality Check': 'Water Quality Check',
        Other: 'Other',
      },
      // 'Other' is drawn as a fifth tile in the same grid. It is needed: 30
      // distinct activity_type values are in live use and the four tiles
      // cover only three of them.
      otherPlaceholder: 'Describe the type of activity…',

      dateHeading: 'Date of activity',
      dateToday: 'Today',
      dateYesterday: 'Yesterday',
      dateOther: 'Another date',

      fertilizerType: 'Type of fertilizer',
      // The select options are the model's own documented examples
      // (CropActivityLog.fertilizer_type help_text) with a free-text
      // fallback rather than an invented catalogue.
      fertilizerOptions: ['14-14-14 NPK', 'Urea (46-0-0)', 'Organic / Compost'],
      quantityKg: 'Amount',
      unit: 'Unit',
      quantityPlaceholder: 'e.g. 25',
      applicationMethod: 'Method of application',
      methodOptions: {
        Broadcast: 'Broadcast (scattered)',
        Basal: 'Basal (at the plant)',
        'Side-dress': 'Side-dress (along the side)',
        'Foliar Spray': 'Foliar spray (leaves)',
        Fertigation: 'Fertigation (in the water)',
      },

      pestName: 'Name of the pest',
      pestPlaceholder: 'e.g. Stem Borer, Brown Plant Hopper',
      pestTreatment: 'Pesticide / remedy used',
      pestTreatmentPlaceholder: 'e.g. Chlorpyrifos, Fipronil',

      diseaseName: 'Type of disease',
      diseasePlaceholder: 'e.g. Blast, Tungro, Bacterial Leaf Blight',
      diseaseTreatment: 'Fungicide / medicine used',
      diseaseTreatmentPlaceholder: 'e.g. Mancozeb, Tricyclazole',

      damageLevel: 'Damage level',
      damageOptions: { Low: 'Low', Medium: 'Medium', High: 'High' },

      plantCondition: 'Plant condition',
      conditionOptions: { Good: 'Good', Fair: 'Fair', Poor: 'Poor' },
      waterQuality: 'Water quality',
      waterOptions: { Good: 'Good', Fair: 'Fair', Poor: 'Poor' },

      notes: 'Notes / observations',
      notesOptional: '(optional)',
      notesPlaceholder: 'What else did you notice in the field today?',

      save: 'Save Activity',
      saveEdit: 'Save changes',
      cancelEdit: 'Cancel editing',

      historyHeading: 'Activity History',
      historyEmpty: 'No activity has been recorded for this crop yet.',
      editBtn: 'Edit',
      selectPlaceholder: 'Please select…',
      noCrops: 'No crops registered yet. Please contact the Office of the Municipal Agriculturist.',
    },

    // ── Health Log ────────────────────────────────────────────────────
    // Its own three-step screen, NOT a field inside the activity log. Step 1
    // pond, step 2 illness, step 3 the form, then a confirmation.
    health: {
      title: 'Health Log',
      subtitle: 'Fish illness or deaths',
      notice: 'Use this for illness, parasites, or widespread fish deaths. For regular feeding, use Log Activity.',
      pondQuestion: 'Which pond is affected?',
      selectedPond: 'Selected pond',
      illnessQuestion: 'What type of illness or problem?',
      contextLabel: 'Pond · Type of illness',
      noIllnessTypes: 'No illness types have been recorded yet. Please contact OMAg.',

      guideHeading: 'GENERAL HUSBANDRY SUGGESTIONS',
      // No veterinary/BFAR-referral language — this is containment/
      // husbandry guidance (isolate stock, check water, harvest early to
      // limit spread), not a treatment protocol needing professional
      // sign-off, so the disclaimer no longer points to one.
      guideDisclaimer: 'This is general guidance only, not a specific treatment.',

      observationDate: 'DATE OF OBSERVATION',
      affectedPortion: 'ESTIMATED PORTION OF THE POND AFFECTED',
      // Keys are the stored English values on
      // FisheriesActivityLog.AFFECTED_PORTION_CHOICES; these are display only.
      portionOptions: {
        'Few fish': 'Only a few fish (under 10%)',
        Part: 'Part of the pond (10–30%)',
        Half: 'Half of the pond (30–60%)',
        Most: 'Most of the pond (over 60%)',
        All: 'All of the fish',
      },
      mortality: 'NUMBER DEAD (IF ANY)',
      mortalityPlaceholder: 'e.g. 50',
      possibleCause: 'POSSIBLE CAUSE',
      possibleCauseOtherPlaceholder: 'Describe the cause…',
      disposalMethod: 'DISPOSAL METHOD',
      disposalMethodOtherPlaceholder: 'Describe the method…',
      consulted: 'DID YOU CONSULT A VETERINARIAN OR BFAR?',
      yes: 'Yes',
      no: 'No',
      treatment: 'TREATMENT GIVEN (IF ANY)',
      treatmentPlaceholder: "Describe the treatment given. If you have not done anything yet, you can enter 'None yet.'",
      treatmentDisclaimer: 'The treatment is your own decision and observation — do not base it on the suggestions above without consulting an expert.',
      extraNotes: 'ADDITIONAL NOTES (OPTIONAL)',
      extraNotesPlaceholder: 'Any other observations…',
      escalation: 'For severe or widespread fish deaths, contact OMAg or the BFAR regional office right away.',
      save: 'Save Health Log',

      successTitle: 'Recorded',
      successBody: (pond) => `The health log for ${pond} has been saved. You can close this or log another.`,
      logMore: 'Log another',
      backHome: 'Back to Home',
    },

    activityTypeHeading: 'TYPE OF ACTIVITY',
    activityMore: 'More',
    activityMoreSub: 'Sampling, stocking, pond preparation, and more',
    // Water Quality Check readings. Values are stored in English (matching
    // every other choice set in the model); these are the display labels only.
    // Disaster recommendation checklist.
    // Disaster-type tiles. Every value the models actually define is listed:
    // the reference omits Strong Winds (farmer) and Disease Outbreak /
    // Predator Attack (fisherfolk), but Strong Winds carries response rules
    // and the other two appear in live records, so dropping them would make
    // real situations unreportable. Values stay English; these are display.
    // Health. The illness list is the real DiseaseType table (5 rows,
    // seeded earlier), not a hardcoded copy of the reference's list -- they
    // happen to match exactly.
    illnessHeading: 'What type of illness or problem?',
    kalusuganNotice: 'Use this for illness, parasites, or widespread fish deaths. For regular feeding, use Log Activity.',

    disasterTypeHeading: 'TYPE OF DISASTER',
    disasterTypes: {
      Typhoon: 'Typhoon',
      Flood: 'Flood',
      Drought: 'Drought',
      'Pest Outbreak': 'Pest Outbreak',
      'Strong Winds': 'Strong Winds',
      'Fish Kill': 'Fish Kill — widespread fish deaths',
      'Disease Outbreak': 'Disease Outbreak',
      'Pollution Incident': 'Pollution',
      'Predator Attack': 'Predator Attack',
      Other: 'Other',
    },
    disasterOtherPlaceholder: 'Describe the type of disaster…',

    recommendations: 'RECOMMENDATIONS',
    recProgress: (done, total) => `${done}/${total}`,
    recRemaining: (n) => (n === 1 ? '1 step left' : `${n} steps left`),
    recAllDone: 'All steps are done.',
    recNone: 'There are no specific recommendations for this type of disaster.',
    // The tick comes from a LOGGED activity, never from tapping the row --
    // see the note in CitizenDisasterScreen.
    recTapHint: 'Tap to log this step',

    phLevel: 'PH LEVEL',
    phPlaceholder: 'e.g. 7.2',
    dissolvedOxygen: 'DISSOLVED OXYGEN',
    waterClarity: 'WATER CLARITY',
    doOptions: { Low: 'Low', Normal: 'Normal', High: 'High' },
    clarityOptions: {
      Clear: 'Clear',
      'Slightly Turbid': 'Slightly cloudy',
      Turbid: 'Cloudy',
    },

    activitySubtitles: {
      'Feed Monitoring': 'Feeding the fish',
      'Disease Control': 'Managing disease',
      'Water Quality Check': 'Checking the water',
    },
  },

  home: {
    greeting: (name) => `Hello, ${name}`,
    subtitle: (recordTypeLabel) => `Your own account for your record as a ${recordTypeLabel} at the Office of the Municipal Agriculturist.`,
    notLinked: 'Your account is not linked to a record yet. Please visit the office so they can help you.',
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
    // Legacy tab labels — still used by the ORGANIZATION role, which keeps
    // the older tabbed layout (neither home-screen redesign covered it).
    tabs: {
      overview: 'Overview',
      myCropRecords: 'My crops',
      myStockingRecords: 'My stocking records',
      myYieldAnalysis: 'My harvest results',
      myAssistanceHistory: 'Assistance received',
      reportAssistance: 'Report assistance',
    },
    overviewFields: {
      name: 'Name',
      recordType: 'Record type',
      rsbsaNumber: 'RSBSA number',
      registrationNumber: 'Registration number',
      barangay: 'Barangay',
    },
  },

  // ── Farmer home screen ────────────────────────────────────────────────
  farmerHome: {
    rsbsaPrefix: 'RSBSA',
    // TIME-NEUTRAL ON PURPOSE. This string renders at every hour of the day
    // and there is no time-of-day logic behind it — a literal "good morning"
    // would be wrong every afternoon. "Hello" carries the same warmth
    // without asserting the time.
    headerGreeting: 'Hello',
    loading: 'Loading your crops...',
    loadError: 'Your crops could not be loaded.',
    needsAttention: {
      title: 'NEEDS ATTENTION',
      overdueBadge: 'Overdue',
      overdueBadgeDays: (days) => `Overdue · ${days} day${Number(days) === 1 ? '' : 's'}`,
      dueTodayBadge: 'Due today',
      emptyTitle: 'Nothing is missing',
      emptyBody: 'No tasks are needed right now — check again after your next visit to the field.',
      actionLabel: 'Log this task',
      contextLine: (crop, barangay, area) => `${crop} · ${barangay} · ${area} ha`,
    },
    myCrops: {
      title: 'My crops',
      empty: 'No crops are recorded under your name yet. Please visit the office to get started.',
      progressDayOf: (elapsed, total) => `Day ${elapsed} of ${total}`,
      expectedHarvest: (date) => `Expected harvest: ${date}`,
      harvestShort: (iso) => {
        if (!iso) return ''
        const d = new Intl.DateTimeFormat(DATE_LOCALE, { month: 'short', day: 'numeric' })
          .format(new Date(iso + 'T00:00:00'))
        return `Harvest ~${d}`
      },
      // `season` arrives already mapped through harvest.seasonOptions by the
      // caller — this function interpolates a display label, never the raw
      // stored 'Dry'/'Wet' value.
      cardMeta: (barangay, area, season) => `${barangay} · ${area} ha · ${season}`,
      logActivity: 'Log an activity',
      viewHistory: 'View history',
      reportDisaster: 'Report a disaster',
      seasonYear: (season, year) => `${season} ${year}`,
      daysLeft: (n) => `${n} day${Number(n) === 1 ? '' : 's'} left`,
      harvestedBadge: 'Harvested',
    },
    secondary: {
      profileTitle: 'My information',
      harvestResultsTitle: 'My harvest results',
      assistanceTitle: 'Assistance received',
      backToHome: 'Back',
      quickLinksTitle: 'Shortcuts',
    },
    history: {
      title: (cropTitle) => `${cropTitle} — history`,
      loading: 'Loading history...',
      loadError: (recordLabel) => `Your ${recordLabel} could not be loaded.`,
      activityLogTitle: 'Activity log',
      logActivity: 'Log an activity',
      noActivity: 'No activity has been logged yet.',
      harvestTitle: 'Harvest',
      recordHarvest: 'Record harvest',
      noHarvest: 'No harvest has been recorded yet.',
      lateSuffix: ' · Late',
      disasterTitle: 'Disasters',
      manageDisasters: 'Report / view',
      activeDisasterCount: (n) => `${n} active`,
    },
  },

  // ── Fisherfolk home screen ─────────────────────────────────────────────
  fisherfolkHome: {
    loading: 'Loading your ponds...',
    loadError: 'Your ponds could not be loaded.',
    feedToday: {
      title: 'FEED TODAY',
      overdueBadge: 'Overdue',
      dueTodayBadge: 'Due today',
      dueBadge: (count) => `Due today · ${count} pond${Number(count) === 1 ? '' : 's'}`,
      emptyTitle: 'Nothing is missing',
      emptyBody: 'No ponds need feeding today.',
      dueSummary: (count) => `${count} pond${Number(count) === 1 ? '' : 's'} need${Number(count) === 1 ? 's' : ''} feeding`,
      lastFed: (feedType, qtyKg, date) => `Last fed: ${feedType || 'unspecified feed'}${qtyKg ? ` · ${qtyKg} kg` : ''} · ${date}`,
      lastFedPond: (pond, feedType, qtyKg) => `${pond}: ${feedType || 'unspecified feed'}${qtyKg ? ` · ${qtyKg} kg` : ''}`,
      noPriorFeeding: 'No feeding has been logged for this pond yet.',
      noPriorFeedingPond: (pond) => `${pond}: no feeding has been logged yet.`,
      repeatButton: "Repeat yesterday's feeding",
      logSeparatelyLink: 'or log each pond separately',
      // Per-pond actions. Kept short because they sit two-up on a 340px card.
      repeatPond: 'Repeat',
      logDifferentPond: 'Different feed',
      lastRecordedOn: (date) => `Last recorded: ${date}`,
    },
    confirmGuard: {
      title: 'Confirm the feeding',
      body: 'The following will be logged for each pond, dated today:',
      pondLine: (pondName, feedType, qtyKg) => `${pondName}: ${feedType || 'unspecified feed'}${qtyKg ? ` · ${qtyKg} kg` : ''}`,
      confirmButton: 'Confirm and log',
      cancelButton: 'Cancel',
      skippedNote: (count) => `${count} pond${Number(count) === 1 ? ' was' : 's were'} skipped — there is no earlier feeding to repeat. Please log ${Number(count) === 1 ? 'it' : 'them'} one by one below.`,
      partialSuccess: (ok, total) => `Logged ${ok} of ${total} ponds.`,
    },
    myPonds: {
      title: 'My ponds',
      empty: 'No ponds are recorded under your name yet. Please visit the office to get started.',
      unstockedLabel: 'Empty right now',
      pondSpecies: (pond, species) => `${pond} · ${species}`,
      areaFingerlings: (area, count) => `${area} ha · ${count} fingerlings`,
      progressDayOf: (elapsed, total) => `Day ${elapsed} of ${total}`,
      logFeeding: 'Log feeding',
      logActivity: 'Log an activity',
    },
    secondary: {
      illnessTitle: 'Log an illness or deaths',
      disasterTitle: 'Report a disaster',
    },
    pondPicker: {
      title: 'Choose a pond',
      subtitle: 'Which pond is this?',
      disasterSubtitle: 'Which pond was hit by the disaster?',
      noPonds: 'There are no stocked ponds that can be reported.',
    },
  },

  // ── CitizenActivityLogScreen ───────────────────────────────────────────
  activityLog: {
    titleNew: 'Log an activity',
    titleEdit: 'Edit the entry',
    // Shown when opened from a "Needs Attention" task card — the header
    // confirms context instead of asking the user to (re)select it.
    prefilledSubtitle: (cropTitle) => `For ${cropTitle}`,
    fields: {
      activity: 'Activity',
      dateOfActivity: 'Date of activity',
      dateHint: 'When the activity was actually done.',
      notes: 'Notes',
      notesFisheries: 'Notes / observations',
      plantCondition: 'Plant condition',
      fertilizerType: 'Type of fertilizer / input',
      quantityApplied: 'Amount used',
      quantityUnit: 'Unit',
      pestDiseaseName: 'Pest / disease',
      areaAffected: 'Area affected (ha)',
      severity: 'How severe',
      waterFishCondition: 'Water / fish condition',
      feedType: 'Type of feed',
      feedQuantity: 'Amount of feed (kg)',
      feedBrand: 'Feed brand',
      feedRecommended: (stage, feedName) => `Growth stage: ${stage} — recommended: ${feedName}`,
      feedUseRecommended: 'Use this',
      mortalityCount: 'Number dead',
      possibleCause: 'Possible cause',
      possibleCauseOtherPlaceholder: 'Describe the cause…',
      disposalMethod: 'Disposal method',
      disposalMethodOtherPlaceholder: 'Describe the method…',
      vetConsulted: 'Consulted a vet',
      treatmentApplied: 'Treatment given',
      outcome: 'Outcome',
      recommendations: 'Recommendations',
    },
    // Keys are the stored database values — do not change the keys.
    outcomeOptions: {
      Recovered: 'Recovered',
      Ongoing: 'Still ongoing',
      'Losses Incurred': 'Losses incurred',
    },
    dateShortcuts: {
      today: 'Today',
      yesterday: 'Yesterday',
      pickDate: 'Pick a date',
    },
    // Rendered under the date buttons so the chosen day is always stated
    // in full.
    dateResolved: (iso) => {
      if (!iso) return ''
      return new Intl.DateTimeFormat(DATE_LOCALE, {
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
    possibleCauseOptions: {
      Disease: 'Disease',
      'Poor Water Quality': 'Poor water quality',
      'Predator Attack': 'Predator attack',
      'Handling Stress': 'Handling stress',
      Overcrowding: 'Overcrowded pond',
      Unknown: 'Unknown',
      Other: 'Other',
    },
    disposalMethodOptions: {
      Buried: 'Buried',
      Composted: 'Composted',
      Incinerated: 'Burned',
      'Municipal Waste Collection': 'Collected by municipal waste collection',
      Other: 'Other',
    },
    growthStageOptions: {
      Fry: 'Fry',
      Fingerling: 'Fingerling',
      Juvenile: 'Juvenile',
      Adult: 'Adult',
    },
    quantityUnitOptions: {
      kg: 'kg',
      bags: 'bag',
      liters: 'liter',
      sacks: 'sack',
      pieces: 'piece',
    },
    errors: {
      dateRequired: 'The date of the activity is required.',
      specifyActivity: 'Please write what the activity was.',
      specifyFeedType: 'Please write what feed was used.',
      lockedByOther: 'Someone else is logging this right now. Please wait.',
      areaAffectedRequired: 'The area affected is required.',
      areaAffectedInvalid: 'The area affected must be greater than 0.',
      areaAffectedExceeds: (recordArea) => `The area cannot be more than the ${recordArea} ha on record.`,
    },
    submitNew: 'Save entry',
    submitEdit: 'Save changes',
    successNew: 'The activity entry was added.',
    successEdit: 'The activity entry was updated.',
  },

  // ── CitizenHarvestModal ────────────────────────────────────────────────
  harvest: {
    titleNew: 'Record harvest',
    titleEdit: 'Edit harvest',
    // Shown when record.expected_harvest_date exists, for both domains
    // (crop and pond share this one modal) — same "N days" phrasing already
    // established elsewhere (see overdueDays/daysLeft), not new wording.
    expectedHarvestLabel: 'Expected harvest',
    expectedHarvestDaysFromNow: (n) => `${n} day${Number(n) === 1 ? '' : 's'} to go`,
    expectedHarvestDaysAgo: (n) => `${n} day${Number(n) === 1 ? '' : 's'} overdue`,
    // Live comparison against whichever harvest-date field is currently
    // filled in — updates as it's picked, not just a static target date.
    expectedHarvestOnTime: '✓ Matches the expected harvest date.',
    expectedHarvestEarly: (n) => `${n} day${Number(n) === 1 ? '' : 's'} earlier than expected.`,
    expectedHarvestLate: (n) => `${n} day${Number(n) === 1 ? '' : 's'} later than expected.`,
    // Same idea, for the estimated YIELD/quantity (not just the date) —
    // crop_type.yield_per_ha_kg × area_planted_ha for crops,
    // species.default_avg_body_weight_kg-based for ponds, both already on
    // the record.
    estimatedYieldLabel: 'Expected harvest amount',
    estimatedYieldOnTarget: '✓ Matches the expected amount.',
    estimatedYieldAbove: (kg, pct) => `${kg} kg more than expected (${pct}% higher).`,
    estimatedYieldBelow: (kg, pct) => `${kg} kg less than expected (${pct}% lower).`,
    // Shown when the chosen Unit of Measure has no real, standard kg
    // conversion (e.g. "sacks", "bundles") — the comparison above falls
    // back to treating the entered number as kg already.
    estimatedYieldNoConversion: (unit) => `There is no standard kg conversion for "${unit}" — this comparison assumes the number you entered is already in kg.`,
    fields: {
      season: 'Season',
      year: 'Year',
      cropName: 'Crop name',
      harvestStartDate: 'Harvest start',
      harvestEndDate: 'Harvest end',
      areaHarvested: 'Area harvested (ha)',
      volume: 'Amount (kg)',
      unitOfMeasure: 'Unit',
      harvestDate: 'Harvest date',
      quantity: 'Amount (kg)',
      avgBodyWeight: 'Average weight (kg)',
      areaOrUnits: 'Area / units harvested',
      areaOrUnitsHint: 'e.g. Pond 2, 3 cages',
      isFinal: 'This is the final harvest for this cycle',
      earlyLateReason: 'Reason if more than 7 days early or late',
      earlyLateReasonHint: 'Only needed if flagged',
      notes: 'Notes',
    },
    // DISPLAY ONLY. Keys are the stored database values ('Dry'/'Wet') and
    // must not be changed — they are what CropMonitoringRecord.season
    // holds and what the payload sends. Only the visible label is written
    // here.
    seasonOptions: {
      Dry: 'Dry season',
      Wet: 'Wet season',
    },
    unitOptions: {
      kg: 'Kilo (kg)',
      bags: 'Bag (50 kg/bag)',
      cavan: 'Cavan (50 kg/cavan)',
      sacks: 'Sack',
      pieces: 'Piece / head',
      bundles: 'Bundle',
      boxes: 'Box',
      other: 'Other',
    },
    errors: {
      lockedByOther: 'Someone else is logging this right now. Please wait.',
      genericSaveError: 'The harvest could not be saved.',
    },
    submitNew: 'Record harvest',
    submitEdit: 'Save changes',
    successNew: 'The harvest was recorded.',
    successEdit: 'The harvest entry was updated.',
  },

  // ── CitizenDisasterScreen ──────────────────────────────────────────────
  disaster: {
    title: 'Disasters',
    reportButton: 'Report a disaster',
    backToList: 'Back to the list',
    empty: 'No disasters have been recorded for this record.',
    loading: 'Loading reports...',
    loadError: 'Something went wrong — please try again.',
    retry: 'Try again',
    statusActive: 'Active',
    statusRecovered: 'Recovered',
    // "Total Loss" is the official term used on OMAg paperwork and in
    // staff-side screens, and it must read identically across both so a
    // citizen and an evaluator are discussing one thing.
    statusTotalLoss: 'Total Loss',
    totalLossNotice: 'Marked as a total loss — the production cycle of this record is finished.',
    recoveredOn: (dateStr) => `Recovered on ${dateStr}`,
    fields: {
      disasterType: 'Type of disaster',
      dateOfOccurrence: 'Date it happened',
      areaAffected: 'Area affected (ha)',
      estimatedDamage: 'Estimated damage',
      productionLoss: 'Estimated production lost',
      isTotalLoss: 'This is a total loss',
      isTotalLossHint: 'The crop or stock was completely destroyed and this cycle is finished. It cannot be undone here — contact the OMAg office to correct it.',
      isTotalLossNeedsWholeArea: (area) => `Total loss is only possible when the whole area (${area} ha) is affected.`,
      recoveryNote: 'Note about the recovery',
      recoveryNoteHint: 'This is required unless every recommended response for this disaster has been logged.',
      photo: 'Photos (optional)',
      photoHint: 'JPG, PNG, or WEBP, up to 5 MB each. Up to 10 photos.',
    },
    errors: {
      dateRequired: 'The date it happened is required.',
      specifyType: 'Please write what type of disaster it was.',
      areaAffectedRequired: 'The area affected is required.',
      areaAffectedInvalid: 'The area affected must be greater than 0.',
      areaAffectedExceeds: (recordArea) => `The area cannot be more than the ${recordArea} ha on record.`,
      severityRequired: 'The damage level is required.',
      lockedByOther: 'Someone else is logging this right now. Please wait.',
      genericSaveError: 'The disaster report could not be saved.',
      recoveryNoteRequired: 'A note about the recovery is required if the recommended responses are not all done.',
      genericRecoverError: 'It could not be marked as recovered.',
    },
    submit: 'Submit Report',
    submitSuccess: 'The disaster report was submitted.',
    markRecovered: 'Mark as recovered',
    confirmRecovery: 'Confirm recovery',
    recovering: 'Marking…',
    recoverSuccess: 'Marked as recovered.',
  },

  // ── CitizenProfileScreen ───────────────────────────────────────────────
  // Read-only registry view. Every field label lives here; the screen itself
  // decides whether a row appears at all (see BLANK_VALUES in the component).
  profile: {
    title: 'My information',
    roleFarmer: 'Farmer',
    roleFisherfolk: 'Fisherfolk',
    groups: {
      registry: 'REGISTRY INFORMATION',
      contact: 'CONTACT',
    },
    fields: {
      fullName: 'Full name',
      rsbsaNumber: 'RSBSA number',
      fishrNumber: 'FishR number',
      barangay: 'Barangay',
      address: 'Address',
      classification: 'Classification',
      civilStatus: 'Civil status',
      fisherfolkType: 'Type of fishing',
      highestEducation: 'Highest education',
      contactNumber: 'Contact number',
    },
    // Every record in this system belongs to this one municipality, so the
    // municipality/province half of the address is a constant rather than
    // data — see CitizenProfileScreen for why this is safe.
    addressSuffix: 'Aringay, La Union',
    // Longer and more specific than a one-liner: it says WHERE the data
    // comes from, not just where to go.
    officeNotice: 'This information comes from the official government registry. To change it, please visit the Office of the Municipal Agriculturist in person.',
  },

  // ── MyYieldAnalysisSection (harvest results) ───────────────────────────
  yieldAnalysis: {
    title: 'My harvest results',
    subtitle: 'What actually happened with each harvest',
    loading: 'Loading your harvest results...',
    empty: 'No completed harvest or total loss yet — this fills in once a cycle is finished.',
    // Deliberately distinct from `empty` above: a real outage and an honest
    // empty state must not render identically.
    loadError: 'Something went wrong — please try again.',
    retry: 'Try again',
    // Card panel headings (small caps in the UI).
    estimatedLabel: 'ESTIMATE',
    actualLabel: 'ACTUAL',
    // Status pills. `totalLossBadge` stays the same English term as
    // disaster.statusTotalLoss.
    aboveEstimateBadge: 'Above estimate',
    belowEstimateBadge: 'Below estimate',
    totalLossBadge: 'Total Loss',
    // Footer trend lines.
    aboveTrend: (pct) => `${pct}% higher than the original estimate`,
    belowTrend: (pct) => `${pct}% lower than the original estimate`,
    onTargetTrend: 'Equal to the original estimate',
    totalLossTrendCrop: 'The crop was lost — no harvest was recorded',
    totalLossTrendFisheries: 'The stock was lost — no harvest was recorded',
    // Kept from the table version rather than dropped: the activity count
    // moves into a quiet footer line instead of its own column.
    activitiesLine: (done, total) => `${done} of ${total} activities completed`,
    // Card meta line: area + barangay + date, whichever are present.
    cropCropLabel: 'Crop',
    cropDateLabel: 'Date planted',
    fisheriesCropLabel: 'Species',
    fisheriesDateLabel: 'Date stocked',
  },

  // ── MyAssistanceHistorySection ─────────────────────────────────────────
  assistanceHistory: {
    loading: 'Loading the assistance you received...',
    empty: 'No assistance has been recorded yet.',
    columns: {
      type: 'Type',
      quantity: 'Amount',
      dateReceived: 'Date received',
      remarks: 'Remarks',
    },
  },

  // ── MyOrgReportingSection ──────────────────────────────────────────────
  // Calendar that marks days already logged (components/UI/LoggedDatePicker.jsx).
  logCalendar: {
    placeholder: 'Pick a date',
    today: 'Today',
    logged: 'Already logged',
    loggedNote: 'There is already a log on this date.',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    logCount: (n) => `${n} log${Number(n) === 1 ? '' : 's'}`,
  },

  orgReportAssistance: {
    title: 'Report Assistance',
    chooserSubtitle: 'Choose whether it is for one member or for the whole organization.',
    chooseMemberTitle: 'For One Member',
    chooseMemberBody: 'Log assistance received by one particular member.',
    chooseOrgTitle: 'Distribute to the Whole Organization',
    chooseOrgBody: (n) => `Distribute assistance to all ${n} members of the organization.`,
    memberFormTitle: 'For One Member',
    memberFormSubtitle: 'Fill in the assistance details for one member.',
    orgFormTitle: 'Distribute to the Organization',
    // Shorter than chooseOrgBody above — the chooser card has the longer
    // body text, the form step has this short subtitle.
    orgFormSubtitle: (n) => `Will be given to all ${n} members.`,
    step1NextButton: 'Next: Preview',
    memberFieldLabel: 'Member',
    memberPlaceholder: 'Select a member...',
    typeHeading: 'Type of assistance',
    quantity: 'Amount',
    unit: 'Unit',
    cashPerMember: 'Amount per member (₱)',
    cashPreview: (amount) => `₱${amount} per member`,
    recipientsHeading: 'Recipients',
    allMembers: 'All members',
    memberCount: (n) => `${n} member${Number(n) === 1 ? '' : 's'}`,
    // States the option-(b) scope honestly rather than drawing per-member
    // checkboxes that would not change what is sent.
    allMembersNote: 'It will be sent to all current members. Choosing only some members is not available yet.',
    previewButton: 'Preview before confirming →',
    confirmTitle: 'Confirm the assistance',
    resultTitle: 'Reporting complete',
    notSpecified: 'Not specified',
    other: 'Other',
    otherTypePlaceholder: 'What type of assistance?',
    otherAgencyPlaceholder: 'Which agency?',
    addAgencyPlaceholder: 'Add another agency…',
    addAgency: 'Add',
    removeAgency: 'Remove',
    trainingDays: 'Length of training (days)',
    trainingDaysPlaceholder: '1–3 days',
    trainingDaysUnit: 'days',
    trainingDaysError: 'Please enter a valid length of training (1–3 days).',
    equipmentType: 'Type of equipment',
    equipmentTypePlaceholder: 'e.g. Hand tractor',
    seedType: 'Type of seed',
    seedTypePlaceholder: 'e.g. Hybrid corn seeds',
    fertilizerType: 'Type of fertilizer',
    fertilizerTypePlaceholder: 'e.g. Urea (46-0-0)',
    futureDateHint: 'You can pick a future date — the record will stay "Pending" until that day.',
  },

  orgReportHistory: {
    title: 'Reporting History',
    countLine: (n) => `${n} distribution${Number(n) === 1 ? '' : 's'}`,
    latest: 'LATEST',
    perMember: (amount) => `${amount} per member`,
    givenTo: (n) => `${n} member${Number(n) === 1 ? '' : 's'}`,
    reportedBy: (name) => `Reported by ${name}`,
    viewRecipients: (n) => `View ${n} recipient${Number(n) === 1 ? '' : 's'}`,
    showRecipients: 'Recipients',
    hideRecipients: 'Hide',
    recipientsHeading: (n) => `RECIPIENTS (${n})`,
    notReceivedReason: (reason) => `Reason: ${reason}`,
  },

  orgReporting: {
    reportForMemberTitle: 'Report assistance for one member',
    searchPlaceholder: (personLabelLower) => `Search for a ${personLabelLower} member of the organization by name...`,
    searching: 'Searching...',
    noMembersFound: 'No members found.',
    reportAssistance: 'Report assistance',
    distributeToOrg: 'Distribute to all members',
    clearSelection: 'Clear selection',
    historyTitle: 'What you have reported',
    loading: 'Loading...',
    historyEmpty: 'You have not reported any assistance yet.',
    columns: {
      type: 'Type',
      quantity: 'Amount',
      dateGiven: 'Date given',
    },
    errors: {
      loadHistoryFailed: 'What you have reported could not be loaded.',
    },
  },

  // ── Accountless-beneficiary on-behalf-of confirmation (Piece 2) ────────
  // A DISTINCT screen from orgReportHistory above on purpose — that one is
  // display-only (recorded_by=self, no confirm action); this one is for
  // members with no working account at all, sourced from a different,
  // eligibility-gated endpoint. The backend list already only returns
  // eligible rows, so there is no "ineligible, here's why" state to word
  // here — a row simply isn't in the list.
  orgConfirmables: {
    title: 'Confirm for a Member',
    subtitle: 'Members without an active account — you can confirm on their behalf.',
    countLine: (n) => `${n} to confirm`,
    loading: 'Loading...',
    loadFailed: 'The list could not be loaded.',
    empty: 'No members need confirmation right now.',
    confirmButton: 'Confirm on Their Behalf',
    pendingBadge: 'Pending review',
    rejectedReason: (reason) => `Rejected by the office: ${reason}`,
    modalTitle: 'Confirm Receipt',
    modalSubtitle: (name) => `For ${name}`,
    photoLabel: 'Photos (optional)',
    photoHint: 'JPG, PNG, or WEBP, up to 5 MB each. Up to 10 photos.',
    submit: 'Submit',
    submitSuccess: 'Submitted — waiting for the office to approve it.',
    submitFailed: 'The confirmation could not be submitted.',
  },

  // ── Batch: profile self-editing ────────────────────────────────────────
  // Two tiers, and the copy has to make the difference obvious: some edits
  // land immediately, others go to the office for review.
  profileEdit: {
    photoLabel: 'Photo',
    logoLabel: 'Logo',
    changePhoto: 'Change photo',
    changeLogo: 'Change logo',
    removePhoto: 'Remove',
    uploading: 'Uploading...',
    uploadFailed: 'The photo could not be uploaded.',
    uploadSuccess: 'The photo has been updated.',
    removeSuccess: 'The photo has been removed.',
    // Mirrors the server's own limits so the two never disagree.
    photoHint: 'JPG, PNG, or WEBP. Up to 5MB.',

    contactLabel: 'Contact number',
    contactSave: 'Save',
    contactCancel: 'Cancel',
    contactSuccess: 'The contact number has been updated.',
    contactFailed: 'The contact number could not be updated.',
    contactPlaceholder: '09XXXXXXXXX',
    contactInvalid: 'It must start with 09 and have exactly 11 digits.',
    editAction: 'Edit',
    barangaySelectPlaceholder: 'Select the barangay',

    requestChange: 'Request a Change',
    pendingReview: 'Pending review',
    pendingNote: (value) => `Requested: ${value}`,
    requestTitle: (fieldLabel) => `Request a change — ${fieldLabel}`,
    requestCurrent: 'Current',
    requestNew: 'New value',
    requestSubmit: 'Submit request',
    requestSuccess: 'Submitted. The office will review it.',
    requestFailed: 'The request could not be submitted.',
    // The office reviews these, so say so plainly rather than implying the
    // change has already happened.
    reviewNotice: 'These changes are reviewed by the office before they are approved.',

    historyTitle: 'Change requests',
    historyEmpty: 'You have not submitted any requests yet.',
    statusPending: 'Pending',
    statusApproved: 'Approved',
    statusRejected: 'Not approved',
    rejectionReason: (reason) => `Reason: ${reason}`,

    fieldLabels: {
      first_name: 'First name',
      middle_name: 'Middle name',
      last_name: 'Last name',
      barangay: 'Barangay',
      name: 'Organization name',
      street_address: 'Barangay / Street Address',
    },

    // Password card — same mechanics as the Farmer/Fisherfolk version
    // (labels.ffNew.profile.password*, CitizenProfileScreen.jsx), reused
    // for the Organization Info screen with one addition: this account is
    // shared/institutional, not personal, so passwordSharedAccountNote
    // says so explicitly rather than reusing identical copy that would
    // silently imply a single owner.
    passwordCardHeading: 'Password',
    passwordCardNote: 'Optional. You can change your password any time — it is not required.',
    passwordSharedAccountNote: 'This account is used by the whole organization — whichever officers currently hold the password. Changing the password affects EVERYONE who uses it, not just you.',
    passwordCurrentLabel: 'Current password',
    passwordNewLabel: 'New password',
    passwordConfirmLabel: 'Confirm new password',
    passwordChangeCta: 'Change Password',
    passwordMismatch: 'The new password and the confirmation do not match.',
    passwordChanged: 'Your password has been changed. Please log in again with your new password.',
  },

  // ── Batch: Organization Info screen ────────────────────────────────────
  orgInfo: {
    title: 'Organization Information',
    registrationNumber: 'Registration Number',
    contactPerson: 'Contact Person',
    typeBadgeFarmers: 'Farmers Organization',
    typeBadgeFisherfolk: 'Fisherfolk Organization',
    samahanSubtitleFarmers: 'Farmers Association',
    samahanSubtitleFisherfolk: 'Fisherfolk Association',
    identificationHeading: 'Identification',
    identificationRegNumber: 'Reg. Number',
    identificationAgency: 'Agency',
    identificationRegistered: 'Registered',
    identificationOrganized: 'Organized',
    groups: {
      registeredDetails: 'Registered Information',
      identity: 'Name and Address',
      contact: 'Contact',
      password: 'Password',
      actions: 'Account',
    },
    readonlyFieldLabels: {
      registration_number: 'Registration Number',
      contact_person: 'Contact Person',
      date_organized: 'Date Organized',
      date_registered: 'Date Registered',
      registration_agency: 'Registration Agency',
      email_address: 'Email',
    },
    historyHeading: 'Request History',
    institutionalAccountTitle: 'Shared / Institutional Account',
    institutionalAccountBody: 'The password of this account is used by the officer who currently holds the credentials. Changing the password affects everyone who uses this account — not just you. Make sure to tell your organization the new password before you update it.',
    passwordForInstitutional: 'For the institutional account',
  },

  // ── Org parity batch: Help screen ───────────────────────────────────────
  orgHelp: {
    title: 'Help',
    faqHeading: 'Frequently asked questions',
    contactHeading: 'Contact OMAg',
    contactOfficeName: 'Office of the Municipal Agriculturist — Aringay, La Union',
    // Deliberately honest, not a fabricated address/phone/hours — those
    // are not finalized yet. An obvious placeholder beats a confident-
    // looking wrong number.
    contactPlaceholderNote: 'The exact address, number, and office hours will be added here soon. For now, please visit the OMAg office at the Aringay Municipal Hall with any questions.',
    faq: [
      {
        key: 'add-member',
        q: 'How do I add a member?',
        a: 'On Home, tap "Add Member". Search by the name or barangay of a registered farmer or fisherfolk, then tap "Add". A farmer or fisherfolk can be a member of more than one organization at the same time — if they already belong to another organization, you will only see it as information, not a warning, and they are not removed from it automatically.',
      },
      {
        key: 'assign-officer',
        q: 'How do I assign an officer?',
        a: 'On Home, tap "Assign Officer". Choose a position (there are 7: President, Vice President, Secretary, Treasurer, Auditor, Board Member, Manager), then choose a member from the list of your organization\'s current members. If someone already holds that position, their assignment will be replaced.',
      },
      {
        key: 'assistance-individual-vs-bulk',
        q: 'What is the difference between reporting assistance for one member and for all members?',
        a: 'Under Members, each member has a "Report Assistance" action — this is for assistance given to one member only. The "Report Assistance" Quick Action on Home is for "Distribute to Organization" — one assistance given to ALL current members of the organization at once. Before you confirm it, you will see a preview of how many members will receive it.',
      },
      {
        key: 'status-lifecycle',
        q: 'What do Pending, Awaiting Confirmation, Confirmed, and Not Received mean?',
        a: 'While the distribution date is still in the future, the status is "Pending". Once that date arrives it becomes "Awaiting Confirmation" and the member is notified to confirm. When the member confirms they received it, it becomes "Confirmed". If the member says they did not receive it, it becomes "Not Received", and the office and the organization are notified — the office takes the next action. You can see the real status of each recipient in "Reporting History".',
      },
      {
        key: 'request-change',
        q: 'How do I request a change to the organization information?',
        a: 'In Organization Information, the logo and contact number change as soon as you save. The name and address go through the office\'s review — tap "Request a Change", enter the new value, and the status "Pending review" is shown until the office approves or rejects it.',
      },
    ],
  },

  // ── Farmer/Fisherfolk individual Help screens ──────────────────────────
  // Desktop and mobile share this content but NOT the same layout: desktop
  // shows a "Field Behaviors" legend card the mobile version omits in favor
  // of a Log out row — see FarmerHelpScreen/FisherfolkHelpScreen render
  // logic, not a difference to "fix" into one shape.
  farmerHelp: {
    title: 'Help',
    subtitle: 'Answers to common questions about your account and using the system.',
    faqHeading: 'FREQUENTLY ASKED QUESTIONS',
    faq: [
      {
        key: 'log-activity',
        q: 'How do I log a crop activity?',
        a: 'On Home, tap "Log" and choose the type of activity (e.g. watering, fertilizing, spraying). Choose the field and the date, then save. The activity will appear in the History of the selected field.',
      },
      {
        key: 'record-harvest',
        q: "How do I record a harvest, and why is there a 50% duration gate?",
        a: 'On the field you want to record, tap "Record Harvest". It is not available until half of the expected length of the cycle has passed — this is the 50% duration gate, so that a harvest cannot be recorded before it could reasonably have happened.',
      },
      {
        key: 'report-disaster',
        q: 'How do I report a disaster on a crop, and how does recovery work?',
        a: 'Choose the affected field and tap "Report Disaster". Enter the type of disaster and the level of damage. When the field has recovered, it goes back to its normal status and its cycle continues.',
      },
      {
        key: 'yield-variance',
        q: "What is Yield Variance Analysis, and what do 'possible contributing factors' mean?",
        a: 'It compares the actual harvest against the expected harvest based on past cycles. The "possible contributing factors" are suggested reasons (e.g. weather, disasters, late harvesting) based on the recorded activities — they are not a confirmed cause, only a guide for reviewing what happened.',
      },
      {
        key: 'request-change',
        q: "How do I request a change to my name or barangay, and what does 'Pending review' mean?",
        a: 'In My Profile, enter the new value in the field and tap "Request". The status "Pending review" means it is still waiting for a decision by staff — it is not applied right away.',
      },
      {
        key: 'instant-vs-request',
        q: 'What is the difference between instant-edit and request-a-change fields?',
        a: 'Instant-edit fields (photo, contact number) apply as soon as you save. Request-a-change fields (name, barangay) must first be reviewed and approved by staff before they change in the registry.',
      },
    ],
    contactHeading: 'CONTACT OMAG ARINGAY',
    contactPlaceholderNote: 'The details below are placeholders — the official information is not final yet.',
    contactOfficeLabel: 'Office',
    contactOfficeValue: '[Office Name — placeholder]',
    contactAddressLabel: 'Address',
    contactAddressValue: '[Full Office Address — placeholder]',
    contactPhoneLabel: 'Phone',
    contactPhoneValue: '[Phone Number — placeholder]',
    contactHoursLabel: 'Office Hours',
    contactHoursValue: '[Office Days and Hours — placeholder]',
    behaviorsHeading: 'FIELD BEHAVIORS',
    behaviorInstantLabel: 'Instant edit',
    behaviorInstantDesc: 'Photo, contact number — applied right away',
    behaviorRequestLabel: 'Request-a-change',
    behaviorRequestDesc: 'Name, barangay — needs staff approval',
    behaviorReadonlyLabel: 'Read-only',
    behaviorReadonlyDesc: 'RSBSA number, reference info — cannot be changed',
    logoutCta: 'Log out',
    backToProfile: 'Back to Profile',
  },

  fisherfolkHelp: {
    title: 'Help',
    subtitle: 'Answers to common questions about your account and using the system.',
    faqHeading: 'FREQUENTLY ASKED QUESTIONS',
    faq: [
      {
        key: 'log-feeding',
        q: "How do I log today's feeding, and how does 'Repeat yesterday's feeding' work?",
        a: 'Choose the pond, then tap "Log Feeding". Enter the type and amount of feed. "Repeat yesterday\'s feeding" copies your latest entry for the same pond right away, so you do not have to enter it again when the feeding is the same every day.',
      },
      {
        key: 'record-harvest',
        q: 'How do I record a harvest for a pond?',
        a: 'On the selected pond, tap "Record Harvest". Enter the amount caught and the date, then save. It will appear in the History of that pond.',
      },
      {
        key: 'report-disaster',
        q: 'How do I report a disaster (including a fish kill), and how does recovery work?',
        a: 'Choose the affected pond and tap "Report Disaster". Fish kill is included as a type of disaster. When the pond has recovered, it goes back to its normal status.',
      },
      {
        key: 'log-mortality',
        q: 'How do I log an illness or mortality, and why is only general care guidance shown?',
        a: 'On the affected pond, tap "Log Illness / Mortality" and enter the details. Only general care guidance is shown because it is not a substitute for an actual diagnosis by a veterinarian or BFAR — it is only starting guidance while you wait for professional help.',
      },
      {
        key: 'request-change',
        q: 'How do I request a change to my name or barangay?',
        a: 'In My Profile, enter the new value in the field and tap "Request". It waits for staff approval before it changes in the registry.',
      },
      {
        key: 'instant-vs-request',
        q: 'What is the difference between instant-edit and request-a-change fields?',
        a: 'Instant-edit fields (photo, contact number) apply as soon as you save. Request-a-change fields (name, barangay) must first be reviewed and approved by staff before they change in the registry.',
      },
    ],
    contactHeading: 'CONTACT OMAG ARINGAY',
    contactPlaceholderNote: 'The details below are placeholders — the official information is not final yet.',
    contactOfficeLabel: 'Office',
    contactOfficeValue: '[Office Name — placeholder]',
    contactAddressLabel: 'Address',
    contactAddressValue: '[Full Office Address — placeholder]',
    contactPhoneLabel: 'Phone',
    contactPhoneValue: '[Phone Number — placeholder]',
    contactHoursLabel: 'Office Hours',
    contactHoursValue: '[Office Days and Hours — placeholder]',
    behaviorsHeading: 'FIELD BEHAVIORS',
    behaviorInstantLabel: 'Instant edit',
    behaviorInstantDesc: 'Photo, contact number — applied right away',
    behaviorRequestLabel: 'Request-a-change',
    behaviorRequestDesc: 'Name, barangay — needs staff approval',
    behaviorReadonlyLabel: 'Read-only',
    behaviorReadonlyDesc: 'RSBSA number, reference info — cannot be changed',
    logoutCta: 'Log out',
    backToProfile: 'Back to Profile',
  },

  // ── Batch 2: Organization dashboard ────────────────────────────────────
  orgHome: {
    appName: 'OMAG ARINGAY',
    // Mixed-case, matching the Organization Reference rebuild's sidebar/top
    // bar exactly (all show "OMAg Aringay", not the all-caps `appName`
    // above) — a separate key rather than editing `appName` itself, since
    // OrgInfoScreen.jsx's untouched old chrome reads that one.
    appNameDisplay: 'OMAg Aringay',
    dashboardTitle: 'Organization Dashboard',
    typeBadgeFarmers: 'Farmers Org',
    typeBadgeFisherfolk: 'Fisherfolk Org',
    addressLine: (barangay) => `Brgy. ${barangay}, Aringay, La Union`,

    statMembers: 'MEMBERS',
    statPositions: 'POSITIONS',
    // Sentence-case forms for the Home status strip.
    statMembersLabel: 'Members',
    statPositionsLabel: 'Positions',
    viewMembers: 'View >',
    viewMembersFull: 'View the members',
    assignNow: 'Assign',
    positionsFilledAria: (filled, total) => `${filled} of ${total} positions have an officer`,
    vacantCount: (n) => `${n} vacant`,
    officerRosterCardTitle: 'Officers',

    vacancyTitle: 'There are vacant positions',
    vacancyBody: (positions) => `${positions} — need to be assigned`,

    actionsHeading: 'QUICK ACTIONS',
    addMember: 'Add Member',
    addMemberSub: 'Search for and add a registered farmer/fisherfolk',
    assignOfficer: 'Assign Officer',
    assignOfficerSub: 'Choose a member for a position',
    distribute: 'Report Assistance',
    distributeSub: 'Record government assistance that was given',
    confirmOnBehalf: 'Confirm for a Member',
    confirmOnBehalfSub: 'For a member without an active account',

    officerRosterHeading: 'OFFICER ROSTER',
    vacant: 'VACANT',
    officerHistory: 'Officer History',
    officerHistorySub: 'See previous officers and terms',

    membersHeading: 'Members',
    membersCount: (n) => `MEMBERS — ${n} TOTAL`,
    membersCountLine: (total, shown) => `${total} member${Number(total) === 1 ? '' : 's'} · ${shown} shown`,
    // Short button label for the Members screen's own "+Add" — the
    // action-tile label above (`addMember`) stays the long form, matching
    // the two different lengths for the same action in two different
    // places (the tile vs the list-header button).
    addMemberShort: 'Add',
    membersSearchPlaceholder: 'Search by name or barangay...',
    membersEmpty: 'This organization has no members yet.',
    // Display only. A person who belongs to several organizations has one
    // "main"; only OMAg staff can change it, so there is no action here.
    mainBadge: 'Main',
    mainBadgeTitle: "This is the member's main organization. Only OMAg staff can change it.",
    membersLoading: 'Loading the members...',
    loadFailed: 'The organization data could not be loaded.',
    retry: 'Try again',

    // Short nav-only labels — the sidebar (desktop) and bottom tab bar
    // (mobile) both read "Home / History / Information", distinct from the
    // longer strings above/below used as page titles or the mobile-only
    // in-content "Reporting History" shortcut link.
    homeNav: 'Home',
    historyNav: 'History',
    orgInfoNav: 'Information',
    historyLinkLabel: 'Reporting History',
    // Short back-link for the NEW shell only (OrgPageHeader) — "< Back"
    // everywhere. Deliberately a separate key from backToDashboard below,
    // which the OLD shell's OrgAppBar aria-label still uses —
    // OrgInfoScreen/OrgHelpScreen/OrgOfficerHistoryScreen are out of
    // scope and must not change even invisibly.
    backLink: 'Back',

    reportingHistory: 'Reporting History',
    reportingHistorySub: 'See past records',
    perMemberRow: 'Report for one member',
    perMemberRowSub: 'When not every member received it',
    orgInfoRow: 'Organization Information',
    orgInfoRowSub: 'Logo, contact number, name and address',
    backToDashboard: 'Back to the dashboard',
    memberReportAction: 'Report Assistance',

    // Profile chip dropdown (>=640px) and nav rail toggle
    accountProfile: 'My Profile',
    accountHelp: 'Help',
    accountLogout: 'Log out',
    expandNav: 'Expand navigation',
    collapseNav: 'Collapse navigation',
    navRailLabel: 'Main navigation',
  },


  // ── Batch 2: Add Member ────────────────────────────────────────────────
  orgAddMember: {
    title: 'Add a Member',
    nameFieldLabel: 'Name or number',
    barangayFieldLabel: 'Barangay',
    searchButton: 'Search',
    noticeLabel: 'Note',
    // Same rule for both domains since multi-organization membership
    // shipped (Phase B): a person may belong to several organizations at
    // once, adding them here takes nothing away from the others, and
    // exactly one active membership is their "main" (their first ever
    // membership is main automatically). Only the organization type
    // differs in the wording — see orgDomainConfig.js's
    // candidateMembershipNote.
    noticeFarmers: 'A farmer can be a member of more than one Farmers Organization at the same time. Only one is their main organization, and they are not removed from their other organizations when added here.',
    noticeFisherfolk: 'A fisherfolk can be a member of more than one Fisherfolk Organization at the same time. Only one is their main organization, and they are not removed from their other organizations when added here.',
    // Suggestions are matched on a name (any words, any order) or on the
    // registry number itself once enough of it is typed; the response only
    // ever returns the last four characters of that number.
    searchPlaceholder: (registryName) => `Name or ${registryName} number...`,
    typeToSearch: 'Type a name or number — registered people will appear here.',
    registeredOnly: 'Only registered farmers/fisherfolk can be added.',
    searchFailed: 'The suggestions could not be loaded. Please try again.',
    // The 2-character minimum is a real server rule, not a UI nicety — the
    // endpoint returns nothing below it. Say so rather than showing an
    // empty-looking result.
    hint: (registryName) => `Search for the member in the ${registryName} registry first before adding.`,
    minChars: 'Please enter at least 2 characters.',
    searching: 'Searching...',
    noResults: 'No matches found.',
    capped: 'Only the first 20 are shown. Make your search more specific if the person is not listed.',
    alreadyMember: 'Already a member',
    currentOrgLabel: (orgName) => `Member of ${orgName}`,
    noCurrentOrg: 'No organization',
    addButton: 'Add',

    // The server refuses the add when the person's other memberships have
    // no main organization and this one doesn't settle it. Only OMAg staff
    // decide a person's main, so this explains rather than offers a choice.
    mainChoiceRequired: (name) =>
      `${name} could not be added to this organization. They do not have a main organization set yet, and OMAg staff need to fix this. Please contact the OMAg office.`,
    addSuccess: (name) => `${name} has been added.`,
    addFailed: 'The member could not be added.',
  },

  // ── Batch 2: Remove Member ─────────────────────────────────────────────
  // Toggle-not-delete batch: replaces the old hard "Remove" flow.
  // Deactivating keeps the member's full record and history intact
  // — only their active participation in this org is turned off — and can
  // always be reversed via the same action in reverse.
  orgMemberActive: {
    deactivateTitle: 'Deactivate the member',
    deactivateBody: (name) => `${name} will be made inactive in this organization. Their record will be kept — you can activate them again at any time.`,
    // Only shown when the member actually holds a position — the backend
    // clears it automatically, so the copy has to say so before the fact.
    officerWarning: (position) => `They are currently the ${position}. This position will also be removed and become vacant.`,
    deactivateConfirm: 'Deactivate',
    deactivateSuccess: (name) => `${name} has been deactivated.`,
    deactivateFailed: 'The member could not be deactivated.',

    reactivateTitle: 'Reactivate the member',
    reactivateBody: (name) => `${name} will be made active again in this organization.`,
    reactivateConfirm: 'Activate',
    reactivateSuccess: (name) => `${name} has been reactivated.`,
    reactivateFailed: 'The member could not be activated.',

    inactiveBadge: 'Inactive',
    deactivateAction: 'Deactivate',
    activateAction: 'Activate',
  },

  // ── Batch 2: Assign Officer ────────────────────────────────────────────
  orgAssignOfficer: {
    title: 'Assign an Officer',
    pickPosition: 'Choose a position and the member to assign. Only members of your organization can be assigned.',
    positionFieldLabel: 'Position',
    positionPlaceholder: 'Choose a position...',
    memberFieldLabel: 'Member',
    memberPlaceholder: 'Choose a member...',
    pickMember: 'Choose a member for this position:',
    currentHolder: (name) => `Currently: ${name}`,
    positionHeld: (name) => `${name} still holds this position. Staff must end their term first before a new officer can be assigned.`,
    noMembers: 'There are no members that can be assigned. Please add a member first.',
    assignButton: 'Assign Officer',
    success: (name, position) => `${name} is now the ${position}.`,
    failed: 'The officer could not be assigned.',
  },

  // Search-as-you-type member picker (Assign Officer, Report Assistance).
  orgPicker: {
    placeholder: 'Name, barangay or number...',
    empty: 'No matching members. Only members of the organization can be chosen.',
    clear: 'Clear selection',
    capped: (n) => `Showing the first ${n}. Narrow your search to see the others.`,
  },

  orgOfficerHistory: {
    title: 'Officer History',
    empty: 'There is no officer history yet.',
    cols: {
      officer: 'Officer',
      position: 'Position',
      start: 'Term start',
      end: 'Term end',
      status: 'Status',
      reason: 'Reason for early end',
    },
    statusCurrent: 'Current',
    statusEndedEarly: 'Ended Early',
    statusCompleted: 'Term Completed',
  },

  // ── CitizenReportAssistanceModal ───────────────────────────────────────
  reportAssistance: {
    titleNew: 'Report assistance',
    titleEdit: 'Edit assistance report',
    fields: {
      assistanceType: 'Type of assistance',
      otherTypePlaceholder: 'Describe the type of assistance…',
      dateGiven: 'Date given',
      quantityAmount: 'Quantity / amount',
      quantityPlaceholder: 'e.g. 2 sacks, 1 unit',
      unit: 'Unit',
      cashPerMember: 'Amount per member',
      sourceAgency: 'Source agency',
      season: 'Season',
      remarks: 'Remarks',
    },
    errors: {
      requiredFields: 'The type of assistance, quantity, and date are required.',
      specifyAssistanceType: 'Please specify the type of assistance.',
      specifySourceAgency: 'Please specify the agency.',
      invalidCashAmount: 'Please enter a valid amount.',
      genericSaveError: 'Could not be saved.',
    },
    submitNew: 'Report assistance',
    submitEdit: 'Save changes',
    successNew: 'The assistance was reported.',
    successEdit: 'The assistance report was updated.',
  },

  // ── CitizenDistributeToOrgModal ────────────────────────────────────────
  distributeAssistance: {
    title: 'Distribute to all members',
    subtitle: (personLabelLower) => `This will create one assistance record for every current ${personLabelLower} member of your organization.`,
    reviewButton: 'Review the distribution',
    confirmButton: 'Confirm and distribute',
    back: 'Back',
    done: 'Done',
    organizationLabel: 'Organization',
    currentMembers: 'Current members',
    assistanceSummary: 'Assistance',
    // Batch 2: was an inline ` — ₱X per head` / ` on YYYY-MM-DD` tail on the
    // confirmation line. Split out so both the wording and the date format
    // go through this file.
    perHeadSummary: (amount) => ` — ₱${amount} per member`,
    onDate: (formatted) => ` on ${formatted}`,
    willBlock: (count) => `${count} member${Number(count) === 1 ? '' : 's'} will be blocked — they already received the same assistance from another organization in the past 30 days`,
    willReceive: (count) => `${count} member${Number(count) === 1 ? '' : 's'} will receive a new record. This cannot be undone automatically — please review carefully before confirming.`,
    fields: {
      assistanceType: 'Type of assistance',
      dateGiven: 'Date given',
      quantity: 'Quantity (per member)',
      cashAmount: 'Total amount (₱) each',
      sourceAgency: 'Source agency',
      season: 'Season',
      description: 'Description',
    },
    errors: {
      requiredFields: 'The type of assistance and date are required.',
      specifyAssistanceType: 'Please specify the type of assistance.',
      specifySourceAgency: 'Please specify the agency.',
      invalidCashAmount: 'Please enter a valid amount for each member.',
      previewFailed: 'The distribution could not be previewed.',
      distributeFailed: 'The assistance could not be distributed.',
    },
    resultSummary: (created, blocked, errors) => `${created} created · ${blocked} blocked · ${errors} error${Number(errors) === 1 ? '' : 's'}`,
    statusCreated: 'Created',
    statusBlocked: 'Blocked',
    statusError: 'Error',
    // Batch: richer 3-step wizard layout (step indicator, org context card,
    // big "about to distribute" summary, stat tiles, per-member outcome
    // list). New keys only — everything above stays as-is, still used by
    // the older OrgReportAssistanceScreen.jsx, a different screen sharing
    // this same label block.
    steps: {
      details: 'Distribution Details',
      review: 'Review and Confirm',
      results: 'Distribution Results',
    },
    sections: {
      targetOrg: 'Receiving Organization',
      assistanceDetails: 'Assistance Details',
      confirmDistribution: 'Confirm the Distribution',
      perMemberOutcome: 'Result per Member',
    },
    aboutToDistribute: 'You Are About to Distribute',
    toAllMembersOf: 'To all current members of',
    onDateBold: (formatted) => `on ${formatted}`,
    stats: {
      totalMembers: 'Total members',
      eligible: 'Will receive',
      flagged: 'Flagged / needs review',
    },
    flaggedPanelTitle: (count) => `${count} member${Number(count) === 1 ? ' is' : 's are'} flagged for review`,
    flaggedPanelBody: 'They will still receive their record right away — the flag is only a note for staff, in case they recently received the same assistance elsewhere.',
    skippedPanelTitle: (count) => `${count} member${Number(count) === 1 ? ' will' : 's will'} be skipped`,
    summaryTitle: 'Summary of what will happen:',
    summaryCreated: (count) => `${count} record${Number(count) === 1 ? '' : 's'} will be created`,
    summaryCreatedDetail: (count) => `— assistance recorded for ${count} member${Number(count) === 1 ? '' : 's'}`,
    summaryFlagged: (count) => `${count} flagged with a note`,
    summaryFlaggedDetail: '— already included above, staff should review',
    summarySkipped: (count) => `${count} record${Number(count) === 1 ? ' was' : 's were'} skipped`,
    summarySkippedDetailProgram: '— already enrolled in the selected program',
    summarySkippedDetailNone: '— no duplicates in this batch',
    backToEdit: 'Back to Edit',
    confirmAndDistribute: 'Confirm and Distribute',
    completeTitle: 'Distribution Complete',
    completeSummary: (created, skipped, flagged) =>
      `${created} record${Number(created) === 1 ? '' : 's'} created, ${skipped} skipped, ${flagged} flagged for review`,
    close: 'Close',
    startNew: 'Start a New Distribution',
    filterAll: (count) => `All ${count}`,
    filterCreated: (count) => `${count} Created`,
    filterSkipped: (count) => `${count} Skipped`,
    filterFlagged: (count) => `${count} Flagged`,
    filterError: (count) => `${count} Error`,
  },
}

export default labels
