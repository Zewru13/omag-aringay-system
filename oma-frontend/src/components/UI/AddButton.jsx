import { Plus } from 'lucide-react'

// The primary "add a new thing" button, the same size and look wherever a list or card header offers one.
export default function AddButton({ children, onClick, disabled = false, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus size={15} aria-hidden="true" />
      {children}
    </button>
  )
}
