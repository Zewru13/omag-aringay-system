// The header row of a list card: a coloured marker and the list's name on the left, how many it holds and the card's
// add button on the right. Used by every settings list so they all read and align the same way.
export default function CardHeader({ title, count, markerClass = 'bg-[#1B4D2E]', action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F4F0] px-5 py-3.5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-[3px] ${markerClass}`} aria-hidden="true" />
        <h2 className="text-[14px] font-semibold text-[#1A2B1A]">{title}</h2>
        {typeof count === 'number' && <span className="text-[12px] text-[#7A8E7A]">{count}</span>}
      </div>
      {action}
    </div>
  )
}
