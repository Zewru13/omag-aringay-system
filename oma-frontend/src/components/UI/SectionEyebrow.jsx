// Small uppercase tracked-letter label marking a form section, e.g.
// "TARGET ORGANIZATION". Purely presentational — not a form label.
function SectionEyebrow({ children, className = '' }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8AA08A] mb-3 ${className}`}>
      {children}
    </p>
  )
}

export default SectionEyebrow
