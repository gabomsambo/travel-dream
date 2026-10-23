/** A town read off a pin. No network types live here; the client can import it. */
export interface CitySuggestion {
  locality: string | null
  admin: string | null
  country: string | null
  /** A park, neighborhood, or similar sitting on the pin, when the geocoder names one. */
  areaLabel: string | null
}

export interface BranchCandidate {
  googlePlaceId: string
  name: string
  detail: string
}

export interface PinDetails {
  googlePlaceId: string
  name: string
  address: string | null
  city: string | null
  admin: string | null
  country: string | null
  coords: { lat: number; lon: number } | null
}
