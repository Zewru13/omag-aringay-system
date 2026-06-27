import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import DataTable from "../../components/UI/DataTable.jsx"
import ModalShell from "../../components/UI/ModalShell.jsx"
import Button from "../../components/UI/Button.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import FormField, { baseInputClasses } from "../../components/UI/FormField.jsx"
import api from "../../api/axiosInstance.js"
import { useAuth } from "../../context/AuthContext.jsx"

function InterventionsPage() {
  const navigate = useNavigate()
  const { isAdmin, isEvaluator } = useAuth()
  const [programs, setPrograms] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    program_name: "",
    program_type: "Seeds",
    source_of_program: "LGU - Aringay",
    source_other_specify: "",
    season: "Dry",
    year: new Date().getFullYear(),
    target_beneficiaries: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const columns = [
    { key: "program_name", label: "Program Name" },
    { key: "type_pill", label: "Type" },
    { key: "season", label: "Season" },
    { key: "year", label: "Year" },
    { key: "slots_display", label: "Slots" },
    { key: "status_pill", label: "Status" },
  ]

  const fetchPrograms = async () => {
    setIsLoading(true)
    try {
      const response = await api.get("/interventions/programs/")
      setPrograms(response.data)
    } catch (error) {
      console.error("Error fetching programs:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPrograms()
  }, [])

  const tableData = programs.map((p) => ({
    ...p,
    type_pill: <StatusPill tone="blue">{p.program_type}</StatusPill>,
    slots_display: p.target_beneficiaries
      ? `${p.actual_beneficiaries ?? 0} / ${p.target_beneficiaries}`
      : `${p.actual_beneficiaries ?? 0}`,
    status_pill: (
      <StatusPill tone={p.is_active ? "green" : "slate"}>
        {p.is_active ? "Active" : "Inactive"}
      </StatusPill>
    ),
  }))

  const handleCreateProgram = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      const payload = { ...formData }
      if (!payload.target_beneficiaries) delete payload.target_beneficiaries
      await api.post("/interventions/programs/", payload)
      setFormData({
        program_name: "",
        program_type: "Seeds",
        source_of_program: "LGU - Aringay",
        source_other_specify: "",
        season: "Dry",
        year: new Date().getFullYear(),
        target_beneficiaries: "",
      })
      setShowCreateModal(false)
      fetchPrograms()
    } catch (error) {
      console.error("Error creating program:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRowClick = (row) => {
    navigate(`/interventions/${row.id}`)
  }

  return (
    <PageLayout title="Interventions" subtitle="Agricultural programs and intervention management">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex-1" />
          {(isAdmin || isEvaluator) && (
            <Button icon={Plus} onClick={() => setShowCreateModal(true)} variant="primary">
              Create Program
            </Button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={tableData}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
      </div>

      {showCreateModal && (
        <ModalShell
          title="Create Program"
          onClose={() => setShowCreateModal(false)}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleCreateProgram} className="space-y-4">
            <FormField label="Program Name" required>
              <input
                className={baseInputClasses}
                required
                type="text"
                value={formData.program_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, program_name: e.target.value }))}
              />
            </FormField>

            <FormField label="Source of Program" required>
              <select
                className={baseInputClasses}
                required
                value={formData.source_of_program}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    source_of_program: e.target.value,
                    source_other_specify: "",
                  }))
                }
              >
                <option value="LGU - Aringay">LGU - Aringay</option>
                <option value="Office of the Provincial Agriculturist">Office of the Provincial Agriculturist</option>
                <option value="Department of Agriculture (DA)">Department of Agriculture (DA)</option>
                <option value="Department of Agrarian Reform (DAR)">Department of Agrarian Reform (DAR)</option>
                <option value="Non-Government Organization (NGO)">Non-Government Organization (NGO)</option>
                <option value="Other">Other</option>
              </select>
            </FormField>

            {formData.source_of_program === "Other" && (
              <FormField label="Specify Source" required>
                <input
                  className={baseInputClasses}
                  required
                  type="text"
                  value={formData.source_other_specify}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, source_other_specify: e.target.value }))
                  }
                />
              </FormField>
            )}

            <FormField label="Target Beneficiaries">
              <input
                className={baseInputClasses}
                min="1"
                placeholder="Optional"
                type="number"
                value={formData.target_beneficiaries}
                onChange={(e) => setFormData((prev) => ({ ...prev, target_beneficiaries: e.target.value }))}
              />
            </FormField>

            <div className="grid grid-cols-3 gap-4">
              <FormField label="Type" required>
                <select
                  className={baseInputClasses}
                  required
                  value={formData.program_type}
                  onChange={(e) => setFormData((prev) => ({ ...prev, program_type: e.target.value }))}
                >
                  <option value="Seeds">Seeds</option>
                  <option value="Fertilizer">Fertilizer</option>
                  <option value="RFFA Cash">RFFA Cash</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Other">Other</option>
                </select>
              </FormField>
              <FormField label="Season" required>
                <select
                  className={baseInputClasses}
                  required
                  value={formData.season}
                  onChange={(e) => setFormData((prev) => ({ ...prev, season: e.target.value }))}
                >
                  <option value="Dry">Dry</option>
                  <option value="Wet">Wet</option>
                </select>
              </FormField>
              <FormField label="Year" required>
                <input
                  className={baseInputClasses}
                  required
                  type="number"
                  value={formData.year}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, year: parseInt(e.target.value) }))
                  }
                />
              </FormField>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button onClick={() => setShowCreateModal(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button isLoading={isSubmitting} type="submit" variant="primary">
                Create Program
              </Button>
            </div>
          </form>
        </ModalShell>
      )}
    </PageLayout>
  )
}

export default InterventionsPage
