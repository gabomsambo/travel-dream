import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth-helpers';
import { loadExploreCached } from '@/lib/explore/load';
import { buildAtlas, seasonCurve } from '@/lib/explore/atlas';
import { buildTripNudges } from '@/lib/explore/trip-nudges';
import { SECTIONS, sectionOf } from '@/lib/explore/sections';
import { AtlasHero } from '@/components/explore/atlas-hero';
import { PlaceGrid } from '@/components/explore/place-grid';
import { TripNudgeCard } from '@/components/explore/trip-nudge-card';

/**
 * City page: full-bleed cover, the trip bridge right under it (shown from
 * two unvisited saves), category sections (See / Eat & drink / Outdoors /
 * Do / Stay), and an "Elsewhere in <country>" chip rail.
 */
export default async function CityPage({ params }: { params: Promise<{ country: string; city: string }> }) {
  const { country: countrySlug, city: citySlug } = await params;
  const user = await requireAuth();
  const { places, collections } = await loadExploreCached(user.id);
  const atlas = buildAtlas(places);
  const country = atlas.find((c) => c.slug === countrySlug);
  const city = country?.cities.find((c) => c.slug === citySlug);
  if (!country || !city) notFound();

  const now = new Date();
  // On the city page the bridge to planning is always offered once there are two places to plan.
  const nudge = buildTripNudges(city.places, collections, 2)[0];
  const caption = (p: (typeof city.places)[number]) => p.bestTimeText ?? p.recommendedBy ?? '';
  const others = country.cities.filter((c) => c.slug !== city.slug);

  return (
    <div className="space-y-12 sm:space-y-16">
      <AtlasHero
        cover={city.cover}
        eyebrow={`${country.flag}  ${country.country}`}
        title={city.city}
        stats={`${city.places.length} saved ${city.places.length === 1 ? 'place' : 'places'}${
          city.places.some((p) => p.recommendedBy)
            ? ` · tips from ${[...new Set(city.places.map((p) => p.recommendedBy).filter(Boolean))]
                .slice(0, 3)
                .join(', ')}`
            : ''
        }`}
        crumbs={[
          { label: 'Atlas', href: '/explore/atlas' },
          { label: country.country, href: `/explore/atlas/${country.slug}` },
        ]}
        siblings={country.cities.map((c) => ({
          label: c.city,
          href: `/explore/atlas/${country.slug}/${c.slug}`,
          count: c.places.length,
        }))}
        curve={seasonCurve(city.places)}
        currentMonth={now.getMonth() + 1}
        shuffleHref={`/explore/shuffle?country=${encodeURIComponent(countrySlug)}&city=${encodeURIComponent(citySlug)}`}
      />

      {nudge && <TripNudgeCard nudge={nudge} dismissible={false} />}

      {SECTIONS.map((s) => {
        const list = city.places
          .filter((p) => sectionOf(p.kind).id === s.id)
          .sort((a, b) => b.priority - a.priority);
        if (!list.length) return null;
        return (
          <PlaceGrid
            key={s.id}
            title={s.title}
            placeIds={list.map((p) => p.id)}
            captions={Object.fromEntries(list.map((p) => [p.id, caption(p)]))}
          />
        );
      })}

      {others.length > 0 && (
        <section className="space-y-3 px-4 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Elsewhere in {country.country}</p>
          <div className="flex flex-wrap gap-2">
            {others.map((c) => (
              <Link
                key={c.slug}
                href={`/explore/atlas/${country.slug}/${c.slug}`}
                className="group flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-4 text-sm transition hover:bg-secondary"
              >
                {c.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cover} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-muted" />
                )}
                {c.city} <span className="text-xs text-muted-foreground">{c.places.length}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}