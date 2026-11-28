import { Download, History, ListChecks, Pencil } from 'lucide-react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { backupSummary, fileNote, formatBytes, formatDate, formatTime } from './backupFormat.js'

// Backup history: every backup, safety backup and restore ever made (nothing is deleted).
const TONES = { done: 'green', running: 'teal', failed: 'rose' }
const COLUMNS = [
  { key: 'name', label: 'NAME' },
  { key: 'date', label: 'DATE' },
  { key: 'time', label: 'TIME' },
  { key: 'location', label: 'LOCATION' },
  { key: 'made_by', label: 'MADE BY' },
  { key: 'size', label: 'SIZE' },
  { key: 'status', label: 'STATUS' },
  { key: 'actions', label: 'ACTIONS' },
]
const LOCKED_REASON = 'Wait until the running backup or restore is done.'
const muted = 'text-[12px] text-[#7A8E7A]'

// A long file name may wrap, never in the middle of its date and time: omag-backup- / 2026-11-28-1505.zip
function breakable(name) {
  const dated = name.match(/^(.*?)(\d{4}-\d{2}-\d{2}-\d{4}.*)$/)
  if (dated) return [dated[1], <wbr key="date" />, <span key="rest" className="whitespace-nowrap">{dated[2]}</span>]
  return name.split('_').flatMap((part, i) => (i ? ['_', <wbr key={i} />, part] : [part]))
}

export default function BackupHistory({ rows, savingId, locked, onDownload, onEdit, onRestore, onViewResult }) {
  const list = rows || []
  const data = list.map((row) => ({
    id: row.id,
    name: (
      <div className="min-w-0 md:min-w-[165px]">
        <p className="break-words font-medium text-[#1A2B1A]">{row.name}</p>
        <p className={`break-words ${muted}`}>{backupSummary(row)}</p>
        {row.remarks && <p className={`break-words ${muted}`}>{row.remarks}</p>}
      </div>
    ),
    date: <span className="whitespace-nowrap">{formatDate(row.created_at)}</span>,
    time: <span className="whitespace-nowrap">{formatTime(row.created_at)}</span>,
    location: (
      <div className="min-w-0 md:min-w-[160px]">
        <p className="break-words">{row.location || <span className="text-[#A8BCA8]">—</span>}</p>
        {row.file_name && <p className={`break-words ${muted}`}>{breakable(row.file_name)}</p>}
      </div>
    ),
    made_by: (
      <div>
        <p>{row.made_by}</p>
        <p className={`${row.kind === 'restore' ? '' : 'whitespace-nowrap'} ${muted}`}>{row.kind_label}</p>
      </div>
    ),
    size: <span className="whitespace-nowrap tabular-nums">{row.kind !== 'restore' && row.status === 'done' ? formatBytes(row.size_bytes) : '—'}</span>,
    status: (
      <div>
        <StatusPill tone={TONES[row.status] || 'slate'}>{row.status_label}</StatusPill>
        {fileNote(row) && <p className={`mt-1 whitespace-nowrap ${row.has_file ? 'text-[12px] font-medium text-[#1B4D2E]' : muted}`}>{fileNote(row)}</p>}
      </div>
    ),
    actions: (
      <RowActions alwaysMenu actions={[
        row.has_file && { key: 'download', label: savingId === row.id ? 'Saving…' : 'Download', icon: Download, onClick: () => onDownload(row), disabled: locked, disabledReason: LOCKED_REASON },
        row.report && { key: 'result', label: 'View result', icon: ListChecks, onClick: () => onViewResult(row), disabled: locked, disabledReason: LOCKED_REASON },
        row.status !== 'running' && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => onEdit(row), disabled: locked, disabledReason: LOCKED_REASON },
        row.can_restore && { key: 'restore', label: 'Restore', icon: History, onClick: () => onRestore(row), disabled: locked, disabledReason: LOCKED_REASON, group: 'restore' },
      ]} />
    ),
  }))

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <CardHeader title="Backup history" count={list.length} />
      <DataTable bare columns={COLUMNS} data={data} isLoading={rows === null} phoneTitleKey="name" phoneSubtitleKey="date"
        emptyState={<p className="px-5 py-8 text-center text-sm text-slate-500">No backup yet. Press Download backup to make the first one.</p>} />
    </div>
  )
}
