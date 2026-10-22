import { History } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'

// "Disaster history" (the button in the header of the farmer and fisherfolk Disaster pages): a table of every disaster the account
// has reported, in a popup. `columns` = [{ key, label, align? }] and each row carries a value (or element) under every column's key;
// `actionsFor(row)` is the row's menu (print, download, mark recovered). A row, or its View button, opens the saved details.

const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em]'

export default function DisasterHistoryModal({ title = 'Disaster history', subtitle, columns, rows, isLoading = false, error = '', actionsFor, onView, onClose }) {
  return (
    <ModalShell title={title} subtitle={subtitle} icon={History} iconBg="bg-rose-100" iconColor="text-rose-600" maxWidth="max-w-5xl" onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}>
      {error ? <ErrorMessage message={error} /> : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white" data-testid="disaster-history">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {columns.map((c) => <th key={c.key} className={`${TH} ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center italic text-[#7A8E7A]">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center italic text-[#7A8E7A]" data-testid="disaster-history-empty">You have not logged any disasters yet.</td></tr>
              )}
              {!isLoading && rows.map((row) => (
                <tr key={row.id} data-testid="disaster-history-row" className="cursor-pointer border-t border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]" onClick={() => onView(row.id)}>
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2.5 align-middle text-[#1A2B1A] ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{row[c.key]}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => onView(row.id)}>View</Button>
                      {actionsFor?.(row)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  )
}
