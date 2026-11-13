import { Building2, CalendarDays, Info, MapPin, Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AvatarBox, ProfileHero as KitHero, initialsOf, withChipIcons } from '../../components/Profile/ProfileKit.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { STATUS_LEGEND } from './farmerProfile.js'

// The pieces of the farmer profile screen (FarmerDetailPage) that are the farmer's own: the hero with the RSBSA number, the organizations, and the legend of
// the crop stage colours. The hero, cards and fields are the shared kit (components/Profile/ProfileKit.jsx); the rules (chips, age) are in farmerProfile.js.

// The top of the profile: the avatar, the name, the RSBSA number, the place and the date registered, the classification chips, and the actions.
export function ProfileHero({ farmer, chips, actions, place, registered }) {
  return (
    <KitHero
      label="Farmer Profile"
      labelIcon={Sprout}
      ariaLabel="Farmer profile"
      avatar={<AvatarBox initials={initialsOf(farmer.full_name)} />}
      name={farmer.full_name}
      idLabel="RSBSA No."
      idValue={farmer.rsbsa_number}
      meta={[{ icon: MapPin, text: place }, { icon: CalendarDays, text: registered ? `Registered ${registered}` : '' }]}
      chips={withChipIcons(chips)}
      actions={actions}
    />
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
