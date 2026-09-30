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
    toggleSidebar: 'I-toggle ang sidebar',
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
    profileNav: 'Aking Profile',
  },

  // ── Mobile tab bar (< 640px only) ──────────────────────────────────────
  // New farmer/fisheries reference: FIVE tabs, and the two domains carry
  // DIFFERENT sets — a farmer logs activities and reports sakuna, a
  // fisherfolk logs feeding and reports pond health. Copy is verbatim from
  // the reference, including the English-in-Tagalog forms it uses.
  tabBar: {
    ariaLabel: 'Pangunahing navigation',
    home: 'HOME',
    // Farmer
    farmerActivity: 'AKTIBIDAD',
    farmerDisaster: 'SAKUNA',
    farmerHarvest: 'ANI',
    // Fisherfolk
    fishLog: 'I-LOG',
    fishHealth: 'KALUSUGAN',
    fishReport: 'ULAT',
    // Both
    profile: 'PROFILE',

    // Superseded by the five-tab sets above, still consumed by the current
    // three-tab wiring in FarmerHomeScreen/FisherfolkHomeScreen. They go
    // when those screens are rebuilt and their tabs are re-pointed.
    harvests: 'Ani',
    myInfo: 'Impormasyon',
  },

  // Farmer citizen redesign (2026-09-29): chrome copy taken verbatim from
  // UPDATED FARMER CITIZEN UI.docx, including the parts it leaves in English.
  farmerChrome: {
    tabs: {
      home: 'Home',
      activity: 'Mag-ulat ng aktibidad',
      disaster: 'Mag-ulat ng sakuna',
      results: 'Resulta ng ani',
      assistance: 'Tulong',
    },
    nav: {
      home: 'Simula',
      log: 'Mag-log',
      disaster: 'Sakuna',
      results: 'Ani',
      assistance: 'Assistance',
    },
    menu: {
      viewProfile: 'View Profile',
      help: 'Help',
      logout: 'Log-out',
    },
  },

  // Farmer Sakuna form addition: the reference ends this label with a full stop.
  farmerDisaster: {
    totalLoss: 'Total loss po ito.',
    reportNew: '+ I-report ang kalamidad',
    affectedMeta: (date, ha, crop) => [date, `${ha} ha na tinamaan`, crop].filter(Boolean).join(' · '),
  },

  // Farmer Ani (results) screen additions, verbatim from the reference.
  farmerAni: {
    none: 'Wala',
    viewHistory: 'Tingnan ang history',
  },

  // Farmer Home screen, verbatim from the reference.
  farmerHomeNew: {
    statParcels: 'Farm parcels',
    statActiveCrops: 'Aktibong pananim',
    statArea: 'Kabuuang lawak',
    statHarvestsThisMonth: 'Aani ngayong buwan',
    attentionTitle: (n) => `${n} pananim ang kailangan ng atensyon`,
    attentionBody: 'May mga nakatakdang gawain ngayong araw.',
    attentionCta: 'Tingnan',
    active: 'Active',
    parcel: (n) => `Parcel ${n}`,
    suggestionsTitle: 'Activity Suggestions',
    suggestionNext: (activity) => `${activity} is recommended next.`,
    logThis: 'Log this',
  },

  // Farmer Tulong (assistance) screen, verbatim from the reference.
  farmerAssistance: {
    awaitingHeading: 'Awaiting your confirmation',
    upcomingHeading: 'Upcoming',
    receivedHeading: 'Received',
    awaitingPill: 'Awaiting Confirmation',
    upcomingPill: 'Upcoming',
    confirmedPill: 'Confirmed',
    notReceivedPill: 'Not Received',
    resolvedPill: 'Resolved',
    confirmCta: 'Kumpirmahin kung natanggap',
    notReceivedCta: 'Hindi natanggap',
    expectedOn: (d) => `Expected on ${d}`,
    confirmedOn: (d) => `Confirmed ${d}`,
    days: (n) => `${n} day${Number(n) === 1 ? '' : 's'}`,
    confirmTitle: 'Kumpirmahin ang tulong',
    proofPhoto: 'Proof photo (optional)',
    note: 'Note',
    cancel: 'Cancel',
    confirm: 'Kumpirmahin',
    reportTitle: 'Hindi natanggap',
    reason: 'Reason',
    submit: 'Isumite',
  },

  // Farmer crop history screen, verbatim from the reference.
  farmerHistory: {
    back: 'Bumalik sa resulta',
    activities: 'Mga aktibidad',
    logActivity: 'Mag-log ng gawain',
    disasters: 'Mga kalamidad',
    lastHarvest: 'Huling ani',
    edit: 'I-edit',
    recordHarvest: 'Itala ang ani',
    harvestMeta: (date, mt) => `${date} · ${mt} MT`,
  },

  // New farmer/fisheries reference — copy verbatim from the 33 frames.
  ffNew: {
    greetingMorning: 'Magandang umaga,',
    headerMeta: (brgy, rsbsa) => `Brgy. ${brgy} · RSBSA ${rsbsa}`,
    footer: (dateText) => `${dateText} · OMAg Aringay`,

    needsAttention: 'Mga Kailangan ng Pansin',
    badgeOverdue: 'OVERDUE',
    badgeDueToday: 'DUE TODAY',
    overdueDays: (n) => `${n} araw na nalagpas`,

    activeCrops: 'MGA AKTIBONG TANIMAN',
    activePill: 'ACTIVE',
    cropProgress: 'Progreso patungong ani',
    daysLeft: (n, dateText) => `${n} araw pa · ${dateText}`,
    logActivity: 'I-log ang Aktibidad',
    reportDisaster: 'Iulat ang Sakuna',

    myPonds: 'AKING MGA POND',
    feedingNow: 'Pagpapakain Ngayon',
    pondCount: (n) => `${n} pond`,
    lastFeed: (dateText, feed, qty) => `Huling pagkain: ${dateText} · ${feed} · ${qty}`,
    pondProgress: 'Progreso',
    fingerlings: (n) => `${n} fingerlings`,
    noStock: 'Walang stock',
    needsFeeding: 'Pakainin na',
    logActivityCta: '+ I-log ang Aktibidad',

    // Every record already carries an owner, so an empty state here means
    // the office has not registered anything for this person yet.
    noCrops: 'Wala pang nakarehistrong taniman. Makipag-ugnayan po sa Office of the Municipal Agriculturist.',
    noPonds: 'Wala pang nakarehistrong pond. Makipag-ugnayan po sa Office of the Municipal Agriculturist.',
    allClear: 'Walang kailangang aksyon ngayon.',

    // The reference tags every history row with who logged it, as a pill,
    // not only the staff-logged ones. Both states are backed: the log
    // serializers expose recorded_by / logged_by, compared against the
    // citizen's own user id.
    loggedByStaff: 'NA-LOG NG STAFF',
    loggedByYou: 'IKAW ANG NAG-LOG',

    // I-Log screen. The reference draws THREE activity cards, but the system
    // supports nine and six of the others are in active use (Sampling 64,
    // Pond Preparation 20, Stocking 19 ...). Copying it literally would make
    // those unloggable, so the three keep their prominent cards and 'Iba pa'
    // reveals the rest. Nothing is lost; the reference's shape is kept.
    // ── Desktop POV shell (UI Base Desktop POV.pdf, 17 frames) ────────
    // A genuinely different desktop information architecture: persistent
    // left sidebar, topbar, two-column body with a right rail. Copied
    // verbatim from the reference's own Tagalog nav labels and copy.
    desktop: {
      appNameFarmer: 'OMAg Farmer',
      appNameFisherfolk: 'OMAg Fisherfolk',
      municipality: 'Aringay, La Union',

      navHome: 'Simula',
      navLog: 'Mag-log',
      navSakuna: 'Sakuna',
      navKaramdaman: 'Karamdaman',
      navAni: 'Ani',
      navTulong: 'Tulong Natanggap',

      greeting: (name) => `Magandang gabi, ${name}!`,
      greetingMorning: (name) => `Magandang umaga, ${name}!`,

      accountProfile: 'Aking Profile',
      accountHelp: 'Tulong / Help',
      accountLogout: 'Mag-logout',

      needsAttention: 'Kailangang Asikasuhin',
      overdueTag: (n) => `Huli na ng ${n} araw`,
      dueNowTag: 'Ngayon',
      logCta: 'Mag-log',

      activeCrops: 'Mga Aktibong Taniman',
      activePonds: 'Aking Mga Pond',
      cycleProgress: 'Progreso sa panahon ng paglago',
      expectedHarvest: 'Inaasahang Ani',
      logActivityInline: '+ Mag-log ng Aktibidad',

      quickActions: 'Mabilis na Kumilos',
      qaSakuna: 'Ulat ng Sakuna',
      qaSakunaSub: 'I-report ang pinsala sa taniman',
      qaSakunaSubFish: 'Fish kill, baha, polusyon',
      qaAni: 'Mga Resulta ng Ani',
      qaAniSub: 'Kasaysayan ng lahat ng ani',
      qaAniSubFish: 'Kasaysayan per pond',
      qaKaramdaman: 'Karamdaman / Namamatay',
      qaKaramdamanSub: 'I-log ang illness o mortality',
      qaTulong: 'Tulong Natanggap',
      qaTulongSub: 'Seeds, abono, at kagamitan',
      qaTulongSubFish: 'Fingerlings, nets, at kagamitan',

      farmSummary: 'Buod ng Bukid',
      farmSummaryActiveCrops: 'Aktibong Taniman',
      farmSummaryNeedsAttention: 'Pag-aasikaso',
      farmSummaryArea: 'Kabuuang Lawak',
      farmSummaryPlantedThisYear: 'Naitanim ngayong Taon',

      fisherySummary: 'Buod ng Fishery',
      fisherySummaryActivePonds: 'Aktibong Pond',
      fisherySummaryTotalFish: 'Kabuuang Isda',
      fisherySummaryArea: 'Kabuuang Lawak',
      fisherySummaryEmptyPonds: 'Walang Isda',

      selectedCrop: 'Napiling Taniman',
      selectedCropHint: 'Pumili ng taniman upang makita ang detalye nito.',
      selectedPond: 'Napiling Pond',
      selectedPondHint: 'Pumili ng pond upang makita ang detalye nito.',

      cropInsuranceHeading: 'CROP INSURANCE',
      cropInsuranceBody: 'Pagkatapos mag-submit, makipag-ugnayan sa OMAg para sa PCIC crop insurance claim.',
      fishInsuranceHeading: 'FISH INSURANCE',
      fishInsuranceBody: 'Pagkatapos mag-submit, makipag-ugnayan sa BFAR o OMAg para sa fish loss insurance claim.',

      tandaanHeading: 'TANDAAN',
      tandaanEditable: 'Maaari mong i-edit ang anumang entry sa record mo, kasama na ang mga ini-log ng field staff.',
      tandaanDateDefault: 'Ang petsa ay default sa ngayon — gamitin ang “Kahapon” para sa aktibidad na hindi naitala kaagad.',
      tandaanFeedDaily: 'Ang Feed Monitoring ay para sa araw-araw na pag-log.',
      tandaanDiseaseUnusual: 'Gamitin ang Disease Control para sa mga hindi karaniwang sitwasyon.',
      loggedByYouNote: 'Ikaw ang mag-e-log nito — maaari mong baguhin kahit ang mga entry ng field staff.',

      helpAssistance: 'TULONG NATANGGAP',
      helpAssistanceSubtitle: 'Pinakabago muna',
      assistanceSummary: 'Buod ng Tulong',
      assistanceTotalCount: 'Kabuuang Tulong',
      assistanceRecordedEntries: 'Recorded na entry',
      assistanceProvidedBy: 'Nagbigay ng Tulong',
      assistanceReadOnly: 'Read-only · Para sa katanungan, makipag-ugnayan sa OMAg',
      assistanceInfoHeading: 'IMPORMASYON',
      assistanceInfoBody: 'Ang listahang ito ay awtomatikong ina-update ng OMAg kapag may natanggap kang bagong tulong. Para sa katanungan, makipag-ugnayan sa opisina.',
      assistanceInfoBodyFish: 'Ang listahang ito ay awtomatikong ina-update ng OMAg at BFAR kapag may natanggap kang bagong tulong.',
      assistanceEmpty: 'Wala pa pong naitalang tulong na natanggap.',
      assistanceAwaitingBadge: 'Kumpirmahin kung natanggap',
      assistanceConfirmReceived: 'Natanggap ko na',
      assistanceReportNotReceived: 'Hindi ko pa natanggap',
      assistanceReasonLabel: 'Dahilan',
      assistanceReasonPlaceholder: 'Ilarawan kung bakit hindi pa natanggap…',
      assistanceReasonRequired: 'Kailangan po ng dahilan.',
      assistanceReportSubmit: 'I-submit ang Report',
      assistanceCancel: 'Kanselahin',
      assistanceConfirmedToast: 'Nakumpirma bilang natanggap.',
      assistanceReportedToast: 'Na-report bilang hindi natanggap.',
      assistanceActionFailed: 'May problema sa pag-proseso. Subukan muli.',
      assistanceNotReceivedNote: 'Naiulat mo na hindi natanggap ito — sinusundan na ng OMAg.',

      karamdamanTitle: 'Karamdaman / Namamatay',
      karamdamanSubtitle: 'Para sa hindi pangkaraniwang sitwasyon — hindi ito regular na feeding log',
      karamdamanPond: 'Pond',
      karamdamanType: 'Uri ng Karamdaman',
      karamdamanMortality: 'Bilang ng Namatay',
      karamdamanCause: 'Posibleng Dahilan',
      karamdamanCauseOtherPlaceholder: 'Ilarawan ang dahilan…',
      karamdamanDisposal: 'Paraan ng Pagtatapon',
      karamdamanDisposalOtherPlaceholder: 'Ilarawan ang paraan…',
      karamdamanTreatment: 'Ginawang Paggamot',
      karamdamanTreatmentPlaceholder: 'Ilagay ang iyong ginawang aksyon o paggamot…',
      karamdamanTreatmentHint: 'Libreng punan ito — may mungkahi man o wala, ikaw ang nagdesisyon kung ano ang ginawa mo',
      karamdamanConsulted: 'Kumonsulta sa Veterinarian o BFAR?',
      karamdamanConsultedYes: 'Oo, nakausap na',
      karamdamanConsultedNo: 'Hindi pa',
      karamdamanConsultedScheduled: 'Nakatakda na',
      karamdamanSave: 'I-save ang Record',
      karamdamanMahalaga: 'MAHALAGA',
      karamdamanMahalagaBody: 'Ang screen na ito ay para sa hindi pangkaraniwang karamdaman at mortality — hindi ito pangkaraniwang feeding log. Para sa regular na feeding, gamitin ang Log Activity.',
      karamdamanVetContact: 'VETERINARY CONTACT',
      karamdamanVetContactBody: 'Para sa emergency na payo mula sa BFAR, makipag-ugnayan sa OMAg at i-refer kayo sa tamang eksperto.',

      profileGovIds: 'Government IDs at Impormasyon ng Account',
      profileGovIdsNote: 'Para sa pagwawasto ng alinmang ID number, makipag-ugnayan sa OMAg o BFAR.',
      profileFieldsPending: 'Mga Field na Nangangailangan ng Kahilingan',
      profileFieldsPendingNote: 'Sinusuri ng opisina ang mga pagbabagong ito bago i-apply. Hindi mababago muli habang may nakabinbing kahilingan.',
      profileRequestBtn: 'Humiling',
      profileContactHeading: 'Contact Number — Agad Nababago',
      profileContactNote: 'Hindi kailangan ng pag-aproba ng opisina',
      profileChangeBtn: 'Baguhin',
      profileAccountInfo: 'Impormasyon ng Account',

      feedMonitoring: 'Feed Monitoring',
      diseaseControl: 'Disease Control',
      waterCondition: 'Kondisyon ng Tubig',
      fishCondition: 'Kondisyon ng Isda',
      feedTypeField: 'Uri ng Feed',
      feedBrand: 'Brand / Pangalan ng Feed',
      feedBrandHint: 'hal. Tateh, Shur-Gain, lokal na feed — o ilarawan kung walang brand',
      feedAmount: 'Dami (kg)',
    },

    // ── Sakuna / Ulat additions (frames 17, 18, 27-30) ────────────────
    sakuna: {
      // Reference wording verbatim (page01/page05 pink banner), domain-
      // specific: crop says "pananim/taniman", fisheries says "pond".
      introCrop: 'I-ulat ang pinsala sa inyong pananim. Maaari kang mag-report ng Total Loss kung ganap na nawasak ang taniman.',
      introFisheries: 'I-ulat ang sakuna sa inyong pond. Maaari kang mag-report ng Total Loss kung ganap na nawasak ang pond.',
      viewHistory: 'Tingnan ang mga naiulat na sakuna',

      damageLevel: 'ANTAS NG PINSALA',
      // Semantic, not decorative: the reference tints Mababa green,
      // Katamtaman amber and Mataas red, so the band reads at a glance.
      damageOptions: { Low: 'Mababa', Medium: 'Katamtaman', High: 'Mataas' },

      // Recovery is a two-step in the reference: the button appears once
      // every recommendation is logged (frame 28), and only then does it
      // open the required reason (frame 29). Keeping the reason behind the
      // button stops a half-filled box sitting under every active disaster.
      markRecovered: 'Markahan bilang Naayos na',
      recoverQuestion: 'Paano naayos?',
      recoverRequired: '(Kailangan po ito.)',
      recoverConfirm: 'Kumpirmahin',
      recoverBack: 'Bumalik',
      recoveredLabel: 'Naayos na',

      reportedTitle: 'Naiulat na po!',
      reportedBody: 'Ang sakuna ay naitala na. Makikita ang mga rekomendasyon sa itaas.',
      reportAnother: 'Mag-ulat pa ng isa',
    },

    // ── Aking Profile (frames 13, 14, 31) ─────────────────────────────
    profile: {
      title: 'Aking Profile',
      subtitle: 'Impormasyon mula sa registry ng OMAg',
      editCta: 'I-Edit ang Profile',

      verifiedFarmer: 'Nakarehistrong Magsasaka',
      verifiedFisherfolk: 'Nakarehistrong Mangingisda',

      rsbsa: 'RSBSA NUMBER',
      // The registry number is the identity key the whole system joins on;
      // it is never a self-service edit, hence the standing note.
      rsbsaNote: 'Hindi mababago. Makipag-ugnayan sa OMAg para sa pagwawasto.',
      fullName: 'BUONG PANGALAN',
      barangay: 'BARANGAY',
      contact: 'CONTACT NUMBER',
      identityNameEyebrow: 'PANGALAN',

      // Reference labels this row differently per domain: "Fishery" for
      // fisherfolk, "Uri" for farmer -- kept as two keys rather than one
      // shared string so each side reads exactly as drawn.
      activityTypeMiniFisherfolk: 'FISHERY',
      activityTypeMiniFarmer: 'URI',
      farmLaborer: 'Manggagawang Bukid',
      regularFarmer: 'Magsasaka',

      // Role pill in the identity card cover — English, per reference
      // ("Farmer" / "Fisherfolk" badge + Tagalog subtitle underneath).
      roleBadgeFarmer: 'Farmer',
      roleBadgeFisherfolk: 'Fisherfolk',
      roleSubtitleFarmer: 'Magsasaka',
      roleSubtitleFisherfolk: 'Mangingisda',

      // Switchable-identity chip — only ever shown to a dual-linked
      // citizen (see CitizenProfileScreen's otherLink).
      switchDomainCta: (otherLabel) => `Switch to ${otherLabel}`,
      switchDomainSwitching: 'Switching…',

      // Field-status legend, matching PROFILE REFERENCE!.docx's own
      // wording exactly (verbatim Tagalog, three fixed states). This is
      // deliberately its own copy from labels.farmerHelp.behaviors* --
      // that block is the Help screen's English-labeled legend, a
      // different frame with different wording; this is the profile
      // screen's own legend bar sitting directly under the identity row.
      legendInstant: 'Instant na Pagbabago',
      legendApproval: 'Kailangan ng Pag-apruba',
      legendLocked: 'Hindi Mababago',

      personalInfoHeading: 'Personal na Impormasyon',
      // Reference draws this card's own title in English even though the
      // rest of the screen is Tagalog -- kept verbatim, not "fixed" to
      // match the surrounding language.
      referenceInfoHeading: 'Reference Information',
      referenceInfoReadOnlyNote: 'Reference Information (Read-only)',
      birthdateLabel: 'Petsa ng Kapanganakan',
      civilStatusLabel: 'Katayuang Sibil',
      educationLabelDesktop: 'Antas ng Edukasyon',
      educationLabelMobile: 'Pinakamataas na Antas ng Edukasyon',
      statusFlagsLabel: 'Mga Status Flag',
      pwdLabel: 'PWD',
      fourPsLabel: '4Ps Beneficiary',
      // Always shown, even when empty -- see CitizenProfileScreen's
      // Reference Information card, which renders this row unconditionally
      // rather than hiding it under the hide-empty rule the other rows use.
      organizationLabel: 'Organisasyon',
      organizationNone: 'Hindi kasapi ng anumang organisasyon',
      civilStatusOptions: {
        Single: 'Walang Asawa',
        Married: 'May Asawa',
        Widowed: 'Balo',
        Separated: 'Hiwalay',
      },

      requestModalCurrentLabel: 'Kasalukuyan',
      requestModalNewLabel: 'Bagong halaga',
      requestModalSubmit: 'Isumite ang hiling',
      contactEditSave: 'I-save',
      contactEditCancel: 'Kanselahin',

      // Pending-change panel. ProfileChangeRequest has existed since the
      // profile self-service batch and has never been surfaced anywhere;
      // this is the reference's own presentation of it (frame 31).
      pendingHeading: 'Nakabinbin sa Pagsusuri',
      pendingRequested: (value) => `Kahilingang palitan ng: ${value}`,
      pendingSubmitted: (dateText) => `Isinumite: ${dateText}`,
      pendingNote: 'Naghihintay ng pag-aproba. Hindi maaaring baguhin habang naghihintay.',

      footerLine1: 'Para sa mga katanungan, makipag-ugnayan po sa',
      footerLine2: 'Office of the Municipal Agriculturist · Aringay, La Union',

      helpRowLabel: 'Tulong',

      // Edit sheet. The reference draws the entry point but has no frame for
      // the sheet itself, so it is kept to exactly what the backend already
      // supports and says plainly which changes are instant and which need
      // review -- rather than inventing a flow the frames never specify.
      editTitle: 'I-Edit ang Profile',
      editSubtitle: 'Ilang bahagi lang ang maaaring baguhin ninyo mismo.',
      editContactLabel: 'CONTACT NUMBER',
      editContactNote: 'Agad na mababago.',
      editReviewHeading: 'KAILANGAN NG PAG-APRUBA',
      editReviewNote: 'Ang pagbabago sa pangalan at barangay ay dadaan muna sa pagsusuri ng OMAg.',
      editFirstName: 'PANGALAN',
      editMiddleName: 'GITNANG PANGALAN',
      editLastName: 'APELYIDO',
      editBarangay: 'BARANGAY',
      editSave: 'I-save',
      editCancel: 'Kanselahin',
      editSubmitted: 'Naisumite na po ang kahilingan.',
      editContactSaved: 'Na-update na po ang contact number.',
      editNothing: 'Wala pong binago.',
      editPendingBlocked: 'May nakabinbin nang kahilingan para sa bahaging ito.',

      // Password card — voluntary, not a forced first-login step. Staff
      // already generated and relayed the first password in person; this
      // is just a genuinely reachable way to set a new one, any time.
      passwordCardHeading: 'Password',
      passwordCardNote: 'Optional. Maaari ninyong baguhin ang password anumang oras — hindi ito kailangan.',
      passwordCurrentLabel: 'KASALUKUYANG PASSWORD',
      passwordNewLabel: 'BAGONG PASSWORD',
      passwordConfirmLabel: 'KUMPIRMAHIN ANG BAGONG PASSWORD',
      passwordChangeCta: 'Baguhin ang Password',
      passwordMismatch: 'Hindi magkatugma ang bagong password at kumpirmasyon.',
      passwordChanged: 'Nabago na po ang password. Mag-log in ulit gamit ang bagong password.',
    },

    // ── Mga Resulta ng Ani (frames 32-33) ─────────────────────────────
    // Backward-looking only. The intro says so explicitly because the same
    // numbers feed the staff-side forecasting screens, and a citizen must
    // not read this as a prediction or a promise.
    ani: {
      title: 'Mga Resulta ng Ani',
      subtitle: 'Aktwal kumpara sa tinantya sa pagtatanim',
      intro: 'Ipinapakita dito kung paano lumabas ang bawat nakaraang pananim — walang pagtataya o pangako para sa hinaharap. Ang tinantyang ani ay batay sa lugar na itinanim at karaniwang ani bawat ektarya.',

      meta: (ha, brgy, dateText) => [ha ? `${ha} ha` : null, brgy ? `Brgy. ${brgy}` : null, dateText]
        .filter(Boolean).join(' · '),

      actual: 'Aktwal na ani',
      estimated: 'Tinantya sa oras ng pagtatanim',

      // The reference uses the same "bahagyang mas mababa" sentence for a
      // -7% and a -20% card, so there is one below-estimate string, not a
      // severity ladder it never shows.
      verdictAbove: 'Lumampas ang aktwal na ani sa tinantya — magandang resulta po para sa tanim na ito.',
      verdictBelow: 'Bahagyang mas mababa ang aktwal na ani kumpara sa tinantya. Ito ang resulta ng tanim na ito.',
      verdictOnTarget: 'Tumugma ang aktwal na ani sa tinantya para sa tanim na ito.',
      verdictNoEstimate: 'Walang naitalang tinantyang ani para sa tanim na ito, kaya walang maihahambing.',
      verdictTotalLoss: 'Naitala ang tanim na ito bilang ganap na nawasak, kaya hindi ito inihahambing sa tinantya.',

      factorsHeading: 'MGA POSIBLENG KAUGNAY NA SALIK',
      // scheduled_day is a day offset from planting; the reference shows the
      // MONTH it fell in, which is derived here from date_planted + offset
      // rather than asking the backend for a second representation.
      factorItem: (activity, monthText) => `${activity}${monthText ? ` (${monthText})` : ''} — hindi naka-log`,
      factorsFootnote: 'Nakalista ito bilang impormasyon lamang — hindi kinukumpirma na ito ang dahilan ng kaibahan.',

      empty: 'Wala pa pong naitalang ani. Lilitaw dito ang resulta pagkatapos maitala ang inyong pag-aani.',
      loadError: 'Hindi makuha ang resulta ng ani ngayon. Subukan po ulit mamaya.',
    },

    // ── Farmer AKTIBIDAD screen (frames 21-26) ────────────────────────
    // Structurally different from the fisherfolk log: a TANIMAN dropdown
    // (not cards), a 2x2 grid of Tagalog activity pills (not icon rows),
    // three date pills where the third reveals a picker, per-type fields,
    // and a collapsible history at the bottom.
    farmerLog: {
      title: 'I-log ang Aktibidad',
      cropHeading: 'Taniman',
      cropOption: (name, ha, brgy) => `${name} — ${ha} ha, Brgy. ${brgy}`,

      activityHeading: 'Uri ng Aktibidad',
      // Keys are the values actually stored in activity_type. Three of the
      // four are already in live data and in the serializer's own
      // special-casing ('Pest Control', 'Disease Control'); the citizen form
      // previously offered 'Pesticide Application', which matched neither,
      // so a citizen's pest log silently skipped the area-affected rule.
      types: {
        'Fertilizer Application': 'Paglalagay ng Abono',
        'Pest Control': 'Kontrol sa Peste',
        'Disease Control': 'Kontrol sa Sakit ng Halaman',
        'Water Quality Check': 'Pagsusuri ng Kalidad ng Tubig',
        Other: 'Iba pa',
      },
      // 'Iba pa' is drawn as a fifth tile in the same grid, which is the
      // reference's own device for "anything else" on the sakuna form
      // (frame 28). It is needed: 30 distinct activity_type values are in
      // live use and the four tiles cover only three of them.
      otherPlaceholder: 'Ilarawan ang uri ng aktibidad…',

      dateHeading: 'Petsa ng aktibidad',
      dateToday: 'Ngayon',
      dateYesterday: 'Kahapon',
      dateOther: 'Iba pang petsa',

      fertilizerType: 'Uri ng abono',
      // The reference draws a select but never opens it, and the column
      // holds no real data to source from, so the options are the model's
      // own documented examples (CropActivityLog.fertilizer_type help_text)
      // with a free-text fallback rather than an invented catalogue.
      fertilizerOptions: ['14-14-14 NPK', 'Urea (46-0-0)', 'Organic / Compost'],
      quantityKg: 'Dami',
      unit: 'Unit',
      quantityPlaceholder: 'hal. 25',
      applicationMethod: 'Paraan ng paglagay',
      methodOptions: {
        Broadcast: 'Broadcast (isabog)',
        Basal: 'Basal (sa tanim)',
        'Side-dress': 'Side-dress (sa gilid)',
        'Foliar Spray': 'Foliar spray (dahon)',
        Fertigation: 'Fertigation (sa tubig)',
      },

      pestName: 'Pangalan ng peste',
      pestPlaceholder: 'hal. Stem Borer, Brown Plant Hopper',
      pestTreatment: 'Gamot / lunas na ginamit',
      pestTreatmentPlaceholder: 'hal. Chlorpyrifos, Fipronil',

      diseaseName: 'Uri ng sakit',
      diseasePlaceholder: 'hal. Blast, Tungro, Bacterial Leaf Blight',
      diseaseTreatment: 'Fungicide / gamot na ginamit',
      diseaseTreatmentPlaceholder: 'hal. Mancozeb, Tricyclazole',

      damageLevel: 'Antas ng pinsala',
      damageOptions: { Low: 'Mababa', Medium: 'Katamtaman', High: 'Mataas' },

      plantCondition: 'Kalagayan ng halaman',
      conditionOptions: { Good: 'Maganda', Fair: 'Katamtaman', Poor: 'Mahina' },
      waterQuality: 'Kalidad ng tubig',
      waterOptions: { Good: 'Mabuti', Fair: 'Katamtaman', Poor: 'Mahina' },

      notes: 'Mga tala / observasyon',
      notesOptional: '(opsyonal)',
      notesPlaceholder: 'Ano pa ang napansin ninyo sa taniman ngayon?',

      save: 'I-save ang Aktibidad',
      saveEdit: 'I-save ang binago',
      cancelEdit: 'Kanselahin ang pag-edit',

      historyHeading: 'Kasaysayan ng mga Aktibidad',
      historyEmpty: 'Wala pa pong naitalang aktibidad para sa taniman na ito.',
      editBtn: 'I-edit',
      selectPlaceholder: 'Pumili po…',
      noCrops: 'Wala pang nakarehistrong taniman. Makipag-ugnayan po sa Office of the Municipal Agriculturist.',
    },

    // ── Log ng Kalusugan (frames 7, 9-12, 15) ──────────────────────────
    // Its own three-step screen in the reference, NOT a field inside the
    // activity log. Step 1 pond, step 2 illness, step 3 the form, then a
    // confirmation. Every string below is copied from the frames.
    health: {
      title: 'Log ng Kalusugan',
      subtitle: 'Sakit o pagkamatay ng isda',
      notice: 'Gamitin ito para sa sakit, parasito, o malawakang pagkamatay ng isda. Para sa karaniwang pagpapakain, gamitin ang I-Log na aktibidad.',
      pondQuestion: 'Alin pong pond ang apektado?',
      selectedPond: 'Napiling pond',
      illnessQuestion: 'Anong uri ng sakit o problema?',
      contextLabel: 'Pond · Uri ng sakit',
      noIllnessTypes: 'Wala pang nakatalang uri ng sakit. Makipag-ugnayan po sa OMAg.',

      guideHeading: 'PANGKALAHATANG MUNGKAHI SA PAG-AALAGA',
      // No veterinary/BFAR-referral language — this is containment/
      // husbandry guidance (isolate stock, check water, harvest early to
      // limit spread), not a treatment protocol needing professional
      // sign-off, so the disclaimer no longer points to one.
      guideDisclaimer: 'Pangkalahatang gabay lamang ito, hindi ito tiyak na paggamot.',

      observationDate: 'PETSA NG OBSERBASYON',
      affectedPortion: 'TINATAYANG BAHAGI NG POND NA APEKTADO',
      // Keys are the stored English values on
      // FisheriesActivityLog.AFFECTED_PORTION_CHOICES; these are display only.
      portionOptions: {
        'Few fish': 'Ilang isda lamang (wala pang 10%)',
        Part: 'Bahagi ng pond (10–30%)',
        Half: 'Kalahati ng pond (30–60%)',
        Most: 'Karamihan ng pond (higit sa 60%)',
        All: 'Lahat ng isda',
      },
      mortality: 'BILANG NG NAMATAY (KUNG MAYROON)',
      mortalityPlaceholder: 'hal. 50',
      possibleCause: 'POSIBLENG DAHILAN',
      possibleCauseOtherPlaceholder: 'Ilarawan ang dahilan…',
      disposalMethod: 'PARAAN NG PAGTATAPON',
      disposalMethodOtherPlaceholder: 'Ilarawan ang paraan…',
      consulted: 'KUMONSULTA SA BETERINARYO O BFAR?',
      yes: 'Oo',
      no: 'Hindi',
      treatment: 'PAGGAMOT NA GINAWA (KUNG MAYROON)',
      treatmentPlaceholder: "Ilarawan ang ginawang paggamot. Kung wala pang ginawa, maaaring ilagay ang 'Wala pa.'",
      treatmentDisclaimer: 'Ang paggamot ay inyong sariling desisyon at obserbasyon — huwag ibase sa mungkahi sa itaas nang walang konsultasyon sa eksperto.',
      extraNotes: 'KARAGDAGANG TALA (OPSYONAL)',
      extraNotesPlaceholder: 'Anumang ibang obserbasyon…',
      escalation: 'Para sa malubha o malawakang pagkamatay ng isda, makipag-ugnayan agad sa OMAg o BFAR regional office.',
      save: 'I-save ang Log ng Kalusugan',

      successTitle: 'Naitala na po',
      successBody: (pond) => `Nai-save ang kalusugan log para sa ${pond}. Puwede na ninyong isara ito o mag-log ng isa pa.`,
      logMore: 'Mag-log pa',
      backHome: 'Bumalik sa Home',
    },

    activityTypeHeading: 'URI NG AKTIBIDAD',
    activityMore: 'Iba pa',
    activityMoreSub: 'Sampling, stocking, pond preparation, at iba pa',
    // Water Quality Check readings. Values are stored in English (matching
    // every other choice set in the model); these are the Tagalog display
    // labels only.
    // Sakuna / Ulat recommendation checklist.
    // Disaster-type tiles. Every value the models actually define is listed:
    // the reference omits Strong Winds (farmer) and Disease Outbreak /
    // Predator Attack (fisherfolk), but Strong Winds carries response rules
    // and the other two appear in live records, so dropping them would make
    // real situations unreportable. Values stay English; these are display.
    // Kalusugan. The illness list is the real DiseaseType table (5 rows,
    // seeded earlier), not a hardcoded copy of the reference's list -- they
    // happen to match exactly.
    illnessHeading: 'Anong uri ng sakit o problema?',
    kalusuganNotice: 'Gamitin ito para sa sakit, parasito, o malawakang pagkamatay ng isda. Para sa karaniwang pagpapakain, gamitin ang I-Log ang Aktibidad.',

    disasterTypeHeading: 'URI NG SAKUNA',
    disasterTypes: {
      Typhoon: 'Bagyo',
      Flood: 'Baha',
      Drought: 'Tagtuyot',
      'Pest Outbreak': 'Pagkalat ng Peste',
      'Strong Winds': 'Malakas na Hangin',
      'Fish Kill': 'Fish Kill \u2014 malawakang pagkamatay ng isda',
      'Disease Outbreak': 'Pagkalat ng Sakit',
      'Pollution Incident': 'Polusyon',
      'Predator Attack': 'Inatake ng Mandaragit',
      Other: 'Iba pa',
    },
    disasterOtherPlaceholder: 'Ilarawan ang uri ng sakuna\u2026',

    recommendations: 'MGA REKOMENDASYON',
    recProgress: (done, total) => `${done}/${total}`,
    recRemaining: (n) => (n === 1 ? '1 hakbang pa ang natitira' : `${n} hakbang pa ang natitira`),
    recAllDone: 'Tapos na ang lahat ng hakbang.',
    recNone: 'Walang partikular na rekomendasyon para sa uri ng sakunang ito.',
    // The tick comes from a LOGGED activity, never from tapping the row --
    // see the note in CitizenDisasterScreen.
    recTapHint: 'Pindutin para i-log ang hakbang na ito',

    phLevel: 'PH LEVEL',
    phPlaceholder: 'hal. 7.2',
    dissolvedOxygen: 'DISSOLVED OXYGEN',
    waterClarity: 'KALINAWAN NG TUBIG',
    doOptions: { Low: 'Mababa', Normal: 'Normal', High: 'Mataas' },
    clarityOptions: {
      Clear: 'Malinaw',
      'Slightly Turbid': 'Bahagyang malabo',
      Turbid: 'Malabo',
    },

    activitySubtitles: {
      'Feed Monitoring': 'Pagpapakain ng isda',
      'Disease Control': 'Pamamahala ng sakit',
      'Water Quality Check': 'Pagsusuri ng tubig',
    },
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
      title: 'KAILANGANG ASIKASUHIN',
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
      title: 'PAKAININ NGAYON',
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
      feedRecommended: (stage, feedName) => `Yugto ng paglaki: ${stage} — inirerekomenda: ${feedName}`,
      feedUseRecommended: 'Gamitin ito',
      mortalityCount: 'Bilang ng namatay',
      possibleCause: 'Posibleng dahilan',
      possibleCauseOtherPlaceholder: 'Ilarawan ang dahilan…',
      disposalMethod: 'Paraan ng pagtatapon',
      disposalMethodOtherPlaceholder: 'Ilarawan ang paraan…',
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
    possibleCauseOptions: {
      Disease: 'Sakit',
      'Poor Water Quality': 'Hindi magandang kalidad ng tubig',
      'Predator Attack': 'Inatake ng mandaragit',
      'Handling Stress': 'Stress sa paghawak',
      Overcrowding: 'Sobrang dami sa pond',
      Unknown: 'Hindi alam',
      Other: 'Iba pa',
    },
    disposalMethodOptions: {
      Buried: 'Inilibing',
      Composted: 'Ginawang compost',
      Incinerated: 'Sinunog',
      'Municipal Waste Collection': 'Ikinolekta ng basura ng bayan',
      Other: 'Iba pa',
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
    // Shown when record.expected_harvest_date exists, for both domains
    // (crop and pond share this one modal) — same "N araw" phrasing already
    // established elsewhere (see overdueDays/daysLeft), not new wording.
    expectedHarvestLabel: 'Inaasahang ani',
    expectedHarvestDaysFromNow: (n) => `${n} araw pa`,
    expectedHarvestDaysAgo: (n) => `${n} araw na nalagpas`,
    // Live comparison against whichever harvest-date field is currently
    // filled in — updates as it's picked, not just a static target date.
    expectedHarvestOnTime: '✓ Tugma sa inaasahang petsa ng ani.',
    expectedHarvestEarly: (n) => `${n} araw na mas maaga kaysa inaasahan.`,
    expectedHarvestLate: (n) => `${n} araw na mas huli kaysa inaasahan.`,
    // Same idea, for the estimated YIELD/quantity (not just the date) —
    // crop_type.yield_per_ha_kg × area_planted_ha for crops,
    // species.default_avg_body_weight_kg-based for ponds, both already on
    // the record.
    estimatedYieldLabel: 'Inaasahang dami ng ani',
    estimatedYieldOnTarget: '✓ Tugma sa inaasahang dami.',
    estimatedYieldAbove: (kg, pct) => `${kg} kg higit pa sa inaasahan (${pct}% mas marami).`,
    estimatedYieldBelow: (kg, pct) => `${kg} kg mas kulang sa inaasahan (${pct}% mas kaunti).`,
    // Shown when the chosen Unit of Measure has no real, standard kg
    // conversion (e.g. "sacks", "bundles") — the comparison above falls
    // back to treating the entered number as kg already.
    estimatedYieldNoConversion: (unit) => `Walang standard na kg conversion para sa "${unit}" — ipinapalagay ng paghahambing na ito na kg na ang inyong inilagay.`,
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
      photo: 'Larawan (opsyonal)',
      photoHint: 'JPG, PNG, o WEBP, hanggang 5 MB.',
    },
    errors: {
      dateRequired: 'Kailangan po ang petsa ng pangyayari.',
      specifyType: 'Pakisulat po kung anong uri ng kalamidad.',
      areaAffectedRequired: 'Kailangan po ang lawak na tinamaan.',
      areaAffectedInvalid: 'Ang lawak na tinamaan ay dapat mas mataas sa 0.',
      areaAffectedExceeds: (recordArea) => `Hindi po pwedeng lumagpas ang lawak sa ${recordArea} ha na nakatala.`,
      severityRequired: 'Kailangan po ang antas ng pinsala.',
      lockedByOther: 'May ibang naglo-log nito ngayon. Maghintay po muna.',
      genericSaveError: 'Hindi ma-save ang report ng kalamidad.',
      recoveryNoteRequired: 'Kailangan po ng note tungkol sa pagbawi kung hindi pa tapos lahat ng inirerekomendang tugon.',
      genericRecoverError: 'Hindi mamarkahan bilang nakabawi.',
    },
    submit: 'I-submit ang Ulat',
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
  },

  // ── MyOrgReportingSection ──────────────────────────────────────────────
  // Reference images 5-8. Copy is the mockup's own, verbatim where it is
  // legible, including the English technical terms it mixes in.
  orgReportAssistance: {
    title: 'Mag-report ng Tulong',
    chooserSubtitle: 'Piliin kung para sa isang miyembro o sa buong organisasyon.',
    chooseMemberTitle: 'Para sa Isang Miyembro',
    chooseMemberBody: 'I-log ang tulong na natanggap ng isang partikular na kasapi.',
    chooseOrgTitle: 'I-distribute sa Buong Organisasyon',
    chooseOrgBody: (n) => `I-distribute ang tulong sa lahat ng ${n} kasapi ng organisasyon.`,
    memberFormTitle: 'Para sa Isang Miyembro',
    memberFormSubtitle: 'Punan ang detalye ng tulong para sa isang kasapi.',
    orgFormTitle: 'I-distribute sa Organisasyon',
    // Shorter than chooseOrgBody above — the reference uses two different
    // phrasings for the same fact: the chooser card's longer body text
    // (image7) vs. the form step's short subtitle (image5: "Ibibigay sa
    // lahat ng 12 kasapi.").
    orgFormSubtitle: (n) => `Ibibigay sa lahat ng ${n} kasapi.`,
    step1NextButton: 'Susunod: I-preview',
    memberFieldLabel: 'KASAPI',
    memberPlaceholder: 'Pumili ng kasapi...',
    typeHeading: 'URI NG TULONG',
    quantity: 'DAMI',
    unit: 'YUNIT',
    cashPerMember: 'HALAGA BAWAT KASAPI (₱)',
    cashPreview: (amount) => `₱${amount} bawat kasapi`,
    recipientsHeading: 'MGA TATANGGAP',
    allMembers: 'Lahat ng kasapi',
    memberCount: (n) => `${n} kasapi`,
    // States the option-(b) scope honestly rather than drawing per-member
    // checkboxes that would not change what is sent.
    allMembersNote: 'Ipapadala sa lahat ng kasalukuyang kasapi. Hindi pa po pwedeng pumili ng iilan lang.',
    previewButton: 'I-preview bago kumpirmahin →',
    confirmTitle: 'Kumpirmahin ang tulong',
    resultTitle: 'Tapos na ang pag-report',
    notSpecified: 'Hindi tinukoy',
    other: 'Iba pa',
    otherTypePlaceholder: 'Anong uri ng tulong?',
    otherAgencyPlaceholder: 'Anong ahensya?',
    futureDateHint: 'Maaari pong pumili ng petsa sa hinaharap — magiging "Pending" ang record hanggang sa araw na iyon.',
  },

  // Reference image9.
  orgReportHistory: {
    title: 'Kasaysayan ng Reporting',
    countLine: (n) => `${n} distribusyon`,
    latest: 'PINAKABAGO',
    perMember: (amount) => `${amount} bawat kasapi`,
    givenTo: (n) => `${n} kasapi`,
    reportedBy: (name) => `I-report ni ${name}`,
    viewRecipients: (n) => `Tingnan ang ${n} tatanggap`,
    showRecipients: 'Tatanggap',
    hideRecipients: 'Itago',
    recipientsHeading: (n) => `MGA TATANGGAP (${n})`,
    notReceivedReason: (reason) => `Dahilan: ${reason}`,
  },

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
    errors: {
      loadHistoryFailed: 'Hindi makuha ang mga na-report ninyo.',
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
    title: 'Kumpirmahin Para sa Kasapi',
    subtitle: 'Mga kasaping walang aktibong account — maaari ninyong kumpirmahin sa kanilang ngalan.',
    countLine: (n) => `${n} kailangang kumpirmahin`,
    loading: 'Naglo-load...',
    loadFailed: 'Hindi makuha ang listahan.',
    empty: 'Walang kasaping kailangang kumpirmahin sa ngayon.',
    confirmButton: 'Kumpirmahin sa Ngalan Niya',
    pendingBadge: 'Nakabinbin sa pagsusuri',
    rejectedReason: (reason) => `Tinanggihan ng opisina: ${reason}`,
    modalTitle: 'Kumpirmahin ang Pagtanggap',
    modalSubtitle: (name) => `Para kay ${name}`,
    photoLabel: 'Larawan (opsyonal)',
    photoHint: 'JPG, PNG, o WEBP, hanggang 5 MB.',
    submit: 'Isumite',
    submitSuccess: 'Naisumite na — hinihintay ang pag-apruba ng opisina.',
    submitFailed: 'Hindi naisumite ang kumpirmasyon.',
  },

  // ── Batch: profile self-editing ────────────────────────────────────────
  // Two tiers, and the copy has to make the difference obvious: some edits
  // land immediately, others go to the office for review.
  profileEdit: {
    photoLabel: 'Larawan',
    logoLabel: 'Logo',
    changePhoto: 'Palitan ang larawan',
    changeLogo: 'Palitan ang logo',
    removePhoto: 'Alisin',
    uploading: 'Ina-upload...',
    uploadFailed: 'Hindi na-upload ang larawan.',
    uploadSuccess: 'Na-update na ang larawan.',
    removeSuccess: 'Naalis na ang larawan.',
    // Mirrors the server's own limits so the two never disagree.
    photoHint: 'JPG, PNG, o WEBP. Hanggang 5MB.',

    contactLabel: 'Contact number',
    contactSave: 'I-save',
    contactCancel: 'Kanselahin',
    contactSuccess: 'Na-update na ang contact number.',
    contactFailed: 'Hindi na-update ang contact number.',
    contactPlaceholder: '09XXXXXXXXX',
    contactInvalid: 'Dapat magsimula sa 09 at eksaktong 11 na numero.',
    editAction: 'I-edit',
    barangaySelectPlaceholder: 'Piliin ang barangay',

    requestChange: 'Humiling ng Pagbabago',
    pendingReview: 'Nakabinbin sa pagsusuri',
    pendingNote: (value) => `Hiniling: ${value}`,
    requestTitle: (fieldLabel) => `Humiling ng pagbabago — ${fieldLabel}`,
    requestCurrent: 'Kasalukuyan',
    requestNew: 'Bagong halaga',
    requestSubmit: 'Isumite ang hiling',
    requestSuccess: 'Naisumite na po. Hihintayin ang pagsusuri ng opisina.',
    requestFailed: 'Hindi naisumite ang hiling.',
    // The office reviews these, so say so plainly rather than implying the
    // change has already happened.
    reviewNotice: 'Ang mga pagbabagong ito ay dumadaan po sa pagsusuri ng opisina bago maaprubahan.',

    historyTitle: 'Mga hiling na pagbabago',
    historyEmpty: 'Wala pa kayong naisumiteng hiling.',
    statusPending: 'Nakabinbin',
    statusApproved: 'Naaprubahan',
    statusRejected: 'Hindi naaprubahan',
    rejectionReason: (reason) => `Dahilan: ${reason}`,

    fieldLabels: {
      first_name: 'Pangalan',
      middle_name: 'Gitnang pangalan',
      last_name: 'Apelyido',
      barangay: 'Barangay',
      name: 'Pangalan ng Samahan',
      street_address: 'Barangay / Street Address',
    },

    // Password card — same mechanics as the Farmer/Fisherfolk version
    // (labels.ffNew.profile.password*, CitizenProfileScreen.jsx), reused
    // for the Organization Info screen with one addition: this account is
    // shared/institutional, not personal, so passwordSharedAccountNote
    // says so explicitly rather than reusing identical copy that would
    // silently imply a single owner.
    passwordCardHeading: 'Password',
    passwordCardNote: 'Opsyonal. Maaari ninyong baguhin ang password anumang oras — hindi ito kailangan.',
    passwordSharedAccountNote: 'Ginagamit ang account na ito ng buong organisasyon — sinuman sa mga opisyal na may hawak ng password sa kasalukuyan. Ang pagbabago ng password ay makakaapekto sa LAHAT ng gumagamit nito, hindi lang sa inyo.',
    passwordCurrentLabel: 'KASALUKUYANG PASSWORD',
    passwordNewLabel: 'BAGONG PASSWORD',
    passwordConfirmLabel: 'KUMPIRMAHIN ANG BAGONG PASSWORD',
    passwordChangeCta: 'Baguhin ang Password',
    passwordMismatch: 'Hindi magkatugma ang bagong password at kumpirmasyon.',
    passwordChanged: 'Nabago na po ang password. Mag-log in ulit gamit ang bagong password.',
  },

  // ── Batch: Organization Info screen ────────────────────────────────────
  orgInfo: {
    title: 'Impormasyon ng Samahan',
    registrationNumber: 'Registration Number',
    contactPerson: 'Contact Person',
    typeBadgeFarmers: 'Farmers Organization',
    typeBadgeFisherfolk: 'Fisherfolk Organization',
    samahanSubtitleFarmers: 'Samahan ng mga Magsasaka',
    samahanSubtitleFisherfolk: 'Samahan ng mga Mangingisda',
    identificationHeading: 'Pagkakakilanlan',
    identificationRegNumber: 'Reg. Number',
    identificationAgency: 'Ahensya',
    identificationRegistered: 'Nagrehistro',
    identificationOrganized: 'Pag-oorganisa',
    groups: {
      registeredDetails: 'Rehistradong Impormasyon',
      identity: 'Pangalan at Address',
      contact: 'Contact',
      password: 'Password',
      actions: 'Account',
    },
    readonlyFieldLabels: {
      registration_number: 'Registration Number',
      contact_person: 'Contact Person',
      date_organized: 'Petsa ng Pag-oorganisa',
      date_registered: 'Petsa ng Pagpaparehistro',
      registration_agency: 'Ahensya ng Pagpaparehistro',
      email_address: 'Email',
    },
    historyHeading: 'Kasaysayan ng mga Kahilingan',
    institutionalAccountTitle: 'Shared / Institutional Account',
    institutionalAccountBody: 'Ang password ng account na ito ay ginagamit ng opisyal na kasalukuyang hawak ng credentials. Ang pagbabago ng password ay makakaapekto sa lahat ng gumagamit ng account na ito — hindi lang sa inyo. Tiyaking ipaabot sa inyong organisasyon ang bagong password bago mag-update.',
    passwordForInstitutional: 'Para sa institutional account',
  },

  // ── Org parity batch: Help screen ───────────────────────────────────────
  orgHelp: {
    title: 'Tulong',
    faqHeading: 'MGA MADALAS ITANONG',
    contactHeading: 'MAKIPAG-UGNAYAN SA OMAg',
    contactOfficeName: 'Opisina ng Municipal Agriculturist — Aringay, La Union',
    // Deliberately honest, not a fabricated address/phone/hours — those
    // are not finalized yet. An obvious placeholder beats a confident-
    // looking wrong number.
    contactPlaceholderNote: 'Malapit nang ilagay dito ang eksaktong address, numero, at oras ng opisina. Sa ngayon, dumalaw po sa opisina ng OMAg sa Munisipyo ng Aringay para sa katanungan.',
    faq: [
      {
        key: 'add-member',
        q: 'Paano magdagdag ng kasapi?',
        a: 'Sa Home, pindutin ang "Magdagdag ng Kasapi". Maghanap gamit ang pangalan o barangay ng rehistradong farmer o fisherfolk, pagkatapos ay pindutin ang "Idagdag". Pwede talagang kasapi ang isang farmer o fisherfolk ng higit sa isang organisasyon nang sabay-sabay — kung kasapi na sila sa ibang organisasyon, makikita lang ito bilang impormasyon, hindi babala; hindi sila awtomatikong matatanggal doon.',
      },
      {
        key: 'assign-officer',
        q: 'Paano italaga ang isang opisyal?',
        a: 'Sa Home, pindutin ang "Italaga ang Opisyal". Pumili ng posisyon (mayroong 7: President, Vice President, Secretary, Treasurer, Auditor, Board Member, Manager), pagkatapos ay pumili ng kasapi mula sa listahan ng mga kasalukuyang kasapi ng organisasyon ninyo. Kung may humahawak na sa posisyong iyon, mapapalitan ang kanyang pagkatalaga.',
      },
      {
        key: 'assistance-individual-vs-bulk',
        q: 'Ano ang pagkakaiba ng pag-report ng tulong sa isang kasapi at sa lahat ng kasapi?',
        a: 'Sa Mga Kasapi, may aksyong "I-report ang Tulong" sa bawat kasapi — ito ay para sa tulong na ibinigay sa iisang kasapi lamang. Ang "I-report ang Tulong" na Quick Action naman sa Home ay para sa "Distribute to Organization" — isang tulong na ibinigay nang sabay-sabay sa LAHAT ng kasalukuyang kasapi ng organisasyon. Bago ito ma-confirm, may makikitang preview muna kung ilang kasapi ang matatanggap nito.',
      },
      {
        key: 'status-lifecycle',
        q: 'Ano ang ibig sabihin ng Pending, Awaiting Confirmation, Confirmed, at Not Received?',
        a: 'Kapag ang petsa ng pamamahagi ay nasa hinaharap pa, "Pending" muna ang status. Pag-abot ng petsang iyon, magiging "Awaiting Confirmation" ito at aabisuhan ang kasapi na kumpirmahin. Kapag kinumpirma ng kasapi na natanggap niya, magiging "Confirmed" ito. Kung sinabi ng kasapi na hindi niya natanggap, magiging "Not Received" ito, at aabisuhan ang opisina at ang organisasyon — ang opisina na ang susunod na aaksyon dito. Makikita ninyo ang totoong status ng bawat tatanggap sa "History ng Reporting".',
      },
      {
        key: 'request-change',
        q: 'Paano humiling ng pagbabago sa impormasyon ng organisasyon?',
        a: 'Sa Impormasyon ng Organisasyon, ang logo at contact number ay agad na nagbabago pagka-save. Ang pangalan at address naman ay dumadaan sa pagsusuri ng opisina — pindutin ang "Humiling ng Pagbabago", ilagay ang bagong halaga, at ipapakita ang status na "Nakabinbin sa pagsusuri" hanggang sa maaprubahan o hindi ng opisina.',
      },
    ],
  },

  // ── Farmer/Fisherfolk individual Help ("Tulong") screens ───────────────
  // Desktop and mobile share this content but NOT the same layout: desktop
  // shows a "Field Behaviors" legend card the mobile version omits in favor
  // of a Mag-logout row — see FarmerHelpScreen/FisherfolkHelpScreen render
  // logic, not a difference to "fix" into one shape.
  farmerHelp: {
    title: 'Tulong',
    subtitle: 'Mga sagot sa mga karaniwang katanungan tungkol sa inyong account at sa paggamit ng sistema.',
    faqHeading: 'MGA MADALAS NA TANONG',
    faq: [
      {
        key: 'log-activity',
        q: 'Paano mag-log ng crop activity?',
        a: 'Sa Home, pindutin ang "Mag-log" at piliin ang uri ng aktibidad (hal. pagdidilig, pag-aabono, pag-spray). Piliin ang bukid at petsa, pagkatapos ay i-save. Makikita ang aktibidad sa Kasaysayan ng napiling bukid.',
      },
      {
        key: 'record-harvest',
        q: "Paano mag-record ng ani, at bakit may 50% duration gate?",
        a: 'Sa bukid na gusto ninyong i-record, pindutin ang "Mag-record ng Ani". Hindi ito available hangga\'t hindi pa umaabot sa kalahati ng inaasahang tagal ng cycle — ito ang 50% duration gate, para hindi maitala ang isang ani bago pa man ito makatwirang mangyari.',
      },
      {
        key: 'report-disaster',
        q: 'Paano mag-report ng disaster sa isang crop, at paano gumagana ang recovery?',
        a: 'Piliin ang apektadong bukid at pindutin ang "Mag-ulat ng Sakuna". Ilagay ang uri ng sakuna at antas ng pinsala. Kapag na-recover na ang bukid, babalik ito sa normal na status at magpapatuloy ang cycle nito.',
      },
      {
        key: 'yield-variance',
        q: "Ano ang Yield Variance Analysis, at ano ang ibig sabihin ng 'possible contributing factors'?",
        a: 'Inihahambing nito ang aktwal na ani laban sa inaasahang ani batay sa nakaraang mga cycle. Ang "possible contributing factors" ay mga mungkahing dahilan (hal. panahon, sakuna, huling pag-aani) batay sa mga naitalang aktibidad — hindi ito kumpirmadong sanhi, kundi gabay lamang para sa pagsusuri.',
      },
      {
        key: 'request-change',
        q: "Paano humiling ng pagbabago sa pangalan o barangay, at ano ang 'Nakabinbin sa pagsusuri'?",
        a: 'Sa Aking Profile, ilagay ang bagong halaga sa field at pindutin ang "Humiling". Ang katayuang "Nakabinbin sa pagsusuri" ay nangangahulugang naghihintay pa ito ng desisyon ng staff — hindi ito agad nalalapat.',
      },
      {
        key: 'instant-vs-request',
        q: 'Ano ang pagkakaiba ng instant-edit at request-a-change na fields?',
        a: 'Ang mga instant-edit field (larawan, contact number) ay agad na nalalapat pagka-save. Ang mga request-a-change field (pangalan, barangay) ay kailangan munang suriin at aprubahan ng staff bago ito magbago sa rehistro.',
      },
    ],
    contactHeading: 'MAKIPAG-UGNAYAN SA OMAG ARINGAY',
    contactPlaceholderNote: 'Ang sumusunod na detalye ay placeholder — hindi pa pinal ang opisyal na impormasyon.',
    contactOfficeLabel: 'Opisina',
    contactOfficeValue: '[Pangalan ng Opisina — placeholder]',
    contactAddressLabel: 'Adres',
    contactAddressValue: '[Kumpletong Adres ng Opisina — placeholder]',
    contactPhoneLabel: 'Telepono',
    contactPhoneValue: '[Numero ng Telepono — placeholder]',
    contactHoursLabel: 'Oras ng Opisina',
    contactHoursValue: '[Araw at Oras ng Opisina — placeholder]',
    behaviorsHeading: 'FIELD BEHAVIORS',
    behaviorInstantLabel: 'Instant edit',
    behaviorInstantDesc: 'Photo, contact number — agad na mailalapat',
    behaviorRequestLabel: 'Request-a-change',
    behaviorRequestDesc: 'Pangalan, barangay — kailangan ng pag-apruba ng staff',
    behaviorReadonlyLabel: 'Read-only',
    behaviorReadonlyDesc: 'RSBSA number, reference info — hindi mababago',
    logoutCta: 'Mag-logout',
    backToProfile: 'Bumalik sa Profile',
  },

  fisherfolkHelp: {
    title: 'Tulong',
    subtitle: 'Mga sagot sa mga karaniwang katanungan tungkol sa inyong account at sa paggamit ng sistema.',
    faqHeading: 'MGA MADALAS NA TANONG',
    faq: [
      {
        key: 'log-feeding',
        q: "Paano mag-log ng pakain ngayon, at paano gumagana ang 'Ulitin ang pakain kahapon'?",
        a: 'Piliin ang pond, pagkatapos ay pindutin ang "Mag-log ng Pakain". Ilagay ang uri at dami ng feed. Ang "Ulitin ang pakain kahapon" ay agad na kokopyahin ang huling entry ninyo para sa parehong pond, para hindi na kailangang ulit-ulitin ang paglalagay kapag pareho lang ang pakain araw-araw.',
      },
      {
        key: 'record-harvest',
        q: 'Paano mag-record ng harvest para sa isang pond?',
        a: 'Sa napiling pond, pindutin ang "Mag-record ng Harvest". Ilagay ang nahuling dami at petsa, pagkatapos ay i-save. Makikita ito sa Kasaysayan ng pond na iyon.',
      },
      {
        key: 'report-disaster',
        q: 'Paano mag-report ng disaster (kasama ang fish kill), at paano gumagana ang recovery?',
        a: 'Piliin ang apektadong pond at pindutin ang "Mag-ulat ng Sakuna". Kasama rito ang fish kill bilang isang uri ng sakuna. Kapag na-recover na ang pond, babalik ito sa normal na status.',
      },
      {
        key: 'log-mortality',
        q: 'Paano mag-log ng sakit o mortality, at bakit general care guidance lang ang ipinapakita?',
        a: 'Sa pond na apektado, pindutin ang "Mag-log ng Sakit/Mortality" at ilagay ang detalye. General care guidance lamang ang ipinapakita dahil hindi ito kapalit ng aktwal na diagnosis ng beterinaryo o BFAR — panimulang gabay lang ito habang naghihintay ng propesyonal na tulong.',
      },
      {
        key: 'request-change',
        q: 'Paano humiling ng pagbabago sa pangalan o barangay?',
        a: 'Sa Aking Profile, ilagay ang bagong halaga sa field at pindutin ang "Humiling". Naghihintay ito ng pag-apruba ng staff bago ito magbago sa rehistro.',
      },
      {
        key: 'instant-vs-request',
        q: 'Ano ang pagkakaiba ng instant-edit at request-a-change na fields?',
        a: 'Ang mga instant-edit field (larawan, contact number) ay agad na nalalapat pagka-save. Ang mga request-a-change field (pangalan, barangay) ay kailangan munang suriin at aprubahan ng staff bago ito magbago sa rehistro.',
      },
    ],
    contactHeading: 'MAKIPAG-UGNAYAN SA OMAG ARINGAY',
    contactPlaceholderNote: 'Ang sumusunod na detalye ay placeholder — hindi pa pinal ang opisyal na impormasyon.',
    contactOfficeLabel: 'Opisina',
    contactOfficeValue: '[Pangalan ng Opisina — placeholder]',
    contactAddressLabel: 'Adres',
    contactAddressValue: '[Kumpletong Adres ng Opisina — placeholder]',
    contactPhoneLabel: 'Telepono',
    contactPhoneValue: '[Numero ng Telepono — placeholder]',
    contactHoursLabel: 'Oras ng Opisina',
    contactHoursValue: '[Araw at Oras ng Opisina — placeholder]',
    behaviorsHeading: 'FIELD BEHAVIORS',
    behaviorInstantLabel: 'Instant edit',
    behaviorInstantDesc: 'Photo, contact number — agad na mailalapat',
    behaviorRequestLabel: 'Request-a-change',
    behaviorRequestDesc: 'Pangalan, barangay — kailangan ng pag-apruba ng staff',
    behaviorReadonlyLabel: 'Read-only',
    behaviorReadonlyDesc: 'RSBSA number, reference info — hindi mababago',
    logoutCta: 'Mag-logout',
    backToProfile: 'Bumalik sa Profile',
  },

  // ── Batch 2: Organization dashboard ────────────────────────────────────
  orgHome: {
    // Copy is taken VERBATIM from the approved reference images — including
    // the English-in-Tagalog mixes ("History ng Reporting", "VACANT",
    // "registered farmer/fisherfolk"), which are how the mockup reads and
    // how these terms are actually said locally.
    appName: 'OMAG ARINGAY',
    // Mixed-case, matching the Organization Reference rebuild's sidebar/top
    // bar exactly (image1 etc. all show "OMAg Aringay", not the all-caps
    // `appName` above) — a separate key rather than editing `appName`
    // itself, since OrgInfoScreen.jsx's untouched old chrome reads that one.
    appNameDisplay: 'OMAg Aringay',
    dashboardTitle: 'Dashboard ng Organisasyon',
    typeBadgeFarmers: 'Farmers Org',
    typeBadgeFisherfolk: 'Fisherfolk Org',
    addressLine: (barangay) => `Brgy. ${barangay}, Aringay, La Union`,

    statMembers: 'KASAPI',
    statPositions: 'POSISYON',
    viewMembers: 'Tingnan >',
    viewMembersFull: 'Tingnan ang mga kasapi',
    assignNow: 'Italaga',
    positionsFilledAria: (filled, total) => `${filled} sa ${total} na posisyon ang may opisyal`,
    vacantCount: (n) => `${n} bakante`,
    officerRosterCardTitle: 'Mga Opisyal',

    vacancyTitle: 'May bakanteng posisyon',
    vacancyBody: (positions) => `${positions} — kailangang italaga`,

    actionsHeading: 'MABILIS NA AKSYON',
    addMember: 'Magdagdag ng Kasapi',
    addMemberSub: 'Maghanap at magdagdag ng registered farmer/fisherfolk',
    assignOfficer: 'Mag-assign ng Opisyal',
    assignOfficerSub: 'Pumili ng kasapi para sa isang posisyon',
    distribute: 'Mag-report ng Tulong',
    distributeSub: 'I-record ang naibigay na government assistance',
    confirmOnBehalf: 'Kumpirmahin Para sa Kasapi',
    confirmOnBehalfSub: 'Para sa kasaping walang aktibong account',

    officerRosterHeading: 'ROSTER NG OPISYAL',
    vacant: 'VACANT',
    officerHistory: 'Kasaysayan ng mga Opisyal',
    officerHistorySub: 'Tingnan ang mga naunang opisyal at termino',

    membersHeading: 'Mga Kasapi',
    membersCount: (n) => `MGA KASAPI — ${n} TOTAL`,
    membersCountLine: (total, shown) => (total === shown ? `${total} kasapi · ${shown} nakita` : `${total} kasapi · ${shown} nakita`),
    // Short button label for the Members screen's own "+Magdagdag" — the
    // action-tile label above (`addMember`) stays the long form, matching
    // the reference's two different lengths for the same action in two
    // different places (image1's tile vs image2's list-header button).
    addMemberShort: 'Magdagdag',
    membersSearchPlaceholder: 'Hanapin ayon sa pangalan o barangay...',
    membersEmpty: 'Wala pang kasapi ang organisasyong ito.',
    // Display only. A person who belongs to several organizations has one
    // "main"; only OMAg staff can change it, so there is no action here.
    mainBadge: 'Main',
    mainBadgeTitle: 'Ito ang pangunahing organisasyon ng kasapi. Ang OMAg staff lang ang maaaring magpalit nito.',
    membersLoading: 'Kinukuha ang mga kasapi...',
    loadFailed: 'Hindi makuha ang datos ng organisasyon.',
    retry: 'Subukan ulit',

    // Short nav-only labels — the reference's sidebar (desktop) and bottom
    // tab bar (mobile) both read "Home / Kasaysayan / Impormasyon", distinct
    // from the longer strings above/below used as page titles or the
    // mobile-only in-content "History ng Reporting" shortcut link.
    homeNav: 'Home',
    historyNav: 'Kasaysayan',
    orgInfoNav: 'Impormasyon',
    historyLinkLabel: 'History ng Reporting',
    // Short back-link for the NEW shell only (OrgPageHeader) — matching the
    // reference's "< Bumalik" everywhere. Deliberately a separate key from
    // backToDashboard below, which the OLD shell's OrgAppBar aria-label still
    // uses — OrgInfoScreen/OrgHelpScreen/OrgOfficerHistoryScreen are out of
    // scope and must not change even invisibly.
    backLink: 'Bumalik',

    reportingHistory: 'History ng Reporting',
    reportingHistorySub: 'Tingnan ang mga nakaraang rekord',
    perMemberRow: 'I-report para sa isang kasapi',
    perMemberRowSub: 'Kapag hindi lahat ng kasapi ang tumanggap',
    orgInfoRow: 'Impormasyon ng Organisasyon',
    orgInfoRowSub: 'Logo, contact number, pangalan at address',
    backToDashboard: 'Bumalik sa dashboard',
    memberReportAction: 'I-report ang Tulong',

    // Profile chip dropdown (>=640px) and nav rail toggle
    accountProfile: 'Aking Profile',
    accountHelp: 'Tulong',
    accountLogout: 'Mag-log out',
    expandNav: 'Palawakin ang navigation',
    collapseNav: 'Paliitin ang navigation',
    navRailLabel: 'Pangunahing navigation',
  },


  // ── Batch 2: Add Member ────────────────────────────────────────────────
  orgAddMember: {
    title: 'Magdagdag ng Kasapi',
    nameFieldLabel: 'PANGALAN',
    barangayFieldLabel: 'BARANGAY',
    searchButton: 'Hanapin',
    noticeLabel: 'Paalala',
    // Same rule for both domains since multi-organization membership
    // shipped (Phase B): a person may belong to several organizations at
    // once, adding them here takes nothing away from the others, and
    // exactly one active membership is their "main" (their first ever
    // membership is main automatically). Only the organization type
    // differs in the wording — see orgDomainConfig.js's
    // candidateMembershipNote.
    noticeFarmers: 'Maaaring maging kasapi ang isang magsasaka ng higit sa isang Farmers Organization nang sabay. Isa lang ang pangunahin niyang organisasyon, at hindi siya matatanggal sa ibang organisasyon kapag idinagdag dito.',
    noticeFisherfolk: 'Maaaring maging kasapi ang isang mangingisda ng higit sa isang Fisherfolk Organization nang sabay. Isa lang ang pangunahin niyang organisasyon, at hindi siya matatanggal sa ibang organisasyon kapag idinagdag dito.',
    // image4's placeholder reads "pangalan, RSBSA number, o barangay". The
    // search endpoint deliberately does NOT match on RSBSA/FishR/LGU numbers
    // (unnecessary disclosure for this use case, decided in Batch 1), so the
    // placeholder promises only what the endpoint actually does.
    searchPlaceholder: 'Pangalan ng kasapi...',
    // The 2-character minimum is a real server rule, not a UI nicety — the
    // endpoint returns nothing below it. Say so rather than showing an
    // empty-looking result.
    hint: (registryName) => `Hanapin muna ang kasapi sa ${registryName} registry bago idagdag.`,
    minChars: 'Magpasok po ng hindi bababa sa 2 letra.',
    searching: 'Naghahanap...',
    noResults: 'Walang nakitang tugma.',
    capped: 'Ipinapakita lang ang unang 20. Gawing mas tiyak ang paghahanap kung wala rito.',
    alreadyMember: 'Kasapi na',
    currentOrgLabel: (orgName) => `Kasapi ng ${orgName}`,
    noCurrentOrg: 'Walang organisasyon',
    addButton: 'Idagdag',

    // The server refuses the add when the person's other memberships have
    // no main organization and this one doesn't settle it. Only OMAg staff
    // decide a person's main, so this explains rather than offers a choice.
    mainChoiceRequired: (name) =>
      `Hindi naidagdag si ${name} sa organisasyong ito. Wala pa siyang itinakdang pangunahing organisasyon, at kailangan itong ayusin ng OMAg staff. Makipag-ugnayan po sa opisina ng OMAg.`,
    addSuccess: (name) => `Naidagdag na si ${name}.`,
    addFailed: 'Hindi maidagdag ang kasapi.',
  },

  // ── Batch 2: Remove Member ─────────────────────────────────────────────
  // Toggle-not-delete batch: replaces the old hard "Tanggalin" (Remove)
  // flow. Deactivating keeps the member's full record and history intact
  // — only their active participation in this org is turned off — and can
  // always be reversed via the same action in reverse.
  orgMemberActive: {
    deactivateTitle: 'I-deactivate ang kasapi',
    deactivateBody: (name) => `Gagawing inactive si ${name} sa organisasyong ito. Mananatili ang record niya — maaari po itong i-activate muli anumang oras.`,
    // Only shown when the member actually holds a position — the backend
    // clears it automatically, so the copy has to say so before the fact.
    officerWarning: (position) => `Siya po ang kasalukuyang ${position}. Matatanggal din ang posisyong ito at magiging bakante.`,
    deactivateConfirm: 'I-deactivate',
    deactivateSuccess: (name) => `Na-deactivate si ${name}.`,
    deactivateFailed: 'Hindi na-deactivate ang kasapi.',

    reactivateTitle: 'I-activate muli ang kasapi',
    reactivateBody: (name) => `Gagawing active muli si ${name} sa organisasyong ito.`,
    reactivateConfirm: 'I-activate',
    reactivateSuccess: (name) => `Na-activate muli si ${name}.`,
    reactivateFailed: 'Hindi na-activate ang kasapi.',

    inactiveBadge: 'Inactive',
    deactivateAction: 'I-deactivate',
    activateAction: 'I-activate',
  },

  // ── Batch 2: Assign Officer ────────────────────────────────────────────
  orgAssignOfficer: {
    title: 'Mag-assign ng Opisyal',
    pickPosition: 'Pumili ng posisyon at ng kasaping ito-itakda. Mga miyembro lamang ng inyong organisasyon ang maaaring italaga.',
    positionFieldLabel: 'POSISYON',
    positionPlaceholder: 'Pumili ng posisyon...',
    memberFieldLabel: 'KASAPI',
    memberPlaceholder: 'Pumili ng kasapi...',
    pickMember: 'Pumili ng kasapi para sa posisyong ito:',
    currentHolder: (name) => `Ngayon: ${name}`,
    positionHeld: (name) => `Hawak pa ni ${name} ang posisyong ito. Kailangan munang tapusin ng staff ang kanilang termino bago magtalaga ng bago.`,
    noMembers: 'Walang kasapi na maitatalaga. Magdagdag po muna ng kasapi.',
    assignButton: 'I-assign ang Opisyal',
    success: (name, position) => `Si ${name} na po ang ${position}.`,
    failed: 'Hindi maitalaga ang opisyal.',
  },

  orgOfficerHistory: {
    title: 'Kasaysayan ng mga Opisyal',
    empty: 'Wala pang kasaysayan ng mga opisyal.',
    statusCurrent: 'Kasalukuyan',
    statusEndedEarly: 'Natapos Bago ang Oras',
    statusCompleted: 'Natapos ang Termino',
  },

  // ── CitizenReportAssistanceModal ───────────────────────────────────────
  reportAssistance: {
    titleNew: 'Mag-report ng tulong',
    titleEdit: 'I-edit ang report ng tulong',
    fields: {
      assistanceType: 'Uri ng tulong',
      otherTypePlaceholder: 'Ilarawan ang uri ng tulong…',
      dateGiven: 'Petsa ibinigay',
      quantityAmount: 'Dami / halaga',
      quantityPlaceholder: 'hal. 2 sako, 1 unit',
      unit: 'Yunit',
      cashPerMember: 'Halaga bawat kasapi',
      sourceAgency: 'Galing na ahensya',
      season: 'Season',
      remarks: 'Remarks',
    },
    errors: {
      requiredFields: 'Kailangan po ang uri ng tulong, dami, at petsa.',
      specifyAssistanceType: 'Pakisulat po kung anong uri ng tulong.',
      specifySourceAgency: 'Pakisulat po kung anong ahensya.',
      invalidCashAmount: 'Pakilagay po ang wastong halaga.',
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
    willBlock: (count) => `${count} miyembro ang mahaharang — nakatanggap na sila ng parehong tulong sa ibang organisasyon sa nakaraang 30 araw`,
    willReceive: (count) => `${count} miyembro ang makakatanggap ng bagong record. Hindi po ito awtomatikong mababawi — suriin pong mabuti bago kumpirmahin.`,
    fields: {
      assistanceType: 'Uri ng tulong',
      dateGiven: 'Petsa ibinigay',
      quantity: 'Dami (bawat miyembro)',
      cashAmount: 'Kabuuang halaga (₱) bawat isa',
      sourceAgency: 'Galing na ahensya',
      season: 'Season',
      description: 'Deskripsyon',
    },
    errors: {
      requiredFields: 'Kailangan po ang uri ng tulong at petsa.',
      specifyAssistanceType: 'Pakisulat po kung anong uri ng tulong.',
      specifySourceAgency: 'Pakisulat po kung anong ahensya.',
      invalidCashAmount: 'Maglagay po ng tamang halaga bawat isa.',
      previewFailed: 'Hindi ma-preview ang ipamamahagi.',
      distributeFailed: 'Hindi naipamahagi ang tulong.',
    },
    resultSummary: (created, blocked, errors) => `${created} nagawa · ${blocked} naharang · ${errors} error`,
    statusCreated: 'Nagawa',
    statusBlocked: 'Naharang',
    statusError: 'Error',
    // Batch: richer 3-step wizard layout (step indicator, org context card,
    // big "about to distribute" summary, stat tiles, per-member outcome
    // list). New keys only — everything above stays as-is, still used by
    // the older OrgReportAssistanceScreen.jsx, a different screen sharing
    // this same label block.
    steps: {
      details: 'Detalye ng Pamamahagi',
      review: 'Suriin at Kumpirmahin',
      results: 'Resulta ng Pamamahagi',
    },
    sections: {
      targetOrg: 'Organisasyong Tatanggap',
      assistanceDetails: 'Detalye ng Tulong',
      confirmDistribution: 'Kumpirmahin ang Pamamahagi',
      perMemberOutcome: 'Resulta bawat Miyembro',
    },
    aboutToDistribute: 'Ipamamahagi Ninyo Ang',
    toAllMembersOf: 'Sa lahat ng kasalukuyang miyembro ng',
    onDateBold: (formatted) => `noong ${formatted}`,
    stats: {
      totalMembers: 'Kabuuang miyembro',
      eligible: 'Makakatanggap',
      flagged: 'Naka-flag / dapat suriin',
    },
    flaggedPanelTitle: (count) => `${count} miyembro ang naka-flag para suriin`,
    flaggedPanelBody: 'Makakatanggap pa rin sila ng record nila kaagad — ang flag ay tala lang para sa staff, sakaling nabigyan na sila ng parehong tulong sa ibang lugar kamakailan.',
    skippedPanelTitle: (count) => `${count} miyembro ang lalaktawan`,
    summaryTitle: 'Buod ng mangyayari:',
    summaryCreated: (count) => `${count} record ang magagawa`,
    summaryCreatedDetail: (count) => `— tulong na naitala para sa ${count} miyembro`,
    summaryFlagged: (count) => `${count} naka-flag na may tala`,
    summaryFlaggedDetail: '— nasama na sa itaas, dapat suriin ng staff',
    summarySkipped: (count) => `${count} record ang nilaktawan`,
    summarySkippedDetailProgram: '— naka-enroll na sa napiling programa',
    summarySkippedDetailNone: '— walang doble sa batch na ito',
    backToEdit: 'Bumalik sa Pag-edit',
    confirmAndDistribute: 'Kumpirmahin at Ipamahagi',
    completeTitle: 'Tapos na ang Pamamahagi',
    completeSummary: (created, skipped, flagged) =>
      `${created} record ang nagawa, ${skipped} nilaktawan, ${flagged} naka-flag para suriin`,
    close: 'Isara',
    startNew: 'Magsimula ng Bagong Pamamahagi',
    filterAll: (count) => `Lahat ${count}`,
    filterCreated: (count) => `${count} Nagawa`,
    filterSkipped: (count) => `${count} Nilaktawan`,
    filterFlagged: (count) => `${count} Naka-flag`,
    filterError: (count) => `${count} Error`,
  },
}

export default labels
