export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  defaultView: 'grid' | 'list' | 'map'
  cardDensity: 'compact' | 'comfortable'
  autoProcessUploads: boolean
  confidenceThreshold: number
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  defaultView: 'grid',
  cardDensity: 'comfortable',
  autoProcessUploads: true,
  confidenceThreshold: 70,
}
