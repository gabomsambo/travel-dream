import { extractionContext } from '@/lib/link-import/extraction-context';
import { parseSocialLink } from '@/lib/link-import/url';

it('feeds captions and structured TikTok place tags to the existing text extraction', () => {
  const parsed = parseSocialLink('https://www.tiktok.com/@creator/video/7694185850497666335');
  if (!parsed.supported) throw new Error('Invalid fixture link');

  const context = extractionContext(parsed.link, 'Try the custard tarts here #lisbon', {
    authorHandle: 'creator',
    hashtags: ['lisbon'],
    placeName: 'Manteigaria',
    placeAddress: 'Rua do Loreto 2',
    placeCategory: 'Bakery',
    placeCity: 'Lisbon',
    placeSourceId: 'poi-42',
  });
  for (const line of [
    'Place mentioned in link: Manteigaria',
    'Tagged place address: Rua do Loreto 2',
    'Tagged place category: Bakery',
    'Tagged place city: Lisbon',
    'Tagged place source id: poi-42',
    'Hashtags: #lisbon',
    'Pasted caption:\nTry the custard tarts here #lisbon',
  ]) expect(context).toContain(line);
});
