import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import DataTable from "../../components/UI/DataTable.jsx"
import Button from "../../components/UI/Button.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import Tabs from "../../components/UI/Tabs.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"
import api from "../../api/axiosInstance.js"
import { useAuth } from "../../context/AuthContext.jsx"
import RecordHarvestModal from "./RecordHarvestModal.jsx"
import AddPlantingRecordModal from "./AddPlantingRecordModal.jsx"
import LogDamageReportModal from "./LogDamageReportModal.jsx"
import BarangaySelect from "../../components/UI/BarangaySelect.jsx"

const labelCls = "block text-xs font-medium text-slate-600"

const PRODUCTION_TABS = [
  { label: "Harvest Records", value: "harvest" },
  { label: "Planting Records", value: "planting" },
  { label: "Damage Reports", value: "damage" },
]

const harvestColumns = [
  { key: "farmer_name", label: "Farmer Name" },
  { key: "farmer_rsbsa_number", label: "RSBSA" },
  { key: "farmer_barangay", label: "Barangay" },
  { key: "crop_name", label: "Crop" },
  { key: "harvest_period_display", label: "Harvest Period" },
  { key: "area_harvested_display", label: "Area (ha)" },
  { key: "volume_kg_display", label: "Volume (kg)" },
  { key: "unit_display", label: "Unit" },
  { key: "season_pill", label: "Season" },
  { key: "year", label: "Year" },
]

const plantingColumns = [
  { key: "farmer_name", label: "Farmer Name" },
  { key: "farmer_rsbsa_number", label: "RSBSA" },
  { key: "farmer_barangay", label: "Barangay" },
  { key: "crop_name", label: "Crop" },
  { key: "area_planted_hectares", label: "Area (ha)" },
  { key: "date_planted", label: "Date Planted" },
  { key: "seedling_type", label: "Seedling Type" },
  { key: "season_pill", label: "Season" },
  { key: "year", label: "Year" },
]

const damageColumns = [
  { key: "barangay", label: "Barangay" },
  { key: "calamity_name", label: "Calamity" },
  { key: "calamity_date", label: "Date" },
  { key: "season_pill", label: "Season" },
  { key: "year", label: "Year" },
  { key: "damaged_crops", label: "Crop Damage" },
  { key: "crop_volume_damaged_kg", label: "Vol. (kg)" },
  { key: "damaged_livestock", label: "Livestock" },
  { key: "livestock_head_count_affected", label: "Head Count" },
]

const currentYear = new Date().getFullYear()
const yearOptions = []
for (let y = 2022; y <= currentYear; y++) yearOptions.push(y.toString())

function formatNumber(num) {
  if (!num && num !== 0) return "—"
  return parseFloat(num).toFixed(2)
}

function ProductionPage() {
  const { isAdmin, isEvaluator } = useAuth()
  const canRecord = isAdmin || isEvaluator

  const [activeTab, setActiveTab] = useState("harvest")

  // Harvest state
  const [harvests, setHarvests] = useState([])
  const [isLoadingHarvests, setIsLoadingHarvests] = useState(false)
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [harvestYear, setHarvestYear] = useState(currentYear.toString())
  const [harvestSeason, setHarvestSeason] = useState("Dry")
  const [harvestBarangay, setHarvestBarangay] = useState("")

  // Planting state
  const [plantings, setPlantings] = useState([])
  const [isLoadingPlantings, setIsLoadingPlantings] = useState(false)
  const [showPlantingModal, setShowPlantingModal] = useState(false)
  const [plantingYear, setPlantingYear] = useState(currentYear.toString())
  const [plantingSeason, setPlantingSeason] = useState("")
  const [plantingBarangay, setPlantingBarangay] = useState("")

  // Damage state
  const [damages, setDamages] = useState([])
  const [isLoadingDamages, setIsLoadingDamages] = useState(false)
  const [showDamageModal, setShowDamageModal] = useState(false)
  const [damageBarangay, setDamageBarangay] = useState("")
  const [damageSeason, setDamageSeason] = useState("")
  const [damageYear, setDamageYear] = useState("")

  const fetchHarvests = async () => {
    setIsLoadingHarvests(true)
    try {
      const params = new URLSearchParams()
      if (harvestYear) params.append("year", harvestYear)
      if (harvestSeason) params.append("season", harvestSeason)
      if (harvestBarangay.trim()) params.append("barangay", harvestBarangay.trim())
      const response = await api.get(`/production/?${params.toString()}`)
      setHarvests(response.data || [])
    } catch {
      setHarvests([])
    } finally {
      setIsLoadingHarvests(false)
    }
  }

  const fetchPlantings = async () => {
    setIsLoadingPlantings(true)
    try {
      const params = new URLSearchParams()
      if (plantingYear) params.append("year", plantingYear)
      if (plantingSeason) params.append("season", plantingSeason)
      if (plantingBarangay.trim()) params.append("barangay", plantingBarangay.trim())
      const response = await api.get(`/production/planting/?${params.toString()}`)
      setPlantings(response.data || [])
    } catch {
      setPlantings([])
    } finally {
      setIsLoadingPlantings(false)
    }
  }

  const fetchDamages = async () => {
    setIsLoadingDamages(true)
    try {
      const params = new URLSearchParams()
      if (damageBarangay.trim()) params.append("barangay", damageBarangay.trim())
      if (damageSeason) params.append("season", damageSeason)
      if (damageYear) params.append("year", damageYear)
      const response = await api.get(`/production/damage-reports/?${params.toString()}`)
      setDamages(response.data || [])
    } catch {
      setDamages([])
    } finally {
      setIsLoadingDamages(false)
    }
  }

  useEffect(() => { fetchHarvests() }, [harvestYear, harvestSeason, harvestBarangay])
  useEffect(() => { fetchPlantings() }, [plantingYear, plantingSeason, plantingBarangay])
  useEffect(() => { fetchDamages() }, [damageBarangay, damageSeason, damageYear])

  const harvestTableData = harvests.map((h) => {
    const fmtDate = (v) => v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v)) : null
    const start = fmtDate(h.harvest_start_date)
    const end   = fmtDate(h.harvest_end_date)
    const harvestPeriod = start
      ? (end && end !== start ? `${start} → ${end}` : start)
      : '—'
    return {
      ...h,
      harvest_period_display: harvestPeriod,
      area_harvested_display: formatNumber(h.area_harvested_hectares),
      volume_kg_display: formatNumber(h.volume_kg),
      unit_display: h.unit_of_measure || 'kg',
      season_pill: <StatusPill tone={h.season === "Wet" ? "green" : "amber"}>{h.season}</StatusPill>,
    }
  })

  const plantingTableData = plantings.map((p) => ({
    ...p,
    season_pill: <StatusPill tone={p.season === "Wet" ? "green" : "amber"}>{p.season}</StatusPill>,
  }))

  const damageTableData = damages.map((d) => ({
    ...d,
    season_pill: <StatusPill tone={d.season === "Wet" ? "green" : "amber"}>{d.season}</StatusPill>,
    crop_volume_damaged_kg: d.crop_volume_damaged_kg != null ? formatNumber(d.crop_volume_damaged_kg) : '—',
    livestock_head_count_affected: d.livestock_head_count_affected != null ? d.livestock_head_count_affected : '—',
  }))

  const totalVolumeKg = harvests.reduce((sum, h) => sum + (parseFloat(h.volume_kg) || 0), 0)
  const totalVolumeBags = harvests.reduce((sum, h) => sum + (parseFloat(h.volume_bags) || 0), 0)

  return (
    <PageLayout title="Production" subtitle="Track planting records, harvest data, and production cycles">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Tabs tabs={PRODUCTION_TABS} activeTab={activeTab} onChange={setActiveTab} />
          {canRecord && activeTab === "harvest" && (
            <Button icon={Plus} onClick={() => setShowRecordModal(true)} variant="primary">
              Record Harvest
            </Button>
          )}
          {canRecord && activeTab === "planting" && (
            <Button icon={Plus} onClick={() => setShowPlantingModal(true)} variant="primary">
              Add Planting Record
            </Button>
          )}
          {canRecord && activeTab === "damage" && (
            <Button icon={Plus} onClick={() => setShowDamageModal(true)} variant="primary">
              Log Damage Report
            </Button>
          )}
        </div>

        {/* Harvest tab */}
        {activeTab === "harvest" && (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label className={labelCls}>Year</label>
                <select className={baseInputClasses} value={harvestYear} onChange={(e) => setHarvestYear(e.target.value)}>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className={labelCls}>Season</label>
                <select className={baseInputClasses} value={harvestSeason} onChange={(e) => setHarvestSeason(e.target.value)}>
                  <option value="Dry">Dry</option>
                  <option value="Wet">Wet</option>
                </select>
              </div>
              <div className="flex-1">
                <BarangaySelect includeAllOption label="Barangay" value={harvestBarangay} onChange={(e) => setHarvestBarangay(e.target.value)} />
              </div>
            </div>
            <DataTable columns={harvestColumns} data={harvestTableData} isLoading={isLoadingHarvests} />
            {!isLoadingHarvests && harvestTableData.length > 0 && (
              <div className="flex flex-wrap gap-6 rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-900">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Totals</span>
                <span>Volume: {formatNumber(totalVolumeKg)} kg</span>
                <span>{formatNumber(totalVolumeBags)} bags</span>
              </div>
            )}
          </>
        )}

        {/* Planting tab */}
        {activeTab === "planting" && (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label className={labelCls}>Year</label>
                <select className={baseInputClasses} value={plantingYear} onChange={(e) => setPlantingYear(e.target.value)}>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className={labelCls}>Season</label>
                <select className={baseInputClasses} value={plantingSeason} onChange={(e) => setPlantingSeason(e.target.value)}>
                  <option value="">All</option>
                  <option value="Dry">Dry</option>
                  <option value="Wet">Wet</option>
                </select>
              </div>
              <div className="flex-1">
                <BarangaySelect includeAllOption label="Barangay" value={plantingBarangay} onChange={(e) => setPlantingBarangay(e.target.value)} />
              </div>
            </div>
            <DataTable columns={plantingColumns} data={plantingTableData} isLoading={isLoadingPlantings} />
          </>
        )}

        {/* Damage tab */}
        {activeTab === "damage" && (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label className={labelCls}>Year</label>
                <select className={baseInputClasses} value={damageYear} onChange={(e) => setDamageYear(e.target.value)}>
                  <option value="">All</option>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className={labelCls}>Season</label>
                <select className={baseInputClasses} value={damageSeason} onChange={(e) => setDamageSeason(e.target.value)}>
                  <option value="">All</option>
                  <option value="Dry">Dry</option>
                  <option value="Wet">Wet</option>
                </select>
              </div>
              <div className="flex-1">
                <BarangaySelect includeAllOption label="Barangay" value={damageBarangay} onChange={(e) => setDamageBarangay(e.target.value)} />
              </div>
            </div>
            <DataTable columns={damageColumns} data={damageTableData} isLoading={isLoadingDamages} />
          </>
        )}
      </div>

      {showRecordModal && (
        <RecordHarvestModal onClose={() => setShowRecordModal(false)} onSuccess={() => { setShowRecordModal(false); fetchHarvests() }} />
      )}
      {showPlantingModal && (
        <AddPlantingRecordModal onClose={() => setShowPlantingModal(false)} onSuccess={() => { setShowPlantingModal(false); fetchPlantings() }} />
      )}
      {showDamageModal && (
        <LogDamageReportModal onClose={() => setShowDamageModal(false)} onSuccess={() => { setShowDamageModal(false); fetchDamages() }} />
      )}
    </PageLayout>
  )
}

export default ProductionPage
