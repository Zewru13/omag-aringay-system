function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="overflow-x-auto whitespace-nowrap">
      <div className="inline-flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            className={[
              'flex-shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab.value === activeTab
                ? 'bg-[#1E4620] text-white'
                : 'text-slate-500 hover:bg-slate-100',
            ].join(' ')}
            onClick={() => onChange(tab.value)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default Tabs
