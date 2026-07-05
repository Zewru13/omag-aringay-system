import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import DataTable from "../../components/UI/DataTable.jsx"
import Button from "../../components/UI/Button.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import api from "../../api/axiosInstance.js"
import CreateUserModal from "./CreateUserModal.jsx"
import EditUserModal from "./EditUserModal.jsx"

function UserManagementPage() {
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)

  const columns = [
    { key: "full_name", label: "Full Name" },
    { key: "email", label: "Email" },
    { key: "role_pill", label: "Role" },
    { key: "status_pill", label: "Status" },
    { key: "date_joined_display", label: "Date Created" },
  ]

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      const response = await api.get("/accounts/users/")
      setUsers(response.data || [])
    } catch (error) {
      console.error("Error fetching users:", error)
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    fetchUsers()
  }

  const handleEditSuccess = () => {
    setShowEditModal(false)
    fetchUsers()
  }

  const handleRowClick = (user) => {
    setSelectedUser(user)
    setShowEditModal(true)
  }

  const formatDate = (dateString) => {
    if (!dateString) return ""
    return new Date(dateString).toLocaleDateString()
  }

  const tableData = users.map((u) => ({
    ...u,
    role_pill: (
      <StatusPill tone={u.role === "ADMIN" ? "green" : "blue"}>
        {u.role === "ADMIN" ? "Admin" : "Evaluator"}
      </StatusPill>
    ),
    status_pill: (
      <StatusPill tone={u.is_active ? "green" : "rose"}>
        {u.is_active ? "Active" : "Inactive"}
      </StatusPill>
    ),
    date_joined_display: formatDate(u.date_joined),
  }))

  return (
    <PageLayout title="User Management" subtitle="Manage system user accounts and roles">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex-1" />
          <Button icon={Plus} onClick={() => setShowCreateModal(true)} variant="primary">
            Create Account
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={tableData}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {showEditModal && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
        />
      )}
    </PageLayout>
  )
}

export default UserManagementPage
