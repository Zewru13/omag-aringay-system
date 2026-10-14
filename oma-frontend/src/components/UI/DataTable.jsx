import { Fragment, useState } from 'react'
import { ChevronDown, InboxIcon } from 'lucide-react'
import { rowClickProps } from '../../utils/rowClick.js'

function SkeletonRow({ columnCount }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columnCount }).map((_, i) => (
        <td key={i} className="px-4 py-[13px]">
          <div className="h-4 rounded skeleton-shimmer w-3/4" />
        </td>
      ))}
    </tr>
  )
}

const isActionsColumn = (column) => /^actions?(_cell)?$/.test(column.key)
const isBlank = (value) => value === undefined || value === null || value === ''

// cardColumns: how many columns the phone cards use for their fields (1 = stacked, 2 = side by side).
// Optional, opt-in expandable rows (no effect when omitted): `expandedRowId` is the id of the open row;
// `renderExpanded(row)` is drawn in a full-width row under it on desktop, `renderExpandedMobile(row)` inside
// its card on phones (taps inside it never re-trigger onRowClick). `rowClickLabel(row)` labels the clickable row.
// `phoneTitleKey` (optional): on a phone each card shows ONLY that column (the person's / organization's / crop's name,
// plus `phoneSubtitleKey` underneath when given); tapping the card opens it to show every other column and, when the
// table has `onRowClick`, a button to open the full page. Larger screens are unchanged. `phoneOpenLabel` names that button.
// `bare`: no border, shadow or rounded corners of its own on larger screens, for a table that sits inside a card
// that already has them (the card's own header sits above it).
function DataTable({
  columns, data, isLoading, loading, onRowClick, emptyState, cardColumns = 1, bare = false,
  expandedRowId, renderExpanded, renderExpandedMobile, rowClickLabel,
  phoneTitleKey, phoneSubtitleKey, phoneOpenLabel = 'View full details',
}) {
  const [phoneOpenId, setPhoneOpenId] = useState(null)
  const showLoading = isLoading || loading
  const frame = bare ? '' : 'bg-surface border border-border rounded-[var(--radius-md)] shadow-sm'
  const expandable = Boolean(renderExpanded || renderExpandedMobile)
  const isExpanded = (row) => expandable && expandedRowId != null && row.id === expandedRowId
  const clickProps = (row) => (onRowClick
    ? { ...rowClickProps(() => onRowClick(row), rowClickLabel?.(row)), ...(expandable ? { 'aria-expanded': isExpanded(row) } : {}) }
    : {})

  if (showLoading) {
    return (
      <div className={`${frame} overflow-hidden`}>
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-primary">
                {columns.map((column) => (
                  <th
                    className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white"
                    key={column.key}
                  >
                    {column.headerNode ?? column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} columnCount={columns.length} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (!data?.length) {
    if (emptyState) {
      return (
        <div className={`${frame} overflow-hidden`}>
          {emptyState}
        </div>
      )
    }
    return (
      <div className={`${frame} overflow-hidden flex flex-col items-center justify-center min-h-[200px] gap-2 py-10`}>
        <InboxIcon size={36} className="text-border-strong" aria-hidden="true" />
        <p className="text-[13px] font-medium text-text-primary">No records found</p>
        <p className="text-[12px] text-text-muted">Records will appear here once added.</p>
      </div>
    )
  }

  return (
    <>
      {/* Mobile: card view */}
      <div className="block space-y-3 md:hidden">
        {phoneTitleKey && data.map((row, rowIndex) => {
          const rowId = row.id ?? rowIndex
          const open = phoneOpenId === rowId
          const detailColumns = columns.filter((c) => c.key !== phoneTitleKey && c.key !== phoneSubtitleKey && !isActionsColumn(c))
          const actionColumns = columns.filter((c) => isActionsColumn(c) && !isBlank(row[c.key]) && row[c.key] !== '—')
          const subtitle = phoneSubtitleKey ? row[phoneSubtitleKey] : null
          return (
            <div
              key={rowId}
              className="stagger-item overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-xs"
              style={{ '--stagger-index': Math.min(rowIndex, 8) }}
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setPhoneOpenId(open ? null : rowId)}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block break-words text-[15px] font-semibold leading-snug text-text-primary">
                    {isBlank(row[phoneTitleKey]) ? '—' : row[phoneTitleKey]}
                  </span>
                  {!isBlank(subtitle) && <span className="mt-0.5 block break-words text-[12px] text-text-muted">{subtitle}</span>}
                </span>
                <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <dl className={cardColumns === 2 ? 'grid grid-cols-2 gap-x-3 gap-y-2.5' : 'space-y-2'}>
                    {detailColumns.map((column) => (
                      <div key={column.key} className="min-w-0 break-words">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{column.label}</dt>
                        <dd className="mt-0.5 text-[13px] text-text-primary">{isBlank(row[column.key]) ? '—' : row[column.key]}</dd>
                      </div>
                    ))}
                  </dl>
                  {actionColumns.map((column) => (
                    <div key={column.key} className="mt-3 border-t border-border pt-3">{row[column.key]}</div>
                  ))}
                  {isExpanded(row) && renderExpandedMobile && (
                    <div className="mt-3 border-t border-border pt-3">{renderExpandedMobile(row)}</div>
                  )}
                  {onRowClick && (
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-border-strong text-[13px] font-medium text-primary transition-colors hover:bg-surface-2"
                    >
                      {phoneOpenLabel} →
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!phoneTitleKey && data.map((row, rowIndex) => (
          <div
            key={row.id || rowIndex}
            className={[
              'stagger-item rounded-[var(--radius-md)] border border-border bg-surface p-4 shadow-xs',
              onRowClick ? 'cursor-pointer hover:shadow-md hover:border-border-strong transition-[box-shadow,border-color] press-scale' : '',
            ].join(' ')}
            style={{ '--stagger-index': Math.min(rowIndex, 8) }}
            {...clickProps(row)}
          >
            <div className={cardColumns === 2 ? 'grid grid-cols-2 gap-x-3 gap-y-2.5' : 'space-y-2'}>
              {columns.filter((column) => !isActionsColumn(column)).map((column) => (
                <div key={column.key} className="min-w-0 break-words">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    {column.label}
                  </p>
                  <div className="mt-0.5 text-[13px] text-text-primary">
                    {isBlank(row[column.key]) ? '—' : row[column.key]}
                  </div>
                </div>
              ))}
            </div>
            {columns.filter((column) => isActionsColumn(column) && !isBlank(row[column.key]) && row[column.key] !== '—').map((column) => (
              <div key={column.key} className="mt-3 border-t border-border pt-3">{row[column.key]}</div>
            ))}
            {isExpanded(row) && renderExpandedMobile && (
              <div className="mt-3 cursor-default border-t border-border pt-3" data-no-row-click>
                {renderExpandedMobile(row)}
              </div>
            )}
            {onRowClick && (
              <p className="mt-3 border-t border-border pt-2 text-[12px] font-medium text-primary">
                {renderExpandedMobile ? (isExpanded(row) ? 'Tap to hide details ↑' : 'Tap to show details ↓') : 'Tap to view details →'}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className={`hidden ${frame} overflow-hidden md:block`}>
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-primary">
                {columns.map((column) => (
                  <th
                    className={`px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white ${isActionsColumn(column) ? 'sticky right-0 bg-primary' : ''}`}
                    key={column.key}
                  >
                    {column.headerNode ?? column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <Fragment key={row.id || rowIndex}>
                  <tr
                    className={[
                      'stagger-item border-b border-border last:border-b-0 transition-colors hover:bg-surface-2',
                      onRowClick ? 'cursor-pointer' : '',
                      isExpanded(row) ? 'bg-surface-2' : '',
                    ].join(' ')}
                    style={{ '--stagger-index': Math.min(rowIndex, 8) }}
                    {...clickProps(row)}
                  >
                    {columns.map((column) => (
                      <td className={`px-4 py-[13px] text-[13px] text-text-primary align-middle ${isActionsColumn(column) ? 'sticky right-0 bg-surface shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.12)]' : ''}`} key={column.key}>
                        {row[column.key] ?? ''}
                      </td>
                    ))}
                  </tr>
                  {isExpanded(row) && renderExpanded && (
                    <tr className="border-b border-border">
                      <td colSpan={columns.length} className="p-0">{renderExpanded(row)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default DataTable
