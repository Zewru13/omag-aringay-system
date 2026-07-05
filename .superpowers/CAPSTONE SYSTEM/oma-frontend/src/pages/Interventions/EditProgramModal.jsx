import { useState } from "react"
import api from "../../api/axiosInstance.js"
import ModalShell from "../../components/UI/ModalShell.jsx"
import Button from "../../components/UI/Button.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"
import { useToast } from "../../context/ToastContext.jsx"

const labelCls = "block text-xs font-medium text-slate-600"

function EditProgramModal({ program, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({
    program_name: program.program_name || "",
    source_of_program: program.source_of_program || "LGU - Aringay",
    source_other_specify: program.source_other_specify || "",
    program_type: program.program_type || "Seeds",
    season: program.season || "Dry",
    year: program.year || new Date().getFullYear(),
    description: program.description || "",
    is_active: program.is_active,
  })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError("")
    setIsSubmitting(true)
    try {
      await api.patch(`/interventions/programs/${program.id}/`, form)
      showToast("Program updated successfully.", "success")
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      setFormError(
        data?.source_other_specify?.[0] ||
          data?.non_field_errors?.[0] ||
          data?.detail ||
          "Unable to update program. Please check the form and try again.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Edit Program" onClose={onClose} maxWidth="max-w-2xl">
      <p className="mb-4 text-sm text-slate-500">{program.program_name}</p>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className={labelCls} htmlFor="ep_program_name">Program Name</label>
          <input
            className={baseInputClasses}
            id="ep_program_name"
            required
            type="text"
            value={form.program_name}
            onChange={(e) => updateField("program_name", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="ep_source">Source of Program</label>
          <select
            className={baseInputClasses}
            id="ep_source"
            value={form.source_of_program}
            onChange={(e) =>
              setForm((f) => ({ ...f, source_of_program: e.target.value, source_other_specify: "" }))
            }
          >
            <option value="LGU - Aringay">LGU - Aringay</option>
            <option value="Office of the Provincial Agriculturist">Office of the Provincial Agriculturist</option>
            <option value="Department of Agriculture (DA)">Department of Agriculture (DA)</option>
            <option value="Department of Agrarian Reform (DAR)">Department of Agrarian Reform (DAR)</option>
            <option value="Non-Government Organization (NGO)">Non-Government Organization (NGO)</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {form.source_of_program === "Other" && (
          <div>
            <label className={labelCls} htmlFor="ep_specify">Specify Source</label>
            <input
              className={baseInputClasses}
              id="ep_specify"
              required
              type="text"
              value={form.source_other_specify}
              onChange={(e) => updateField("source_other_specify", e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="ep_type">Type</label>
            <select
              className={baseInputClasses}
              id="ep_type"
              value={form.program_type}
              onChange={(e) => updateField("program_type", e.target.value)}
            >
              <option value="Seeds">Seeds</option>
              <option value="Fertilizer">Fertilizer</option>
              <option value="RFFA Cash">RFFA Cash</option>
              <option value="Equipment">Equipment</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ep_season">Season</label>
            <select
              className={baseInputClasses}
              id="ep_season"
              value={form.season}
              onChange={(e) => updateField("season", e.target.value)}
            >
              <option value="Dry">Dry</option>
              <option value="Wet">Wet</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ep_year">Year</label>
            <input
              className={baseInputClasses}
              id="ep_year"
              min="2000"
              required
              type="number"
              value={form.year}
              onChange={(e) => updateField("year", parseInt(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="ep_description">Description</label>
          <textarea
            className={baseInputClasses}
            id="ep_description"
            rows={3}
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="ep_status">Status</label>
          <select
            className={baseInputClasses}
            id="ep_status"
            value={form.is_active ? "true" : "false"}
            onChange={(e) => updateField("is_active", e.target.value === "true")}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        {formError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            Save Changes
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default EditProgramModal
