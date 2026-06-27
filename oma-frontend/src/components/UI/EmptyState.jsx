import { InboxIcon } from 'lucide-react'

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <InboxIcon className="h-5 w-5 text-slate-400" />
      </div>
      <p className="mt-3 text-sm text-slate-400">{message}</p>
    </div>
  )
}

export default EmptyState
