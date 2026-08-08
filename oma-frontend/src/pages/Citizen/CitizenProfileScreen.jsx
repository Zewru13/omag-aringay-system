import { ChevronRight, Info, User } from 'lucide-react'
import { labels } from './labels.js'
import { CITIZEN_GUTTER, CitizenScreen } from './citizenUI.jsx'

// Read-only registry view for a Farmer/Fisherfolk citizen. There is no edit
// affordance anywhere in this file by design — self-service editing is a
// separate decision and is deliberately not assumed here. Everything shown
// comes from /accounts/me/'s `linked_record`, which only ever resolves the
// caller's OWN record, so this screen adds no new data access.
//
// UI-basis pass: the identity block moved INTO the tinted header (centred
// avatar/name/role) and rows became stacked label-above-value instead of
// label-left/value-right. The back affordance moved into the header's top
// row so the centred identity block isn't pushed off-axis by it.
//
// HIDE-EMPTY RULE — UNCHANGED BY THE RE-SKIN. A row renders only when its
// value is real. Blank strings and the literal 'Unspecified' marker are
// treated identically — both mean "the registry doesn't actually know this"
// — and the row is omitted rather than shown with a placeholder. This
// matters at the scale this system runs at: civil_status is 'Unspecified'
// for 3556 of 3568 farmers and blank for 873 of 874 fisherfolk, and
// highest_education is blank for essentially everyone, so rendering
// placeholders would bury the two or three fields that ARE real under a
// wall of nothing. A group whose rows all vanish drops its heading too — a
// label over an empty region reads as broken.

// 'Unspecified' is a real stored choice value (Farmer.CivilStatus.UNSPECIFIED,
// Fisherfolk.FisherfolkType.UNSPECIFIED) meaning "not determined from the
// RSBSA/BFAR import source", not a user's answer — so it is hidden, not shown.
const BLANK_VALUES = new Set(['', 'Unspecified'])

const hasValue = (v) => v !== null && v !== undefined && !BLANK_VALUES.has(String(v).trim())

// Stacked row, per the basis: small-caps label above, value below.
function FieldRow({ label, value, isLast }) {
  return (
    <div className={`px-[14px] py-[11px] ${isLast ? '' : 'border-b-[0.5px] border-cz-border'}`}>
      <p className="text-[10px] font-medium tracking-[0.05em] text-cz-text-2">{label.toUpperCase()}</p>
      <p className="mt-[3px] text-[14px] font-medium leading-[1.4] text-cz-text">{value}</p>
    </div>
  )
}

// The basis draws one filled-strip heading over a single card of rows. The
// two existing groupings are preserved as separate cards so "contact" is
// still visually distinct from registry identity, each with the same strip
// treatment — and each still disappears entirely when the hide-empty rule
// empties it.
function FieldGroup({ heading, rows }) {
  const visible = rows.filter((r) => hasValue(r.value))
  if (visible.length === 0) return null
  return (
    <section className={`${CITIZEN_GUTTER} mt-3`}>
      <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
        <h2 className="border-b-[0.5px] border-cz-border bg-cz-page px-[14px] py-[9px] text-[11px] font-semibold tracking-[0.05em] text-cz-text-2">
          {heading}
        </h2>
        {visible.map((r, i) => (
          <FieldRow key={r.label} label={r.label} value={r.value} isLast={i === visible.length - 1} />
        ))}
      </div>
    </section>
  )
}

export default function CitizenProfileScreen({ record, recordType, theme, onBack, tabBar }) {
  const isFisherfolk = recordType === 'FISHERFOLK'
  const f = labels.profile.fields

  // Composed from barangay + a constant municipality/province. Safe because
  // every record in this system belongs to Aringay, La Union — this is not
  // inventing data, it is spelling out a fact already true of the whole
  // dataset. It still respects hide-empty: with no barangay there is no
  // address row at all, rather than a row reading just "Aringay, La Union".
  const address = hasValue(record?.barangay)
    ? `${record.barangay}, ${labels.profile.addressSuffix}`
    : ''

  const registryRows = [
    { label: f.fullName, value: record?.label },
    // Fisherfolk keep RSBSA / FishR / LGU as three SEPARATE rows, each
    // subject to hide-empty. The basis mockup collapses them into one row
    // labelled "RSBSA NUMBER", which would mislabel a FishR number as an
    // RSBSA one — a data-accuracy problem, not a style choice, so it is
    // deliberately not adopted.
    { label: f.rsbsaNumber, value: record?.rsbsa_number },
    ...(isFisherfolk
      ? [
          { label: f.fishrNumber, value: record?.fishr_number },
          { label: f.lguRegistrationNumber, value: record?.lgu_registration_number },
        ]
      : []),
    { label: f.address, value: address },
    {
      label: f.classification,
      value: isFisherfolk ? labels.profile.roleFisherfolk : labels.profile.roleFarmer,
    },
    ...(isFisherfolk ? [{ label: f.fisherfolkType, value: record?.fisherfolk_type }] : []),
    { label: f.civilStatus, value: record?.civil_status },
    { label: f.highestEducation, value: record?.highest_education },
  ]

  const contactRows = [
    { label: f.contactNumber, value: record?.contact_number },
  ]

  return (
    <CitizenScreen hasTabBar={Boolean(tabBar)}>
      {/* IDENTITY — inside the tinted header, per the basis. */}
      <header className={`${theme.header} ${CITIZEN_GUTTER} pb-5 pt-3`}>
        <button
          type="button"
          onClick={onBack}
          aria-label={labels.farmerHome.secondary.backToHome}
          className={`-ml-3 flex h-11 w-11 items-center justify-center rounded-lg ${theme.iconBtn} transition-colors hover:bg-white/10`}
        >
          <ChevronRight size={20} className="rotate-180" aria-hidden="true" />
        </button>
        <div className="-mt-2 flex flex-col items-center text-center">
          <div className={`mb-[10px] flex h-16 w-16 items-center justify-center rounded-full ${theme.circleBg}`}>
            <User size={30} className={theme.circleIcon} aria-hidden="true" />
          </div>
          <p className={`text-[18px] font-medium ${theme.name}`}>
            {record?.label || labels.common.unknown}
          </p>
          <p className={`mt-[2px] text-[12px] ${theme.meta}`}>
            {isFisherfolk ? labels.profile.roleFisherfolk : labels.profile.roleFarmer}
            {hasValue(record?.barangay) ? ` · ${record.barangay}` : ''}
          </p>
        </div>
      </header>

      {/* OFFICE NOTICE — moved to the TOP, per the basis. */}
      <div className={`${CITIZEN_GUTTER} mt-3`}>
        <div className="flex gap-2 rounded-[8px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg p-3">
          <Info size={16} className="mt-px shrink-0 text-cz-warn-accent" aria-hidden="true" />
          <p className="text-[12px] leading-[1.5] text-cz-warn-body">{labels.profile.officeNotice}</p>
        </div>
      </div>

      <FieldGroup heading={labels.profile.groups.registry} rows={registryRows} />
      <FieldGroup heading={labels.profile.groups.contact} rows={contactRows} />

      {/* TODO: Office contact card — pending real OMAg-verified address /
          phone / opening hours. The UI basis shows this block populated
          ("Aringay Municipal Hall", "(072) 888-0000", "Monday – Friday ·
          8:00 AM – 5:00 PM"), but none of those values exist anywhere in
          this system and none have been confirmed as accurate, so the card
          is deliberately NOT rendered rather than shipped with numbers a
          citizen might actually try to call. Build it once the office has
          verified the details. */}

      <div className="h-4" />
      {tabBar}
    </CitizenScreen>
  )
}
