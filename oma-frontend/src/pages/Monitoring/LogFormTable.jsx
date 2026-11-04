// The table the Feeding Log and Health Log forms are laid out in: one labelled column per field, one row per pond/cage where the entry is
// per pond/cage. From `md` up it is a normal table (its own horizontal scroll if the window is narrow); on a phone every row becomes a
// small card and each cell shows its column name (the `label` of LogCell) above its box.
//   <LogTable label testId> <LogHead><LogTh>..</LogTh></LogHead> <tbody><LogRow><LogCell label="Date *">..</LogCell></LogRow></tbody> </LogTable>
// A required column says so with a red * in its heading; put the same * in the cell's `label`.

const CELL = 'px-3 py-2 align-top max-md:block max-md:px-0 max-md:py-1.5 max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'

const CELL_PLAIN = 'px-3 py-2 align-top max-md:block max-md:px-0 max-md:py-1'

export function LogTable({ label, testId, children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white" data-testid={testId}>
      <table className="w-full text-sm max-md:block max-md:[&>tbody]:block max-md:[&>tfoot]:block" aria-label={label}>{children}</table>
    </div>
  )
}

export function LogHead({ children }) {
  return (
    <thead className="bg-[#EBF5EE] max-md:hidden">
      <tr>{children}</tr>
    </thead>
  )
}

export function LogTh({ children, className = '', required = false }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E] ${className}`}>
      {children}{required && <span className="text-red-500"> *</span>}
    </th>
  )
}

export function LogRow({ children, tone = '', className = '', ...props }) {
  return (
    <tr className={`border-t border-[#F0F4F0] max-md:block max-md:px-3 max-md:py-2 ${tone} ${className}`} {...props}>{children}</tr>
  )
}

// No `label`: the cell shows no column name on a phone (a key/value table, where the key cell already says what the value is).
export function LogCell({ label, children, className = '' }) {
  return label
    ? <td data-label={label} className={`${CELL} ${className}`}>{children}</td>
    : <td className={`${CELL_PLAIN} ${className}`}>{children}</td>
}
