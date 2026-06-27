function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border-none bg-slate-900/90 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
      {label != null && <p className="mb-1 text-slate-300">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-white">
          <span className="text-slate-300">{entry.name}: </span>
          {valueFormatter ? valueFormatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  )
}

export default ChartTooltip
