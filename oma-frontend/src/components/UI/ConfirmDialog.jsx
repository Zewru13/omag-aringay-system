import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

function ConfirmDialog({
  title, message, subtitle, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, variant = 'danger', details = null,
  requireTypedConfirmation = false, typedConfirmationText = 'DELETE',
  showReasonInput = false, reasonValue = '', onReasonChange, reasonLabel = 'Reason (optional)',
  reasonPlaceholder = '', reasonMaxLength,
  // Lets a caller hold the confirm button back (e.g. until a required reason is written).
  confirmDisabled: holdConfirm = false,
  // Optional icon override — every existing caller omits these and keeps
  // today's amber AlertTriangle look. Added for non-destructive confirms
  // (e.g. "Confirm Save") that want a different icon/color, without forking
  // this component or touching any of its other 28 call sites.
  icon: Icon = AlertTriangle, iconBg = '#FEF3C7', iconColor = '#D97706',
}) {
  const isDanger = danger || variant === 'danger'
  const [typedValue, setTypedValue] = useState('')
  const confirmDisabled = holdConfirm || (requireTypedConfirmation && typedValue !== typedConfirmationText)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-[380px] rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon area */}
        <div className="flex flex-col items-center pt-6 pb-2">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: iconBg }}>
            <Icon size={22} color={iconColor} />
          </div>
          <h3 className="text-[15px] font-semibold text-[#1A2B1A] text-center mt-3">{title}</h3>
          {subtitle && (
            <p className="text-[12px] text-[#7A8E7A] text-center mt-1 px-6">{subtitle}</p>
          )}
          {message && (
            <p className="text-[13px] text-[#7A8E7A] text-center mt-2 px-6">{message}</p>
          )}
        </div>

        {details && (
          <div className="mx-6 mt-1 rounded-lg bg-[#FDF2F2] border border-[#F5D5D0] px-3 py-2">
            <p className="text-[12px] text-[#8A3B32]">{details}</p>
          </div>
        )}

        {showReasonInput && (
          <div className="px-6 mt-3">
            <label className="text-[12px] text-[#7A8E7A]">{reasonLabel}</label>
            <textarea
              rows={2}
              value={reasonValue}
              onChange={(e) => onReasonChange?.(e.target.value)}
              maxLength={reasonMaxLength}
              className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg border border-[#C8D5C8] focus:outline-none focus:ring-2 focus:ring-[#1B4D2E]/20 resize-none"
              placeholder={reasonPlaceholder}
            />
          </div>
        )}

        {requireTypedConfirmation && (
          <div className="px-6 mt-3">
            <label className="text-[12px] text-[#7A8E7A]">
              Type <span className="font-semibold text-[#C0392B]">{typedConfirmationText}</span> to confirm
            </label>
            <input
              type="text"
              autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              className="mt-1 w-full h-9 px-3 text-[13px] rounded-lg border border-[#C8D5C8] focus:outline-none focus:ring-2 focus:ring-[#C0392B]/30"
              placeholder={typedConfirmationText}
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 px-6 pb-6 mt-5">
          <button
            type="button"
            className="flex-1 h-9 px-4 text-[13px] font-medium rounded-lg border border-[#C8D5C8] text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            className={`flex-1 h-9 px-4 text-[13px] font-medium rounded-lg text-white transition-colors ${
              confirmDisabled
                ? 'bg-[#D8B8B4] cursor-not-allowed'
                : isDanger
                  ? 'bg-[#C0392B] hover:bg-[#A93226]'
                  : 'bg-[#1B4D2E] hover:bg-[#235E38]'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
