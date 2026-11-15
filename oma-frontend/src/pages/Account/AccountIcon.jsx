import { AlertTriangle, BookOpen, CircleHelp, HandHeart, HandHelping, Home, Menu, Package, Sprout, TrendingUp, User, UserCog, Users, Waves } from 'lucide-react'

// The icon of a menu entry, by the name accountNav.js gives it.
const ICONS = {
  home: Home, crop: Sprout, cycle: Waves, members: Users, assistance: HandHeart, disaster: AlertTriangle, equipment: Package, more: Menu,
  forecast: TrendingUp, borrow: HandHelping, officers: UserCog, profile: User, help: CircleHelp, manual: BookOpen,
}

export default function AccountIcon({ name, size = 18, className = '' }) {
  const Icon = ICONS[name] || Home
  return <Icon size={size} className={className} aria-hidden="true" />
}
