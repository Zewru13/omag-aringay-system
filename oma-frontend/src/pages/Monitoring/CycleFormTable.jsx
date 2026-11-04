// The Start Production Cycle form laid out as tables: one titled section for each group of related fields (Fisherfolk Information, Culture Details,
// Stocking Information, Ownership, Pond/Cage Details), and in each a table of labelled rows - a label cell and its input cell, two fields to a row on a wide
// window, one under the other on a phone. A required field says so with a red * after its label.
//   <CycleSection title="Culture Details"> <CycleRow> <CycleField label="Species Farmed" required>..input..</CycleField> <CycleField ...> </CycleRow> </CycleSection>
// A row with a single field gives it the whole row (`wide`).

export function CycleSection({ title, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white" aria-label={title}>
      <h3 className="bg-[#EBF5EE] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E]">{title}</h3>
      {children}
    </section>
  )
}

// The rows of a section: a real table (a block on a phone).
export function CycleRows({ label, children }) {
  return (
    <table className="w-full table-fixed text-sm max-md:block" aria-label={label}>
      {/* Four equal-purpose columns (label, input, label, input) so a single wide field lines up with the two-to-a-row ones. */}
      <colgroup className="max-md:hidden"><col style={{ width: '16%' }} /><col style={{ width: '34%' }} /><col style={{ width: '16%' }} /><col style={{ width: '34%' }} /></colgroup>
      <tbody className="max-md:block">{children}</tbody>
    </table>
  )
}

export function CycleRow({ children }) {
  return <tr className="border-t border-[#F0F4F0] first:border-t-0 max-md:block max-md:px-3 max-md:py-2">{children}</tr>
}

export function CycleField({ label, required = false, wide = false, hint = null, error = '', children }) {
  return (
    <>
      <th scope="row" className="whitespace-normal px-3 py-2.5 text-left align-top text-[12px] font-medium text-[#4A5E4A] max-md:block max-md:w-auto max-md:px-0 max-md:pb-1 max-md:pt-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </th>
      <td colSpan={wide ? 3 : 1} className="px-3 py-2 align-top max-md:block max-md:w-auto max-md:px-0 max-md:pb-1 max-md:pt-0">
        {children}
        {hint}
        {error && <p className="mt-1 text-xs text-rose-600" role="alert">{error}</p>}
      </td>
    </>
  )
}
