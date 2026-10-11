import { buildSearchIndex, editDistance, matchesValue, normalize, searchLibrary } from '@/lib/library/search';
import { item } from '../helpers/library-items';

const places = [
  item({ id: 'ichiran', name: 'Ichiran Shibuya', kind: 'restaurant', city: 'Tokyo', country: 'Japan', tags: ['ramen'], notes: 'Order the tonkotsu.' }),
  item({ id: 'fuunji', name: 'Fuunji', kind: 'restaurant', city: 'Tokyo', country: 'Japan', cuisine: ['tsukemen'] }),
  item({ id: 'kinkaku', name: 'Kinkaku-ji', kind: 'landmark', city: 'Kyoto', country: 'Japan' }),
  item({ id: 'mercado', name: 'Mercado Municipal', kind: 'market', city: 'São Paulo', country: 'Brazil' }),
  item({ id: 'kunsthaus', name: 'Kunsthaus', kind: 'museum', city: 'Zürich', country: 'Switzerland', recommendedBy: 'Marta' }),
  item({ id: 'flore', name: 'Café de Flore', kind: 'cafe', city: 'Paris', country: 'France' }),
  item({ id: 'ramen-paris', name: 'Kodawari Ramen', kind: 'restaurant', city: 'Paris', country: 'France' }),
];
const index = buildSearchIndex(places);
const find = (q: string) => searchLibrary(index, q).map((h) => h.id);

describe('Library search', () => {
  it('needs every word to match somewhere, in any order — "ramen tokyo" is the ramen place in Tokyo', () => {
    expect(find('ramen tokyo')).toEqual(['ichiran']);
    expect(find('tokyo ramen')).toEqual(['ichiran']);
    expect(find('ramen')).toEqual(expect.arrayContaining(['ichiran', 'ramen-paris']));
  });

  it('matches as you type: a word prefix finds the place', () => {
    expect(find('ramen tok')).toEqual(['ichiran']);
    expect(find('kinka')).toEqual(['kinkaku']);
  });

  it('forgives a typo — one for a short word, two for a long one', () => {
    expect(find('kyto')).toEqual(['kinkaku']);
    expect(find('tokio')).toEqual(expect.arrayContaining(['ichiran', 'fuunji']));
    expect(find('switzerlnd')).toEqual(['kunsthaus']);
    // Not so forgiving that three-letter words start matching everything.
    expect(find('zzz')).toEqual([]);
  });

  it('ignores accents both ways', () => {
    expect(find('sao paulo')).toEqual(['mercado']);
    expect(find('zurich')).toEqual(['kunsthaus']);
    expect(find('cafe flore')).toEqual(['flore']);
    expect(find('Café')).toEqual(['flore']);
  });

  it('searches notes, cuisine and who recommended it, and says which matched', () => {
    expect(searchLibrary(index, 'tonkotsu')).toEqual([expect.objectContaining({ id: 'ichiran', field: 'notes' })]);
    expect(searchLibrary(index, 'tsukemen')).toEqual([expect.objectContaining({ id: 'fuunji', field: 'cuisine' })]);
    expect(searchLibrary(index, 'marta')).toEqual([expect.objectContaining({ id: 'kunsthaus', field: 'recommendedBy' })]);
    // A tag that explains the hit is preferred over the obvious city match.
    expect(searchLibrary(index, 'ramen tokyo')[0].field).toBe('tags');
  });

  it('ranks a name match above a match in the notes', () => {
    const idx = buildSearchIndex([
      item({ id: 'note', name: 'Somewhere', notes: 'the best gyoza' }),
      item({ id: 'name', name: 'Gyoza Bar' }),
    ]);
    expect(searchLibrary(idx, 'gyoza').map((h) => h.id)).toEqual(['name', 'note']);
  });

  it('answers an empty query with nothing', () => {
    expect(find('   ')).toEqual([]);
  });
});

describe('search helpers', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalize('São Paulo, Brasil!')).toBe('sao paulo brasil');
    expect(normalize('Øresund Kraków')).toBe('oresund krakow');
  });

  it('counts a transposition as one edit and stops early past the budget', () => {
    expect(editDistance('kyto', 'kyot', 1)).toBe(1);
    expect(editDistance('sevile', 'sevill', 1)).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBeGreaterThan(1);
  });

  it('matches a filter suggestion by any of its words', () => {
    expect(matchesValue('mexico', 'Mexico City')).toBe(true);
    expect(matchesValue('mexco cit', 'Mexico City')).toBe(true);
    expect(matchesValue('lisbon', 'Mexico City')).toBe(false);
  });
});

describe('search speed', () => {
  // A coarse guard against an accidental quadratic, not a benchmark: the suite runs in parallel
  // workers, so the bound is loose. Measured live on a 300-place library: see the PR.
  it('searches 1,000 places quickly', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      item({ id: `p${i}`, name: `Place ${i} ${['Ramen', 'Café', 'Museo', 'Parque'][i % 4]}`, city: ['Tokyo', 'Lisbon', 'Kyoto', 'Mexico City'][i % 4], notes: i % 3 ? 'a long note about the view and the food' : null, tags: ['sunset', 'budget'] })
    );
    const idx = buildSearchIndex(many);
    const start = performance.now();
    for (const q of ['ramen tok', 'lisbn', 'mexico', 'view food', 'parqe']) searchLibrary(idx, q);
    const perQuery = (performance.now() - start) / 5;
    expect(perQuery).toBeLessThan(150);
  });
});
