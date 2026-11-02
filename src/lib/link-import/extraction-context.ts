import type { CanonicalSocialLink, LinkDetails } from '@/types/link-import';

const MAX_EXTRACTION_CONTEXT = 10_000;

/** Build the exact text fed to the social-link text extractor. */
export function extractionContext(
  link: CanonicalSocialLink,
  caption: string | undefined,
  details: LinkDetails | undefined,
): string {
  const pastedCaption = caption?.trim();
  const postCaption = details?.caption?.trim();
  const lines = [
    `Social link: ${link.canonicalUrl}`,
    `Platform: ${link.platform}; content type: ${link.kind}`,
    link.placeName || details?.placeName ? `Place mentioned in link: ${link.placeName ?? details?.placeName}` : '',
    details?.placeAddress ? `Tagged place address: ${details.placeAddress}` : '',
    details?.placeCategory ? `Tagged place category: ${details.placeCategory}` : '',
    details?.placeCity ? `Tagged place city: ${details.placeCity}` : '',
    details?.placeSourceId ? `Tagged place source id: ${details.placeSourceId}` : '',
    link.handle ? `Creator handle: @${link.handle}` : '',
    details?.authorHandle && details.authorHandle !== link.handle ? `Creator handle: @${details.authorHandle}` : '',
    details?.author && details.author !== `@${link.handle}` ? `Creator: ${details.author}` : '',
    details?.title ? `Post title: ${details.title}` : '',
    details?.hashtags?.length ? `Hashtags: ${details.hashtags.map((tag) => `#${tag}`).join(' ')}` : '',
    postCaption && postCaption !== pastedCaption ? `Post caption:\n${postCaption}` : '',
    pastedCaption ? `Pasted caption:\n${pastedCaption}` : '',
  ].filter(Boolean);
  return lines.join('\n').slice(0, MAX_EXTRACTION_CONTEXT);
}
