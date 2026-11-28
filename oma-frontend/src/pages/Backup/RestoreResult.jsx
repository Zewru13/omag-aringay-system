import { CircleCheck, CircleX } from 'lucide-react'
import { keptWords, moreSkipped } from './backupFormat.js'

// What a restore did: how much it Wrote, Removed and Skipped, the same for each row, and every skipped entry with its reason.
// Shown on the Restore tab when a restore ends. `entry` is the restore's history entry.
const TOTALS = [
  { key: 'written', label: 'Written', tone: 'text-[#1B4D2E]' },
  { key: 'removed', label: 'Removed', tone: 'text-rose-700' },
  { key: 'skipped', label: 'Skipped', tone: 'text-amber-700' },
]
// four columns must fit a phone: tighter there
const head = 'px-1.5 py-2 text-[10px] font-semibold tracking-normal sm:px-3 sm:text-[11px] sm:tracking-[0.06em]'
const cell = 'px-1.5 py-2 text-[12.5px] sm:px-3 sm:text-[13px]'
const number = (value) => value.toLocaleString('en-US')

export default function RestoreResult({ entry }) {
  if (entry.status === 'failed' || !entry.report) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-rose-800">
          <CircleX size={18} aria-hidden="true" className="flex-none" /> The restore did not finish
        </p>
        <p className="mt-1 break-words text-[13px] text-rose-800">{entry.detail}</p>
      </div>
    )
  }
  const { report } = entry
  const more = moreSkipped(report)
  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1A2B1A]">
          <CircleCheck size={18} aria-hidden="true" className="flex-none text-[#1B4D2E]" /> Restore complete
        </p>
        <p className="mt-0.5 break-words text-[12px] text-[#7A8E7A]">{entry.kind_label}: {entry.name}</p>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {TOTALS.map((total) => (
          <div key={total.key} className="rounded-lg border border-[#E2E8E2] bg-white px-2 py-3 text-center">
            <dd className={`text-[26px] font-bold leading-none tabular-nums ${total.tone}`}>{number(report.totals[total.key])}</dd>
            <dt className="mt-1.5 text-[12px] font-medium text-[#4A5E4A]">{total.label}</dt>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white">
        <table className="w-full text-sm" aria-label="What the restore did">
          <thead className="bg-[#F9FAF9] text-[#4A5E4A]">
            <tr>
              <th className={`${head} text-left`}>Records</th>
              {TOTALS.map((total) => <th key={total.key} className={`${head} text-right`}>{total.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.key} className="border-t border-[#F0F4F0]">
                <td className={`${cell} font-medium text-[#1A2B1A]`}>{row.label}</td>
                {row.kept
                  ? <td colSpan={3} className={`${cell} text-right text-[#7A8E7A]`}>{keptWords(entry.scope)}</td>
                  : TOTALS.map((total) => <td key={total.key} className={`${cell} text-right tabular-nums text-[#4A5E4A]`}>{number(row[total.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.skipped.length > 0 && (
        <div className="rounded-lg border border-[#E2E8E2] bg-white">
          <p className="border-b border-[#F0F4F0] px-3 py-2 text-[13px] font-semibold text-[#1A2B1A]">Skipped, and why</p>
          <ul>
            {report.skipped.map((item, i) => (
              <li key={`${item.list}-${item.name}-${i}`} className="border-t border-[#F0F4F0] px-3 py-2 first:border-t-0">
                <p className="break-words text-[13px] text-[#1A2B1A]"><span className="text-[#7A8E7A]">{item.list}:</span> <span className="font-medium">{item.name}</span></p>
                <p className="text-[12px] text-[#4A5E4A]">{item.reason}</p>
              </li>
            ))}
          </ul>
          {more > 0 && <p className="border-t border-[#F0F4F0] px-3 py-2 text-[12px] text-[#7A8E7A]">and {number(more)} more</p>}
        </div>
      )}
    </div>
  )
}
