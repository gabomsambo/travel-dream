import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicateExpandedView } from '@/components/duplicates/duplicate-expanded-view';
import { mergePlaceFields } from '@/lib/place-merge';
import type { Place } from '@/types/database';

function place(id: string, name: string, phone: string | null, confidence: number): Place {
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
    confidence,
    price_level: null,
    best_time: null,
    activities: [],
    cuisine: [],
    amenities: [],
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    archivedAt: null,
    website: null,
    phone,
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

function fieldRow(label: string): HTMLElement {
  const row = screen.getByText(label).parentElement;
  if (!row) throw new Error(`No row for ${label}`);
  return row;
}

describe('duplicate will-add markers', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
  });

  it('shows Merge These Two on the open tab and Merge All in the preview for Keep, Alpha, and Beta phones', async () => {
    const user = userEvent.setup();
    const keep = place('keep', 'Keep', null, 0.95);
    const alpha = place('alpha', 'Alpha', '+1', 0.5);
    const beta = place('beta', 'Beta', '+2', 0.5);
    const mergeTheseTwoAlpha = mergePlaceFields(keep, [alpha]);
    const mergeTheseTwoBeta = mergePlaceFields(keep, [beta]);
    const mergeAll = mergePlaceFields(keep, [alpha, beta]);

    render(
      <DuplicateExpandedView
        cluster={{
          cluster_id: 'phones',
          avgConfidence: 0.9,
          places: [keep, alpha, beta],
        }}
        onMerge={() => undefined}
        onMergePair={() => undefined}
        onDismiss={() => undefined}
      />
    );

    const alphaPhone = fieldRow('Phone');
    expect(within(alphaPhone).getByRole('img', { name: 'Will add (Merge These Two)' })).toBeInTheDocument();
    expect(within(alphaPhone).getByText(String(mergeTheseTwoAlpha.phone))).toBeInTheDocument();
    expect(within(alphaPhone).queryByText(/Merge All uses/)).not.toBeInTheDocument();
    expect(screen.getByText('Will add (Merge All)')).toBeInTheDocument();
    expect(screen.getByText(`Phone: ${mergeAll.phone}`)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Beta/ }));

    const betaPhone = fieldRow('Phone');
    expect(within(betaPhone).getByRole('img', { name: 'Will add (Merge These Two)' })).toBeInTheDocument();
    expect(within(betaPhone).getByText(String(mergeTheseTwoBeta.phone))).toBeInTheDocument();
    expect(within(betaPhone).getByText("Merge All uses Alpha's value")).toBeInTheDocument();
    expect(screen.getByText(`Phone: ${mergeAll.phone}`)).toBeInTheDocument();
    expect(screen.queryByText(`Phone: ${mergeTheseTwoBeta.phone}`)).not.toBeInTheDocument();

    await user.click(within(betaPhone).getByRole('button', { name: 'Use this value' }));

    const mergeAllOverridden = mergePlaceFields(keep, [alpha, beta], { phone: beta.id });
    expect(screen.getByText(`Phone: ${mergeAllOverridden.phone}`)).toBeInTheDocument();
    expect(screen.queryByText("Merge All uses Alpha's value")).not.toBeInTheDocument();
    expect(within(fieldRow('Phone')).getByRole('img', { name: 'Will add (Merge These Two)' })).toBeInTheDocument();
  });
});
