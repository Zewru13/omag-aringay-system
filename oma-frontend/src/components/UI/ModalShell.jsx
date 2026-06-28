import { X } from 'lucide-react'

function ModalShell({ title, subtitle, icon: Icon, iconBg = 'bg-[#EBF5EE]', iconColor = 'text-[#1B4D2E]', onClose, children, footer, maxWidth = 'max-w-md' }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 modal-backdrop"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-h-[90vh] overflow-y-auto modal-content ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-[#F0F4F0]">
          {Icon && (
            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              <Icon size={18} className={iconColor} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-[#1A2B1A]">{title}</h2>
            {subtitle && <p className="text-[12px] text-[#7A8E7A] mt-0.5">{subtitle}</p>}
          </div>
          <button
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-[#7A8E7A] hover:bg-[#F5F7F5] transition-colors flex-shrink-0"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 pb-5 pt-4 border-t border-[#F0F4F0] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default ModalShell
