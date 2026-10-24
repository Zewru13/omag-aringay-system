// The red FORCED HARVEST label on a crop that was harvested before it was ready (the crop record's `forced_harvest`: { label, text }).
// Hover shows why. Nothing is shown for a normal harvest.
export default function ForcedHarvestPill({ forced, className = '' }) {
  if (!forced) return null
  return (
    <span
      data-testid="forced-harvest-pill"
      title={forced.text || `Forced harvest: ${forced.label}`}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-red-600 px-2.5 py-[3px] text-[10px] font-bold uppercase leading-none tracking-wide text-white ${className}`}
    >
      FORCED HARVEST
    </span>
  )
}
