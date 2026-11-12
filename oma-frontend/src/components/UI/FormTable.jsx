import { detailRows, displayValue } from './formTableRows.js'

// The table layout every form window and every view window uses: titled sections, and in each a table of labelled rows - a label cell and
// its input (or value) cell, two fields to a row on a wide window, one under the other on a phone. A required field says so with a red *.
//
//   <FormSection title="Culture Details">
//     <FormRows label="Culture details">
//       <FormRow> <FormCell label="Species Farmed" required>..input..</FormCell> <FormCell label="Culture System">..</FormCell> </FormRow>
//       <FormRow> <FormCell label="Remarks" wide>..input..</FormCell> </FormRow>      a single field takes the whole row
//     </FormRows>
//   </FormSection>
//
// A view window shows the same thing read-only:
//   <DetailTable title="Culture Details" fields={[{ label: 'Species Farmed', value: 'Tilapia' }, { label: 'Remarks', value: notes, wide: true }]} />
//
// A form with one row per item (a pond, a member, a log entry) uses EntryTable.jsx instead.

export function FormSection({ title, children }) {
  return (
    <section className="rounded-xl border border-[#E2E8E2] bg-white" aria-label={title}>
      {/* No overflow clipping on the section: a drop-down list opened inside it must not be cut off, so the header rounds its own corners. */}
      <h3 className="rounded-t-[11px] bg-[#EBF5EE] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E]">{title}</h3>
      {children}
    </section>
  )
}

// The rows of a section: a real table (a block on a phone).
export function FormRows({ label, children }) {
  return (
    <table className="w-full table-fixed text-sm max-md:block" aria-label={label}>
      {/* Four equal-purpose columns (label, input, label, input) so a single wide field lines up with the two-to-a-row ones. */}
      <colgroup className="max-md:hidden"><col style={{ width: '16%' }} /><col style={{ width: '34%' }} /><col style={{ width: '16%' }} /><col style={{ width: '34%' }} /></colgroup>
      <tbody className="max-md:block">{children}</tbody>
    </table>
  )
}

export function FormRow({ children }) {
  return <tr className="border-t border-[#F0F4F0] first:border-t-0 max-md:block max-md:px-3 max-md:py-2">{children}</tr>
}

export function FormCell({ label, required = false, wide = false, hint = null, error = '', children }) {
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

// A read-only value in a cell: lined up with where an input's text would be; a dash when there is nothing.
export function FormValue({ children }) {
  return <div className="break-words py-1 text-[13px] text-[#1A2B1A]">{displayValue(children)}</div>
}

// A read-only section for a view window. fields: [{ label, value, wide?, hidden? }]; `value` may be text, a number or anything drawn
// (a pill, a link). `columns={1}` puts every field on a row of its own.
export function DetailTable({ title, fields, columns = 2 }) {
  const rows = detailRows(fields, columns)
  if (!rows.length) return null
  return (
    <FormSection title={title}>
      <FormRows label={title}>
        {rows.map((row) => (
          <FormRow key={row.map((field) => field.label).join('|')}>
            {row.map((field) => (
              <FormCell key={field.label} label={field.label} wide={field.wide}>
                <FormValue>{field.value}</FormValue>
              </FormCell>
            ))}
          </FormRow>
        ))}
      </FormRows>
    </FormSection>
  )
}
