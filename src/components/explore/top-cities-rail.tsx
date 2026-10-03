import Link from 'next/link';
import type { CityGroup } from '@/lib/explore/types';
import { flagFor, slugify } from '@/lib/explore/geo';
import { FallbackArt } from './fallback-art';

/**
 * Netflix "Top 10" treatment for the user's most-saved cities — giant
 * outlined numerals, straight into the atlas.
 */
export function TopCitiesRail({ cities }: { cities: CityGroup[] }) {
  if (cities.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="px-4 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Your top {cities.length}</p>
        <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">Cities you can&apos;t stop saving</h2>
      </div>
      <ol className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-4 px-4 pb-2 hide-scrollbar sm:scroll-px-8 sm:px-8">
        {cities.map((c, i) => (
          <li key={`${c.country}/${c.slug}`} className="shrink-0 snap-start">
            <Link href={`/explore/atlas/${slugify(c.country)}/${c.slug}`} className="group flex items-end">
              <span
                aria-hidden
                className="-mr-5 select-none font-editorial text-[150px] leading-[0.75] text-transparent [-webkit-text-stroke:2px_hsl(var(--muted-foreground))] sm:text-[190px]"
              >
                {i + 1}
              </span>
              <span className="relative block aspect-[3/4] w-[34vw] overflow-hidden rounded-2xl bg-muted shadow-lg sm:w-[150px]">
                {c.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.cover}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                ) : (
                  <FallbackArt name={c.city} kind="city" />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <span className="block font-editorial text-2xl leading-none">{c.city}</span>
                  <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">
                    {flagFor(c.country)} {c.places.length} places
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}