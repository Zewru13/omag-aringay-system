import { useState } from "react"
import api from "../../api/axiosInstance.js"
import SearchBar from "../../components/UI/SearchBar.jsx"
import ModalShell from "../../components/UI/ModalShell.jsx"
import Button from "../../components/UI/Button.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"

const labelCls = "block text-xs font-medium text-slate-600"

function AddBeneficiaryModal({ programId, onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [farmers, setFarmers] = useState([])
  const [selectedFarmer, setSelectedFarmer] = useState(null)
  const [quantityGiven, setQuantityGiven] = useState("")
  const [unit, setUnit] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSearch = async (query) => {
    setSearchQuery(query)
    setSelectedFarmer(null)
    setErrorMessage("")
    if (!query.trim()) { setFarmers([]); return }
    setIsSearching(true)
    try {
      const response = await api.get(`/farmers/?search=${encodeURIComponent(query)}`)
      setFarmers(response.data || [])
    } catch {
      setErrorMessage("Unable to search farmers.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectFarmer = (farmer) => {
    setSelectedFarmer(farmer)
    setFarmers([])
    setSearchQuery("")
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage("")
    setIsSubmitting(true)
    try {
      await api.post(`/interventions/programs/${programId}/beneficiaries/`, {
        farmer: selectedFarmer.id,
        quantity_given: quantityGiven,
        unit,
        date_given: new Date().toISOString().split("T")[0],
      })
      onSuccess()
      onClose()
    } catch (error) {
      const errorData = error.response?.data
      setErrorMessage(
        errorData?.non_field_errors?.[0] || errorData?.detail || "Unable to add beneficiary",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Add Beneficiary" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className={labelCls}>Search Farmer</label>
          <div className="mt-1">
            <SearchBar
              placeholder="Search by RSBSA or farmer name..."
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
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
        </div>

        {selectedFarmer && (
          <div className="rounded-xl border border-green-200 bg-[#f0f7f0] px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">Selected: {selectedFarmer.full_name}</p>
            <p className="text-xs text-slate-600">{selectedFarmer.rsbsa_number}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Quantity Given</label>
            <input
              className={baseInputClasses}
              required
              step="0.01"
              type="number"
              value={quantityGiven}
              onChange={(e) => setQuantityGiven(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Unit</label>
            <input
              className={baseInputClasses}
              placeholder="bags, kg, liters, etc."
              required
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
        </div>

        {errorMessage && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!selectedFarmer}
            isLoading={isSubmitting}
            type="submit"
            variant="primary"
          >
            Add Beneficiary
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default AddBeneficiaryModal
