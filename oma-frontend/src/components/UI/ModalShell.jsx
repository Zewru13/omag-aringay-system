import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

function ModalShell({ title, subtitle, icon: Icon, iconBg = 'bg-primary-light', iconColor = 'text-primary', onClose, children, footer, maxWidth = 'max-w-md' }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 modal-backdrop"
      onClick={onClose}
    >
      <div
        className={`bg-surface rounded-[var(--radius-lg)] shadow-[var(--shadow-modal)] w-full max-h-[90vh] overflow-y-auto modal-content ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-border">
          {Icon && (
            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              <Icon size={18} className={iconColor} aria-hidden="true" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
            {subtitle && <p className="text-[12px] text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            className="press-scale ml-auto w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors flex-shrink-0"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 pb-5 pt-4 border-t border-border flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default ModalShell
