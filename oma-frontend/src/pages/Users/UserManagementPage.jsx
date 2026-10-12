import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MailWarning, Pencil, RotateCcw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import CreateUserModal from './CreateUserModal.jsx'
import EditUserModal from './EditUserModal.jsx'
import { describeRole } from './userRoleHelpers.js'
import {
  STAFF_ROLE_OPTIONS, STAFF_STATUS_OPTIONS, TYPE_OPTIONS, USER_TABS,
  buildUserQuery, defaultFilters, filterCount, tabFromParam,
} from './userTabs.js'

const filterSelectCls =
  'border border-[#E2E8E2] rounded-lg px-3 py-[7px] text-[13px] bg-[#F9FAF9] text-[#1A2B1A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

const COLUMNS = [
  { key: 'name_cell',   label: 'NAME' },
  { key: 'email',       label: 'EMAIL' },
  { key: 'role_pill',   label: 'ROLE' },
  { key: 'status_pill', label: 'STATUS' },
  { key: 'actions',     label: 'ACTIONS' },
]

const PAGE_SIZE = 10

// One table for one kind of account. The page gives it a `key` of the tab, so switching tabs starts a fresh table:
// its own filters, search and page. `reloadKey` changes when a user was created, to fetch the list again.
function UsersTable({ tab, reloadKey, onEdit }) {
  const { showToast } = useToast()
  // The last answer received and the request it answers; the table is "loading" whenever that is not the current request.
  const [loaded,         setLoaded]         = useState({ key: null, users: [], total: 0 })
  const [search,         setSearch]         = useState('')
  const [filters,        setFilters]        = useState(() => defaultFilters(tab))
  const [page,           setPage]           = useState(1)
  const [version,        setVersion]        = useState(0)
  const [resendingId,    setResendingId]    = useState(null)
  const [reactivatingId, setReactivatingId] = useState(null)
  const setFilter = (name, value) => { setFilters((f) => ({ ...f, [name]: value })); setPage(1) }

  const handleResendVerification = async (u) => {
    setResendingId(u.id)
    try {
      const r = await api.post('/accounts/resend-verification/', { email: u.email })
      showToast(
        r.data.email_sent
          ? `Verification email resent to ${u.email}.`
          : `Could not email ${u.email} (${r.data.reason || 'unknown reason'}) — share the verification link from the server console/logs directly.`,
        r.data.email_sent ? 'success' : 'error',
      )
    } catch {
      showToast('Failed to resend verification email.', 'error')
    } finally {
      setResendingId(null)
    }
  }

  const handleReactivate = async (u) => {
    setReactivatingId(u.id)
    try {
      await api.post(`/accounts/users/${u.id}/reactivate/`)
      showToast(`${u.full_name} reactivated.`, 'success')
      setVersion((v) => v + 1)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to reactivate user.', 'error')
    } finally {
      setReactivatingId(null)
    }
  }

  // search and filters are sent to the backend and refetched, not filtered client-side: filtering only the page that
  // happened to be loaded made a search for a user on another page look like "no such user". An answer to a request that
  // was replaced by newer typing is thrown away.
  const requestKey = JSON.stringify([tab, filters, search, page, version, reloadKey])
  useEffect(() => {
    let cancelled = false
    const done = (users, total) => { if (!cancelled) setLoaded({ key: requestKey, users, total }) }
    api.get('/accounts/users/', { params: buildUserQuery(tab, filters, search, page) })
      .then((r) => done(Array.isArray(r.data) ? r.data : (r.data?.results || []), typeof r.data?.count === 'number' ? r.data.count : 0))
      .catch(() => done([], 0))
    return () => { cancelled = true }
  }, [requestKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = loaded.key !== requestKey
  const users = loaded.users
  const totalCount = loaded.total

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const rows = users.map(u => ({
    ...u,
    name_cell: (
      <span className="text-[13px] font-semibold text-[#1A2B1A]">
        {u.full_name}{u.suffix ? ` ${u.suffix}` : ''}
      </span>
    ),
    email: u.email || '—',
    role_pill: (
      <StatusPill tone={describeRole(u).tone}>{describeRole(u).label}</StatusPill>
    ),
    status_pill: (
      <span className="flex items-center gap-1.5">
        <StatusPill tone={u.is_active ? 'green' : (!u.is_email_verified && u.role !== 'CITIZEN' ? 'amber' : 'rose')}>
          {u.is_active ? 'Active' : (!u.is_email_verified && u.role !== 'CITIZEN' ? 'Unverified' : 'Deactivated')}
        </StatusPill>
        {/* Edge case: active but somehow never verified (shouldn't happen via
            normal flows — is_active/is_email_verified move together — but
            keep the signal rather than hide it). When inactive, the pill
            itself already says "Unverified", so this badge would be redundant.
            Citizens have no e-mail to verify, so they never show it. */}
        {u.is_active && !u.is_email_verified && u.role !== 'CITIZEN' && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap"
            title="This user hasn't clicked their verification link yet."
          >
            <MailWarning className="w-2.5 h-2.5" /> Unverified
          </span>
        )}
      </span>
    ),
    actions: (
      <RowActions actions={[
        // Deactivated accounts simply don't offer Edit at all (matching
        // how every other table here omits an inapplicable action rather
        // than showing it disabled), so an active user's own most common
        // state — nothing else applicable — is a real single action, not
        // a disabled decoy sitting next to it.
        u.is_active && { key: 'edit', label: 'Edit user', icon: Pencil, onClick: () => onEdit(u) },
        !u.is_active && {
          key: 'reactivate', label: 'Reactivate account', icon: RotateCcw,
          onClick: () => handleReactivate(u), disabled: reactivatingId === u.id,
        },
        u.role !== 'CITIZEN' && !u.is_email_verified && {
          key: 'resend', label: 'Resend verification email', icon: MailWarning, tone: 'amber',
          onClick: () => handleResendVerification(u), disabled: resendingId === u.id,
        },
      ]} />
    ),
  }))

  const typeFilter = TYPE_OPTIONS[tab]

  return (
    <div className="space-y-4">
      <FilterPanel
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by name or email..."
        activeCount={filterCount(tab, filters)}
      >
        {tab === 'staff' ? (
          <>
            <select className={filterSelectCls} value={filters.role} aria-label="Role" onChange={e => setFilter('role', e.target.value)}>
              {STAFF_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={filterSelectCls} value={filters.status} aria-label="Status" onChange={e => setFilter('status', e.target.value)}>
              {STAFF_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </>
        ) : (
          <select className={filterSelectCls} value={filters.type} aria-label={typeFilter.label} onChange={e => setFilter('type', e.target.value)}>
            {typeFilter.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </FilterPanel>

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
                    <p className="text-[13px] text-[#7A8E7A]">
                      {tab === 'staff' ? 'Try another status, or create a new user.' : 'Try another type or search.'}
                    </p>
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
  )
}

export default function UserManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabFromParam(searchParams.get('tab'))
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editUser,        setEditUser]        = useState(null)
  const [reloadKey,       setReloadKey]       = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const openTab = (id) => setSearchParams(id === 'staff' ? {} : { tab: id }, { replace: true })

  return (
    <PageLayout
      title="User Management"
      subtitle={USER_TABS.find((t) => t.id === tab).subtitle}
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
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kinds of account">
          {USER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => openTab(t.id)}
              className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
                tab === t.id
                  ? 'bg-[#1B4D2E] text-white'
                  : 'border border-[#E2E8E2] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <UsersTable key={tab} tab={tab} reloadKey={reloadKey} onEdit={setEditUser} />
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); reload() }}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={() => { setEditUser(null); reload() }}
        />
      )}
    </PageLayout>
  )
}
