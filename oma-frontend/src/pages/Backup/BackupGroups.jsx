// What a backup holds (Backup & Restore > Create backup): one card for each group of records with how many there are now, the optional tick for the
// activity log and the notifications. `groups` comes from GET /backups/summary/ (null while loading).
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
              The activity log and the notifications ({plural(audit.count, 'record')}). Left unticked, the backup is smaller and quicker.
            </span>
          </span>
        </label>
      )}
    </div>
  )
}
