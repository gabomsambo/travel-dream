/** Place-name helpers shared by every Explore surface. */

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
