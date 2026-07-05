import { AlertCircle, Check, Info, X } from 'lucide-react'
import { useToast } from '../../context/ToastContext.jsx'

function Toast() {
  const { toasts, removeToast } = useToast()

  const getStyles = (type) => {
    switch (type) {
      case 'success':
        return {
          border: 'border-l-green-600',
          icon: <Check className="h-4 w-4 shrink-0 text-[#1E4620]" />,
        }
      case 'error':
        return {
          border: 'border-l-rose-600',
          icon: <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />,
        }
      case 'info':
      default:
        return {
          border: 'border-l-blue-600',
          icon: <Info className="h-4 w-4 shrink-0 text-blue-600" />,
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
            className={`flex items-start gap-3 rounded-xl border-l-4 bg-white px-4 py-3 shadow-lg ${styles.border}`}
          >
            {styles.icon}
            <p className="flex-1 text-sm text-slate-900">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-slate-400 transition hover:text-slate-600"
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
