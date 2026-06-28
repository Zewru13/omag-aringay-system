import { AlertCircle, AlertTriangle, Check, Info, X } from 'lucide-react'
import { useToast } from '../../context/ToastContext.jsx'

function Toast() {
  const { toasts, removeToast } = useToast()

  const getStyles = (type) => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-[#EBF5EE] border border-[#C8E6D0] text-[#1B4D2E]',
          icon: <Check className="h-4 w-4 shrink-0" />,
        }
      case 'error':
        return {
          container: 'bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B]',
          icon: <AlertCircle className="h-4 w-4 shrink-0" />,
        }
      case 'warning':
        return {
          container: 'bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E]',
          icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
        }
      case 'info':
      default:
        return {
          container: 'bg-slate-100 border border-slate-200 text-slate-700',
          icon: <Info className="h-4 w-4 shrink-0" />,
        }
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => {
        const styles = getStyles(toast.type)

        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg min-w-[280px] max-w-sm ${styles.container}`}
          >
            {styles.icon}
            <p className="flex-1 text-[13px]">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default Toast
