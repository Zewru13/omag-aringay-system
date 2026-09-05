import { InboxIcon } from 'lucide-react'

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

function DataTable({ columns, data, isLoading, loading, onRowClick, emptyState }) {
  const showLoading = isLoading || loading

  if (showLoading) {
    return (
      <div className="bg-surface border border-border rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-primary">
                {columns.map((column) => (
                  <th
                    className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white"
                    key={column.key}
                  >
                    {column.label}
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
        <div className="bg-surface border border-border rounded-[var(--radius-md)] shadow-sm overflow-hidden">
          {emptyState}
        </div>
      )
    }
    return (
      <div className="bg-surface border border-border rounded-[var(--radius-md)] shadow-sm overflow-hidden flex flex-col items-center justify-center min-h-[200px] gap-2 py-10">
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
        {data.map((row, rowIndex) => (
          <div
            key={row.id || rowIndex}
            className={[
              'stagger-item rounded-[var(--radius-md)] border border-border bg-surface p-4 shadow-xs',
              onRowClick ? 'cursor-pointer hover:shadow-md hover:border-border-strong transition-[box-shadow,border-color] press-scale' : '',
            ].join(' ')}
            style={{ '--stagger-index': Math.min(rowIndex, 8) }}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map((column) => (
              <div key={column.key} className="mt-2 first:mt-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {column.label}
                </p>
                <div className="mt-0.5 text-[13px] text-text-primary">
                  {row[column.key] ?? '—'}
                </div>
              </div>
            ))}
            {onRowClick && (
              <p className="mt-3 border-t border-border pt-2 text-[12px] font-medium text-primary">
                Tap to view details →
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden bg-surface border border-border rounded-[var(--radius-md)] shadow-sm overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-primary">
                {columns.map((column) => (
                  <th
                    className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white"
                    key={column.key}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr
                  className={[
                    'stagger-item border-b border-border last:border-b-0 transition-colors hover:bg-surface-2',
                    onRowClick ? 'cursor-pointer' : '',
                  ].join(' ')}
                  style={{ '--stagger-index': Math.min(rowIndex, 8) }}
                  key={row.id || rowIndex}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <td className="px-4 py-[13px] text-[13px] text-text-primary align-middle" key={column.key}>
                      {row[column.key] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default DataTable
