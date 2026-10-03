import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CountryGroup } from '@/lib/explore/types';

/** One country tile: cover photo (or fallback), flag top-left, name and counts. */
export function CountryTile({
  country,
  className,
  size = 'md',
}: {
  country: CountryGroup;
  className?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <Link
      href={`/explore/atlas/${country.slug}`}
      className={cn(
        'group relative block shrink-0 snap-start overflow-hidden rounded-3xl bg-muted outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {country.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={country.cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-primary" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/10" />
      <span className="absolute left-4 top-4 text-3xl drop-shadow">{country.flag}</span>
      <div className="absolute inset-x-0 bottom-0 p-5">
        <h3 className={cn('font-editorial leading-none text-white', size === 'lg' ? 'text-5xl' : 'text-4xl')}>{country.country}</h3>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
          {country.places.length} places · {country.cities.length} {country.cities.length === 1 ? 'city' : 'cities'}
        </p>
      </div>
    </Link>
  );
}