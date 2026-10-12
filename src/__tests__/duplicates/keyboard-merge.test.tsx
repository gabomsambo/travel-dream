import '../helpers/react-optimistic';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicatesPageClient } from '@/components/duplicates/duplicates-page-client';
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

const clusters = [
  cluster('c1', ['Cafe A', 'Cafe A copy']),
  cluster('c2', ['Cafe B', 'Cafe B copy']),
];

describe('duplicates keyboard and bulk confirmation', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
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

  it('asks how many groups and places before Merge All runs', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={clusters} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'Merge All' }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Merge 2 groups?');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('4 places across 2 groups');
  });

  it('asks how many groups and places before Dismiss All runs', async () => {
    const user = userEvent.setup();
    render(
      <DuplicatesPageClient initialData={clusters} fetchedAt={null} fetchError={null} />
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss All' }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Dismiss 2 groups?');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('4 places across 2 groups');
  });
});
