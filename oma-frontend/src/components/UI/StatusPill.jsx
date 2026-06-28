const TONE = {
  green:    { bg: 'bg-[#EBF5EE]', text: 'text-[#1B4D2E]', dot: 'bg-[#1B4D2E]' },
  amber:    { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', dot: 'bg-[#92400E]' },
  rose:     { bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', dot: 'bg-[#991B1B]' },
  blue:     { bg: 'bg-[#EEF2FF]', text: 'text-[#3730A3]', dot: 'bg-[#3730A3]' },
  slate:    { bg: 'bg-[#F5F7F5]', text: 'text-[#4A5E4A]', dot: 'bg-[#4A5E4A]' },
  navy:     { bg: 'bg-[#EEF2FF]', text: 'text-[#3730A3]', dot: 'bg-[#3730A3]' },
  marigold: { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', dot: 'bg-[#92400E]' },
}

function StatusPill({ tone = 'slate', children }) {
  const colors = TONE[tone] || TONE.slate
  return (
    <span className={`inline-flex items-center gap-[5px] px-[10px] py-[3px] rounded-full text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
      <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${colors.dot}`} />
      {children}
    </span>
  )
}

export default StatusPill
