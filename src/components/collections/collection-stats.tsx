'use client';

import { MapPin, Navigation, DollarSign, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Place } from '@/types/database';
import distance from '@turf/distance';
import { point } from '@turf/helpers';

interface CollectionStatsProps {
  places: Place[];
}

export function CollectionStats({ places }: CollectionStatsProps) {
  const stats = calculateStats(places);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={<MapPin className="h-4 w-4" />}
        label="Places"
        value={stats.totalPlaces.toString()}
      />

      {stats.totalDistance > 0 && (
        <StatCard
          icon={<Navigation className="h-4 w-4" />}
          label="Total Distance"
          value={`${stats.totalDistance.toFixed(1)} km`}
        />
      )}

      {stats.avgRating > 0 && (
        <StatCard
          icon={<Star className="h-4 w-4" />}
          label="Avg Rating"
          value={stats.avgRating.toFixed(1)}
        />
      )}

      {stats.priceRange && (
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Price Range"
          value={stats.priceRange}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-semibold truncate">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function calculateStats(places: Place[]) {
  const totalPlaces = places.length;

  // Calculate total distance between consecutive places with coordinates
  let totalDistance = 0;
  const placesWithCoords = places.filter(
    (p) => p.coords && p.coords.lat && p.coords.lon
  );

  if (placesWithCoords.length >= 2) {
    for (let i = 0; i < placesWithCoords.length - 1; i++) {
      const from = placesWithCoords[i].coords!;
      const to = placesWithCoords[i + 1].coords!;

      try {
        const fromPoint = point([from.lon, from.lat]);
        const toPoint = point([to.lon, to.lat]);
        totalDistance += distance(fromPoint, toPoint, { units: 'kilometers' });
      } catch (error) {
        console.error('Error calculating distance:', error);
      }
    }
  }

  // Calculate average rating
  const placesWithRatings = places.filter(
    (p) => p.ratingSelf !== null && p.ratingSelf !== undefined
  );
  const avgRating =
    placesWithRatings.length > 0
      ? placesWithRatings.reduce((sum, p) => sum + (p.ratingSelf || 0), 0) /
        placesWithRatings.length
      : 0;

  // Determine price range
  const priceLevels = places
    .map((p) => p.price_level)
    .filter((p): p is string => !!p);

  const priceRange = priceLevels.length > 0
    ? `${getPriceSymbol(Math.min(...priceLevels.map(priceToNumber)))} - ${getPriceSymbol(Math.max(...priceLevels.map(priceToNumber)))}`
    : null;

  return {
    totalPlaces,
    totalDistance,
    avgRating,
    priceRange,
  };
}

function priceToNumber(priceLevel: string): number {
  const match = priceLevel.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function getPriceSymbol(level: number): string {
  return '$'.repeat(Math.max(1, Math.min(level, 4)));
}
