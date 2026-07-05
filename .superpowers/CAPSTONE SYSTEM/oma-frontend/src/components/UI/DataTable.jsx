function DataTable({ columns, data, isLoading, onRowClick }) {
  if (isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-100 bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-green-600" />
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-2xl border border-slate-100 bg-white text-sm text-slate-400">
        No records found.
      </div>
    )
  }

  return (
    <>
      {/* Mobile: card view — one card per row */}
      <div className="block space-y-3 md:hidden">
        {data.map((row, rowIndex) => (
          <div
            key={row.id || rowIndex}
            className={[
              'rounded-xl border border-slate-100 bg-white p-4',
              onRowClick ? 'cursor-pointer active:bg-slate-50' : '',
            ].join(' ')}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map((column) => (
              <div key={column.key} className="mt-2 first:mt-0">
                <p className="text-xs font-medium text-slate-400">
                  {column.label}
                </p>
                <p className="mt-0.5 text-sm text-slate-900">
                  {row[column.key] ?? '—'}
                </p>
              </div>
            ))}
            {onRowClick && (
              <p className="mt-3 border-t border-slate-100 pt-2 text-xs font-medium text-[#1E4620]">
                Tap to view details →
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: normal table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="bg-[#1E4620]">
                {columns.map((column) => (
                  <th
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white"
                    key={column.key}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row, rowIndex) => (
                <tr
                  className={[
                    'transition-colors hover:bg-slate-50',
                    onRowClick ? 'cursor-pointer' : '',
                  ].join(' ')}
                  key={row.id || rowIndex}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700" key={column.key}>
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
