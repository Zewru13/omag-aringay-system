// Batch E — every user-facing string on the citizen self-service pages
// (src/pages/Citizen/**), centralized here as named keys. Nothing below may
// be hardcoded inside a component — every citizen-facing label, button,
// heading, empty state, and error message renders from this file, so
// changing the portal's language is a ONE-FILE change here rather than a
// component-by-component refactor.
//
// LANGUAGE: Tagalog, spoken register (not textbook/formal Filipino). Terms
// that Aringay speakers actually use in English stay in English on purpose —
// RSBSA, FishR, LGU, barangay names, pond, feed, kg/ha, contact number,
// Season, Total Loss, program names. Translating those would read as
// stilted, not more accessible. "Po" is used where it falls naturally in
// speech (instructions, apologies, requests), not bolted onto every line.
//
// NOT included here: activity/assistance-type CHOICE VALUES (e.g.
// 'Fertilizer Application', 'Pest Control') defined in citizenDomainConfig.js
// and orgDomainConfig.js. Those are stored verbatim in the database and
// matched against staff-side data (e.g. the suggestion engine compares
// activity_type against CropActivityStage.stage_name) — translating the
// VALUE would silently break that matching and staff/citizen data
// consistency. Where a map below is keyed BY such a value (outcomeOptions,
// plantConditionOptions, severityOptions), only the displayed text is
// translated; the key is left exactly as the database stores it.

// Locale for every date rendered on the citizen screens. Single constant so
// the portal's date language is the same one-file change as its text.
// 'fil-PH' gives Filipino month and weekday names ("Ago", "Sabado"); the
// second entry is an explicit fallback for runtimes whose ICU data does not
// carry Filipino, which would otherwise silently resolve to the browser
// default rather than anything we chose.
export const DATE_LOCALE = ['fil-PH', 'en-PH']

export const labels = {
  common: {
    loading: 'Naglo-load…',
    cancel: 'Kanselahin',
    save: 'I-save',
    saveChanges: 'I-save ang binago',
    edit: 'I-edit',
    close: 'Isara',
    unknown: '—',
    loggedByStaff: 'Nilagay ng staff',
    // The caller renders the locker's name in its own <strong> tag, so
    // these are the surrounding text only, not a full templated sentence.
    lockedByOtherSuffix: 'ang kasalukuyang naglo-log nito. Maghintay po muna',
    lockedByOtherMinutes: (mins) => ` (~${mins} min)`,
    genericSaveError: 'Hindi na-save. Subukan po ulit.',
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
    tagline: 'Sariling Account',
    logOut: 'Mag-log out',
  },

  // ── Mobile tab bar (< 640px only) ──────────────────────────────────────
  tabBar: {
    ariaLabel: 'Pangunahing navigation',
    home: 'Home',
    harvests: 'Ani',
    myInfo: 'Impormasyon',
  },

  home: {
    greeting: (name) => `Kumusta, ${name}`,
    subtitle: (recordTypeLabel) => `Sariling account para sa inyong record bilang ${recordTypeLabel} sa Office of the Municipal Agriculturist.`,
    notLinked: 'Hindi pa naka-link ang account ninyo sa isang record. Pumunta po sa opisina para matulungan kayo.',
    recordTypeLabels: {
      FARMER: 'magsasaka',
      FISHERFOLK: 'mangingisda',
      FARMERS_ORG: 'organisasyon ng magsasaka',
      FISHERFOLK_ORG: 'organisasyon ng mangingisda',
    },
    recordTypeLabelsCapitalized: {
      FARMER: 'Magsasaka',
      FISHERFOLK: 'Mangingisda',
      FARMERS_ORG: 'Organisasyon ng Magsasaka',
      FISHERFOLK_ORG: 'Organisasyon ng Mangingisda',
    },
    recordTypeFallback: 'Record',
    // Legacy tab labels — still used by the ORGANIZATION role, which keeps
    // the older tabbed layout (neither home-screen redesign covered it).
    tabs: {
      overview: 'Buod',
      myCropRecords: 'Mga tanim ko',
      myStockingRecords: 'Mga stocking record ko',
      myYieldAnalysis: 'Resulta ng ani ko',
      myAssistanceHistory: 'Mga natanggap na tulong',
      reportAssistance: 'Mag-report ng tulong',
    },
    overviewFields: {
      name: 'Pangalan',
      recordType: 'Uri ng record',
      rsbsaNumber: 'RSBSA number',
      registrationNumber: 'Registration number',
      barangay: 'Barangay',
    },
  },

  // ── Farmer home screen ────────────────────────────────────────────────
  farmerHome: {
    rsbsaPrefix: 'RSBSA',
    // TIME-NEUTRAL ON PURPOSE. The UI basis shows "MALIGAYANG UMAGA", but
    // this string renders at every hour of the day and there is no
    // time-of-day logic behind it — a literal "good morning" would be
    // wrong every afternoon. "Kumusta po" carries the same warmth without
    // asserting the time.
    headerGreeting: 'Kumusta po',
    loading: 'Kinukuha ang mga tanim ninyo...',
    loadError: 'Hindi makuha ang mga tanim ninyo.',
    needsAttention: {
      title: 'Kailangan ng aksyon',
      overdueBadge: 'Lampas na',
      // Tagalog does not inflect "araw" for plural, so unlike the English
      // original there is no singular/plural branch here.
      overdueBadgeDays: (days) => `Lampas na · ${days} araw`,
      dueTodayBadge: 'Ngayon na',
      emptyTitle: 'Wala pong kulang',
      emptyBody: 'Walang gawaing kailangan ngayon — balikan po ninyo pagkatapos ng susunod ninyong punta sa bukid.',
      actionLabel: 'I-log ang gawaing ito',
      contextLine: (crop, barangay, area) => `${crop} · ${barangay} · ${area} ha`,
    },
    myCrops: {
      title: 'Mga tanim ko',
      empty: 'Wala pa pong nakatalang tanim sa pangalan ninyo. Pumunta po sa opisina para masimulan ito.',
      progressDayOf: (elapsed, total) => `Araw ${elapsed} ng ${total}`,
      expectedHarvest: (date) => `Inaasahang ani: ${date}`,
      harvestShort: (iso) => {
        if (!iso) return ''
        const d = new Intl.DateTimeFormat(DATE_LOCALE, { month: 'short', day: 'numeric' })
          .format(new Date(iso + 'T00:00:00'))
        return `Ani ~${d}`
      },
      // `season` arrives already mapped through harvest.seasonOptions by the
      // caller — this function interpolates a display label, never the raw
      // stored 'Dry'/'Wet' value.
      cardMeta: (barangay, area, season) => `${barangay} · ${area} ha · ${season}`,
      logActivity: 'Mag-log ng gawain',
      viewHistory: 'Tingnan ang history',
      reportDisaster: 'I-report ang kalamidad',
      seasonYear: (season, year) => `${season} ${year}`,
      daysLeft: (n) => `${n} araw na lang`,
      harvestedBadge: 'Naani na',
    },
    secondary: {
      profileTitle: 'Impormasyon ko',
      harvestResultsTitle: 'Resulta ng ani ko',
      assistanceTitle: 'Mga natanggap na tulong',
      backToHome: 'Bumalik',
      quickLinksTitle: 'Mga shortcut',
    },
    history: {
      title: (cropTitle) => `${cropTitle} — history`,
      loading: 'Kinukuha ang history...',
      loadError: (recordLabel) => `Hindi makuha ang mga ${recordLabel} ninyo.`,
      activityLogTitle: 'Talaan ng gawain',
      logActivity: 'Mag-log ng gawain',
      noActivity: 'Wala pang naka-log na gawain.',
      harvestTitle: 'Ani',
      recordHarvest: 'Itala ang ani',
      noHarvest: 'Wala pang naitalang ani.',
      lateSuffix: ' · Huli',
      disasterTitle: 'Mga kalamidad',
      manageDisasters: 'I-report / tingnan',
      activeDisasterCount: (n) => `${n} aktibo`,
    },
  },

  // ── Fisherfolk home screen ─────────────────────────────────────────────
  fisherfolkHome: {
    loading: 'Kinukuha ang mga pond ninyo...',
    loadError: 'Hindi makuha ang mga pond ninyo.',
    feedToday: {
      title: 'Pakain ngayon',
      overdueBadge: 'Lampas na',
      dueTodayBadge: 'Ngayon na',
      dueBadge: (count) => `Ngayon na · ${count} pond`,
      emptyTitle: 'Wala pong kulang',
      emptyBody: 'Walang pond na kailangang pakainin ngayon.',
      dueSummary: (count) => `${count} pond ang kailangang pakainin`,
      lastFed: (feedType, qtyKg, date) => `Huling pakain: ${feedType || 'hindi tukoy na feed'}${qtyKg ? ` · ${qtyKg} kg` : ''} · ${date}`,
      lastFedPond: (pond, feedType, qtyKg) => `${pond}: ${feedType || 'hindi tukoy na feed'}${qtyKg ? ` · ${qtyKg} kg` : ''}`,
      noPriorFeeding: 'Wala pang naka-log na pakain para sa pond na ito.',
      noPriorFeedingPond: (pond) => `${pond}: wala pang naka-log na pakain.`,
      repeatButton: 'Ulitin ang pakain kahapon',
      logSeparatelyLink: 'o i-log isa-isa ang bawat pond',
      // Per-pond actions adopted from the UI basis. Kept short because they
      // sit two-up on a 340px card.
      repeatPond: 'Ulitin',
      logDifferentPond: 'Ibang pakain',
      lastRecordedOn: (date) => `Huling naitala: ${date}`,
    },
    confirmGuard: {
      title: 'Kumpirmahin ang pakain',
      body: 'I-lo-log po ang sumusunod para sa bawat pond, na may petsa ngayong araw:',
      pondLine: (pondName, feedType, qtyKg) => `${pondName}: ${feedType || 'hindi tukoy na feed'}${qtyKg ? ` · ${qtyKg} kg` : ''}`,
      confirmButton: 'Kumpirmahin at i-log',
      cancelButton: 'Kanselahin',
      skippedNote: (count) => `${count} pond ang nilaktawan — walang dating pakain na maaaring ulitin. I-log po ito nang isa-isa sa ibaba.`,
      partialSuccess: (ok, total) => `Na-log ang ${ok} sa ${total} pond.`,
    },
    myPonds: {
      title: 'Mga pond ko',
      empty: 'Wala pa pong nakatalang pond sa pangalan ninyo. Pumunta po sa opisina para masimulan ito.',
      unstockedLabel: 'Walang laman ngayon',
      pondSpecies: (pond, species) => `${pond} · ${species}`,
      areaFingerlings: (area, count) => `${area} ha · ${count} fingerlings`,
      progressDayOf: (elapsed, total) => `Araw ${elapsed} ng ${total}`,
      logFeeding: 'Mag-log ng pakain',
      logActivity: 'Mag-log ng gawain',
    },
    secondary: {
      illnessTitle: 'Mag-log ng sakit o namatay',
      disasterTitle: 'I-report ang kalamidad',
    },
    pondPicker: {
      title: 'Pumili ng pond',
      subtitle: 'Aling pond po ito?',
      disasterSubtitle: 'Aling pond ang tinamaan ng kalamidad?',
      noPonds: 'Walang pond na may laman na maaaring i-report.',
    },
  },

  // ── CitizenActivityLogScreen ───────────────────────────────────────────
  activityLog: {
    titleNew: 'Mag-log ng gawain',
    titleEdit: 'I-edit ang talaan',
    // Shown when opened from a "Needs Attention" task card — the header
    // confirms context instead of asking the user to (re)select it.
    prefilledSubtitle: (cropTitle) => `Para sa ${cropTitle}`,
    fields: {
      activity: 'Gawain',
      dateOfActivity: 'Petsa ng gawain',
      dateHint: 'Kailan po talaga ginawa ang gawain.',
      notes: 'Mga Tala',
      notesFisheries: 'Mga Tala / napansin',
      plantCondition: 'Kalagayan ng halaman',
      fertilizerType: 'Uri ng fertilizer / input',
      quantityApplied: 'Dami na nagamit',
      quantityUnit: 'Unit',
      pestDiseaseName: 'Peste / sakit',
      areaAffected: 'Lawak na tinamaan (ha)',
      severity: 'Gaano kalala',
      waterFishCondition: 'Kalagayan ng tubig / isda',
      feedType: 'Uri ng feed',
      feedQuantity: 'Dami ng feed (kg)',
      feedBrand: 'Brand ng feed',
      mortalityCount: 'Bilang ng namatay',
      vetConsulted: 'May kinonsultang vet',
      treatmentApplied: 'Ginawang lunas',
      outcome: 'Resulta',
      recommendations: 'Rekomendasyon',
    },
    // Keys are the stored database values — do not translate the keys.
    outcomeOptions: {
      Recovered: 'Nakabawi',
      Ongoing: 'Tuloy pa',
      'Losses Incurred': 'May nawala',
    },
    dateShortcuts: {
      today: 'Ngayon',
      yesterday: 'Kahapon',
      pickDate: 'Pumili ng petsa',
    },
    // Rendered under the date buttons so the chosen day is always stated
    // in full.
    dateResolved: (iso) => {
      if (!iso) return ''
      return new Intl.DateTimeFormat(DATE_LOCALE, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      }).format(new Date(iso + 'T00:00:00'))
    },
    selectPlaceholder: 'Pumili…',
    plantConditionOptions: {
      Good: 'Maganda',
      Fair: 'Katamtaman',
      Poor: 'Mahina',
    },
    severityOptions: {
      Low: 'Mababa',
      Medium: 'Katamtaman',
      High: 'Mataas',
    },
    quantityUnitOptions: {
      kg: 'kg',
      bags: 'bag',
      liters: 'litro',
      sacks: 'sako',
      pieces: 'piraso',
    },
    errors: {
      dateRequired: 'Kailangan po ang petsa ng gawain.',
      specifyActivity: 'Pakisulat po kung anong gawain.',
      specifyFeedType: 'Pakisulat po kung anong feed.',
      lockedByOther: 'May ibang naglo-log nito ngayon. Maghintay po muna.',
      areaAffectedRequired: 'Kailangan po ang lawak na tinamaan.',
      areaAffectedInvalid: 'Ang lawak na tinamaan ay dapat mas mataas sa 0.',
      areaAffectedExceeds: (recordArea) => `Hindi po pwedeng lumagpas ang lawak sa ${recordArea} ha na nakatala.`,
    },
    submitNew: 'I-save ang talaan',
    submitEdit: 'I-save ang binago',
    successNew: 'Naidagdag ang talaan ng gawain.',
    successEdit: 'Na-update ang talaan ng gawain.',
  },

  // ── CitizenHarvestModal ────────────────────────────────────────────────
  harvest: {
    titleNew: 'Itala ang ani',
    titleEdit: 'I-edit ang ani',
    fields: {
      season: 'Season',
      year: 'Taon',
      cropName: 'Pangalan ng tanim',
      harvestStartDate: 'Simula ng ani',
      harvestEndDate: 'Katapusan ng ani',
      areaHarvested: 'Lawak na inani (ha)',
      volume: 'Dami (kg)',
      unitOfMeasure: 'Unit',
      harvestDate: 'Petsa ng ani',
      quantity: 'Dami (kg)',
      avgBodyWeight: 'Average na timbang (kg)',
      areaOrUnits: 'Lawak / bilang na inani',
      areaOrUnitsHint: 'hal. Pond 2, 3 cages',
      isFinal: 'Ito na ang huling ani para sa cycle na ito',
      earlyLateReason: 'Dahilan kung lampas 7 araw ang aga o huli',
      earlyLateReasonHint: 'Kailangan lang kung may flag',
      notes: 'Mga Tala',
    },
    // DISPLAY ONLY. Keys are the stored database values ('Dry'/'Wet') and
    // must not be translated — they are what CropMonitoringRecord.season
    // holds and what the payload sends. Only the visible label changes, so
    // the field name "Season" itself stays English as an established system
    // term while the two values read naturally.
    seasonOptions: {
      Dry: 'Tag-init',
      Wet: 'Tag-ulan',
    },
    unitOptions: {
      kg: 'Kilo (kg)',
      bags: 'Bag (50 kg/bag)',
      cavan: 'Kaban (50 kg/kaban)',
      sacks: 'Sako',
      pieces: 'Piraso / ulo',
      bundles: 'Bigkis',
      boxes: 'Kahon',
      other: 'Iba pa',
    },
    errors: {
      lockedByOther: 'May ibang naglo-log nito ngayon. Maghintay po muna.',
      genericSaveError: 'Hindi ma-save ang ani.',
    },
    submitNew: 'Itala ang ani',
    submitEdit: 'I-save ang binago',
    successNew: 'Naitala ang ani.',
    successEdit: 'Na-update ang talaan ng ani.',
  },

  // ── CitizenDisasterScreen ──────────────────────────────────────────────
  disaster: {
    title: 'Mga kalamidad',
    reportButton: 'I-report ang kalamidad',
    backToList: 'Bumalik sa listahan',
    empty: 'Walang naitalang kalamidad sa record na ito.',
    loading: 'Kinukuha ang mga report...',
    loadError: 'May nangyaring mali — subukan po ulit.',
    retry: 'Subukan ulit',
    statusActive: 'Aktibo',
    statusRecovered: 'Nakabawi',
    // Kept in English: "Total Loss" is the official term used on OMAg
    // paperwork and in staff-side screens, and it must read identically
    // across both so a citizen and an evaluator are discussing one thing.
    statusTotalLoss: 'Total Loss',
    totalLossNotice: 'Namarkahan bilang total loss — tapos na ang production cycle ng record na ito.',
    recoveredOn: (dateStr) => `Nakabawi noong ${dateStr}`,
    fields: {
      disasterType: 'Uri ng kalamidad',
      dateOfOccurrence: 'Petsa ng pangyayari',
      areaAffected: 'Lawak na tinamaan (ha)',
      estimatedDamage: 'Tantiyang pinsala',
      productionLoss: 'Tantiyang nawalang produksyon',
      isTotalLoss: 'Total loss po ito',
      isTotalLossHint: 'Tuluyang nasira ang tanim o stock at tapos na ang cycle na ito. Hindi na po ito mababawi dito — tawagan ang OMAg office para maitama.',
      recoveryNote: 'Note tungkol sa pagbawi',
      recoveryNoteHint: 'Kailangan po ito maliban kung na-log na lahat ng inirerekomendang tugon para sa kalamidad na ito.',
    },
    errors: {
      dateRequired: 'Kailangan po ang petsa ng pangyayari.',
      specifyType: 'Pakisulat po kung anong uri ng kalamidad.',
      areaAffectedRequired: 'Kailangan po ang lawak na tinamaan.',
      areaAffectedInvalid: 'Ang lawak na tinamaan ay dapat mas mataas sa 0.',
      areaAffectedExceeds: (recordArea) => `Hindi po pwedeng lumagpas ang lawak sa ${recordArea} ha na nakatala.`,
      lockedByOther: 'May ibang naglo-log nito ngayon. Maghintay po muna.',
      genericSaveError: 'Hindi ma-save ang report ng kalamidad.',
      recoveryNoteRequired: 'Kailangan po ng note tungkol sa pagbawi kung hindi pa tapos lahat ng inirerekomendang tugon.',
      genericRecoverError: 'Hindi mamarkahan bilang nakabawi.',
    },
    submit: 'Isumite ang report',
    submitSuccess: 'Naisumite ang report ng kalamidad.',
    markRecovered: 'Markahan na nakabawi',
    confirmRecovery: 'Kumpirmahin ang pagbawi',
    recovering: 'Minamarkahan…',
    recoverSuccess: 'Namarkahan bilang nakabawi.',
  },

  // ── CitizenProfileScreen ───────────────────────────────────────────────
  // Read-only registry view. Every field label lives here; the screen itself
  // decides whether a row appears at all (see BLANK_VALUES in the component).
  profile: {
    title: 'Impormasyon ko',
    roleFarmer: 'Magsasaka',
    roleFisherfolk: 'Mangingisda',
    groups: {
      registry: 'IMPORMASYON SA REHISTRO',
      contact: 'CONTACT',
    },
    fields: {
      fullName: 'Buong pangalan',
      rsbsaNumber: 'RSBSA number',
      fishrNumber: 'FishR number',
      lguRegistrationNumber: 'LGU registration no.',
      barangay: 'Barangay',
      address: 'Address',
      classification: 'Klasipikasyon',
      civilStatus: 'Katayuan Sibil',
      fisherfolkType: 'Uri ng pangingisda',
      highestEducation: 'Natapos na pag-aaral',
      contactNumber: 'Contact number',
    },
    // Every record in this system belongs to this one municipality, so the
    // municipality/province half of the address is a constant rather than
    // data — see CitizenProfileScreen for why this is safe.
    addressSuffix: 'Aringay, La Union',
    // Basis copy, translated. Longer and more specific than the previous
    // one-liner: it says WHERE the data comes from, not just where to go.
    officeNotice: 'Galing po ang impormasyong ito sa opisyal na registry ng gobyerno. Para mapalitan ito, pumunta po mismo sa Office of the Municipal Agriculturist.',
  },

  // ── MyYieldAnalysisSection (harvest results) ───────────────────────────
  yieldAnalysis: {
    title: 'Resulta ng ani ko',
    subtitle: 'Kung ano ang aktwal na nangyari sa bawat ani',
    loading: 'Kinukuha ang resulta ng ani ninyo...',
    empty: 'Wala pang natapos na ani o total loss — mapupuno po ito kapag may natapos nang cycle.',
    // Deliberately distinct from `empty` above: a real outage and an honest
    // empty state must not render identically.
    loadError: 'May nangyaring mali — subukan po ulit.',
    retry: 'Subukan ulit',
    // Card panel headings (small caps in the UI).
    estimatedLabel: 'TANTIYA',
    actualLabel: 'AKTWAL',
    // Status pills. `totalLossBadge` stays English for the same reason as
    // disaster.statusTotalLoss.
    aboveEstimateBadge: 'Lumagpas sa tantiya',
    belowEstimateBadge: 'Mas mababa sa tantiya',
    totalLossBadge: 'Total Loss',
    // Footer trend lines.
    aboveTrend: (pct) => `${pct}% mas mataas kaysa orihinal na tantiya`,
    belowTrend: (pct) => `${pct}% mas mababa kaysa orihinal na tantiya`,
    onTargetTrend: 'Katumbas ng orihinal na tantiya',
    totalLossTrendCrop: 'Nawala ang tanim — walang naitalang ani',
    totalLossTrendFisheries: 'Nawala ang stock — walang naitalang ani',
    // Kept from the table version rather than dropped: the activity count
    // moves into a quiet footer line instead of its own column.
    activitiesLine: (done, total) => `${done} sa ${total} gawain ang natapos`,
    // Card meta line: area + barangay + date, whichever are present.
    cropCropLabel: 'Tanim',
    cropDateLabel: 'Petsa ng tanim',
    fisheriesCropLabel: 'Species',
    fisheriesDateLabel: 'Petsa ng stocking',
  },

  // ── MyAssistanceHistorySection ─────────────────────────────────────────
  assistanceHistory: {
    loading: 'Kinukuha ang mga natanggap ninyong tulong...',
    empty: 'Wala pang naitalang tulong.',
    columns: {
      type: 'Uri',
      quantity: 'Dami',
      dateReceived: 'Petsa natanggap',
      remarks: 'Remarks',
    },
    programDistribution: 'Pamamahagi ng Programa',
  },

  // ── MyOrgReportingSection ──────────────────────────────────────────────
  orgReporting: {
    reportForMemberTitle: 'Mag-report ng tulong para sa isang miyembro',
    searchPlaceholder: (personLabelLower) => `Hanapin ang ${personLabelLower} na miyembro ng organisasyon sa pangalan...`,
    searching: 'Naghahanap...',
    noMembersFound: 'Walang nakitang miyembro.',
    reportAssistance: 'Mag-report ng tulong',
    distributeToOrg: 'Ipamahagi sa lahat ng miyembro',
    clearSelection: 'Alisin ang napili',
    historyTitle: 'Mga na-report ninyo',
    loading: 'Naglo-load...',
    historyEmpty: 'Wala pa kayong na-report na tulong.',
    columns: {
      type: 'Uri',
      quantity: 'Dami',
      dateGiven: 'Petsa ibinigay',
    },
    programDistribution: 'Pamamahagi ng Programa',
    errors: {
      loadHistoryFailed: 'Hindi makuha ang mga na-report ninyo.',
    },
  },

  // ── Batch 2: Organization dashboard ────────────────────────────────────
  orgHome: {
    dashboardTitle: 'Dashboard ng Organisasyon',
    typeBadgeFarmers: 'Farmers Organization',
    typeBadgeFisherfolk: 'Fisherfolk Organization',
    // Address is composed the same way the citizen profile screen does it —
    // every organization in this system is in Aringay, La Union.
    addressLine: (barangay) => `Brgy. ${barangay}, Aringay, La Union`,
    statMembers: 'Kasapi',
    statPositions: 'Posisyon',
    positionsOf: (filled, total) => `${filled}/${total}`,

    vacancyTitle: 'May bakanteng posisyon',
    vacancyBody: (positions) => `${positions} — kailangan italaga`,
    noVacancy: 'Kumpleto ang mga opisyal',

    actionsHeading: 'Mga aksyon',
    addMember: 'Magdagdag ng Kasapi',
    addMemberSub: (personLabelLower) => `Maghanap at magdagdag ng rehistradong ${personLabelLower}`,
    assignOfficer: 'Italaga ang Opisyal',
    assignOfficerSub: 'Pumili ng kasapi para sa isang posisyon',
    distribute: 'Ipamahagi ang Tulong',
    distributeSub: 'I-record ang tulong na naibigay sa mga kasapi',

    officerRosterHeading: 'Roster ng Opisyal',
    vacant: 'Bakante',
    membersHeading: 'Mga kasapi',
    membersCount: (n) => `Mga kasapi — ${n} lahat`,
    membersEmpty: 'Wala pang kasapi ang organisasyong ito.',
    membersLoading: 'Kinukuha ang mga kasapi...',
    officersLoading: 'Kinukuha ang mga opisyal...',
    loadFailed: 'Hindi makuha ang datos ng organisasyon.',
    retry: 'Subukan ulit',

    secondaryHeading: 'Iba pa',
    reportingHistory: 'History ng Reporting',
    reportingHistorySub: 'Tingnan ang mga nakaraang record',
    backToDashboard: 'Bumalik sa dashboard',
  },

  // ── Batch 2: Add Member ────────────────────────────────────────────────
  orgAddMember: {
    title: 'Magdagdag ng Kasapi',
    searchPlaceholder: 'Maghanap ng pangalan...',
    // The 2-character minimum is a real server rule, not a UI nicety — the
    // endpoint returns nothing below it. Say so rather than showing an
    // empty-looking result.
    hint: (personLabelLower) => `Maghanap ng pangalan ng rehistradong ${personLabelLower} para idagdag sa organisasyon.`,
    minChars: 'Magpasok po ng hindi bababa sa 2 letra.',
    searching: 'Naghahanap...',
    noResults: 'Walang nakitang tugma.',
    capped: 'Ipinapakita lang ang unang 20. Gawing mas tiyak ang paghahanap kung wala rito.',
    alreadyMember: 'Kasapi na',
    currentOrgLabel: (orgName) => `Kasapi ng ${orgName}`,
    noCurrentOrg: 'Walang organisasyon',
    addButton: 'Idagdag',

    reassignTitle: 'Lilipat ng organisasyon',
    reassignBody: (name, orgName) =>
      `Si ${name} ay kasapi ngayon ng ${orgName}. Kapag idinagdag ninyo rito, matatanggal po siya sa ${orgName}.`,
    reassignOfficerNote: 'Matatanggal din ang posisyon niya bilang opisyal doon.',
    reassignConfirm: 'Ituloy at ilipat',
    addSuccess: (name) => `Naidagdag na si ${name}.`,
    addFailed: 'Hindi maidagdag ang kasapi.',
  },

  // ── Batch 2: Remove Member ─────────────────────────────────────────────
  orgRemoveMember: {
    title: 'Tanggalin sa organisasyon',
    body: (name) => `Tatanggalin po si ${name} sa organisasyon. Hindi po mabubura ang record niya sa registry.`,
    // Only shown when the member actually holds a position — the backend
    // clears it automatically, so the copy has to say so before the fact.
    officerWarning: (position) => `Siya po ang kasalukuyang ${position}. Matatanggal din ang posisyong ito at magiging bakante.`,
    confirm: 'Tanggalin',
    success: (name) => `Natanggal na si ${name}.`,
    failed: 'Hindi matanggal ang kasapi.',
  },

  // ── Batch 2: Assign Officer ────────────────────────────────────────────
  orgAssignOfficer: {
    title: 'Italaga ang Opisyal',
    pickPosition: 'Pumili ng posisyon:',
    pickMember: 'Pumili ng kasapi para sa posisyong ito:',
    currentHolder: (name) => `Ngayon: ${name}`,
    willReplace: (name) => `Papalitan po si ${name} sa posisyong ito.`,
    noMembers: 'Walang kasapi na maitatalaga. Magdagdag po muna ng kasapi.',
    assignButton: 'Italaga',
    success: (name, position) => `Si ${name} na po ang ${position}.`,
    failed: 'Hindi maitalaga ang opisyal.',
  },

  // ── CitizenReportAssistanceModal ───────────────────────────────────────
  reportAssistance: {
    titleNew: 'Mag-report ng tulong',
    titleEdit: 'I-edit ang report ng tulong',
    fields: {
      assistanceType: 'Uri ng tulong',
      dateGiven: 'Petsa ibinigay',
      quantityAmount: 'Dami / halaga',
      quantityPlaceholder: 'hal. 2 sako, 1 unit',
      sourceAgency: 'Galing na ahensya',
      season: 'Season',
      program: 'Ikabit sa isang programa (opsyonal)',
      programHelp: 'Iwanang walang pili para maitala ito nang mag-isa, gaya ng dati.',
      programNone: 'Walang programa — mag-isang record',
      remarks: 'Remarks',
    },
    errors: {
      requiredFields: 'Kailangan po ang uri ng tulong, dami, at petsa.',
      specifySourceAgency: 'Pakisulat po kung anong ahensya.',
      genericSaveError: 'Hindi na-save.',
    },
    submitNew: 'Mag-report ng tulong',
    submitEdit: 'I-save ang binago',
    successNew: 'Na-report ang tulong.',
    successEdit: 'Na-update ang report ng tulong.',
  },

  // ── CitizenDistributeToOrgModal ────────────────────────────────────────
  distributeAssistance: {
    title: 'Ipamahagi sa lahat ng miyembro',
    subtitle: (personLabelLower) => `Gagawa ng isang record ng tulong para sa bawat kasalukuyang ${personLabelLower} na miyembro ng organisasyon ninyo.`,
    reviewButton: 'Suriin ang ipamamahagi',
    confirmButton: 'Kumpirmahin at ipamahagi',
    back: 'Bumalik',
    done: 'Tapos',
    organizationLabel: 'Organisasyon',
    currentMembers: 'Kasalukuyang miyembro',
    assistanceSummary: 'Tulong',
    // Batch 2: was an inline ` — ₱X per head` / ` on YYYY-MM-DD` tail on the
    // confirmation line. Split out so both the wording and the date format
    // go through this file.
    perHeadSummary: (amount) => ` — ₱${amount} bawat kasapi`,
    onDate: (formatted) => ` noong ${formatted}`,
    willSkip: (count) => `${count} miyembro ang lalaktawan`,
    willFlag: (count) => `${count} miyembro ang naka-flag para suriin`,
    willReceive: (count) => `${count} miyembro ang makakatanggap ng bagong record. Hindi po ito awtomatikong mababawi — suriin pong mabuti bago kumpirmahin.`,
    fields: {
      assistanceType: 'Uri ng tulong',
      dateGiven: 'Petsa ibinigay',
      quantity: 'Dami (bawat miyembro)',
      cashAmount: 'Kabuuang halaga (₱) bawat isa',
      sourceAgency: 'Galing na ahensya',
      season: 'Season',
      description: 'Deskripsyon',
      program: 'Ikabit sa isang programa (opsyonal)',
      programHelp: 'Ang miyembrong naka-enroll na sa programang ito ay lalaktawan, hindi haharangin.',
      programNone: 'Walang programa — mag-isang record',
    },
    errors: {
      requiredFields: 'Kailangan po ang uri ng tulong at petsa.',
      specifyAssistanceType: 'Pakisulat po kung anong uri ng tulong.',
      specifySourceAgency: 'Pakisulat po kung anong ahensya.',
      invalidCashAmount: 'Maglagay po ng tamang halaga bawat isa.',
      previewFailed: 'Hindi ma-preview ang ipamamahagi.',
      distributeFailed: 'Hindi naipamahagi ang tulong.',
    },
    resultSummary: (created, skipped, errors) => `${created} nagawa · ${skipped} nilaktawan · ${errors} error`,
    statusCreated: 'Nagawa',
    statusSkipped: 'Nilaktawan',
    statusError: 'Error',
  },
}

export default labels
