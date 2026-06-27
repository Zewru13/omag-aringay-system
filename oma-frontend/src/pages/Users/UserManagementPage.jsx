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
  const [isLoading,       setIsLoading]       = useState(false)
  const [search,          setSearch]          = useState('')
  const [roleFilter,      setRoleFilter]      = useState('All')
  const [page,            setPage]            = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editUser,        setEditUser]        = useState(null)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const r = await api.get('/accounts/users/')
      setUsers(r.data || [])
    } catch {
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const rows = paginated.map(u => ({
    ...u,
    name_cell: (
      <span className="font-semibold text-slate-900">
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
        className="rounded-lg p-1.5 text-[#1E4620] hover:bg-[#f0f7f0] transition-colors"
        onClick={() => setEditUser(u)}
        title="Edit user"
      >
        <Pencil size={14} />
      </button>
    ),
  }))

  return (
    <PageLayout title="User Management" subtitle="Manage user roles and access.">
      <div className="space-y-4">
        {/* Top row: search + filter + button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm placeholder-slate-400 focus:border-[#1E4620] focus:outline-none"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-[#1E4620] focus:outline-none"
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          >
            <option value="All">All</option>
            <option value="ADMIN">Admin</option>
            <option value="EVALUATOR">Evaluator</option>
          </select>
          <button
            type="button"
            className="whitespace-nowrap rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31]"
            onClick={() => setShowCreateModal(true)}
          >
            Create User
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1E4620] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">No users found.</td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                    {COLUMNS.map(col => (
                      <td key={col.key} className="px-4 py-3 text-sm text-slate-800">
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
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-medium">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"
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
