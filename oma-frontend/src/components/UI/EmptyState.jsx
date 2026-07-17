import { InboxIcon } from 'lucide-react'

function EmptyState({ message, icon: Icon, title, description, action }) {
  const DisplayIcon = Icon || InboxIcon

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-1">
        <DisplayIcon size={26} className="text-primary" aria-hidden="true" />
      </div>
      {(title || message) && (
        <p className="text-[14px] font-semibold text-text-primary mt-3">{title || message}</p>
      )}
      {description && (
        <p className="text-[13px] text-text-muted mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
