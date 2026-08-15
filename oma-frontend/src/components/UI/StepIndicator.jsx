import { Check } from 'lucide-react'

// Numbered-circle progress header for multi-step wizards. `steps` is
// [{ key, label }]; `currentIndex` is 0-based. A step is "done" (checkmark,
// filled) when its index is behind currentIndex, "active" (filled, numbered)
// when it equals currentIndex, otherwise "pending" (outlined, muted).
function StepIndicator({ steps, currentIndex }) {
  return (
    <div className="flex items-start">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <div key={step.key} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                className={
                  'w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold ' +
                  (done || active
                    ? 'bg-[#1B4D2E] text-white'
                    : 'bg-white border-2 border-[#D8E2D8] text-[#8AA08A]')
                }
              >
                {done ? <Check size={16} /> : i + 1}
              </div>
              <span
                className={
                  'text-[12px] whitespace-nowrap ' +
                  (active ? 'font-semibold text-[#1A2B1A]' : 'font-medium text-[#8AA08A]')
                }
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-[2px] mx-3 mt-[18px] ${done ? 'bg-[#1B4D2E]' : 'bg-[#E2E8E2]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default StepIndicator
