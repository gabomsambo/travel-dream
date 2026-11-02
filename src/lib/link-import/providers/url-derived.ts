import type { CanonicalSocialLink, LinkDetails } from '@/types/link-import';
import type { LinkDetailsProvider } from '../details';

export const urlDerivedDetailsProvider: LinkDetailsProvider = {
  name: 'url-derived',
  supports: () => true,
  async getDetails(link: CanonicalSocialLink): Promise<LinkDetails> {
    return {
      ...(link.handle ? { author: `@${link.handle}` } : {}),
      ...(link.placeName ? { placeName: link.placeName } : {}),
    };
  },
};
