import { InboxIcon } from 'lucide-react'

function EmptyState({ message, icon: Icon, title, description, action }) {
  const DisplayIcon = Icon || InboxIcon

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <DisplayIcon size={48} color="#C8D5C8" />
      {(title || message) && (
        <p className="text-[14px] font-medium text-[#1A2B1A] mt-3">{title || message}</p>
      )}
      {description && (
        <p className="text-[13px] text-[#7A8E7A] mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
