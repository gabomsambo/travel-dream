import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth-helpers';
import { loadExploreCached } from '@/lib/explore/load';
import { buildAtlas, seasonCurve } from '@/lib/explore/atlas';
import { buildTripNudges } from '@/lib/explore/trip-nudges';
import { captionFor } from '@/lib/explore/rails';
import { SECTIONS, sectionOf } from '@/lib/explore/sections';
import type { RailRef } from '@/lib/explore/types';
import { AtlasHero } from '@/components/explore/atlas-hero';
import { CityTiles } from '@/components/explore/city-tiles';
import { RailRow } from '@/components/explore/rail-row';
import { TripNudgeCard } from '@/components/explore/trip-nudge-card';

/**
 * Country page: full-bleed cover, the city's bento, a trip idea, and one
 * rail per section that has any places here. Shuffle is scoped to this
 * country via ?country=<slug>, the same selector Shuffle reads.
 */
export default async function CountryPage({ params }: { params: Promise<{ country: string }> }) {
  const { country: slug } = await params;
  const user = await requireAuth();
  const { places, collections } = await loadExploreCached(user.id);
  const atlas = buildAtlas(places);
  const country = atlas.find((c) => c.slug === slug);
  if (!country) notFound();

  const now = new Date();
  const nudges = buildTripNudges(country.places, collections);
  const sections: RailRef[] = SECTIONS.map((s) => {
    const list = country.places
      .filter((p) => sectionOf(p.kind).id === s.id)
      .sort((a, b) => b.priority - a.priority);
    const rail = {
      id: `${slug}-${s.id}`,
      title: s.title,
      eyebrow: country.country,
      blurb: '',
      shape: 'poster' as const,
      group: 'moods' as const,
      places: list,
    };
    return {
      ...rail,
      placeIds: list.map((p) => p.id),
      captions: Object.fromEntries(list.map((p) => [p.id, captionFor(rail, p, now)])),
    };
  }).filter((r) => r.placeIds.length > 0);

  return (
    <div className="space-y-12 sm:space-y-16">
      <AtlasHero
        cover={country.cover}
        eyebrow={country.flag}
        title={country.country}
        stats={`${country.places.length} saved places · ${country.cities.length} ${
          country.cities.length === 1 ? 'city' : 'cities'
        } · ${country.places.filter((p) => p.visitStatus === 'visited').length} visited`}
        crumbs={[{ label: 'Atlas', href: '/explore/atlas' }]}
        siblings={atlas.map((c) => ({ label: `${c.flag} ${c.country}`, href: `/explore/atlas/${c.slug}`, count: c.places.length }))}
        curve={seasonCurve(country.places)}
        currentMonth={now.getMonth() + 1}
        shuffleHref={`/explore/shuffle?country=${slug}`}
      />

      {country.cities.length > 1 && <CityTiles country={country} />}

      {nudges[0] && <TripNudgeCard nudge={nudges[0]} dismissible />}

      {sections.map((r) => (
        <RailRow key={r.id} rail={r} seeAllHref={null} />
      ))}
    </div>
  );
}