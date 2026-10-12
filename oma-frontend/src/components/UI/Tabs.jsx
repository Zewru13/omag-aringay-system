function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex w-full min-w-0 overflow-x-auto border-b border-[#E2E8E2] [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={[
            'flex-1 whitespace-nowrap px-2 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px sm:flex-none sm:px-4',
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
