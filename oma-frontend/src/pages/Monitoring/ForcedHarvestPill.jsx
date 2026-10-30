import { useState } from 'react'
import CropForcedHarvestDetails from './CropForcedHarvestDetails.jsx'

// The red FORCED HARVEST label on a crop that was harvested before it was ready (the crop record's `forced_harvest`:
// { id, label, text }). Hover shows why. Nothing is shown for a normal harvest. Clicking it (when the crop knows its forced harvest)
// opens the saved details, as on Aquaculture Monitoring.
export default function ForcedHarvestPill({ forced, className = '' }) {
  const [open, setOpen] = useState(false)
  if (!forced) return null
  const classes = `inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-red-600 px-2.5 py-[3px] text-[10px] font-bold uppercase leading-none tracking-wide text-white ${className}`
  const title = forced.text || `Forced harvest: ${forced.label}`
  if (!forced.id) return <span data-testid="forced-harvest-pill" title={title} className={classes}>FORCED HARVEST</span>
  return (
    // The wrapper stops the click from reaching a table row that would open or collapse.
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-testid="forced-harvest-pill"
        title={`${title}. View details`}
        aria-label="Forced harvest, view details"
        onClick={() => setOpen(true)}
        className={`${classes} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300`}
      >
        FORCED HARVEST
      </button>
      {open && <CropForcedHarvestDetails harvestId={forced.id} onClose={() => setOpen(false)} />}
    </span>
  )
}
