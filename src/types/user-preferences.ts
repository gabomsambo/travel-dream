export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  defaultView: 'grid' | 'list'
  cardDensity: 'compact' | 'comfortable'
  autoProcessUploads: boolean
  confidenceThreshold: number
  /** When true, /place/[id] opens in the editor. Off by default. */
  openPlacesInEditMode: boolean
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  defaultView: 'grid',
  cardDensity: 'comfortable',
  autoProcessUploads: true,
  confidenceThreshold: 70,
  openPlacesInEditMode: false,
}
