import { AlertTriangle } from 'lucide-react'

function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, variant = 'danger' }) {
  const isDanger = danger || variant === 'danger'

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
          <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center">
            <AlertTriangle size={22} color="#D97706" />
          </div>
          <h3 className="text-[15px] font-semibold text-[#1A2B1A] text-center mt-3">{title}</h3>
          {message && (
            <p className="text-[13px] text-[#7A8E7A] text-center mt-2 px-6">{message}</p>
          )}
        </div>

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
            className={`flex-1 h-9 px-4 text-[13px] font-medium rounded-lg text-white transition-colors ${
              isDanger
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
