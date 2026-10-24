import { useState } from "react"
import { Tractor } from "lucide-react"
import api from "../../api/axiosInstance.js"
import ModalShell from "../../components/UI/ModalShell.jsx"
import Button from "../../components/UI/Button.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"
import { harvestAreaHint, harvestAreaProblem } from "../Monitoring/harvestArea.js"
import { needsTotalKg, quantityPayload, quantityProblem, totalKgProblem, unitPreview, weightFor } from "../Monitoring/harvestUnits.js"
import useHarvestUnitWeights from "../Monitoring/useHarvestUnitWeights.js"

const labelCls = "block text-xs font-medium text-slate-600"

const UNIT_OPTIONS = [
  { value: 'kg',      label: 'Kilograms (kg)' },
  { value: 'bags',    label: 'Bags (50 kg/bag)' },
  { value: 'cavan',   label: 'Cavan (50 kg/cavan)' },
  { value: 'sacks',   label: 'Sacks' },
  { value: 'pieces',  label: 'Pieces/Heads' },
  { value: 'bundles', label: 'Bundles' },
  { value: 'boxes',   label: 'Boxes' },
  { value: 'other',   label: 'Other' },
]

function RecordHarvestModal({ onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [farmers, setFarmers] = useState([])
  const [selectedFarmer, setSelectedFarmer] = useState(null)
  const [parcels, setParcels] = useState([])
  const [selectedParcel, setSelectedParcel] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingParcels, setIsLoadingParcels] = useState(false)

  const [season, setSeason] = useState("Dry")
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [cropName, setCropName] = useState("")
  const [harvestStartDate, setHarvestStartDate] = useState("")
  const [areaHarvested, setAreaHarvested] = useState("")
  const [quantity, setQuantity] = useState("")
  const [totalKg, setTotalKg] = useState("")
  // The kg one unit weighs (Settings > Harvest Units); this form has no crop record, so only the units for every crop apply.
  const weights = useHarvestUnitWeights()
  const [unitOfMeasure, setUnitOfMeasure] = useState("kg")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSearch = async (query) => {
    setSearchQuery(query)
    setSelectedFarmer(null)
    setSelectedParcel(null)
    setParcels([])
    setErrorMessage("")
    if (!query.trim()) { setFarmers([]); return }
    setIsSearching(true)
    try {
      const response = await api.get(`/farmers/?search=${encodeURIComponent(query)}`)
      setFarmers(Array.isArray(response.data) ? response.data : (response.data?.results || []))
    } catch {
      setErrorMessage("Unable to search farmers.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectFarmer = async (farmer) => {
    setSelectedFarmer(farmer)
    setSearchQuery("")
    setFarmers([])
    setSelectedParcel(null)
    setErrorMessage("")
    setIsLoadingParcels(true)
    try {
      const response = await api.get(`/farmers/${farmer.id}/parcels/`)
      setParcels(response.data || [])
    } catch {
      setErrorMessage("Unable to load farm parcels.")
      setParcels([])
    } finally {
      setIsLoadingParcels(false)
    }
  }

  const weight = weights === null ? undefined : weightFor(weights, unitOfMeasure)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage("")
    if (!selectedFarmer) { setErrorMessage("Please select a farmer."); return }
    if (!selectedParcel) { setErrorMessage("Please select a farm parcel."); return }
    const areaProblem = harvestAreaProblem(areaHarvested, selectedParcel.area_hectares, "the parcel")
    if (areaProblem) { setErrorMessage(`Area harvested: ${areaProblem}`); return }
    const quantityIssue = quantityProblem(quantity) || (needsTotalKg(weight) ? totalKgProblem(totalKg) : '')
    if (quantityIssue) { setErrorMessage(quantityIssue); return }
    setIsSubmitting(true)
    try {
      await api.post("/production/create/", {
        farm_parcel: selectedParcel.id,
        season,
        year: parseInt(year),
        crop_name: cropName,
        harvest_start_date: harvestStartDate || null,
        area_harvested_hectares: parseFloat(areaHarvested),
        ...quantityPayload({ quantity, unit: unitOfMeasure, weight, totalKg }),
      })
      onSuccess()
      onClose()
    } catch (error) {
      const errorData = error.response?.data
      setErrorMessage(
        errorData?.volume_kg?.[0] ||
        errorData?.area_harvested_hectares?.[0] ||
        errorData?.non_field_errors?.[0] ||
        errorData?.detail ||
        "Unable to record harvest",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = []
  for (let y = 2022; y <= currentYear; y++) yearOptions.push(y.toString())

  return (
    <ModalShell
      title="Record Harvest"
      subtitle="Log harvest data for a farmer's parcel"
      icon={Tractor}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit" form="record-harvest-form" variant="primary">
            Record Harvest
          </Button>
        </>
      }
    >
      <form id="record-harvest-form" className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className={labelCls}>Select Farmer</label>
          <input
            className={`${baseInputClasses} mt-1`}
            placeholder="Search by RSBSA or farmer name..."
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchQuery && !selectedFarmer && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-100">
              {isSearching && (
                <p className="p-4 text-center text-sm text-slate-500">Searching...</p>
              )}
              {!isSearching && farmers.length === 0 && (
                <p className="p-4 text-center text-sm text-slate-500">No farmers found.</p>
              )}
              {!isSearching &&
                farmers.map((farmer) => (
                  <button
                    key={farmer.id}
                    className="block w-full rounded-lg px-4 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => handleSelectFarmer(farmer)}
                    type="button"
                  >
                    <p className="font-semibold text-slate-900">{farmer.full_name}</p>
                    <p className="text-xs text-slate-500">{farmer.rsbsa_number}</p>
                  </button>
                ))}
            </div>
          )}
          {selectedFarmer && (
            <div className="mt-2 rounded-xl border border-green-200 bg-[#f0f7f0] px-4 py-3 text-sm">
              <p className="font-semibold text-slate-900">{selectedFarmer.full_name}</p>
              <p className="text-xs text-slate-600">{selectedFarmer.rsbsa_number}</p>
            </div>
          )}
        </div>

        {selectedFarmer && (
          <div>
            <label className={labelCls}>Farm Parcel</label>
            {isLoadingParcels ? (
              <p className="mt-2 text-sm text-slate-500">Loading parcels...</p>
            ) : parcels.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No parcels found for this farmer.</p>
            ) : (
              <select
                className={`${baseInputClasses} mt-1`}
                required
                value={selectedParcel?.id || ""}
                onChange={(e) =>
                  setSelectedParcel(parcels.find((p) => p.id === parseInt(e.target.value)))
                }
              >
                <option value="">-- Select a parcel --</option>
                {parcels.map((parcel) => (
                  <option key={parcel.id} value={parcel.id}>
                    {parcel.location} ({parcel.area} ha)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Season</label>
            <select
              className={`${baseInputClasses} mt-1`}
              required
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              <option value="Dry">Dry</option>
              <option value="Wet">Wet</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <select
              className={`${baseInputClasses} mt-1`}
              required
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Crop Name <span className="text-rose-500">*</span></label>
          <input
            className={`${baseInputClasses} mt-1`}
            required
            type="text"
            value={cropName}
            onChange={(e) => setCropName(e.target.value)}
          />
        </div>

        {/* Harvested date */}
        <div>
          <label className={labelCls}>Harvested Date <span className="text-rose-500">*</span></label>
          <input
            className={`${baseInputClasses} mt-1`}
            required
            type="date"
            value={harvestStartDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setHarvestStartDate(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Area Harvested (ha) <span className="text-rose-500">*</span></label>
          <input
            className={`${baseInputClasses} mt-1`}
            required
            step="0.01"
            type="number"
            max={selectedParcel?.area_hectares}
            value={areaHarvested}
            onChange={(e) => setAreaHarvested(e.target.value)}
          />
          {harvestAreaHint(selectedParcel?.area_hectares, "Parcel") && (
            <p className="mt-1 text-[11px] text-slate-400">{harvestAreaHint(selectedParcel?.area_hectares, "Parcel")}</p>
          )}
        </div>

        {/* Quantity + Unit of Measure: the server saves it in kg using the unit's weight (Settings > Harvest Units) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Quantity Harvested <span className="text-rose-500">*</span></label>
            <input
              className={`${baseInputClasses} mt-1`}
              required
              step="0.01"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Unit of Measure</label>
            <select
              className={`${baseInputClasses} mt-1`}
              value={unitOfMeasure}
              onChange={(e) => { setUnitOfMeasure(e.target.value); setTotalKg("") }}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {unitPreview(quantity, unitOfMeasure, weight) && (
          <p className={`rounded-lg px-3 py-2 text-xs ${weight === null ? 'bg-amber-50 text-amber-800' : 'bg-[#f0f7f0] text-[#1E4620]'}`}>
            {unitPreview(quantity, unitOfMeasure, weight)}
          </p>
        )}
        {needsTotalKg(weight) && (
          <div>
            <label className={labelCls}>Total weight (kg) <span className="text-rose-500">*</span></label>
            <input className={`${baseInputClasses} mt-1`} required step="0.01" type="number" value={totalKg} onChange={(e) => setTotalKg(e.target.value)} />
          </div>
        )}

        {errorMessage && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        )}

      </form>
    </ModalShell>
  )
}

export default RecordHarvestModal
