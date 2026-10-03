/** Place-name helpers shared by every Explore surface. */

/**
 * URL-safe slug. A name with no Latin letters or digits ("東京") still gets a
 * stable, non-empty slug from a hash of the name, so it keeps its own URL.
 */
export function slugify(s: string): string {
  const slug = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const name = s.normalize('NFC').trim().toLowerCase();
  if (slug || !name) return slug;
  let h = 0x811c9dc5;
  for (const ch of name) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `x${h.toString(36)}`;
}

// Country *names* are what the extraction pipeline stores. ISO codes only feed
// the flag; an unknown country simply gets no flag.
const ISO: Record<string, string> = {
  argentina: 'AR', australia: 'AU', austria: 'AT', belgium: 'BE', brazil: 'BR', cambodia: 'KH',
  canada: 'CA', chile: 'CL', china: 'CN', colombia: 'CO', 'costa rica': 'CR', croatia: 'HR',
  cuba: 'CU', 'czech republic': 'CZ', czechia: 'CZ', denmark: 'DK', ecuador: 'EC', egypt: 'EG',
  france: 'FR', germany: 'DE', greece: 'GR', hungary: 'HU', iceland: 'IS', india: 'IN',
  indonesia: 'ID', ireland: 'IE', israel: 'IL', italy: 'IT', japan: 'JP', jordan: 'JO',
  kenya: 'KE', laos: 'LA', malaysia: 'MY', maldives: 'MV', malta: 'MT', mexico: 'MX',
  morocco: 'MA', nepal: 'NP', netherlands: 'NL', 'new zealand': 'NZ', norway: 'NO', peru: 'PE',
  philippines: 'PH', poland: 'PL', portugal: 'PT', singapore: 'SG', slovenia: 'SI',
  'south africa': 'ZA', 'south korea': 'KR', korea: 'KR', spain: 'ES', 'sri lanka': 'LK',
  sweden: 'SE', switzerland: 'CH', taiwan: 'TW', tanzania: 'TZ', thailand: 'TH', turkey: 'TR',
  türkiye: 'TR', 'united arab emirates': 'AE', uae: 'AE', 'united kingdom': 'GB', uk: 'GB',
  scotland: 'GB', england: 'GB', 'united states': 'US', usa: 'US', 'united states of america': 'US',
  uruguay: 'UY', vietnam: 'VN', 'viet nam': 'VN',
};

export function flagFor(country: string | null | undefined): string {
  const code = country ? ISO[country.trim().toLowerCase()] : undefined;
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
