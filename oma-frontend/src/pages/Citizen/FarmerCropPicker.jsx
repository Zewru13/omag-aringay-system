import { ChevronRight, Leaf } from 'lucide-react'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'
import { labels } from './labels.js'

// "Mga aktibong taniman" picker for the Sakuna tab when the farmer has more
// than one crop — the reference draws it as its own screen on phone and inside
// the desktop shell. It never picks for the user.
export default function FarmerCropPicker({ records, onPick, tabBar, bare = false }) {
  const list = (
    <>
      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-cz-text">{labels.ffNew.activeCrops}</h2>
      {records.length === 0 ? (
        <p className="px-1 py-8 text-center text-[13px] italic text-cz-text-muted">{labels.ffNew.noCrops}</p>
      ) : (
        <ul className="space-y-2.5">
          {records.map((rec) => (
            <li key={rec.id}>
              <button
                type="button"
                onClick={() => onPick(rec)}
                className="flex w-full items-center gap-3.5 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-3.5 py-3.5 text-left transition-colors hover:bg-cz-page"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-cz-crop-pale">
                  <Leaf size={20} className="text-cz-crop-header" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold text-cz-text">
                    {rec.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-cz-text-2">
                    {rec.area_planted_ha ?? labels.common.unknown} ha · Brgy. {rec.farm_location_barangay || labels.common.unknown}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-cz-text" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  if (bare) return <div className="mx-auto w-full max-w-[718px] px-6 py-6">{list}</div>

  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!px-3 !pt-5">{list}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
