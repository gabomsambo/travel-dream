import Fuse from 'fuse.js'
import type { Place } from '@/types/database'

let fuseIndex: Fuse<SearchablePlace> | null = null
let cachedPlaces: SearchablePlace[] = []

interface SearchablePlace extends Place {
  tagsString?: string
  vibesString?: string
  cuisineString?: string
  activitiesString?: string
  amenitiesString?: string
}

function arrayToString(value: any): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.join(' ')
  if (typeof value === 'string') return value
  return ''
}

export function initializeSearchIndex(places: Place[]): void {
  cachedPlaces = places.map(place => ({
    ...place,
    tagsString: arrayToString(place.tags),
    vibesString: arrayToString(place.vibes),
    cuisineString: arrayToString(place.cuisine),
    activitiesString: arrayToString(place.activities),
    amenitiesString: arrayToString(place.amenities),
  }))

  fuseIndex = new Fuse(cachedPlaces, {
    keys: [
      { name: 'name', weight: 1.5 },
      { name: 'description', weight: 1.0 },
      { name: 'city', weight: 1.2 },
      { name: 'country', weight: 1.0 },
      { name: 'kind', weight: 1.3 },
      { name: 'tagsString', weight: 1.1 },
      { name: 'vibesString', weight: 1.0 },
      { name: 'altNames', weight: 1.2 },
      { name: 'address', weight: 0.8 },
      { name: 'cuisineString', weight: 1.1 },
      { name: 'activitiesString', weight: 1.0 },
      { name: 'amenitiesString', weight: 0.9 },
      { name: 'notes', weight: 0.7 },
      { name: 'practicalInfo', weight: 0.6 },
    ],
    threshold: 0.3,
    ignoreLocation: false,
    minMatchCharLength: 1,
    shouldSort: true,
    includeScore: true,
  })
}

export interface SearchResult {
  place: Place
  score: number
}

export function fuzzySearch(query: string): SearchResult[] {
  if (!fuseIndex || !query.trim()) {
    return []
  }

  const results = fuseIndex.search(query)

  return results.map(result => ({
    place: result.item,
    score: 1 - (result.score || 0),
  }))
}

export function getSearchSuggestions(
  query: string,
  limit: number = 8
): { text: string; type: string }[] {
  if (!query.trim() || !cachedPlaces.length) return []

  const suggestions: Set<string> = new Set()
  const lowerQuery = query.toLowerCase()

  cachedPlaces.forEach(place => {
    if (place.name.toLowerCase().includes(lowerQuery)) {
      suggestions.add(place.name)
    }
  })

  cachedPlaces.forEach(place => {
    if (place.city?.toLowerCase().includes(lowerQuery)) {
      suggestions.add(place.city)
    }
  })

  cachedPlaces.forEach(place => {
    if (place.kind.toLowerCase().includes(lowerQuery)) {
      suggestions.add(place.kind)
    }
  })

  cachedPlaces.forEach(place => {
    const tags = Array.isArray(place.tags) ? place.tags : []
    tags.forEach(tag => {
      if (tag.toLowerCase().includes(lowerQuery)) {
        suggestions.add(tag)
      }
    })
  })

  return Array.from(suggestions)
    .slice(0, limit)
    .map(text => ({
      text,
      type: 'suggestion',
    }))
}
