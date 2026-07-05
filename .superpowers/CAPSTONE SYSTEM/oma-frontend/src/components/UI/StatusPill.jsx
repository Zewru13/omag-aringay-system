const TONE = {
  green:    'bg-[#F1F8E9] text-[#2E7D32]',
  amber:    'bg-[#FFFDE7] text-[#F57F17]',
  rose:     'bg-[#FFEBEE] text-[#C62828]',
  blue:     'bg-blue-100  text-blue-800',
  slate:    'bg-slate-200 text-slate-700',
  navy:     'bg-blue-100  text-blue-900',
  marigold: 'bg-[#fff3e0] text-[#E65100]',
}

function StatusPill({ tone = 'slate', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  )
}

export default StatusPill
