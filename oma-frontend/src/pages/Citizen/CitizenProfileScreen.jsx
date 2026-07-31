import { Info, User } from 'lucide-react'
import { labels } from './labels.js'
import { CitizenScreen, CitizenSubHeader } from './citizenUI.jsx'

// Read-only registry view for a Farmer/Fisherfolk citizen. There is no edit
// affordance anywhere in this file by design — self-service editing is a
// separate decision and is deliberately not assumed here. Everything shown
// comes from /accounts/me/'s `linked_record`, which only ever resolves the
// caller's OWN record, so this screen adds no new data access.
//
// HIDE-EMPTY RULE: a row renders only when its value is real. Blank strings
// and the literal 'Unspecified' marker are treated identically — both mean
// "the registry doesn't actually know this" — and the row is omitted rather
// than shown with a placeholder. This matters at the scale this system runs
// at: civil_status is 'Unspecified' for 3556 of 3568 farmers and blank for
// 873 of 874 fisherfolk, and highest_education is blank for essentially
// everyone, so rendering placeholders would bury the two or three fields
// that ARE real under a wall of nothing. A group whose rows all vanish
// drops its heading too — a label over an empty region reads as broken.

// 'Unspecified' is a real stored choice value (Farmer.CivilStatus.UNSPECIFIED,
// Fisherfolk.FisherfolkType.UNSPECIFIED) meaning "not determined from the
// RSBSA/BFAR import source", not a user's answer — so it is hidden, not shown.
const BLANK_VALUES = new Set(['', 'Unspecified'])

const hasValue = (v) => v !== null && v !== undefined && !BLANK_VALUES.has(String(v).trim())

function FieldRow({ label, value, emphasise, isLast }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-[11px] ${
        isLast ? '' : 'border-b-[0.5px] border-cz-border'
      }`}
    >
      <span className="shrink-0 text-[13px] text-cz-text-2">{label}</span>
      <span className={`text-right text-[13px] text-cz-text ${emphasise ? 'font-medium' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function FieldGroup({ heading, rows }) {
  const visible = rows.filter((r) => hasValue(r.value))
  if (visible.length === 0) return null
  return (
    <section className="px-4 pt-[18px]">
      <h2 className="mb-1 text-[12px] font-medium tracking-[0.03em] text-cz-text-2">{heading}</h2>
      {visible.map((r, i) => (
        <FieldRow
          key={r.label}
          label={r.label}
          value={r.value}
          emphasise={r.emphasise}
          isLast={i === visible.length - 1}
        />
      ))}
    </section>
  )
}

export default function CitizenProfileScreen({ record, recordType, theme, onBack }) {
  const isFisherfolk = recordType === 'FISHERFOLK'
  const f = labels.profile.fields

  const registryRows = [
    { label: f.rsbsaNumber, value: record?.rsbsa_number, emphasise: true },
    ...(isFisherfolk
      ? [
          { label: f.fishrNumber, value: record?.fishr_number },
          { label: f.lguRegistrationNumber, value: record?.lgu_registration_number },
        ]
      : []),
    { label: f.barangay, value: record?.barangay },
    ...(isFisherfolk ? [{ label: f.fisherfolkType, value: record?.fisherfolk_type }] : []),
    { label: f.civilStatus, value: record?.civil_status },
    { label: f.highestEducation, value: record?.highest_education },
  ]

  const contactRows = [
    { label: f.contactNumber, value: record?.contact_number },
  ]

  return (
    <CitizenScreen>
      <CitizenSubHeader theme={theme} title={labels.profile.title} onBack={onBack} />

      {/* IDENTITY */}
      <div className="flex flex-col items-center border-b-[0.5px] border-cz-border px-4 py-5 text-center">
        <div className={`mb-[10px] flex h-16 w-16 items-center justify-center rounded-full ${theme.circleBg}`}>
          <User size={30} className={theme.circleIcon} aria-hidden="true" />
        </div>
        <p className="text-[18px] font-medium text-cz-text">{record?.label || labels.common.unknown}</p>
        <p className="mt-[2px] text-[12px] text-cz-text-2">
          {isFisherfolk ? labels.profile.roleFisherfolk : labels.profile.roleFarmer}
        </p>
      </div>

      <FieldGroup heading={labels.profile.groups.registry} rows={registryRows} />
      <FieldGroup heading={labels.profile.groups.contact} rows={contactRows} />

      {/* OFFICE NOTICE */}
      <div className="mx-4 mt-1 mb-[18px] flex gap-2 rounded-[8px] bg-cz-warn-bg p-3">
        <Info size={16} className="mt-px shrink-0 text-cz-warn-accent" aria-hidden="true" />
        <p className="text-[12px] leading-[1.5] text-cz-warn-body">{labels.profile.officeNotice}</p>
      </div>
    </CitizenScreen>
  )
}
