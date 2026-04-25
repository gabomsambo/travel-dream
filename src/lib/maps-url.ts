type Coords = { lat: number; lon: number };

export type MapsUrlInput = {
  coords?: Coords | null;
  address?: string | null;
  name?: string | null;
};

export type MapsUrlResult = {
  url: string;
  sameWindow: boolean;
};

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel; disambiguate via touch points
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
}

function googleMapsUrl({ coords, address }: MapsUrlInput): string {
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ?? "")}`;
}

function appleMapsUrl({ coords, address, name }: MapsUrlInput): string {
  if (coords) {
    const q = name ? `&q=${encodeURIComponent(name)}` : "";
    return `https://maps.apple.com?ll=${coords.lat},${coords.lon}${q}`;
  }
  return `https://maps.apple.com?q=${encodeURIComponent(address ?? "")}`;
}

function geoUri({ coords, address, name }: MapsUrlInput): string {
  if (coords) {
    const label = name ? `(${encodeURIComponent(name)})` : "";
    return `geo:${coords.lat},${coords.lon}?q=${coords.lat},${coords.lon}${label}`;
  }
  return `geo:0,0?q=${encodeURIComponent(address ?? "")}`;
}

export function getMapsUrl(input: MapsUrlInput): MapsUrlResult {
  if (isIOS()) {
    return { url: appleMapsUrl(input), sameWindow: false };
  }
  if (isAndroid()) {
    return { url: geoUri(input), sameWindow: true };
  }
  return { url: googleMapsUrl(input), sameWindow: false };
}

export function getFallbackMapsUrl(input: MapsUrlInput): string {
  return googleMapsUrl(input);
}
