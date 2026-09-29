import { AlertTriangle, Clock, Leaf } from 'lucide-react'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'
import { labels } from './labels.js'

// Farmer Home (Simula), rebuilt to the updated reference: four summary tiles,
// an attention banner, and one card per crop with log / report actions and a
// single "recommended next" strip. Presentation only — every figure and handler
// is computed and owned by FarmerHomeScreen.
const L = labels.farmerHomeNew

function StatTile({ value, label }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-[15px] py-[16px]">
      <p className="text-[22px] font-bold leading-[1.15] text-cz-crop-header">{value}</p>
      <p className="mt-2.5 text-[11.5px] text-cz-text-2 sm:text-[12.5px]">{label}</p>
    </div>
  )
}

function CropCard({ rec, suggestion, onLog, onDisaster }) {
  const isActive = rec.status !== 'Harvested' && rec.status !== 'Total Loss'
  const season = [rec.season, rec.year].filter(Boolean).join(' ')
  const crop = rec.crop_type_name || labels.yieldAnalysis.cropCropLabel
  const area = rec.area_planted_ha != null ? Number(rec.area_planted_ha).toFixed(2) : labels.common.unknown
  const place = rec.parcel_number
    ? L.parcel(String(rec.parcel_number).padStart(2, '0'))
    : (rec.farm_location_barangay || labels.common.unknown)
  const chip = (
    <span className="inline-block rounded-full bg-cz-crop-pale px-2.5 py-[3px]">
      <span className="text-[10.5px] font-semibold text-cz-crop-header sm:text-[11px]">
        {isActive ? L.active : rec.status}
      </span>
    </span>
  )

  return (
    <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
      <div className="flex items-start gap-3 px-[16px] py-[16px] sm:items-center">
        <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px] bg-cz-crop-pale sm:h-[48px] sm:w-[48px] sm:rounded-[10px]">
          <Leaf size={18} className="text-cz-crop-header" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-cz-text sm:text-[18px]">
            {crop}{season ? ` — ${season}` : ''}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-cz-text-2 sm:text-[13px]">{area} ha · {place}</p>
          <div className="mt-2 sm:hidden">{chip}</div>
        </div>
        <div className="hidden shrink-0 sm:block">{chip}</div>
      </div>

      <div className="flex gap-2 border-t-[0.5px] border-cz-border px-[16px] py-3">
        <button
          type="button"
          onClick={() => onLog(rec)}
          className="flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-2 py-[9px] transition-colors hover:bg-cz-page sm:flex-none sm:px-4"
        >
          <span className="whitespace-nowrap text-[11.5px] font-semibold text-cz-text sm:text-[14px]">{labels.ffNew.logActivity}</span>
        </button>
        <button
          type="button"
          onClick={() => onDisaster(rec)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-2 py-[9px] transition-opacity hover:opacity-90 sm:flex-none sm:px-4"
        >
          <AlertTriangle size={13} className="shrink-0 text-cz-danger-accent" aria-hidden="true" />
          <span className="whitespace-nowrap text-[11.5px] font-semibold text-cz-danger-accent sm:text-[14px]">{labels.ffNew.reportDisaster}</span>
        </button>
      </div>

      {suggestion && (
        <div className="flex items-center justify-between gap-3 border-t border-cz-crop-300 bg-cz-soft-crop px-[16px] py-[14px]">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-cz-text sm:text-[16px]">{L.suggestionsTitle}</p>
            <p className="mt-1 text-[11px] leading-[1.4] text-cz-text-2 sm:text-[12.5px]">{L.suggestionNext(suggestion.activity_name)}</p>
          </div>
          <button
            type="button"
            onClick={() => onLog(rec, suggestion.activity_name)}
            className="shrink-0 rounded-[8px] bg-cz-crop-header px-4 py-[10px] transition-opacity hover:opacity-90"
          >
            <span className="whitespace-nowrap text-[12px] font-semibold text-white sm:text-[14px]">{L.logThis}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function FarmerHomeView({
  isLoading, records, suggestionFor, stats, attentionCount, onSeeAttention, onLog, onDisaster,
  tabBar, bare = false,
}) {
  const content = isLoading ? (
    <p className="text-[15px] italic text-cz-text-2">{labels.farmerHome.loading}</p>
  ) : (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatTile value={stats.parcels} label={L.statParcels} />
        <StatTile value={stats.activeCrops} label={L.statActiveCrops} />
        <StatTile value={stats.area} label={L.statArea} />
        <StatTile value={stats.harvestsThisMonth} label={L.statHarvestsThisMonth} />
      </div>

      {attentionCount > 0 && (
        <div className="rounded-[12px] border border-cz-crop-300 bg-cz-soft-crop px-[15px] py-[15px] sm:flex sm:items-center sm:gap-4 sm:px-5">
          <div className="flex items-center gap-3 sm:flex-1">
            <Clock size={20} className="shrink-0 text-cz-crop-header" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-[1.3] text-cz-text sm:text-[16px]">{L.attentionTitle(attentionCount)}</p>
              <p className="mt-1 text-[11.5px] text-cz-text-2 sm:text-[13px]">{L.attentionBody}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSeeAttention}
            className="mt-3 w-full rounded-[8px] bg-cz-crop-header px-5 py-[11px] transition-opacity hover:opacity-90 sm:mt-0 sm:w-auto"
          >
            <span className="text-[13px] font-semibold text-white sm:text-[14px]">{L.attentionCta}</span>
          </button>
        </div>
      )}

      {records.length === 0 ? (
        <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4 text-[13px] italic text-cz-text-muted">
          {labels.farmerHome.myCrops.empty}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {records.map((rec) => (
            <CropCard key={rec.id} rec={rec} suggestion={suggestionFor(rec)} onLog={onLog} onDisaster={onDisaster} />
          ))}
        </div>
      )}
    </div>
  )

  if (bare) return <div className="mx-auto w-full max-w-[1028px] px-6 py-5">{content}</div>

  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!px-3 !pt-3.5">{content}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
