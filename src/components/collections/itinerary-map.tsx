"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import type { Place } from "@/types/database";

interface ItineraryMapProps {
  places: Place[];
  hoveredPlaceId?: string | null;
  onPlaceHover?: (placeId: string | null) => void;
  transportMode: "drive" | "walk";
}

export function ItineraryMap({
  places,
  hoveredPlaceId,
  onPlaceHover,
  transportMode,
}: ItineraryMapProps) {
  const placesWithCoords = useMemo(
    () => places.filter((p) => p.coords),
    [places]
  );

  if (placesWithCoords.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-2 p-8">
          <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Add places with coordinates to see the map
          </p>
        </div>
      </Card>
    );
  }

  const bounds = useMemo(() => {
    const lats = placesWithCoords.map((p) => p.coords!.lat);
    const lngs = placesWithCoords.map((p) => p.coords!.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latPadding = (maxLat - minLat) * 0.2 || 0.1;
    const lngPadding = (maxLng - minLng) * 0.2 || 0.1;

    return {
      minLat: minLat - latPadding,
      maxLat: maxLat + latPadding,
      minLng: minLng - lngPadding,
      maxLng: maxLng + lngPadding,
    };
  }, [placesWithCoords]);

  const mapToSVG = (lat: number, lng: number) => {
    const padding = 50;
    const x =
      ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) *
        (800 - padding * 2) +
      padding;
    const y =
      ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) *
        (600 - padding * 2) +
      padding;
    return { x, y };
  };

  const routePath = placesWithCoords
    .map((p, i) => {
      const { x, y } = mapToSVG(p.coords!.lat, p.coords!.lon);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  const lineColor =
    transportMode === "drive" ? "rgb(59 130 246)" : "rgb(34 197 94)";

  return (
    <div className="h-full w-full bg-muted/30 rounded-lg overflow-hidden">
      <svg viewBox="0 0 800 600" className="w-full h-full">
        {/* Route Line */}
        {placesWithCoords.length > 1 && (
          <path
            d={routePath}
            stroke={lineColor}
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
          />
        )}

        {/* Markers */}
        {placesWithCoords.map((place, i) => {
          const { x, y } = mapToSVG(place.coords!.lat, place.coords!.lon);
          const isHovered = hoveredPlaceId === place.id;

          return (
            <g
              key={place.id}
              onMouseEnter={() => onPlaceHover?.(place.id)}
              onMouseLeave={() => onPlaceHover?.(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Marker Circle */}
              <circle
                cx={x}
                cy={y}
                r={isHovered ? 12 : 8}
                fill={isHovered ? "rgb(239 68 68)" : lineColor}
                stroke="white"
                strokeWidth="2"
              />
              {/* Order Number */}
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize="10"
                fontWeight="bold"
              >
                {i + 1}
              </text>

              {/* Hover label */}
              {isHovered && (
                <text
                  x={x}
                  y={y - 20}
                  textAnchor="middle"
                  fill="hsl(var(--foreground))"
                  fontSize="12"
                  fontWeight="600"
                  className="pointer-events-none"
                >
                  {place.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
