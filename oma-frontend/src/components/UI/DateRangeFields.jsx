import { dateRangeProblem } from '../../utils/dateRange.js'

// A "From / To" pair of date filters for a FilterPanel (Date Planted, Date Stocked, Trip Date, Date Registered). The calendars stop a
// "To" before the "From"; a range typed backwards is flagged and not applied (see utils/dateRange.js).
const inputCls =
  'border border-[#E2E8E2] rounded-lg px-3 py-[7px] text-[13px] bg-[#F9FAF9] text-[#1A2B1A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

// On a phone each date filter is a row of its own: the label in a fixed column and the box filling the rest, so the boxes line up
// with each other and with the other filters instead of floating at different widths. Used by every From / To filter.
export const DATE_FILTER_LABEL = 'flex items-center gap-1.5 text-[13px] text-[#4A5E4A] max-md:grid max-md:w-full max-md:grid-cols-[7.5rem_minmax(0,1fr)]'
export const DATE_FILTER_BOX = 'max-md:w-full max-md:min-w-0'

export default function DateRangeFields({ label, from, to, onFromChange, onToChange }) {
  const problem = dateRangeProblem(from, to)
  return (
    <>
      <label className={DATE_FILTER_LABEL}>
        {label} From
        <input type="date" className={`${inputCls} ${DATE_FILTER_BOX}`} value={from} max={to || undefined} onChange={(e) => onFromChange(e.target.value)} />
      </label>
      <label className={DATE_FILTER_LABEL}>
        {label} To
        <input type="date" className={`${inputCls} ${DATE_FILTER_BOX}`} value={to} min={from || undefined} onChange={(e) => onToChange(e.target.value)} />
      </label>
      {problem && <span role="alert" className="text-[12px] font-medium text-rose-600 max-md:w-full">{problem} The range is not applied yet.</span>}
    </>
  )
}
