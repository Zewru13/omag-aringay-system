import { useEffect, useState } from "react"
import { ArrowLeft, Download, Edit, Plus } from "lucide-react"
import { useParams, Link } from "react-router-dom"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import DataTable from "../../components/UI/DataTable.jsx"
import SearchBar from "../../components/UI/SearchBar.jsx"
import Button from "../../components/UI/Button.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import Tabs from "../../components/UI/Tabs.jsx"
import api from "../../api/axiosInstance.js"
import { useAuth } from "../../context/AuthContext.jsx"
import AddBeneficiaryModal from "./AddBeneficiaryModal.jsx"
import AddFisherfolkBeneficiaryModal from "./AddFisherfolkBeneficiaryModal.jsx"
import EditProgramModal from "./EditProgramModal.jsx"

const beneficiaryTabs = [
  { value: "farmers", label: "Farmer Beneficiaries" },
  { value: "fisherfolk", label: "Fisherfolk Beneficiaries" },
]

function ProgramDetailPage() {
  const { id } = useParams()
  const { isAdmin, isEvaluator } = useAuth()
  const [program, setProgram] = useState(null)
  const [beneficiaries, setBeneficiaries] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddBeneficiaryModal, setShowAddBeneficiaryModal] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [fisherfolkBeneficiaries, setFisherfolkBeneficiaries] = useState([])
  const [isLoadingFisherfolk, setIsLoadingFisherfolk] = useState(false)
  const [fisherfolkSearchQuery, setFisherfolkSearchQuery] = useState("")
  const [showAddFisherfolkBeneficiaryModal, setShowAddFisherfolkBeneficiaryModal] = useState(false)
  const [activeTab, setActiveTab] = useState("farmers")
  const [isExportingCsv, setIsExportingCsv] = useState(false)

  const columns = [
    { key: "number", label: "No." },
    { key: "farmer_full_name", label: "Full Name" },
    { key: "farmer_rsbsa_number", label: "RSBSA" },
    { key: "farmer_barangay", label: "Barangay" },
    { key: "quantity_unit", label: "Quantity Given" },
    { key: "date_given_display", label: "Date Given" },
  ]

  const fisherfolkColumns = [
    { key: "number", label: "No." },
    { key: "fisherfolk_full_name", label: "Full Name" },
    { key: "fisherfolk_lgu_registration_number", label: "LGU Reg. No." },
    { key: "fisherfolk_barangay", label: "Barangay" },
    { key: "quantity_unit", label: "Quantity Given" },
    { key: "date_given_display", label: "Date Given" },
  ]

  const fetchProgram = async () => {
    try {
      const response = await api.get(`/interventions/programs/${id}/`)
      setProgram(response.data)
    } catch (error) {
      console.error("Error fetching program:", error)
    }
  }

  const fetchBeneficiaries = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.append("search", searchQuery)
      const response = await api.get(
        `/interventions/programs/${id}/beneficiaries/?${params.toString()}`,
      )
      setBeneficiaries(response.data?.results ?? [])
    } catch (error) {
      console.error("Error fetching beneficiaries:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchFisherfolkBeneficiaries = async () => {
    setIsLoadingFisherfolk(true)
    try {
      const params = new URLSearchParams()
      if (fisherfolkSearchQuery) params.append("search", fisherfolkSearchQuery)
      const response = await api.get(
        `/interventions/programs/${id}/fisherfolk-beneficiaries/?${params.toString()}`,
      )
      setFisherfolkBeneficiaries(response.data?.results ?? [])
    } catch (error) {
      console.error("Error fetching fisherfolk beneficiaries:", error)
    } finally {
      setIsLoadingFisherfolk(false)
    }
  }

  useEffect(() => { fetchProgram() }, [id])
  useEffect(() => { fetchBeneficiaries() }, [id, searchQuery])
  useEffect(() => { fetchFisherfolkBeneficiaries() }, [id, fisherfolkSearchQuery])

  const handleAddBeneficiarySuccess = () => {
    setShowAddBeneficiaryModal(false)
    fetchBeneficiaries()
  }

  const handleAddFisherfolkBeneficiarySuccess = () => {
    setShowAddFisherfolkBeneficiaryModal(false)
    fetchFisherfolkBeneficiaries()
  }

  const formatDate = (dateString) => {
    if (!dateString) return ""
    return new Date(dateString).toLocaleDateString()
  }

  const tableData = beneficiaries.map((b, index) => ({
    ...b,
    number: index + 1,
    quantity_unit: `${b.quantity_given} ${b.unit}`,
    date_given_display: formatDate(b.date_given),
  }))

  const fisherfolkTableData = fisherfolkBeneficiaries.map((b, index) => ({
    ...b,
    number: index + 1,
    quantity_unit: `${b.quantity_given} ${b.unit}`,
    date_given_display: formatDate(b.date_given),
  }))

  const handleExportCsv = () => {
    setIsExportingCsv(true)
    try {
      const isFarmers = activeTab === "farmers"
      const rows = isFarmers ? tableData : fisherfolkTableData
      const cols = isFarmers ? columns : fisherfolkColumns
      const header = cols.map((c) => c.label).join(",")
      const body = rows
        .map((r) =>
          cols.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(","),
        )
        .join("\n")
      const csv = `${header}\n${body}`
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${program?.program_name || "beneficiaries"}_${activeTab}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExportingCsv(false)
    }
  }

  const sourceLabel =
    program?.source_of_program === "Other" && program?.source_other_specify
      ? `Other — ${program.source_other_specify}`
      : program?.source_of_program

  return (
    <PageLayout title="Program Detail" subtitle="Program details, beneficiaries, and interventions">
      <div className="space-y-6">
        <Link
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          to="/interventions"
        >
          <ArrowLeft size={16} />
          Back to Interventions
        </Link>

        {program && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{program.program_name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPill tone="blue">{program.program_type}</StatusPill>
                  <StatusPill tone="slate">{program.season}</StatusPill>
                  <StatusPill tone="slate">{program.year}</StatusPill>
                  <StatusPill tone={program.is_active ? "green" : "rose"}>
                    {program.is_active ? "Active" : "Inactive"}
                  </StatusPill>
                  {program.source_of_program && (
                    <StatusPill tone="navy">{sourceLabel}</StatusPill>
                  )}
                </div>
              </div>

              {(isAdmin || isEvaluator) && (
                <Button icon={Edit} onClick={() => setIsEditModalOpen(true)} variant="outline">
                  Edit Program
                </Button>
              )}
            </div>

            {program.target_beneficiaries != null && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Beneficiaries reached</span>
                  <span className="font-semibold text-slate-700">
                    {program.actual_beneficiaries ?? 0} / {program.target_beneficiaries}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-[#f0f7f0]0 transition-all"
                    style={{
                      width: `${Math.min(100, Math.round(((program.actual_beneficiaries ?? 0) / program.target_beneficiaries) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-100 bg-white p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              activeTab={activeTab}
              onChange={setActiveTab}
              tabs={beneficiaryTabs}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={Download} isLoading={isExportingCsv} onClick={handleExportCsv} size="sm" variant="secondary">
                Export CSV
              </Button>
              {(isAdmin || isEvaluator) && activeTab === "farmers" && (
                <Button icon={Plus} onClick={() => setShowAddBeneficiaryModal(true)} variant="primary">
                  Add Beneficiary
                </Button>
              )}
              {(isAdmin || isEvaluator) && activeTab === "fisherfolk" && (
                <Button icon={Plus} onClick={() => setShowAddFisherfolkBeneficiaryModal(true)} variant="primary">
                  Add Fisherfolk Beneficiary
                </Button>
              )}
            </div>
          </div>

          {activeTab === "farmers" && (
            <>
              <div className="mb-4">
                <SearchBar
                  placeholder="Search by farmer name or barangay..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                />
              </div>
              <DataTable columns={columns} data={tableData} isLoading={isLoading} />
            </>
          )}

          {activeTab === "fisherfolk" && (
            <>
              <div className="mb-4">
                <SearchBar
                  placeholder="Search by fisherfolk name or barangay..."
                  value={fisherfolkSearchQuery}
                  onChange={setFisherfolkSearchQuery}
                />
              </div>
              <DataTable
                columns={fisherfolkColumns}
                data={fisherfolkTableData}
                isLoading={isLoadingFisherfolk}
              />
            </>
          )}
        </section>
      </div>

      {showAddBeneficiaryModal && (
        <AddBeneficiaryModal
          programId={id}
          onClose={() => setShowAddBeneficiaryModal(false)}
          onSuccess={handleAddBeneficiarySuccess}
        />
      )}

      {showAddFisherfolkBeneficiaryModal && (
        <AddFisherfolkBeneficiaryModal
          programId={id}
          onClose={() => setShowAddFisherfolkBeneficiaryModal(false)}
          onSuccess={handleAddFisherfolkBeneficiarySuccess}
        />
      )}

      {isEditModalOpen && program && (
        <EditProgramModal
          program={program}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={fetchProgram}
        />
      )}
    </PageLayout>
  )
}

export default ProgramDetailPage
