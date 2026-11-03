import { ASSISTANCE_TABS } from './assistanceGroups.js'

// Current | History: the two tabs on every Assistance page (staff, organization, farmer, fisherfolk). `active` is 'current', 'history' or
// 'confirm' (an organization's Confirm for Members list, which belongs to Current).
export default function AssistanceTabs({ active, onChange }) {
  const selected = active === 'confirm' ? 'current' : active
  return (
    <div role="tablist" aria-label="Current or history" className="flex w-full overflow-hidden rounded-xl border border-slate-300 sm:w-fit">
      {ASSISTANCE_TABS.map((t) => (
        <button
          key={t.key} type="button" role="tab" aria-selected={selected === t.key} onClick={() => onChange(t.key)}
          className={`flex-1 whitespace-nowrap px-2 py-2 text-[12px] font-semibold transition-colors sm:flex-none sm:px-6 sm:text-[13px] ${
            selected === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
