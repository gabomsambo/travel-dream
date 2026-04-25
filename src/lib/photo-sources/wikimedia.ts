import type {
  PhotoSearchInput,
  PhotoSearchItem,
  PhotoSearchResult,
  PhotoSourceAdapter,
} from './types';
import { RateLimitError } from './types';

export const USER_AGENT =
  'TravelDreams/1.0 (https://tabidreams.com; sambogabriel370@gmail.com)';

const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const PAGE_SIZE = 12;
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

type LicenseFamily =
  | 'cc0'
  | 'public-domain'
  | 'cc-by'
  | 'cc-by-sa'
  | 'gfdl'
  | 'unknown';

function classifyLicense(licenseShortName: string): LicenseFamily {
  const s = licenseShortName.trim().toLowerCase();
  if (!s) return 'unknown';
  if (s.startsWith('cc0') || s.includes('public domain') || s.startsWith('pd-')) {
    return s.startsWith('cc0') ? 'cc0' : 'public-domain';
  }
  if (s.startsWith('cc by-sa') || s.startsWith('cc-by-sa')) return 'cc-by-sa';
  if (s.startsWith('cc by') || s.startsWith('cc-by')) return 'cc-by';
  if (s.startsWith('gfdl')) return 'gfdl';
  return 'unknown';
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

interface WikimediaPage {
  pageid: number;
  title: string;
  imagerepository?: string;
  imageinfo?: Array<{
    url: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

interface WikimediaResponse {
  query?: {
    pages?: WikimediaPage[];
  };
}

async function search(input: PhotoSearchInput): Promise<PhotoSearchResult> {
  const page = input.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: input.query,
    gsrnamespace: '6',
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String(offset),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: '300',
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Encoding': 'gzip',
    },
  });

  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After') ?? 5);
    throw new RateLimitError(Number.isFinite(retry) && retry > 0 ? retry : 5);
  }
  if (!res.ok) {
    throw new Error(`Wikimedia request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as WikimediaResponse;
  const pages = data.query?.pages ?? [];

  const items: PhotoSearchItem[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    if (!ii.mime || !ACCEPTED_MIME.has(ii.mime)) continue;

    const md = ii.extmetadata ?? {};
    const licenseShortName = md.LicenseShortName?.value ?? 'Unknown';
    const family = classifyLicense(licenseShortName);
    if (family === 'unknown') continue;

    const authorText = stripHtml(md.Artist?.value ?? '');
    items.push({
      source: 'wikimedia',
      sourceId: String(p.pageid),
      thumbnailUrl: ii.thumburl ?? ii.url,
      fullUrl: ii.url,
      width: ii.width ?? null,
      height: ii.height ?? null,
      attribution: {
        kind: 'wikimedia',
        authorText,
        licenseShortName,
        licenseUrl: md.LicenseUrl?.value ?? '',
        descriptionUrl: ii.descriptionurl ?? '',
      },
      caption: stripHtml(md.ImageDescription?.value ?? '') || undefined,
    });
  }

  return {
    items,
    nextPage: pages.length === PAGE_SIZE ? page + 1 : null,
  };
}

const adapter: PhotoSourceAdapter = {
  source: 'wikimedia',
  search,
};

export default adapter;
