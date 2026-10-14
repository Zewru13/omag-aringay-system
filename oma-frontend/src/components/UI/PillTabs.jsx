// The page-level tab row: one rounded pill per view (the same look as the User Management tabs). `tabs` is
// [{ id, label, icon? }]; `value` is the active id. Used where a page switches between whole views, e.g. Forecast / Yield analysis.
export default function PillTabs({ tabs, value, onChange, ariaLabel }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
            value === id
              ? 'bg-[#1B4D2E] text-white'
              : 'border border-[#E2E8E2] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
          }`}
        >
          {Icon && <Icon size={14} aria-hidden="true" />}
          {label}
        </button>
      ))}
    </div>
  )
}
