import type { BrowseRail, Rail } from './types';

/**
 * The "Browse all" tiles, with each cover picked here on the server so the
 * client needs none of the rails' places. One cover per tile, never repeated:
 * the same strong photo tops many rails.
 */
export function buildBrowseRails(rails: Rail[]): BrowseRail[] {
  const used = new Set<string>();
  return rails.map((rail) => {
    const withPhoto = rail.places.filter((p) => p.photos.length > 0);
    const pick = withPhoto.find((p) => !used.has(p.photos[0].thumb)) ?? withPhoto[0];
    if (pick) used.add(pick.photos[0].thumb);
    const first = rail.places[0];
    return {
      id: rail.id,
      title: rail.title,
      group: rail.group,
      count: rail.places.length,
      cover: pick ? pick.photos[0].thumb : null,
      fallback: first ? { name: first.name, kind: first.kind } : null,
    };
  });
}
