import { AlertTriangle, BookOpen, CircleHelp, HandHeart, HandHelping, Home, Menu, Package, Sprout, TrendingUp, User, UserCog, Users, Waves } from 'lucide-react'

// The icon of a menu entry, by the name accountNav.js gives it. The phone tab bar, the sidebar and the More page all draw from here.
export const ACCOUNT_ICONS = {
  home: Home, crop: Sprout, cycle: Waves, members: Users, assistance: HandHeart, disaster: AlertTriangle, equipment: Package, more: Menu,
  forecast: TrendingUp, borrow: HandHelping, officers: UserCog, profile: User, help: CircleHelp, manual: BookOpen,
}

export const accountIcon = (name) => ACCOUNT_ICONS[name] || Home
