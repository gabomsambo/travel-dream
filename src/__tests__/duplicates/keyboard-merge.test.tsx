import '../helpers/react-optimistic';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicatesPageClient } from '@/components/duplicates/duplicates-page-client';
import type { DuplicateGroupEdge } from '@/lib/duplicate-detection';
import type { Place } from '@/types/database';

function place(id: string, name: string): Place {
  return {
    id,
    userId: 'user_test',
    name,
    kind: 'cafe',
    city: 'Lisbon',
    country: 'Portugal',
    admin: null,
    coords: null,
    address: null,
    googlePlaceId: null,
    altNames: [],
    description: null,
    tags: [],
    vibes: [],
    ratingSelf: 0,
    notes: null,
    status: 'inbox',
    confidence: 0.8,
    price_level: null,
    best_time: null,
    activities: [],
    cuisine: [],
    amenities: [],
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    archivedAt: null,
    website: null,
    phone: null,
    email: null,
    hours: null,
    visitStatus: 'not_visited',
    priority: 0,
    lastVisited: null,
    plannedVisit: null,
    recommendedBy: null,
    companions: null,
    practicalInfo: null,
  };
}

function cluster(id: string, names: [string, string]) {
  return {
    cluster_id: id,
    avgConfidence: 0.9,
    places: [place(`${id}_a`, names[0]), place(`${id}_b`, names[1])],
  };
}

function edge(a: string, b: string, score: number, distanceM: number | null, name: number): DuplicateGroupEdge {
  return {
    a,
    b,
    score,
    included: true,
    distanceM,
    factors: { name, location: distanceM === null ? 0 : 0.9, kind: 1, city: 1, country: 1 },
    for: [],
    against: [],
    flags: [],
  };
}

function certainCluster() {
  const kept = place('arctic_a', 'Arctic Cathedral');
  const other = place('arctic_b', 'Ishavskatedralen');
  kept.coords = { lat: 69.649, lon: 18.986 };
  other.coords = { lat: 69.6493, lon: 18.986 };
  kept.city = 'Tromsø';
  other.city = 'Tromsø';
  kept.country = 'Norway';
  other.country = 'Norway';
  kept.kind = 'attraction';
  other.kind = 'attraction';
  return {
    cluster_id: 'arctic_a+arctic_b',
    avgConfidence: 0.981,
    places: [kept, other],
    edges: [edge(kept.id, other.id, 0.981, 32, 1)],
    leftOut: [],
    mergedOn: null,
  };
}

function maybeCluster() {
  const kept = place('saito', 'Sushi Saito');
  const other = place('sato', 'Sushi Sato');
  kept.city = 'Tokyo';
  other.city = 'Tokyo';
  kept.kind = 'restaurant';
  other.kind = 'restaurant';
  return {
    cluster_id: 'saito+sato',
    avgConfidence: 0.948,
    places: [kept, other],
    edges: [edge(kept.id, other.id, 0.948, null, 0.91)],
    leftOut: [],
    mergedOn: null,
  };
}

const clusters = [
  cluster('c1', ['Cafe A', 'Cafe A copy']),
  cluster('c2', ['Cafe B', 'Cafe B copy']),
];

function mockViewport(desktop: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: desktop && query === '(min-width: 768px)',
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

function sameGooglePossible() {
  const kept = place('chapel_a', 'Twin Chapel');
  const other = place('chapel_b', 'Capela');
  kept.googlePlaceId = 'ChIJ_same_chapel';
  other.googlePlaceId = 'ChIJ_same_chapel';
  kept.kind = 'attraction';
  other.kind = 'attraction';
  kept.city = 'Lisbon';
  other.city = 'Lisbon';
  kept.country = 'Portugal';
  other.country = 'Portugal';
  kept.coords = null;
  other.coords = null;
  return {
    cluster_id: 'chapel_a+chapel_b',
    avgConfidence: 0.66,
    places: [kept, other],
    edges: [edge(kept.id, other.id, 0.66, null, 0.4)],
    leftOut: [],
    mergedOn: null,
  };
}

function postedBody(url: string, method: string): {
  pairs?: Array<{ placeId1: string; placeId2: string }>;
  clusters?: Array<{ targetId: string; sourceIds: string[]; confidence: number }>;
} {
  const call = (global.fetch as jest.Mock).mock.calls.find(
    (entry: [string, { method?: string; body?: string }]) => entry[0] === url && entry[1]?.method === method,
  );
  expect(call).toBeDefined();
  return JSON.parse(call[1].body as string);
}

function sharedGooglePlace(id: string, name: string) {
  const row = place(id, name);
  row.googlePlaceId = 'ChIJ_overlap';
  row.kind = 'attraction';
  row.city = 'Lisbon';
  row.country = 'Portugal';
  return row;
}

function overlappingCertainGroups() {
  const kept = sharedGooglePlace('place_b', 'Chapel copy');
  const noted = sharedGooglePlace('place_c', 'Chapel note');
  kept.description = 'The fuller record';
  noted.notes = 'A note';
  const reviewEdge = edge('place_a', 'place_b', 0.97, 20, 1);
  reviewEdge.flags = ['same Google place'];
  const possibleEdge = edge('place_a', 'place_c', 0.66, null, 0.4);
  possibleEdge.flags = ['same Google place'];
  return {
    review: {
      cluster_id: 'place_a+place_b',
      avgConfidence: 0.97,
      places: [sharedGooglePlace('place_a', 'Chapel'), kept],
      edges: [reviewEdge],
      leftOut: [],
      mergedOn: null,
    },
    possible: {
      cluster_id: 'place_a+place_c',
      avgConfidence: 0.66,
      places: [sharedGooglePlace('place_a', 'Chapel'), noted],
      edges: [possibleEdge],
      leftOut: [],
      mergedOn: null,
    },
  };
}

function possibleDismissGroups() {
  const alpha = place('place_a', 'Alpha');
  const beta = place('place_b', 'Beta');
  const gamma = place('place_c', 'Gamma');
  return {
    review: {
      cluster_id: 'place_a+place_b',
      avgConfidence: 0.85,
      places: [alpha, beta],
      edges: [edge('place_a', 'place_b', 0.85, 40, 0.9)],
      leftOut: [],
      mergedOn: null,
    },
    possible: {
      cluster_id: 'place_a+place_b+place_c',
      avgConfidence: 0.65,
      places: [alpha, beta, gamma],
      edges: [
        edge('place_a', 'place_c', 0.65, null, 0.5),
        edge('place_b', 'place_c', 0.65, null, 0.5),
      ],
      leftOut: [],
      mergedOn: null,
    },
  };
}

describe('duplicates keyboard and bulk confirmation', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    mockViewport(true);
  });

  it('does not merge or dismiss when m or d is pressed with no group open', () => {
    render(
      <DuplicatesPageClient initialData={clusters} fetchedAt={null} fetchError={null} />
    );

    fireEvent.keyDown(document, { key: 'm' });
    fireEvent.keyDown(document, { key: 'd' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Cafe A/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cafe B/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirms only Certain groups, and leaves the rest out of the count', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[certainCluster(), maybeCluster()]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));

    expect(global.fetch).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Merge 1 certain group?');
    expect(dialog).toHaveTextContent('2 places across 1 certain group');
    expect(dialog).not.toHaveTextContent('4 places');
  });

  it('counts a same-Google pair on Possible as certain', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[]}
        possible={[sameGooglePossible()]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Merge 1 certain group?');
    expect(dialog).toHaveTextContent('2 places across 1 certain group');
  });

  it('keeps Dismiss all on a phone and keeps Merge certain groups off it', async () => {
    mockViewport(false);
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[certainCluster(), maybeCluster()]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    fireEvent.keyDown(document, { key: 'm' });
    fireEvent.keyDown(document, { key: 'M' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('menuitem', { name: /Merge certain groups/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss all (2)' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Dismiss 2 groups?');
    expect(dialog).toHaveTextContent('4 places across 2 groups');
  });

  it('asks how many groups and places before Dismiss all runs', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={clusters} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss all (2)' }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Dismiss 2 groups?');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('4 places across 2 groups');
  });

  it('merges overlapping certain groups once and counts each place once', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: 1, failed: 0 }),
    });
    const user = userEvent.setup();
    const groups = overlappingCertainGroups();
    render(
      <DuplicatesPageClient
        initialData={[groups.review]}
        possible={[groups.possible]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Merge 1 certain group?');
    expect(dialog).toHaveTextContent('3 places across 1 certain group');
    expect(dialog).not.toHaveTextContent('4 places');

    await user.click(screen.getByRole('button', { name: 'Merge', exact: true }));

    expect(postedBody('/api/places/bulk-merge', 'POST').clusters).toEqual([{
      targetId: 'place_b',
      sourceIds: ['place_a', 'place_c'],
      confidence: 0.66,
    }]);
  });

  it('dismisses a Possible group without writing its review pair', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const user = userEvent.setup();
    const groups = possibleDismissGroups();
    render(
      <DuplicatesPageClient
        initialData={[groups.review]}
        possible={[groups.possible]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Possible (1)' }));
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss all (1)' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss', exact: true }));

    const keys = (postedBody('/api/places/dismiss-duplicate', 'POST').pairs ?? [])
      .map((pair) => [pair.placeId1, pair.placeId2].sort().join(':'))
      .sort();
    expect(keys).toEqual(['place_a:place_c', 'place_b:place_c']);
  });

  it('names Possible and merged work on an empty To review list', () => {
    render(
      <DuplicatesPageClient
        initialData={[]}
        possible={[cluster('weak', ['Fushimi Inari Taisha', 'Fushimi Inari Shrine'])]}
        merged={[{
          id: 'mrg_igu',
          keptPlaceId: 'plc_igu',
          keptName: 'Iguazu Falls',
          performedAt: '2026-10-11T00:00:00.000Z',
          placeCount: 3,
        }]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    expect(screen.getByRole('heading', { name: "You're up to date." })).toBeInTheDocument();
    expect(screen.getByText('1 weaker match under Possible.')).toBeInTheDocument();
    expect(screen.getByText('Merged Iguazu Falls on 11 Oct.')).toBeInTheDocument();
    expect(screen.queryByText(/clean/i)).not.toBeInTheDocument();
  });
});
