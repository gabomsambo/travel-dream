import {
  Building2, Coffee, Landmark, Martini, Mountain, Palmtree, ShoppingBag, Sparkles, Store, Telescope,
  Trees, UtensilsCrossed, Waves, Home, MapPin, Ticket, Palette, type LucideIcon,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  beach: Palmtree, natural: Mountain, park: Trees, viewpoint: Telescope, landmark: Landmark,
  museum: Palette, gallery: Palette, restaurant: UtensilsCrossed, cafe: Coffee, bar: Martini,
  club: Martini, market: Store, shop: ShoppingBag, experience: Ticket, tour: Ticket,
  thermal: Waves, neighborhood: Building2, city: Building2, stay: Home, hotel: Home, hostel: Home,
  festival: Sparkles,
}

export function kindIcon(kind: string): LucideIcon {
  return ICONS[kind] ?? MapPin
}

const LABELS: Record<string, string> = {
  natural: "Nature", viewpoint: "Viewpoint", neighborhood: "Neighborhood", thermal: "Hot springs",
}

export function kindLabel(kind: string): string {
  return LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1)
}
