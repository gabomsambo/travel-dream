/**
 * @jest-environment node
 */
process.env.BETA_TESTER_IDS = 'usr_beta';

import { getRouteTier } from '@/lib/rate-limit';

describe('getRouteTier', () => {
  it('gives photo resolves their own tier, for beta testers too', () => {
    expect(getRouteTier('/api/photos/resolve/att_1', 'usr_regular')).toBe('photo-resolve');
    expect(getRouteTier('/api/photos/resolve/att_1', 'usr_beta')).toBe('photo-resolve');
  });

  it('leaves every other route as it was', () => {
    expect(getRouteTier('/api/llm-process', 'usr_regular')).toBe('strict');
    expect(getRouteTier('/api/llm-process', 'usr_beta')).toBe('relaxed');
    expect(getRouteTier('/api/photos/search', 'usr_regular')).toBe('photo-search');
    expect(getRouteTier('/api/places', 'usr_regular')).toBe('relaxed');
    expect(getRouteTier('/api/auth/register')).toBe('auth');
  });
});
