import { useState } from "react"
import api from "../../api/axiosInstance.js"
import SearchBar from "../../components/UI/SearchBar.jsx"
import ModalShell from "../../components/UI/ModalShell.jsx"
import Button from "../../components/UI/Button.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"

const labelCls = "block text-xs font-medium text-slate-600"

function AddFisherfolkBeneficiaryModal({ programId, onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [fisherfolkList, setFisherfolkList] = useState([])
  const [selectedFisherfolk, setSelectedFisherfolk] = useState(null)
  const [quantityGiven, setQuantityGiven] = useState("")
  const [unit, setUnit] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSearch = async (query) => {
    setSearchQuery(query)
    setSelectedFisherfolk(null)
    setErrorMessage("")
    if (!query.trim()) { setFisherfolkList([]); return }
    setIsSearching(true)
    try {
      const response = await api.get(`/fisheries/fisherfolk/?search=${encodeURIComponent(query)}`)
      const rows = Array.isArray(response.data) ? response.data : (response.data.results || [])
      setFisherfolkList(rows)
    } catch {
      setErrorMessage("Unable to search fisherfolk.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectFisherfolk = (fisherfolk) => {
    setSelectedFisherfolk(fisherfolk)
    setFisherfolkList([])
    setSearchQuery("")
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage("")
    setIsSubmitting(true)
    try {
      await api.post(`/interventions/programs/${programId}/fisherfolk-beneficiaries/`, {
        fisherfolk: selectedFisherfolk.id,
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
    <ModalShell title="Add Fisherfolk Beneficiary" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className={labelCls}>Search Fisherfolk</label>
          <div className="mt-1">
            <SearchBar
              placeholder="Search by LGU registration number or name..."
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
          {searchQuery && !selectedFisherfolk && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-100">
              {isSearching && (
                <p className="p-4 text-center text-sm text-slate-500">Searching...</p>
              )}
              {!isSearching && fisherfolkList.length === 0 && (
                <p className="p-4 text-center text-sm text-slate-500">No fisherfolk found.</p>
              )}
              {!isSearching &&
                fisherfolkList.map((fisherfolk) => (
                  <button
                    key={fisherfolk.id}
                    className="block w-full rounded-lg px-4 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => handleSelectFisherfolk(fisherfolk)}
                    type="button"
                  >
                    <p className="font-semibold text-slate-900">{fisherfolk.full_name}</p>
                    <p className="text-xs text-slate-500">{fisherfolk.lgu_registration_number}</p>
                  </button>
                ))}
            </div>
          )}
        </div>

        {selectedFisherfolk && (
          <div className="rounded-xl border border-green-200 bg-[#f0f7f0] px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">
              Selected: {selectedFisherfolk.full_name}
            </p>
            <p className="text-xs text-slate-600">{selectedFisherfolk.lgu_registration_number}</p>
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
            disabled={!selectedFisherfolk}
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

export default AddFisherfolkBeneficiaryModal
