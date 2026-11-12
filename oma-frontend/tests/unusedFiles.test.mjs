// Files nothing used any more stay deleted: earlier screens, dashboard cards and the old Production page (no menu entry; Crop Monitoring and
// Disaster do its work). A file that comes back must be used by something.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const GONE = [
  'src/pages/Citizen/FisherfolkHomeScreen.jsx',
  'src/pages/Monitoring/EncodeBarangayReportModal.jsx',
  'src/pages/Monitoring/LogFisheriesDisasterModal.jsx',
  'src/pages/Monitoring/BarangayCropDetailModal.jsx',
  'src/pages/Monitoring/CropHistoricalModal.jsx',
  'src/pages/HealthMonitoring/HealthMonitoringPage.jsx',
  'src/components/dashboard/CommodityRankingCard.jsx',
  'src/components/dashboard/MetricHeroCard.jsx',
  'src/components/dashboard/ProductionTrendCard.jsx',
  'src/components/dashboard/SeasonalComparisonCard.jsx',
  'src/components/dashboard/DashboardCard.jsx',
  'src/components/UI/ViewToggle.jsx',
  'src/pages/Production/ProductionPage.jsx',
  'src/pages/Production/AddPlantingRecordModal.jsx',
  'src/pages/Production/LogDamageReportModal.jsx',
  'src/pages/Production/ProductionAnalyticsTab.jsx',
  'src/pages/Production/RecordHarvestModal.jsx',
]
for (const f of GONE) ok(!existsSync(here(f)), `${f} is gone`)

const app = readFileSync(here('src/App.jsx'), 'utf8')
ok(!app.includes('ProductionPage') && !/path="\/production"/.test(app), 'App: no route to the old Production page')
ok(/<Route path="\*" element=\{<Navigate to="\/" replace \/>\} \/>/.test(app), 'App: an address that no longer exists goes home instead of a blank page')
ok(app.includes('HarvestUnitSettingsPage'), 'App: Harvest Unit Settings (same folder) is kept')

console.log(`unusedFiles: ${n} checks passed`)
