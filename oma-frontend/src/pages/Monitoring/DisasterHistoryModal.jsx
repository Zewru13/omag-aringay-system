import { History } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'

// "Disaster history" (the button in the header of the farmer and fisherfolk Disaster pages): a table of every disaster the account
// has reported, in a popup. `columns` = [{ key, label, align? }] and each row carries a value (or element) under every column's key;
// `actionsFor(row)` is the row's menu (print, download, mark recovered). A row, or its View button, opens the saved details.

export default function DisasterHistoryModal({ title = 'Disaster history', subtitle, columns, rows, isLoading = false, error = '', actionsFor, onView, onClose }) {
  const span = columns.length + 1
  return (
    <ModalShell title={title} subtitle={subtitle} icon={History} iconBg="bg-rose-100" iconColor="text-rose-600" maxWidth="max-w-5xl" onClose={onClose}
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}>
      {error ? <ErrorMessage message={error} /> : (
        <EntryTable label="Disaster history" testId="disaster-history">
          <EntryHead>
            {columns.map((c) => <EntryTh key={c.key} className={c.align === 'right' ? 'md:text-right' : ''}>{c.label}</EntryTh>)}
            <EntryTh className="md:text-right">Actions</EntryTh>
          </EntryHead>
          <tbody>
            {isLoading && (
              <tr className="max-md:block"><td colSpan={span} className="px-3 py-8 text-center italic text-[#7A8E7A] max-md:block">Loading…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr className="max-md:block"><td colSpan={span} className="px-3 py-8 text-center italic text-[#7A8E7A] max-md:block" data-testid="disaster-history-empty">You have not logged any disasters yet.</td></tr>
            )}
            {!isLoading && rows.map((row) => (
              <EntryRow key={row.id} data-testid="disaster-history-row" className="cursor-pointer transition-colors hover:bg-[#F9FAF9]" onClick={() => onView(row.id)}>
                {columns.map((c) => (
                  <EntryCell key={c.key} label={c.label} className={`align-middle text-[#1A2B1A] ${c.align === 'right' ? 'tabular-nums md:text-right' : ''}`}>{row[c.key]}</EntryCell>
                ))}
                <td className="px-3 py-1.5 align-middle max-md:block max-md:px-0" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 md:justify-end">
                    <Button type="button" size="sm" variant="outline" onClick={() => onView(row.id)}>View</Button>
                    {actionsFor?.(row)}
                  </div>
                </td>
              </EntryRow>
            ))}
          </tbody>
        </EntryTable>
      )}
    </ModalShell>
  )
}
