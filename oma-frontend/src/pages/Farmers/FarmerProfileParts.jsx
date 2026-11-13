import {
  Accessibility, Building2, CalendarDays, Feather, HandHeart, Hourglass, IdCard, Info, MapPin, Sprout, Wrench,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { STATUS_LEGEND } from './farmerProfile.js'

// The pieces of the farmer profile screen (FarmerDetailPage): the hero with the name, ID and classifications, the grouped information cards, the
// organizations, and the legend of the crop stage colours. The rules (chips, totals, age) are in
// farmerProfile.js.

const ICONS = { accessibility: Accessibility, handheart: HandHeart, feather: Feather, hourglass: Hourglass, wrench: Wrench }
const CHIP_TONE = {
  blue: { chip: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-100 text-blue-700' },
  green: { chip: 'bg-green-50 text-green-700 ring-green-200', dot: 'bg-green-100 text-green-700' },
  purple: { chip: 'bg-purple-50 text-purple-700 ring-purple-200', dot: 'bg-purple-100 text-purple-700' },
  amber: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-100 text-amber-700' },
  orange: { chip: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-100 text-orange-700' },
}
const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em]'

export const initialsOf = (fullName) => (fullName || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?'

// A label for a block of the page, with its picture.
export function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className={`flex items-center gap-2 ${EYEBROW} text-[#1B4D2E]`}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </h2>
  )
}

// The top of the profile: a green band, the avatar, the name, the RSBSA number, the place and the date registered, the classification chips, and the
// actions (icon buttons) on the right.
export function ProfileHero({ farmer, chips, actions, place, registered }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label="Farmer profile">
      <div className="relative h-20 bg-[#1B4D2E]">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(circle at 10% 130%, #5B9A68 0, transparent 52%), radial-gradient(circle at 92% -30%, #3E7D4D 0, transparent 48%)' }}
        />
        <span className={`absolute right-4 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ${EYEBROW} text-white`}>
          <Sprout size={12} aria-hidden="true" /> Farmer Profile
        </span>
      </div>
      <div className="relative px-5 pb-5 sm:px-6">
        <div className="-mt-9 flex flex-wrap items-start justify-between gap-3">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border-4 border-white bg-[#EBF5EE] text-[24px] font-semibold text-[#1B4D2E] shadow-[0_2px_6px_rgba(27,77,46,0.18)]">
            {initialsOf(farmer.full_name)}
          </div>
          {actions && <div className="flex basis-full flex-wrap items-center justify-end gap-2 sm:mt-[46px] sm:basis-auto">{actions}</div>}
        </div>
        <h1 className="mt-3 text-[20px] font-semibold leading-tight text-[#1A2B1A]">{farmer.full_name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-[#4A5E4A]">
          <span className="inline-flex items-center gap-1.5">
            <IdCard size={14} className="text-[#8AA08A]" aria-hidden="true" />
            RSBSA No. <strong className="font-semibold text-[#1A2B1A]">{farmer.rsbsa_number}</strong>
          </span>
          {place && (
            <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-[#8AA08A]" aria-hidden="true" />{place}</span>
          )}
          {registered && (
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-[#8AA08A]" aria-hidden="true" />Registered {registered}</span>
          )}
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Classifications">
            {chips.map((chip) => {
              const Icon = ICONS[chip.icon]
              return (
                <span key={chip.key} title={chip.meaning} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ${CHIP_TONE[chip.tone].chip}`}>
                  {Icon && <Icon size={13} aria-hidden="true" />}
                  {chip.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

// A card of the profile: a green header with its picture and name, then the content.
export function InfoCard({ icon: Icon, title, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-[#E2E8E2] bg-[#EBF5EE] px-5 py-3">
        {Icon && <Icon size={15} className="text-[#1B4D2E]" aria-hidden="true" />}
        <h2 className={`${EYEBROW} text-[#1B4D2E]`}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

// One fact: its small label with a picture, and the value under it ("—" when there is none).
export function FieldItem({ icon: Icon, label, value, hint = '' }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-[12px] text-[#7A8E7A]">
        {Icon && <Icon size={13} className="text-[#A8BCA8]" aria-hidden="true" />}
        {label}
      </p>
      <p className={`break-words text-[14px] font-medium ${empty ? 'text-[#A8BCA8]' : 'text-[#1A2B1A]'}`}>
        {empty ? '—' : value}
        {!empty && hint && <span className="ml-1.5 text-[12px] font-normal text-[#7A8E7A]">{hint}</span>}
      </p>
    </div>
  )
}

// Every organization the farmer belongs to: the main one marked, a membership that ended muted.
export function OrganizationList({ organizations }) {
  if (!organizations || organizations.length === 0) {
    return <p className="text-[13px] italic text-[#A8BCA8]">Not part of any organization.</p>
  }
  return (
    <ul className="space-y-2">
      {organizations.map((o) => {
        const name = o.organization_id ? <Link to={`/organizations/farmers/${o.organization_id}`} className="hover:underline">{o.organization_name}</Link> : o.organization_name
        return (
          <li key={o.membership_id} className={`flex items-start gap-2.5 rounded-lg border border-[#E2E8E2] px-3 py-2.5 ${o.is_active ? 'bg-white' : 'bg-[#F9FAF9]'}`}>
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${o.is_active ? 'bg-[#EBF5EE] text-[#1B4D2E]' : 'bg-slate-100 text-slate-400'}`}>
              <Building2 size={14} aria-hidden="true" />
            </span>
            <span className={`min-w-0 flex-1 text-[13.5px] font-medium ${o.is_active ? 'text-[#1A2B1A]' : 'text-[#A8BCA8]'}`}>{name}</span>
            {o.is_main && o.is_active && <span className="rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[11px] font-medium text-[#1B4D2E]">Main</span>}
            {!o.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Inactive</span>}
          </li>
        )
      })}
    </ul>
  )
}

// What each colour of a crop's status pill means (folded, so it stays out of the way until it is needed).
export function StatusLegend() {
  return (
    <details className="group mb-3 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-[#1B4D2E] [&::-webkit-details-marker]:hidden">
        <Info size={13} aria-hidden="true" /> Legend: what the crop stages mean
      </summary>
      <ul className="mt-2.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {STATUS_LEGEND.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <StatusPill tone={s.tone}>{s.label}</StatusPill>
            <span className="text-[12px] text-[#7A8E7A]">{s.meaning}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
