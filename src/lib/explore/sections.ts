/** Broad sections a place kind falls under. Order is the order they read in. */
export const SECTIONS: Array<{ id: string; title: string; kinds: string[] }> = [
  { id: 'see', title: 'See', kinds: ['landmark', 'museum', 'gallery', 'viewpoint', 'neighborhood', 'city'] },
  { id: 'eat', title: 'Eat & drink', kinds: ['restaurant', 'cafe', 'bar', 'club', 'market'] },
  { id: 'outdoors', title: 'Outdoors', kinds: ['natural', 'park', 'beach'] },
  { id: 'do', title: 'Do', kinds: ['experience', 'tour', 'shop', 'thermal', 'festival'] },
  { id: 'stay', title: 'Stay', kinds: ['stay', 'hotel', 'hostel'] },
];

export function sectionOf(kind: string): (typeof SECTIONS)[number] {
  return SECTIONS.find((s) => s.kinds.includes(kind)) ?? SECTIONS[3];
}
