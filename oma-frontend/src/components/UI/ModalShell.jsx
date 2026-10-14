import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

function ModalShell({ title, subtitle, icon: Icon, iconBg = 'bg-primary-light', iconColor = 'text-primary', onClose, children, footer, maxWidth = 'max-w-md' }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 modal-backdrop"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-modal)] modal-content ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — pinned; overflow-hidden + flex-col on the outer shell
            above means only the body below scrolls, and the rounded
            corners genuinely clip the header/footer bands instead of
            being scrolled out of view on tall content (see EditUserModal.jsx's
            standalone version, where this exact structure was live-tested
            first before being folded back in here). */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
          {Icon && (
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
              <Icon size={18} className={iconColor} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-text-muted max-sm:line-clamp-2">{subtitle}</p>}
          </div>
          <button
            className="press-scale ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md max-sm:h-10 max-sm:w-10 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body — only this section scrolls */}
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        {/* Footer — pinned, same as header. Only takes effect for callers
            that pass footer= instead of putting action buttons in
            children; a caller doing the latter keeps its old
            scrolls-with-the-body behavior for those specific buttons
            until it's migrated to this slot individually. */}
        {footer && (
          <div className="flex flex-shrink-0 justify-end gap-2 border-t border-border px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default ModalShell
