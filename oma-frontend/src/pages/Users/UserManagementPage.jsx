import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import CreateUserModal from './CreateUserModal.jsx'
import EditUserModal from './EditUserModal.jsx'

const COLUMNS = [
  { key: 'name_cell',   label: 'NAME' },
  { key: 'email',       label: 'EMAIL' },
  { key: 'role_pill',   label: 'ROLE' },
  { key: 'status_pill', label: 'STATUS' },
  { key: 'actions',     label: 'ACTIONS' },
]

const PAGE_SIZE = 10

export default function UserManagementPage() {
  const [users,           setUsers]           = useState([])
  const [totalCount,      setTotalCount]      = useState(0)
  const [isLoading,       setIsLoading]       = useState(false)
  const [search,          setSearch]          = useState('')
  const [roleFilter,      setRoleFilter]      = useState('All')
  const [page,            setPage]            = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editUser,        setEditUser]        = useState(null)

  const fetchUsers = useCallback(async (pageNum = 1) => {
    setIsLoading(true)
    try {
      const r = await api.get(`/accounts/users/?page=${pageNum}`)
      setUsers(Array.isArray(r.data) ? r.data : (r.data?.results || []))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      setUsers([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers(page) }, [fetchUsers, page])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      const matchSearch = !q
        || u.full_name?.toLowerCase().includes(q)
        || u.email?.toLowerCase().includes(q)
      const matchRole = roleFilter === 'All' || u.role === roleFilter
      return matchSearch && matchRole
    })
  }, [users, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const paginated  = filtered

  const rows = paginated.map(u => ({
    ...u,
    name_cell: (
      <span className="text-[13px] font-semibold text-[#1A2B1A]">
        {u.full_name}{u.suffix ? ` ${u.suffix}` : ''}
      </span>
    ),
    role_pill: (
      <StatusPill tone={u.role === 'ADMIN' ? 'green' : 'blue'}>
        {u.role === 'ADMIN' ? 'Admin' : 'Evaluator'}
      </StatusPill>
    ),
    status_pill: (
      <StatusPill tone={u.is_active ? 'green' : 'rose'}>
        {u.is_active ? 'Active' : 'Inactive'}
      </StatusPill>
    ),
    actions: (
      <button
        type="button"
        className="rounded-lg p-1.5 text-[#1B4D2E] hover:bg-[#EBF5EE] transition-colors"
        onClick={() => setEditUser(u)}
        title="Edit user"
      >
        <Pencil size={14} />
      </button>
    ),
  }))

  return (
    <PageLayout
      title="User Management"
      subtitle="Manage user roles and access."
      action={
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38]"
          onClick={() => setShowCreateModal(true)}
        >
          <span className="text-base leading-none">+</span> Create User
        </button>
      }
    >
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center bg-white border border-[#E2E8E2] rounded-lg px-4 py-2.5">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8BCA8]">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input
              className="w-full border-none bg-transparent pl-8 pr-2 text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] focus:outline-none"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select
            className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[5px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none"
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          >
            <option value="All">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="EVALUATOR">Evaluator</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-10 text-center text-[13px] text-[#7A8E7A]">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-[#C8D5C8]">
                      <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      <p className="text-[14px] font-medium text-[#4A5E4A]">No users found</p>
                      <p className="text-[13px] text-[#7A8E7A]">Create a new user to get started</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]">
                    {COLUMNS.map(col => (
                      <td key={col.key} className="px-4 py-[13px] text-[13px] text-[#1A2B1A] align-middle">
                        {row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#7A8E7A]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[13px] font-medium text-[#1A2B1A]">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); fetchUsers() }}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={() => { setEditUser(null); fetchUsers() }}
        />
      )}
    </PageLayout>
  )
}
