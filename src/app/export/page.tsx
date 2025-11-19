import { Suspense } from 'react';
import { ExportClient } from '@/components/export/export-client';
import { getAllCollections, getPlacesByStatus } from '@/lib/db-queries';

function ExportPageSkeleton() {
  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 bg-muted animate-pulse rounded-md w-48" />
        <div className="h-4 bg-muted animate-pulse rounded-md w-96" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
      <div className="h-96 bg-muted animate-pulse rounded-lg" />
    </div>
  );
}

export default async function ExportPage() {
  const [collections, libraryPlaces] = await Promise.all([
    getAllCollections(),
    getPlacesByStatus('library')
  ]);

  const filterOptions = {
    kinds: [...new Set(libraryPlaces.map(p => p.kind))].sort(),
    cities: [...new Set(libraryPlaces.map(p => p.city).filter(Boolean) as string[])].sort(),
    countries: [...new Set(libraryPlaces.map(p => p.country).filter(Boolean) as string[])].sort(),
    tags: [...new Set(libraryPlaces.flatMap(p => p.tags || []))].sort(),
    vibes: [...new Set(libraryPlaces.flatMap(p => p.vibes || []))].sort()
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Export Center</h1>
        <p className="text-muted-foreground mt-1">
          Customize and export your travel data with full control over scope, format, and fields
        </p>
      </div>

      <Suspense fallback={<ExportPageSkeleton />}>
        <ExportClient
          collections={collections}
          filterOptions={filterOptions}
        />
      </Suspense>
    </div>
  );
}
