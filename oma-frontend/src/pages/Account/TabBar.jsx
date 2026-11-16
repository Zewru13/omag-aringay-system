// The tab row of an account page (at most three tabs). `tabs` is [{ value, label, count? }]; `count` adds a small number badge (for
// example open borrow requests). On a phone the tabs share the width and are 44px tall.
export default function TabBar({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 p-1">
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`press-scale flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-center transition-colors md:min-h-10 md:flex-none md:px-5 ${
              active ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:bg-surface hover:text-text-primary'
            }`}
          >
            <span className="text-[14px] font-semibold leading-tight">{tab.label}</span>
            {tab.count > 0 && (
              <span className={`rounded-full px-1.5 text-[13px] font-semibold leading-5 ${active ? 'bg-white/20 text-white' : 'bg-primary text-white'}`}>{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
