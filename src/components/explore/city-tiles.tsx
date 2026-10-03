import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CountryGroup } from '@/lib/explore/types';
import { FallbackArt } from './fallback-art';

/** The middle step of the drill-down: big city cards, the busiest one widest. */
export function CityTiles({ country }: { country: CountryGroup }) {
  return (
    <section className="space-y-4 px-4 sm:px-8">
      <div className="flex items-baseline gap-3">
        <h2 className="font-editorial text-4xl">Cities</h2>
        <span className="text-xs text-muted-foreground">
          {country.cities.length} in {country.country}
        </span>
      </div>
      <div className="grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[220px] sm:gap-4 lg:grid-cols-4">
        {country.cities.map((c, i) => (
          <Link
            key={c.slug}
            href={`/explore/atlas/${country.slug}/${c.slug}`}
            className={cn(
              'group relative overflow-hidden rounded-3xl bg-muted outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              i === 0 && 'col-span-2 row-span-2',
            )}
          >
            {c.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.cover}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
            ) : (
              <FallbackArt name={c.city} kind="city" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <h3 className={cn('font-editorial leading-none text-white', i === 0 ? 'text-5xl sm:text-6xl' : 'text-3xl')}>{c.city}</h3>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
                {c.places.length} {c.places.length === 1 ? 'place' : 'places'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}