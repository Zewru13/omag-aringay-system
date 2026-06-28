function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white border border-[#E2E8E2] rounded-lg px-3 py-2 shadow-sm text-[13px] text-[#1A2B1A]">
      {label != null && <p className="mb-1 text-[#4A5E4A]">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i}>
          <span className="text-[#7A8E7A]">{entry.name}: </span>
          {valueFormatter ? valueFormatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  )
}

export default ChartTooltip
