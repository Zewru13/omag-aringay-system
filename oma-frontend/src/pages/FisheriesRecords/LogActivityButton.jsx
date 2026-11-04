import { ChevronDown, ClipboardList, HeartPulse, Utensils } from 'lucide-react'
import ActionsMenu from '../../components/UI/ActionsMenu.jsx'
import { LOG_ACTIVITY_OPTIONS } from '../Monitoring/cycleLogForms.js'

// "Log Activity" of an expanded production cycle (Fisheries Monitoring): a green button that offers the Feeding Log and the Health Log.
// onChoose(key) gets 'feeding' or 'health'; the page opens that form (Monitoring/LogActivityModal.jsx).
const ICONS = { feeding: Utensils, health: HeartPulse }

export default function LogActivityButton({ onChoose }) {
  return (
    // data-no-row-click: pressing it inside a card or row never collapses it.
    <span data-no-row-click onClick={(e) => e.stopPropagation()}>
      <ActionsMenu
        title="Log Activity"
        menuWidthClassName="w-44"
        buttonClassName="press-scale inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#235E38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B4D2E] max-md:min-h-11"
        trigger={<><ClipboardList size={14} aria-hidden="true" /> Log Activity <ChevronDown size={13} aria-hidden="true" /></>}
      >
        {({ close }) => LOG_ACTIVITY_OPTIONS.map((o) => {
          const Icon = ICONS[o.key]
          return (
            <button
              key={o.key} type="button" role="menuitem"
              onClick={(e) => { e.stopPropagation(); close(); onChoose(o.key) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-[#1A2B1A] transition-colors hover:bg-[#F5F7F5]"
            >
              <Icon size={13} aria-hidden="true" /> {o.label}
            </button>
          )
        })}
      </ActionsMenu>
    </span>
  )
}
