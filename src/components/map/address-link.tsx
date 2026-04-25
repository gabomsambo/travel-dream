"use client";

import { MapPin, ExternalLink } from "lucide-react";
import { getMapsUrl, getFallbackMapsUrl } from "@/lib/maps-url";
import type { PlaceWithRelations } from "@/types/database";

function narrowCoords(coords: PlaceWithRelations["coords"]): { lat: number; lon: number } | null {
  if (
    coords &&
    typeof coords === "object" &&
    !Array.isArray(coords) &&
    "lat" in coords &&
    "lon" in coords
  ) {
    const c = coords as { lat: unknown; lon: unknown };
    if (typeof c.lat === "number" && typeof c.lon === "number") {
      return { lat: c.lat, lon: c.lon };
    }
  }
  return null;
}

export function AddressLink({ place }: { place: PlaceWithRelations }) {
  if (!place.address) return null;

  const coords = narrowCoords(place.coords);
  const name = place.name || undefined;
  const fallbackHref = getFallbackMapsUrl({
    coords,
    address: place.address,
    name,
  });

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const { url, sameWindow } = getMapsUrl({
      coords,
      address: place.address,
      name,
    });
    e.preventDefault();
    if (sameWindow) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex items-start gap-2">
      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <a
        href={fallbackHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="text-sm hover:text-blue-600 focus-visible:text-blue-600 focus-visible:underline rounded-sm transition-colors inline-flex items-baseline gap-1 break-words"
      >
        <span>{place.address}</span>
        <ExternalLink className="h-3 w-3 flex-shrink-0 self-center" />
      </a>
    </div>
  );
}
