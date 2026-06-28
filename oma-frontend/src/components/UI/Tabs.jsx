function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex border-b border-[#E2E8E2]">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={[
            'px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px',
            tab.value === activeTab
              ? 'text-[#1B4D2E] border-[#1B4D2E]'
              : 'text-[#7A8E7A] hover:text-[#4A5E4A] border-transparent',
          ].join(' ')}
          onClick={() => onChange(tab.value)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default Tabs
