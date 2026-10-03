import { parseBestTime, monthSpan } from '@/lib/explore/best-time';

describe('parseBestTime', () => {
  it('reads wrapping month ranges', () => {
    expect(parseBestTime('November to March').months).toEqual([1, 2, 3, 11, 12]);
    expect(parseBestTime('Dry season (November–April)').months).toEqual([1, 2, 3, 4, 11, 12]);
  });

  it('reads several ranges and lone months', () => {
    expect(parseBestTime('February–March for northern lights, June–July for midnight sun').months).toEqual([2, 3, 6, 7]);
    expect(parseBestTime('May, June or September').months).toEqual([5, 6, 9]);
    expect(parseBestTime('Late June to mid-July for lavender').months).toEqual([6, 7]);
  });

  it('prefers explicit months over season words', () => {
    expect(parseBestTime('Clear winter days (December–February)').months).toEqual([1, 2, 12]);
    expect(parseBestTime('Autumn (October–November)').months).toEqual([10, 11]);
  });

  it('maps seasons, flipping them in the southern hemisphere', () => {
    expect(parseBestTime('summer').months).toEqual([6, 7, 8]);
    expect(parseBestTime('summer', -33.9).months).toEqual([1, 2, 12]);
    expect(parseBestTime('Spring or autumn').months).toEqual([3, 4, 5, 9, 10, 11]);
  });

  it('does not flip events that are fixed in the calendar', () => {
    expect(parseBestTime('Early April for cherry blossoms', -10.5).months).toEqual([4]);
  });

  it('detects time of day', () => {
    expect(parseBestTime('Sunset, May to October').times).toEqual(['sunset']);
    expect(parseBestTime('Dawn, November').times).toEqual(['sunrise']);
    expect(parseBestTime('Late night, year-round')).toMatchObject({ times: ['night'], yearRound: true, months: [] });
  });

  it('is empty for nothing', () => {
    expect(parseBestTime(null)).toEqual({ months: [], yearRound: false, times: [] });
    expect(parseBestTime('Rainy day (to watch rain fall through the oculus)').months).toEqual([]);
  });

  it('spans months inclusively', () => {
    expect(monthSpan(11, 2)).toEqual([11, 12, 1, 2]);
    expect(monthSpan(4, 4)).toEqual([4]);
  });
});
