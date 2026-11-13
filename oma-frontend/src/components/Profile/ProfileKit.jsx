import {
  Accessibility, Camera, Feather, HandHeart, Hourglass, IdCard, Ship, TriangleAlert, Wrench,
} from 'lucide-react'

// The pieces every profile screen is drawn with (the staff My Profile, the farmer, fisherfolk and organization profiles): a hero with the avatar, name, ID,
// place and chips, a card with a green (or blue) header, a labelled field, and a section label. A fisheries page passes its blue as `accent` / `soft`.

const ICONS = {
  accessibility: Accessibility, handheart: HandHeart, feather: Feather, hourglass: Hourglass, wrench: Wrench, ship: Ship, alert: TriangleAlert,
}
export const CHIP_TONE = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
}
const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em]'

export const initialsOf = (name) => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?'

// Chips ({ key, label, meaning, tone, icon: 'name' }) with their picture drawn by the kit.
export const withChipIcons = (chips) => (chips || []).map((chip) => ({ ...chip, Icon: ICONS[chip.icon] }))

// A label for a block of the page, with its picture.
export function SectionTitle({ icon: Icon, accent = '#1B4D2E', children }) {
  return (
    <h2 className={`flex items-center gap-2 ${EYEBROW}`} style={{ color: accent }}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </h2>
  )
}

// The square avatar: the initials, a photo or a logo; with `onPick` a camera button on its corner to change the photo.
export function AvatarBox({ initials, photoUrl, accent = '#1B4D2E', soft = '#EBF5EE', onPick, uploading = false }) {
  return (
    <div className="relative shrink-0">
      <div
        className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl border-4 border-white text-[24px] font-semibold shadow-[0_2px_6px_rgba(27,77,46,0.18)]"
        style={{ backgroundColor: soft, color: accent }}
      >
        {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : initials}
      </div>
      {onPick && (
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full text-white ring-2 ring-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: accent }}
          aria-label="Upload a new photo"
        >
          <Camera size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// The top of a profile: a coloured band with its kind ("Farmer Profile"), the avatar, the name, the ID and a line of facts (`meta`: [{ icon, text }]), chips,
// and the actions (icon buttons) on the right, below the band (below the avatar on a phone).
export function ProfileHero({
  label, labelIcon: LabelIcon, accent = '#1B4D2E', avatar, name, idLabel, idValue, meta = [], chips = [], actions, ariaLabel,
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label={ariaLabel || label}>
      <div className="relative h-20" style={{ backgroundColor: accent }}>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at 10% 130%, rgba(255,255,255,0.28) 0, transparent 52%), radial-gradient(circle at 92% -30%, rgba(255,255,255,0.2) 0, transparent 48%)' }}
        />
        {label && (
          <span className={`absolute right-4 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ${EYEBROW} text-white`}>
            {LabelIcon && <LabelIcon size={12} aria-hidden="true" />} {label}
          </span>
        )}
      </div>
      <div className="relative px-5 pb-5 sm:px-6">
        <div className="-mt-9 flex flex-wrap items-start justify-between gap-3">
          {avatar}
          {actions && <div className="flex basis-full flex-wrap items-center justify-end gap-2 sm:mt-[46px] sm:basis-auto">{actions}</div>}
        </div>
        <h1 className="mt-3 text-[20px] font-semibold leading-tight text-[#1A2B1A]">{name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-[#4A5E4A]">
          {idValue && (
            <span className="inline-flex items-center gap-1.5">
              <IdCard size={14} className="text-[#8AA08A]" aria-hidden="true" />
              {idLabel} <strong className="font-semibold text-[#1A2B1A]">{idValue}</strong>
            </span>
          )}
          {meta.filter((m) => m.text).map((m) => (
            <span key={m.text} className="inline-flex items-center gap-1.5">
              {m.icon && <m.icon size={14} className="text-[#8AA08A]" aria-hidden="true" />}
              {m.text}
            </span>
          ))}
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Classifications">
            {chips.map((chip) => {
              const Icon = chip.Icon || ICONS[chip.icon]
              return (
                <span key={chip.key} title={chip.meaning} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ${CHIP_TONE[chip.tone] || CHIP_TONE.slate}`}>
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

// A card of a profile: a coloured header with its picture and name (and, on the right, an optional `action`), then the content.
export function InfoCard({ icon: Icon, title, accent = '#1B4D2E', soft = '#EBF5EE', action = null, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-[#E2E8E2] px-5 py-3" style={{ backgroundColor: soft }}>
        {Icon && <Icon size={15} style={{ color: accent }} aria-hidden="true" />}
        <h2 className={EYEBROW} style={{ color: accent }}>{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
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
      <div className={`break-words text-[14px] font-medium ${empty ? 'text-[#A8BCA8]' : 'text-[#1A2B1A]'}`}>
        {empty ? '—' : value}
        {!empty && hint && <span className="ml-1.5 text-[12px] font-normal text-[#7A8E7A]">{hint}</span>}
      </div>
    </div>
  )
}
