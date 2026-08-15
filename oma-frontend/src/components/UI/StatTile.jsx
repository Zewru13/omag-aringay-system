// Small "number + caption" card, used in a row to summarize counts
// (e.g. Total members / Eligible recipients / Flagged).
function StatTile({ value, label, className = '' }) {
  return (
    <div className={`rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-4 text-center ${className}`}>
      <p className="text-[26px] font-semibold text-[#1A2B1A] leading-none">{value}</p>
      <p className="mt-1.5 text-[12px] text-[#7A8E7A]">{label}</p>
    </div>
  )
}

export default StatTile
