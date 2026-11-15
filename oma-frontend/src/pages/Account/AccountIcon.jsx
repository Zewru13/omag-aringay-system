import { Home } from 'lucide-react'
import { ACCOUNT_ICONS } from './accountIcons.js'

// Draws the icon of a menu entry (see accountIcons.js).
export default function AccountIcon({ name, size = 18, className = '' }) {
  const Icon = ACCOUNT_ICONS[name] || Home
  return <Icon size={size} className={className} aria-hidden="true" />
}
