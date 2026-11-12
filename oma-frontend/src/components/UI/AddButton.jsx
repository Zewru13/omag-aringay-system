import { Plus } from 'lucide-react'
import Button from './Button.jsx'

// The primary "add a new thing" button, the same size and look wherever a list or card header offers one.
export default function AddButton({ children, onClick, disabled = false, title }) {
  return (
    <Button type="button" onClick={onClick} disabled={disabled} title={title} variant="primary" className="whitespace-nowrap">
      <Plus size={15} aria-hidden="true" />
      {children}
    </Button>
  )
}
