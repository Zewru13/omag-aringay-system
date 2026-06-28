import LoadingSpinner from './LoadingSpinner'

function DataTable({ columns, data, isLoading, loading, onRowClick, emptyState }) {
  const showLoading = isLoading || loading

  if (showLoading) {
    return (
      <div className="bg-white border border-[#E2E8E2] rounded-xl overflow-hidden">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size={24} />
        </div>
      </div>
    )
  }

  if (!data?.length) {
    if (emptyState) {
      return (
        <div className="bg-white border border-[#E2E8E2] rounded-xl overflow-hidden">
          {emptyState}
        </div>
      )
    }
    return (
      <div className="bg-white border border-[#E2E8E2] rounded-xl overflow-hidden flex items-center justify-center min-h-[160px]">
        <p className="text-[13px] text-[#7A8E7A]">No records found.</p>
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
              'rounded-xl border border-[#E2E8E2] bg-white p-4',
              onRowClick ? 'cursor-pointer hover:bg-[#F9FAF9] transition-colors' : '',
            ].join(' ')}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map((column) => (
              <div key={column.key} className="mt-2 first:mt-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7A8E7A]">
                  {column.label}
                </p>
                <p className="mt-0.5 text-[13px] text-[#1A2B1A]">
                  {row[column.key] ?? '—'}
                </p>
              </div>
            ))}
            {onRowClick && (
              <p className="mt-3 border-t border-[#F0F4F0] pt-2 text-[12px] font-medium text-[#1B4D2E]">
                Tap to view details →
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden bg-white border border-[#E2E8E2] rounded-xl overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-[#1B4D2E]">
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
                    'border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]',
                    onRowClick ? 'cursor-pointer' : '',
                  ].join(' ')}
                  key={row.id || rowIndex}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <td className="px-4 py-[13px] text-[13px] text-[#1A2B1A] align-middle" key={column.key}>
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
