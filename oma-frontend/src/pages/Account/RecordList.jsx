import { Link } from 'react-router-dom'
import { TABLE_HEAD_CELL, TABLE_HEAD_ROW } from '../../components/UI/tableStyles.js'
import { EmptyNote, LoadFailed, LoadingRows } from './ListStates.jsx'
import { cellText, groupRows, phoneParts, selectionState } from './recordList.js'

// The one list of the farmer, fisherfolk and organization accounts. One column definition (see recordList.js) gives both layouts:
// a row per record on a phone (name, two lines of detail, the status badge, the buttons) and, from the same fields in the same
// order, a table on a computer with the header the office tables use.
//   columns   the column definition
//   rows      the records (each needs an `id`)
//   sections  optional [{ key, label, match(row) }] headings the rows are grouped under
//   state     'loading' | 'failed' | 'ready'; `onRetry` and `what` ("your crops") are for the failed state
//   empty     { title, hint } shown when there are no rows
//   actions   optional (row) => [{ label, primary?, to?, onClick? }]: at most two buttons a row, the main one first
//   selectable optional { selected: Set of ids, onToggle(row), onToggleAll(), label(row), canSelect?(row) }: a tick box on each row
//             (before the name on a phone, a first column on a computer, with a header box that ticks every row)

const BUTTON = 'press-scale inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] px-4 text-center transition-colors md:min-h-9 md:px-3'
const BUTTON_TONE = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  plain: 'border border-border-strong bg-surface text-text-primary hover:bg-surface-2',
}

function ActionButton({ action, grow }) {
  const className = `${BUTTON} ${action.primary ? BUTTON_TONE.primary : BUTTON_TONE.plain} ${grow ? 'flex-1' : ''}`
  const label = <span className="text-[14px] font-semibold leading-tight md:text-[13px]">{action.label}</span>
  return action.to
    ? <Link to={action.to} className={className}>{label}</Link>
    : <button type="button" onClick={action.onClick} className={className}>{label}</button>
}

const BOX = 'h-5 w-5 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--color-primary)]'

// A row's tick box; a row that cannot be ticked shows a dash in its place.
function RowBox({ selectable, row }) {
  if (selectable.canSelect && !selectable.canSelect(row)) return <span className="inline-block w-5 text-center text-text-muted" title="Cannot be selected">—</span>
  return <input type="checkbox" className={BOX} aria-label={selectable.label(row)} checked={selectable.selected.has(row.id)} onChange={() => selectable.onToggle(row)} />
}

function SectionLabel({ group }) {
  if (!group.label) return null
  return <h3 className="px-1 pb-1.5 pt-1 text-[13px] font-semibold text-text-secondary">{group.label} ({group.rows.length})</h3>
}

export default function RecordList({ columns, rows, sections, state = 'ready', onRetry, what, empty, actions, selectable }) {
  if (state === 'loading') return <LoadingRows />
  if (state === 'failed') return <LoadFailed what={what} onRetry={onRetry} />
  const groups = groupRows(rows, sections)
  if (groups.length === 0) return <EmptyNote title={empty?.title || 'Nothing here yet'} hint={empty?.hint} />

  const { title, badge, lines } = phoneParts(columns)
  const ticked = selectable ? selectionState(rows, selectable.selected, selectable.canSelect) : null

  return (
    <>
      {/* Phone: a row per record */}
      <div className="space-y-3 md:hidden">
        {groups.map((group) => (
          <section key={group.key}>
            <SectionLabel group={group} />
            <ul className="space-y-2">
              {group.rows.map((row) => {
                const rowActions = actions ? actions(row) : []
                return (
                  <li key={row.id} className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      {selectable && <label className="-my-1 -ml-1 flex min-h-[44px] min-w-[44px] shrink-0 items-start justify-center pt-1"><RowBox selectable={selectable} row={row} /></label>}
                      <p className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-text-primary">{cellText(title, row)}</p>
                      {badge && <span className="shrink-0">{cellText(badge, row)}</span>}
                    </div>
                    {lines.map((column) => (
                      <p key={column.key} className="mt-1 break-words text-[13px] leading-snug text-text-secondary">
                        <span className="text-text-muted">{column.label}: </span>{cellText(column, row)}
                      </p>
                    ))}
                    {rowActions.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        {rowActions.map((action) => <ActionButton key={action.label} action={action} grow />)}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Computer: the same fields as a table */}
      <div className="hidden md:block overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                {selectable && (
                  <th scope="col" className={`${TABLE_HEAD_CELL} w-10`}>
                    <input type="checkbox" className={BOX} aria-label="Select every row" checked={ticked.all} disabled={!rows.some((row) => !selectable.canSelect || selectable.canSelect(row))} onChange={selectable.onToggleAll} />
                  </th>
                )}
                {columns.map((column) => (
                  <th key={column.key} scope="col" className={`${TABLE_HEAD_CELL} ${column.align === 'right' ? '!text-right' : ''}`}>{column.label}</th>
                ))}
                {actions && <th scope="col" className={TABLE_HEAD_CELL}>Action</th>}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key}>
                {group.label && (
                  <tr className="border-b border-border bg-surface-2">
                    <th scope="colgroup" colSpan={columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)} className="px-4 py-2 text-left text-[12px] font-semibold text-text-secondary">
                      {group.label} ({group.rows.length})
                    </th>
                  </tr>
                )}
                {group.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    {selectable && <td className="px-4 py-2 align-middle"><RowBox selectable={selectable} row={row} /></td>}
                    {columns.map((column, i) => (
                      <td
                        key={column.key}
                        className={`px-4 py-[11px] align-middle text-[13px] ${i === 0 ? 'font-semibold text-text-primary' : 'text-text-secondary'} ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                      >
                        {cellText(column, row)}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-2 align-middle">
                        <div className="flex gap-2">
                          {actions(row).map((action) => <ActionButton key={action.label} action={action} />)}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </>
  )
}
