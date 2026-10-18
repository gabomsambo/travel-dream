import '../helpers/react-optimistic';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicatesPageClient } from '@/components/duplicates/duplicates-page-client';
import type { DuplicateGroupEdge } from '@/lib/duplicate-detection';
import { notify } from '@/lib/notify';
import type { Place } from '@/types/database';

function accessibleName(expected: string) {
  return (name: string) => name === expected;
}

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

function partButton(name: string, which: 'In' | 'Not this one') {
  const group = screen.getByRole('group', { name: `Is ${name} part of this place?` });
  return within(group).getByRole('button', { name: which === 'In' ? /^In/ : 'Not this one' });
}

function farPair() {
  const kept = place('far_k', 'Harbor Cafe');
  const other = place('far_o', 'Harbor Other');
  kept.status = 'library';
  const pair = edge(kept.id, other.id, 0.4, 6600, 0.9);
  pair.against = ['6.6 km apart'];
  return {
    cluster_id: 'far_k+far_o',
    avgConfidence: 0.4,
    places: [kept, other],
    edges: [pair],
    leftOut: [],
    mergedOn: null,
  };
}

function symmetricHardAgainstGroup() {
  const kept = place('g4_k', 'Kept Cafe');
  const cafeA = place('g4_a', 'Cafe A');
  const cafeB = place('g4_b', 'Cafe B');
  const cafeC = place('g4_c', 'Cafe C');
  kept.status = 'library';
  kept.confidence = 0.95;
  kept.description = 'The complete record';
  const near = (left: string, right: string, score: number, distanceM: number) => edge(left, right, score, distanceM, 0.95);
  const clash = edge('g4_a', 'g4_b', 0.4, 5000, 0.9);
  clash.included = false;
  clash.against = ['5 km apart'];
  return {
    cluster_id: 'g4_a+g4_b+g4_c+g4_k',
    avgConfidence: 0.9,
    places: [kept, cafeA, cafeB, cafeC],
    edges: [
      near('g4_k', 'g4_a', 0.92, 40),
      near('g4_k', 'g4_b', 0.9, 50),
      near('g4_k', 'g4_c', 0.88, 30),
      near('g4_a', 'g4_c', 0.86, 45),
      near('g4_b', 'g4_c', 0.84, 55),
      clash,
    ],
    leftOut: [],
    mergedOn: null,
  };
}

function keptChangeGroup() {
  const kept = place('mix_k', 'Harbor Cafe');
  const kiosk = place('mix_n', 'Harbor Kiosk');
  const chapel = place('mix_c', 'Harbor Chapel');
  const other = place('mix_f', 'Harbor Other');
  kept.status = 'library';
  other.city = 'Porto';
  const near = (id: string, distanceM: number) => edge('mix_k', id, 0.9, distanceM, 0.95);
  const clash = (id: string, distanceM: number) => {
    const pair = edge(id, 'mix_f', 0.5, distanceM, 0.9);
    pair.against = ['Lisbon vs Porto'];
    return pair;
  };
  const far = edge('mix_k', 'mix_f', 0.5, 9500, 0.9);
  far.against = ['9.5 km apart'];
  return {
    cluster_id: 'mix_c+mix_f+mix_k+mix_n',
    avgConfidence: 0.8,
    places: [kept, kiosk, chapel, other],
    edges: [
      near('mix_n', 40),
      near('mix_c', 50),
      edge('mix_n', 'mix_c', 0.9, 30, 0.95),
      far,
      clash('mix_n', 50),
      clash('mix_c', 60),
    ],
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

function postedBodies(url: string, method: string): Array<{
  pairs?: Array<{ placeId1: string; placeId2: string }>;
  clusters?: Array<{ targetId: string; sourceIds: string[]; confidence: number }>;
}> {
  return (global.fetch as jest.Mock).mock.calls
    .filter((entry: [string, { method?: string; body?: string }]) => entry[0] === url && entry[1]?.method === method)
    .map((entry: [string, { body?: string }]) => JSON.parse(entry[1].body as string));
}

function certainPair(index: number) {
  const kept = place(`a${index}`, `Place ${index}`);
  const other = place(`b${index}`, `Copy ${index}`);
  kept.googlePlaceId = `g${index}`;
  other.googlePlaceId = `g${index}`;
  kept.kind = 'attraction';
  other.kind = 'attraction';
  const pair = edge(kept.id, other.id, 0.99, 20, 1);
  pair.flags = ['same Google place'];
  return {
    cluster_id: `${kept.id}+${other.id}`,
    avgConfidence: 0.99,
    places: [kept, other],
    edges: [pair],
    leftOut: [],
    mergedOn: null,
  };
}

function clusterPlaceIds(body: {
  clusters?: Array<{ targetId: string; sourceIds: string[] }>;
}): string[] {
  return (body.clusters ?? []).flatMap((cluster) => [cluster.targetId, ...cluster.sourceIds]);
}

function bulkMergeOk(bodyText: string | undefined, failedIndexes: number[] = []) {
  const posted = JSON.parse(bodyText ?? '{}') as { clusters?: Array<{ targetId: string }> };
  const clusters = posted.clusters ?? [];
  const failed = new Set(failedIndexes);
  const results = clusters.map((cluster, index) => (
    failed.has(index)
      ? { clusterId: cluster.targetId, status: 'error', error: 'transaction failed' }
      : { clusterId: cluster.targetId, status: 'success' }
  ));
  return {
    ok: true,
    json: async () => ({
      success: results.filter((entry) => entry.status === 'success').length,
      failed: failed.size,
      results,
    }),
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

function reviewWithPossibleChord() {
  const alpha = place('place_a', 'Alpha');
  const beta = place('place_b', 'Beta');
  const gamma = place('place_c', 'Gamma');
  const chord = edge('place_a', 'place_c', 0.65, null, 0.5);
  chord.included = false;
  return {
    cluster_id: 'place_a+place_b+place_c',
    avgConfidence: 0.8,
    places: [alpha, beta, gamma],
    edges: [
      edge('place_a', 'place_b', 0.85, 40, 0.9),
      edge('place_b', 'place_c', 0.75, 80, 0.8),
      chord,
    ],
    leftOut: [],
    mergedOn: null,
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

function spyRefresh() {
  const refresh = jest.fn();
  const navigation = require('next/navigation') as {
    useRouter: () => { refresh: jest.Mock };
  };
  const routerSpy = jest.spyOn(navigation, 'useRouter').mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh,
  } as ReturnType<typeof navigation.useRouter>);
  return { refresh, routerSpy };
}

function deleteCalls(): unknown[] {
  return (global.fetch as jest.Mock).mock.calls.filter(
    (entry: [string, { method?: string }]) => entry[0] === '/api/places/duplicates' && entry[1]?.method === 'DELETE',
  );
}

describe('duplicates keyboard and bulk confirmation', () => {
  let routerSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    (notify.success as jest.Mock).mockClear();
    (notify.error as jest.Mock).mockClear();
    mockViewport(true);
  });

  afterEach(() => {
    routerSpy?.mockRestore();
    routerSpy = undefined;
  });

  it('does not merge or dismiss when m or d is pressed with a modifier', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: 1, failed: 0 }),
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[certainCluster()]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    fireEvent.keyDown(document, { key: 'm', metaKey: true });
    fireEvent.keyDown(document, { key: 'd', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'd', altKey: true });
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'm' });
    expect(postedBody('/api/places/bulk-merge', 'POST').clusters).toHaveLength(1);
  });

  it('does not move or open a group when j or k is pressed with a modifier', () => {
    render(
      <DuplicatesPageClient
        initialData={[certainCluster(), maybeCluster()]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    expect(fireEvent.keyDown(document, { key: 'k', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(document, { key: 'j', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(document, { key: 'k', altKey: true })).toBe(true);
    expect(screen.queryByText('Is this one place?')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-current="true"]')).toBeNull();

    expect(fireEvent.keyDown(document, { key: 'j' })).toBe(false);
    expect(document.querySelector('[data-cluster-index="0"]')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Is this one place?')).toBeInTheDocument();

    expect(fireEvent.keyDown(document, { key: 'j', metaKey: true })).toBe(true);
    expect(document.querySelector('[data-cluster-index="0"]')).toHaveAttribute('aria-current', 'true');
    expect(document.querySelector('[data-cluster-index="1"]')).not.toHaveAttribute('aria-current');
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

  it('shows an earlier merge under the queue row that it belongs to', () => {
    mockViewport(false);
    render(
      <DuplicatesPageClient
        initialData={[{ ...certainCluster(), mergedOn: '2026-09-14T12:00:00.000Z' }]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    const row = screen.getByRole('button', { name: /Arctic Cathedral/ });
    expect(row).toHaveTextContent('Matches a place you merged on 14 Sept.');
  });

  it('shows the stored UTC day when the merge time is a SQLite timestamp', () => {
    mockViewport(false);
    render(
      <DuplicatesPageClient
        initialData={[{ ...certainCluster(), mergedOn: '2026-09-14 00:30:00' }]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    const row = screen.getByRole('button', { name: /Arctic Cathedral/ });
    expect(row).toHaveTextContent('Matches a place you merged on 14 Sept.');
    expect(row).not.toHaveTextContent('13 Sept');
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

    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

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
    await user.click(screen.getByRole('button', { name: accessibleName('Dismiss') }));

    const keys = (postedBody('/api/places/dismiss-duplicate', 'POST').pairs ?? [])
      .map((pair) => [pair.placeId1, pair.placeId2].sort().join(':'))
      .sort();
    expect(keys).toEqual(['place_a:place_c', 'place_b:place_c']);
  });

  it('dismisses a To-review group without writing its Possible chord', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[reviewWithPossibleChord()]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss all (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Dismiss') }));

    const keys = (postedBody('/api/places/dismiss-duplicate', 'POST').pairs ?? [])
      .map((pair) => [pair.placeId1, pair.placeId2].sort().join(':'))
      .sort();
    expect(keys).toEqual(['place_a:place_b', 'place_b:place_c']);
  });

  it('chunks certain merges under the 50-cluster cap', async () => {
    const user = userEvent.setup();
    const groups = Array.from({ length: 51 }, (_, index) => certainPair(index));
    (global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'DELETE') return { ok: true, json: async () => ({}) };
      const body = JSON.parse(init?.body ?? '{}') as { clusters?: unknown[] };
      return { ok: true, json: async () => ({ success: body.clusters?.length ?? 0, failed: 0 }) };
    });
    render(
      <DuplicatesPageClient initialData={groups} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (51)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    const bodies = postedBodies('/api/places/bulk-merge', 'POST');
    expect(bodies.map((body) => body.clusters?.length)).toEqual([50, 1]);
    expect(notify.success).toHaveBeenCalledWith('Merged 51 certain groups');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('refreshes after a later certain-merge chunk throws', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    let posts = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      posts += 1;
      if (posts === 1) {
        const body = JSON.parse(init?.body ?? '{}') as { clusters?: unknown[] };
        return { ok: true, json: async () => ({ success: body.clusters?.length ?? 0, failed: 0 }) };
      }
      throw new Error('network down');
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={Array.from({ length: 51 }, (_, index) => certainPair(index))}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (51)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merged 50 certain groups'));
    expect(notify.error).toHaveBeenCalledWith('Failed to merge duplicates');
    expect(deleteCalls()).toHaveLength(1);
    expect(refresh).toHaveBeenCalled();
  });

  it('does not merge a certain batch again while the payload still lists it', async () => {
    const groups = Array.from({ length: 51 }, (_, index) => certainPair(index));
    let posts = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      posts += 1;
      if (posts === 1) return bulkMergeOk(init?.body);
      if (posts === 2) return { ok: false, json: async () => ({ status: 'error', message: 'Invalid request data' }) };
      const body = JSON.parse(init?.body ?? '{}') as { clusters?: unknown[] };
      return { ok: true, json: async () => ({ success: body.clusters?.length ?? 0, failed: 0 }) };
    });
    const user = userEvent.setup();
    const view = render(
      <DuplicatesPageClient initialData={groups} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (51)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merged 50 certain groups'));
    expect(notify.error).toHaveBeenCalledWith('Failed to merge duplicates');

    view.rerender(
      <DuplicatesPageClient initialData={[...groups]} fetchedAt={null} fetchError={null} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    const bodies = postedBodies('/api/places/bulk-merge', 'POST');
    const saved = new Set(clusterPlaceIds(bodies[0]));
    const retried = clusterPlaceIds(bodies[2]);
    expect(bodies.map((body) => body.clusters?.length)).toEqual([50, 1, 1]);
    expect(retried).toEqual(clusterPlaceIds(bodies[1]));
    expect(retried.every((id) => !saved.has(id))).toBe(true);
  });

  it('offers a saved certain group again once a later payload drops it', async () => {
    const groups = Array.from({ length: 51 }, (_, index) => certainPair(index));
    let posts = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      posts += 1;
      if (posts === 1) return bulkMergeOk(init?.body);
      throw new Error('network down');
    });
    const user = userEvent.setup();
    const view = render(
      <DuplicatesPageClient initialData={groups} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (51)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merged 50 certain groups'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    const saved = new Set(clusterPlaceIds(postedBodies('/api/places/bulk-merge', 'POST')[0]));
    const stillListed = groups.filter((group) => group.places.some((place) => !saved.has(place.id)));
    view.rerender(
      <DuplicatesPageClient initialData={stillListed} fetchedAt={null} fetchError={null} />
    );
    view.rerender(
      <DuplicatesPageClient initialData={groups} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('menuitem', { name: 'Merge certain groups (51)' })).toBeInTheDocument();
  });

  it('offers only the certain group whose cluster failed inside an ok bulk response', async () => {
    const groups = [certainPair(0), certainPair(1)];
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      return bulkMergeOk(init?.body, [1]);
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={groups} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (2)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merged 1 certain group'));
    expect(notify.error).toHaveBeenCalledWith('Failed to merge 1 groups');
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    const bodies = postedBodies('/api/places/bulk-merge', 'POST');
    expect(bodies.map((body) => body.clusters?.length)).toEqual([2, 1]);
    const failedCluster = bodies[0].clusters?.[1];
    expect(bodies[1].clusters).toEqual([failedCluster]);
  });

  it('does not merge a saved certain group again from the open group', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      return bulkMergeOk(init?.body);
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainCluster()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merged 1 certain group'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toBeEnabled());

    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Merge 2 into one place/ }));
    fireEvent.keyDown(document, { key: 'm' });

    expect(postedBodies('/api/places/bulk-merge', 'POST')).toHaveLength(1);
  });

  it('merges a saved keeper into a later richer duplicate', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      return bulkMergeOk(init?.body);
    });
    const user = userEvent.setup();
    const saved = certainCluster();
    const survivor = saved.places[0];
    const richer = place('arctic_c', 'Tromsø Cathedral');
    richer.description = 'The fuller record';
    richer.coords = { lat: 69.649, lon: 18.986 };
    richer.city = 'Tromsø';
    richer.country = 'Norway';
    richer.kind = 'attraction';
    const later = {
      cluster_id: 'arctic_a+arctic_c',
      avgConfidence: 0.98,
      places: [survivor, richer],
      edges: [edge(survivor.id, richer.id, 0.98, 10, 1)],
      leftOut: [],
      mergedOn: null,
    };
    const view = render(
      <DuplicatesPageClient initialData={[saved]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merged 1 certain group'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toBeEnabled());

    view.rerender(
      <DuplicatesPageClient initialData={[later]} fetchedAt={null} fetchError={null} />
    );
    await screen.findByText('Tromsø Cathedral');

    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Merge 2 into one place/ }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(
      'Merged 2 places into Tromsø Cathedral',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    ));

    const bodies = postedBodies('/api/places/bulk-merge', 'POST');
    expect(bodies).toHaveLength(2);
    expect(bodies[1].clusters).toEqual([{
      targetId: 'arctic_c',
      sourceIds: ['arctic_a'],
      confidence: 0.98,
    }]);
  });

  it('refreshes a skipped merge from the button without a failure toast', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          success: 0,
          failed: 0,
          results: [{ clusterId: 'arctic_b', status: 'skipped' }],
        }),
      };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainCluster()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();

    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Merge 2 into one place/ }));

    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(refresh).toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('refreshes a skipped open-group merge without a failure toast', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          success: 0,
          failed: 0,
          results: [{ clusterId: 'arctic_b', status: 'skipped' }],
        }),
      };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainCluster()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();

    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    fireEvent.keyDown(document, { key: 'm' });

    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(refresh).toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('still reports a merge that failed', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: 0,
        failed: 1,
        results: [{ clusterId: 'arctic_b', status: 'error', error: 'transaction failed' }],
      }),
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainCluster()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();

    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Merge 2 into one place/ }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('transaction failed'));
    expect(deleteCalls()).toHaveLength(0);
    // The group was taken off the queue while the merge ran; the refresh brings it back.
    expect(refresh).toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('refreshes when every certain-group merge is already skipped', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      const posted = JSON.parse(init?.body ?? '{}') as { clusters?: Array<{ targetId: string }> };
      return {
        ok: true,
        json: async () => ({
          success: 0,
          failed: 0,
          results: (posted.clusters ?? []).map((cluster) => ({ clusterId: cluster.targetId, status: 'skipped' })),
        }),
      };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainPair(0)]} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(refresh).toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('still reports a certain merge when a cluster fails beside a skip', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      const posted = JSON.parse(init?.body ?? '{}') as { clusters?: Array<{ targetId: string }> };
      const clusters = posted.clusters ?? [];
      return {
        ok: true,
        json: async () => ({
          success: 0,
          failed: 1,
          results: clusters.map((cluster, index) => (
            index === 0
              ? { clusterId: cluster.targetId, status: 'skipped' }
              : { clusterId: cluster.targetId, status: 'error', error: 'transaction failed' }
          )),
        }),
      };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[certainPair(0), certainPair(1)]}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (2)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Failed to merge 1 groups'));
    expect(notify.success).not.toHaveBeenCalled();
    expect(deleteCalls()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh a certain merge that throws before anything is saved', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      throw new Error('network down');
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainPair(0)]} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Failed to merge duplicates'));
    expect(notify.success).not.toHaveBeenCalled();
    expect(deleteCalls()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('toasts when a certain-group merge is rejected', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', message: 'Invalid request data' }),
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainPair(0)]} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Merge certain groups (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Merge') }));

    expect(notify.error).toHaveBeenCalledWith('Failed to merge duplicates');
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('chunks dismiss all under the 100-pair cap', async () => {
    const user = userEvent.setup();
    const groups = Array.from({ length: 101 }, (_, index) => cluster(`p${index}`, [`Place ${index}`, `Copy ${index}`]));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success' }),
    });
    render(
      <DuplicatesPageClient initialData={groups} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss all (101)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Dismiss') }));

    const bodies = postedBodies('/api/places/dismiss-duplicate', 'POST');
    expect(bodies.map((body) => body.pairs?.length)).toEqual([100, 1]);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('toasts when dismiss all is rejected', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', message: 'Invalid request body' }),
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[cluster('only', ['Cafe A', 'Cafe A copy'])]} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss all (1)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Dismiss') }));

    expect(notify.error).toHaveBeenCalledWith('Failed to dismiss duplicates');
    expect(postedBodies('/api/places/dismiss-duplicate', 'POST')).toHaveLength(1);
  });

  it('refreshes after a later dismiss-all chunk throws', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    let posts = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      posts += 1;
      if (posts === 1) return { ok: true, json: async () => ({ status: 'success' }) };
      throw new Error('network down');
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={Array.from({ length: 101 }, (_, index) => cluster(`p${index}`, [`Place ${index}`, `Copy ${index}`]))}
        fetchedAt={null}
        fetchError={null}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss all (101)' }));
    await user.click(screen.getByRole('button', { name: accessibleName('Dismiss') }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Failed to dismiss duplicates'));
    expect(postedBodies('/api/places/dismiss-duplicate', 'POST').map((body) => body.pairs?.length)).toEqual([100, 1]);
    expect(deleteCalls()).toHaveLength(1);
    expect(refresh).toHaveBeenCalled();
  });

  it('does not merge from m with one member In, and ignores shortcuts while the kept record select is focused', async () => {
    render(
      <DuplicatesPageClient
        initialData={[certainCluster(), maybeCluster()]}
        fetchedAt={null}
        fetchError={null}
      />
    );
    Element.prototype.scrollIntoView = jest.fn();
    const user = userEvent.setup();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);

    const notThisOne = screen.getAllByRole('button', { name: 'Not this one' });
    await user.click(notThisOne[notThisOne.length - 1]);
    fireEvent.keyDown(document, { key: 'm' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'change' }));
    const keptRecord = screen.getByRole('combobox', { name: 'Kept record' });
    keptRecord.focus();
    fireEvent.keyDown(document, { key: 'm' });
    fireEvent.keyDown(document, { key: 'd' });
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'k' });

    expect(global.fetch).not.toHaveBeenCalled();
    const workbench = screen.getByRole('region', { name: 'Is this one place?' });
    expect(workbench).toHaveTextContent('Arctic Cathedral');
    expect(workbench).not.toHaveTextContent('Sushi Saito');
  });

  it('keeps a hard-against pair from merging when the kept record changes', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[farPair()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);

    expect(partButton('Harbor Other', 'Not this one')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Not duplicates marks these as different places. #2 stays separate too.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Merge 1 into one place/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kept record' }), 'far_o');

    expect(partButton('Harbor Cafe', 'Not this one')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Suggested out: 6.6 km apart from Harbor Other.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Merge 1 into one place/ })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'm' });
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(partButton('Harbor Cafe', 'In'));
    expect(partButton('Harbor Cafe', 'In')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('"Not duplicates" remembers these 2 as different places.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Merge 2 into one place/ })).toBeEnabled();
  });

  it('says a Not duplicates undo was put back without naming a tab', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === '/api/places/dismiss-duplicate' || (url === '/api/places/duplicates' && init?.method === 'DELETE')) {
        return { ok: true, json: async () => ({ status: 'success' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[certainCluster()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /^Not duplicates/ }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(
      'Marked 2 places as not duplicates',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    ));

    (notify.success as jest.Mock).mockClear();
    fireEvent.keyDown(document, { key: 'u' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Put back'));
    expect(notify.success).not.toHaveBeenCalledWith(expect.stringContaining('To review'));
  });

  it('marks members hard-against the new kept record Out', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[keptChangeGroup()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);

    expect(partButton('Harbor Kiosk', 'In')).toHaveAttribute('aria-pressed', 'true');
    expect(partButton('Harbor Chapel', 'In')).toHaveAttribute('aria-pressed', 'true');
    expect(partButton('Harbor Other', 'Not this one')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kept record' }), 'mix_f');

    expect(partButton('Harbor Cafe', 'Not this one')).toHaveAttribute('aria-pressed', 'true');
    expect(partButton('Harbor Kiosk', 'Not this one')).toHaveAttribute('aria-pressed', 'true');
    expect(partButton('Harbor Chapel', 'Not this one')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Merge 1 into one place/ })).toBeDisabled();

    await user.click(partButton('Harbor Kiosk', 'In'));
    expect(partButton('Harbor Kiosk', 'In')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Merge 2 into one place/ })).toBeEnabled();
  });

  it('retries a failed merge undo without deleting dismissals by place id', async () => {
    const { refresh, routerSpy: spy } = spyRefresh();
    routerSpy = spy;
    let undoPosts = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === '/api/places/duplicates' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) };
      }
      if (url === '/api/places/bulk-merge') {
        return { ok: true, json: async () => ({ success: 1, failed: 0, results: [{ status: 'success', mergeLogId: 'log_1' }] }) };
      }
      if (url === '/api/places/undo-merge') {
        undoPosts += 1;
        if (undoPosts === 1) return { ok: false, status: 500, json: async () => ({ message: 'Undo failed' }) };
        return { ok: true, json: async () => ({ status: 'success' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const user = userEvent.setup();
    const gamma = place('place_c', 'Gamma Cafe');
    const alpha = place('place_a', 'Alpha Cafe');
    const beta = place('place_b', 'Beta Cafe');
    render(
      <DuplicatesPageClient
        initialData={[{
          cluster_id: 'place_a+place_b+place_c',
          avgConfidence: 0.9,
          places: [alpha, beta, gamma],
          edges: [
            edge('place_a', 'place_b', 0.9, 40, 0.9),
            edge('place_a', 'place_c', 0.88, 50, 0.9),
            edge('place_b', 'place_c', 0.86, 30, 0.9),
          ],
          leftOut: [],
          mergedOn: null,
        }]}
        fetchedAt={null}
        fetchError={null}
      />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    const notThisOne = screen.getAllByRole('button', { name: 'Not this one' });
    await user.click(notThisOne[notThisOne.length - 1]);
    await user.click(screen.getByRole('button', { name: /^Merge 2 into one place/ }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(
      'Merged 2 places into Alpha Cafe',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    ));

    const mergeBody = postedBody('/api/places/bulk-merge', 'POST') as {
      clusters?: Array<{ dismissPairs?: unknown[] }>;
    };
    expect(mergeBody.clusters?.[0].dismissPairs?.length).toBeGreaterThan(0);
    expect(postedBodies('/api/places/dismiss-duplicate', 'POST')).toHaveLength(0);

    fireEvent.keyDown(document, { key: 'u' });
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Undo failed'));
    expect(undoPosts).toBe(1);
    expect(postedBodies('/api/places/dismiss-duplicate', 'DELETE')).toHaveLength(0);
    expect(notify.success).not.toHaveBeenCalledWith('Merge undone');

    fireEvent.keyDown(document, { key: 'u' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merge undone'));
    expect(undoPosts).toBe(2);
    expect(postedBodies('/api/places/dismiss-duplicate', 'DELETE')).toHaveLength(0);
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a hard-against edge between two In members on the link line and both cards', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={[symmetricHardAgainstGroup()]} fetchedAt={null} fetchError={null} />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);

    expect(partButton('Cafe A', 'In')).toHaveAttribute('aria-pressed', 'true');
    expect(partButton('Cafe B', 'In')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('2 and 3 · 5 km apart')).toBeInTheDocument();
    const member = (number: number) => {
      const card = document.querySelector(`[data-member="${number}"]`);
      expect(card).not.toBeNull();
      return within(card as HTMLElement);
    };
    expect(member(2).getByText('5 km apart from #3')).toBeInTheDocument();
    expect(member(3).getByText('5 km apart from #2')).toBeInTheDocument();
    expect(screen.queryByText(/Suggested out:/)).not.toBeInTheDocument();
  });

  it('deletes a partial Not duplicates write when a later chunk fails', async () => {
    const places = Array.from({ length: 16 }, (_, index) => place(`part_${index}`, `Cafe ${index}`));
    let posts = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/dismiss-duplicate' && init?.method === 'POST') {
        posts += 1;
        const body = JSON.parse(init.body ?? '{}') as { pairs?: Array<{ placeId1: string; placeId2: string }> };
        if (posts === 1) return { ok: true, json: async () => ({ status: 'success', inserted: body.pairs ?? [] }) };
        return { ok: false, status: 500, json: async () => ({ message: 'failed' }) };
      }
      return { ok: true, json: async () => ({ status: 'success' }) };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[{
          cluster_id: places.map((row) => row.id).sort().join('+'),
          avgConfidence: 0.9,
          places,
          edges: [],
          leftOut: [],
          mergedOn: null,
        }]}
        fetchedAt={null}
        fetchError={null}
      />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    const notThisOne = screen.getAllByRole('button', { name: 'Not this one' });
    await user.click(notThisOne[notThisOne.length - 1]);
    await user.click(screen.getByRole('button', { name: /^Not duplicates/ }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Failed to dismiss cluster'));
    expect(notify.success).not.toHaveBeenCalled();
    const posted = postedBodies('/api/places/dismiss-duplicate', 'POST');
    expect(posted.map((body) => body.pairs?.length)).toEqual([100, 20]);
    expect(postedBodies('/api/places/dismiss-duplicate', 'DELETE')).toEqual([{ pairs: posted[0].pairs }]);
  });

  it('ignores m, d, and u while Not duplicates is in flight', async () => {
    let releaseDismiss: () => void = () => {};
    const dismissGate = new Promise<void>((resolve) => {
      releaseDismiss = resolve;
    });
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/bulk-merge') {
        return { ok: true, json: async () => ({ success: 1, failed: 0, results: [{ status: 'success', mergeLogId: 'log_1' }] }) };
      }
      if (url === '/api/places/dismiss-duplicate' && init?.method === 'POST') {
        await dismissGate;
        const body = JSON.parse(init.body ?? '{}') as { pairs?: Array<{ placeId1: string; placeId2: string }> };
        return { ok: true, json: async () => ({ status: 'success', inserted: body.pairs ?? [] }) };
      }
      if (url === '/api/places/undo-merge') {
        return { ok: true, json: async () => ({ status: 'success' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[certainCluster(), maybeCluster()]}
        fetchedAt={null}
        fetchError={null}
      />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    fireEvent.keyDown(document, { key: 'm' });
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Is this one place?' })).toHaveTextContent('Sushi Saito');
      expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
    });

    fireEvent.keyDown(document, { key: 'd' });
    fireEvent.keyDown(document, { key: 'd' });
    fireEvent.keyDown(document, { key: 'm' });
    fireEvent.keyDown(document, { key: 'u' });

    expect(postedBodies('/api/places/dismiss-duplicate', 'POST')).toHaveLength(1);
    expect(postedBodies('/api/places/bulk-merge', 'POST')).toHaveLength(1);
    expect(postedBodies('/api/places/undo-merge', 'POST')).toHaveLength(0);

    releaseDismiss();
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Marked 2 places as not duplicates',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
      );
      expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
    });
    const saved = postedBodies('/api/places/dismiss-duplicate', 'POST')[0]?.pairs ?? [];
    expect(saved.length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: 'u' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Put back'));
    expect(postedBodies('/api/places/undo-merge', 'POST')).toHaveLength(0);
    expect(postedBodies('/api/places/dismiss-duplicate', 'DELETE')).toEqual([{ pairs: saved }]);
  });

  it('keeps an earlier undo when a later dismiss writes no new pairs', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === '/api/places/bulk-merge') {
        return { ok: true, json: async () => ({ success: 1, failed: 0, results: [{ status: 'success', mergeLogId: 'log_keep' }] }) };
      }
      if (url === '/api/places/dismiss-duplicate' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ status: 'success', inserted: [] }) };
      }
      if (url === '/api/places/undo-merge') {
        return { ok: true, json: async () => ({ status: 'success' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[certainCluster(), maybeCluster()]}
        fetchedAt={null}
        fetchError={null}
      />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    fireEvent.keyDown(document, { key: 'm' });
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Is this one place?' })).toHaveTextContent('Sushi Saito');
      expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
    });

    fireEvent.keyDown(document, { key: 'd' });
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith('Marked 2 places as not duplicates', { duration: expect.any(Number) });
      expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
    });
    expect(notify.success).not.toHaveBeenCalledWith(
      'Marked 2 places as not duplicates',
      expect.objectContaining({ action: expect.anything() }),
    );

    fireEvent.keyDown(document, { key: 'u' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Merge undone'));
    const merged = postedBody('/api/places/bulk-merge', 'POST');
    expect(postedBodies('/api/places/undo-merge', 'POST')).toEqual([{
      placeId: merged.clusters?.[0].targetId,
      mergeLogId: 'log_keep',
    }]);
    expect(postedBodies('/api/places/dismiss-duplicate', 'DELETE')).toHaveLength(0);
  });

  it('keeps saved pairs undoable when a partial dismiss cannot be rolled back', async () => {
    const places = Array.from({ length: 16 }, (_, index) => place(`part_${index}`, `Cafe ${index}`));
    let posts = 0;
    let deletes = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/dismiss-duplicate' && init?.method === 'POST') {
        posts += 1;
        const body = JSON.parse(init.body ?? '{}') as { pairs?: Array<{ placeId1: string; placeId2: string }> };
        if (posts === 1) return { ok: true, json: async () => ({ status: 'success', inserted: body.pairs ?? [] }) };
        return { ok: false, status: 500, json: async () => ({ message: 'failed' }) };
      }
      if (url === '/api/places/dismiss-duplicate' && init?.method === 'DELETE') {
        deletes += 1;
        if (deletes === 1) return { ok: false, status: 500, json: async () => ({ message: 'failed' }) };
        return { ok: true, json: async () => ({ status: 'success' }) };
      }
      return { ok: true, json: async () => ({ status: 'success' }) };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[{
          cluster_id: places.map((row) => row.id).sort().join('+'),
          avgConfidence: 0.9,
          places,
          edges: [],
          leftOut: [],
          mergedOn: null,
        }]}
        fetchedAt={null}
        fetchError={null}
      />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    const notThisOne = screen.getAllByRole('button', { name: 'Not this one' });
    await user.click(notThisOne[notThisOne.length - 1]);
    await user.click(screen.getByRole('button', { name: /^Not duplicates/ }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Failed to dismiss cluster'));
    const saved = postedBodies('/api/places/dismiss-duplicate', 'POST')[0]?.pairs ?? [];
    expect(saved).toHaveLength(100);
    expect(postedBodies('/api/places/dismiss-duplicate', 'DELETE')).toEqual([{ pairs: saved }]);
    expect(notify.success).toHaveBeenCalledWith(
      'Marked 16 places as not duplicates',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );

    fireEvent.keyDown(document, { key: 'u' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Put back'));
    expect(postedBodies('/api/places/dismiss-duplicate', 'DELETE')).toEqual([{ pairs: saved }, { pairs: saved }]);
  });

  it('chunks Not duplicates past 100 pairs and undoes only the pairs the server newly wrote', async () => {
    const places = Array.from({ length: 16 }, (_, index) => place(`wide_${index}`, `Cafe ${index}`));
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/places/dismiss-duplicate' && init?.method === 'POST') {
        const body = JSON.parse(init.body ?? '{}') as { pairs?: Array<{ placeId1: string; placeId2: string }> };
        const pairs = body.pairs ?? [];
        const inserted = pairs.filter((pair) => pair.placeId1 !== 'wide_1' && pair.placeId2 !== 'wide_1');
        return { ok: true, json: async () => ({ status: 'success', inserted }) };
      }
      return { ok: true, json: async () => ({ status: 'success' }) };
    });
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient
        initialData={[{
          cluster_id: places.map((row) => row.id).sort().join('+'),
          avgConfidence: 0.9,
          places,
          edges: [],
          leftOut: [],
          mergedOn: null,
        }]}
        fetchedAt={null}
        fetchError={null}
      />
    );
    Element.prototype.scrollIntoView = jest.fn();
    await user.click(document.querySelector('[data-cluster-index="0"]') as HTMLElement);
    const notThisOne = screen.getAllByRole('button', { name: 'Not this one' });
    await user.click(notThisOne[notThisOne.length - 1]);
    await user.click(screen.getByRole('button', { name: /^Not duplicates/ }));

    await waitFor(() => expect(postedBodies('/api/places/dismiss-duplicate', 'POST')).toHaveLength(2));
    expect(postedBodies('/api/places/dismiss-duplicate', 'POST').map((body) => body.pairs?.length)).toEqual([100, 20]);

    fireEvent.keyDown(document, { key: 'u' });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Put back'));
    const undone = postedBodies('/api/places/dismiss-duplicate', 'DELETE').flatMap((body) => body.pairs ?? []);
    expect(undone.some((pair) => pair.placeId1 === 'wide_1' || pair.placeId2 === 'wide_1')).toBe(false);
    expect(undone.length).toBeGreaterThan(0);
    expect(undone.length).toBeLessThan(120);
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
