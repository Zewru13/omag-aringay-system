import { AlertTriangle } from 'lucide-react'

// What a backup holds (Backup & Restore > Create backup): one card for each group of records with how many there are now, the optional tick for the
// activity log and the notifications, and a note on what the file cannot protect. `groups` comes from GET /backups/summary/ (null while loading).
const plural = (n, word) => `${Number(n).toLocaleString('en-US')} ${word}${Number(n) === 1 ? '' : 's'}`

export default function BackupGroups({ groups, includeAudit, onIncludeAudit, disabled }) {
  const required = (groups || []).filter((g) => !g.optional)
  const audit = (groups || []).find((g) => g.optional)
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={groups === null}>
        {groups === null && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-[#E2E8E2] bg-[#E8EEE8]/60" />)}
        {required.map((group) => (
          <div key={group.key} className="rounded-lg border border-[#E2E8E2] bg-white px-3 py-2.5" data-testid={`backup-group-${group.key}`}>
            <p className="text-[13px] font-semibold text-[#1A2B1A]">{group.label}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-[#7A8E7A]">{group.description}</p>
            <p className="mt-1.5 text-[12px] font-medium tabular-nums text-[#1B4D2E]">{plural(group.count, 'record')}</p>
          </div>
        ))}
      </div>

      {audit && (
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${includeAudit ? 'border-[#1B4D2E] bg-[#F6FAF7]' : 'border-[#E2E8E2] bg-white'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none accent-[#1B4D2E]" checked={includeAudit} disabled={disabled} onChange={(e) => onIncludeAudit(e.target.checked)} />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-[#1A2B1A]">Include the audit trail and notification history</span>
            <span className="block text-[12px] leading-snug text-[#7A8E7A]">
              {audit.description} {plural(audit.count, 'record')} now. Leave it unticked for a smaller, quicker backup: restoring such a file keeps the activity log
              and notifications that are already in the system.
            </span>
          </span>
        </label>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
        <AlertTriangle size={16} className="mt-0.5 flex-none" aria-hidden="true" />
        <div>
          <p className="font-semibold">Two things to know about this file</p>
          <p>
            <span className="font-semibold">It is not encrypted.</span> It holds personal records and the login accounts with their scrambled passwords: keep it
            somewhere safe, off this computer. <span className="font-semibold">It holds rows and files only.</span> The database structure (tables and rules) comes from the
            system&apos;s own update scripts, not from a backup.
          </p>
        </div>
      </div>
    </div>
  )
}
