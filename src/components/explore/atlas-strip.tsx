import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { CountryGroup } from '@/lib/explore/types';
import { CountryTile } from './country-tile';

/**
 * The atlas strip on the Explore home: a sideways-scrolling band of country
 * tiles that hands off to the full atlas at `/explore/atlas`.
 */
export function AtlasStrip({ countries, total }: { countries: CountryGroup[]; total: number }) {
  if (countries.length === 0) return null;
  return (
    <section className="space-y-3 border-y bg-secondary/40 py-8 sm:py-10">
      <div className="flex items-end gap-3 px-4 sm:px-8">
        <Link href="/explore/atlas" className="group">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">The atlas</p>
          <h2 className="flex items-center gap-1 font-editorial text-3xl leading-none sm:text-4xl">
            Wander by country
            <ChevronRight className="h-6 w-6 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
          </h2>
        </Link>
        <span className="mb-1 ml-auto text-xs text-muted-foreground">{total} countries</span>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 hide-scrollbar sm:scroll-px-8 sm:gap-4 sm:px-8">
        {countries.map((c) => (
          <CountryTile key={c.slug} country={c} className="aspect-[4/5] w-[62vw] sm:w-[260px]" />
        ))}
      </div>
    </section>
  );
}