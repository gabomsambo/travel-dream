import { point } from '@turf/helpers';
import distance from '@turf/distance';
import type { Place } from '@/types/database';

export interface RouteOptimizationResult {
  orderedPlaces: Place[];
  totalDistance: number;
  distances: number[];
}

function calculateDistance(a: Place, b: Place): number {
  if (!a.coords || !b.coords) {
    return Infinity;
  }

  const from = point([a.coords.lon, a.coords.lat]);
  const to = point([b.coords.lon, b.coords.lat]);
  return distance(from, to, { units: 'kilometers' });
}

export function nearestNeighborTSP(
  places: Place[],
  startIndex: number = 0,
  returnToStart: boolean = false
): RouteOptimizationResult {
  if (places.length === 0) {
    return { orderedPlaces: [], totalDistance: 0, distances: [] };
  }

  if (places.length === 1) {
    return { orderedPlaces: [...places], totalDistance: 0, distances: [] };
  }

  const placesWithCoords = places.filter((p) => p.coords);

  if (placesWithCoords.length === 0) {
    return { orderedPlaces: places, totalDistance: 0, distances: [] };
  }

  const unvisited = new Set(placesWithCoords.map((_, i) => i));
  const tour: number[] = [startIndex];
  const distances: number[] = [];
  let totalDistance = 0;

  unvisited.delete(startIndex);
  let currentIndex = startIndex;

  while (unvisited.size > 0) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;

    for (const candidateIndex of unvisited) {
      const dist = calculateDistance(
        placesWithCoords[currentIndex],
        placesWithCoords[candidateIndex]
      );
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = candidateIndex;
      }
    }

    if (nearestIndex === -1) break;

    tour.push(nearestIndex);
    distances.push(nearestDistance);
    totalDistance += nearestDistance;
    unvisited.delete(nearestIndex);
    currentIndex = nearestIndex;
  }

  if (returnToStart && placesWithCoords.length > 1) {
    const returnDistance = calculateDistance(
      placesWithCoords[currentIndex],
      placesWithCoords[startIndex]
    );
    distances.push(returnDistance);
    totalDistance += returnDistance;
  }

  const orderedPlaces = tour.map((i) => placesWithCoords[i]);

  return { orderedPlaces, totalDistance, distances };
}

export function twoOptImprovement(places: Place[], initialTour: number[]): number[] {
  if (places.length <= 3) {
    return initialTour;
  }

  const tour = [...initialTour];
  let improved = true;

  while (improved) {
    improved = false;

    for (let i = 1; i < tour.length - 2; i++) {
      for (let j = i + 1; j < tour.length - 1; j++) {
        const currentDist =
          calculateDistance(places[tour[i]], places[tour[i + 1]]) +
          calculateDistance(places[tour[j]], places[tour[j + 1]]);

        const newDist =
          calculateDistance(places[tour[i]], places[tour[j]]) +
          calculateDistance(places[tour[i + 1]], places[tour[j + 1]]);

        if (newDist < currentDist - 0.001) {
          const newTour = [
            ...tour.slice(0, i + 1),
            ...tour.slice(i + 1, j + 1).reverse(),
            ...tour.slice(j + 1),
          ];
          tour.splice(0, tour.length, ...newTour);
          improved = true;
        }
      }
    }
  }

  return tour;
}

export function optimizedNearestNeighbor(
  places: Place[],
  returnToStart: boolean = false
): RouteOptimizationResult {
  const placesWithCoords = places.filter((p) => p.coords);

  if (placesWithCoords.length <= 2) {
    return nearestNeighborTSP(placesWithCoords, 0, returnToStart);
  }

  let bestResult: RouteOptimizationResult | null = null;

  const numStarts = Math.min(placesWithCoords.length, 5);
  for (let i = 0; i < numStarts; i++) {
    const result = nearestNeighborTSP(placesWithCoords, i, returnToStart);
    if (!bestResult || result.totalDistance < bestResult.totalDistance) {
      bestResult = result;
    }
  }

  return bestResult!;
}

export function nearestNeighborWith2Opt(
  places: Place[],
  returnToStart: boolean = false
): RouteOptimizationResult {
  const placesWithCoords = places.filter((p) => p.coords);

  if (placesWithCoords.length === 0) {
    return { orderedPlaces: places, totalDistance: 0, distances: [] };
  }

  if (placesWithCoords.length <= 2) {
    return nearestNeighborTSP(placesWithCoords, 0, returnToStart);
  }

  const initial = optimizedNearestNeighbor(placesWithCoords, returnToStart);

  const placeIndices = initial.orderedPlaces.map((p) =>
    placesWithCoords.findIndex((place) => place.id === p.id)
  );

  const improvedTour = twoOptImprovement(placesWithCoords, placeIndices);

  const orderedPlaces = improvedTour.map((i) => placesWithCoords[i]);
  let totalDistance = 0;
  const distances: number[] = [];

  for (let i = 0; i < orderedPlaces.length - 1; i++) {
    const dist = calculateDistance(orderedPlaces[i], orderedPlaces[i + 1]);
    distances.push(dist);
    totalDistance += dist;
  }

  if (returnToStart && orderedPlaces.length > 1) {
    const returnDist = calculateDistance(
      orderedPlaces[orderedPlaces.length - 1],
      orderedPlaces[0]
    );
    distances.push(returnDist);
    totalDistance += returnDist;
  }

  return { orderedPlaces, totalDistance, distances };
}

export function optimizeCollectionRoute(
  places: Place[],
  options: {
    returnToStart?: boolean;
    maxPlaces?: number;
  } = {}
): RouteOptimizationResult {
  const { returnToStart = false, maxPlaces = 50 } = options;

  const placesToOptimize = places.slice(0, maxPlaces);

  return nearestNeighborWith2Opt(placesToOptimize, returnToStart);
}
