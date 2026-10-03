import Link from 'next/link';
import { requireAuth } from '@/lib/auth-helpers';
import { loadExploreCached } from '@/lib/explore/load';
import { buildAtlas, REGION_ORDER, regionOf } from '@/lib/explore/atlas';
import { CountryTile } from '@/components/explore/country-tile';
import { cn } from '@/lib/utils';

/**
 * The atlas index: regions -> countries, each region's busiest country
 * wearing a 2x2 bento square. A line for places with no country so the user
 * can find them in the Library.
 */
export default async function AtlasPage() {
  const user = await requireAuth();
  const { places } = await loadExploreCached(user.id);
  const atlas = buildAtlas(places);
  const unplaced = places.filter((p) => !p.country).length;
  const cityCount = atlas.reduce((n, c) => n + c.cities.length, 0);

  const regions = REGION_ORDER.map((region) => ({
    region,
    countries: atlas.filter((c) => regionOf(c.country) === region),
  })).filter((r) => r.countries.length > 0);

  return (
    <div className="space-y-12 px-4 pt-8 sm:space-y-16 sm:px-8 sm:pt-12">
      <header className="max-w-3xl space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">The atlas</p>
        <h1 className="font-editorial text-5xl leading-[0.95] tracking-tight sm:text-7xl">
          {atlas.length} countries, <span className="italic text-muted-foreground">{cityCount} cities,</span> one long wish list.
        </h1>
        <p className="text-sm text-muted-foreground">Pick a country, then a city, then get lost in it.</p>
      </header>

      {regions.map(({ region, countries }) => (
        <section key={region} className="space-y-4">
          <div className="flex items-baseline gap-3 border-b pb-2">
            <h2 className="font-editorial text-3xl">{region}</h2>
            <span className="text-xs text-muted-foreground">
              {countries.reduce((n, c) => n + c.places.length, 0)} places
            </span>
          </div>
          {/* Bento: the most-saved country in each region gets the big square. */}
          <div className="grid auto-rows-[200px] grid-cols-2 gap-3 sm:auto-rows-[220px] sm:gap-4 md:grid-cols-4">
            {countries.map((c, i) => (
              <CountryTile
                key={c.slug}
                country={c}
                size={i === 0 ? 'lg' : 'md'}
                className={cn('h-full', i === 0 && countries.length > 2 && 'col-span-2 row-span-2')}
              />
            ))}
          </div>
        </section>
      ))}

      {unplaced > 0 && (
        <p className="text-sm text-muted-foreground">
          {unplaced} saved {unplaced === 1 ? 'place has' : 'places have'} no country yet —{' '}
          <Link href="/library" className="underline underline-offset-4">
            find them in the Library
          </Link>
          .
        </p>
      )}
    </div>
  );
}