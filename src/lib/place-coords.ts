/**
 * A pin the map can show. `{lat: 0, lon: 0}` is the Gulf of Guinea, written
 * when Google returned a place with no geometry. It is not a location.
 */
export function isNullIsland(coords: { lat: number; lon: number } | null | undefined): boolean {
  return !!coords && coords.lat === 0 && coords.lon === 0
}

export function usablePin(
  coords: { lat: number; lon: number } | null | undefined,
): { lat: number; lon: number } | null {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return null
  if (isNullIsland(coords)) return null
  return { lat: coords.lat, lon: coords.lon }
}
