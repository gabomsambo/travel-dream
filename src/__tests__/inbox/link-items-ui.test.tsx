/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { InboxScreen } from '@/components/inbox/inbox-screen';
import { buildInboxScreen } from '@/lib/inbox-page-model';
import type { InboxLinkItem } from '@/lib/inbox-link-items';

const noContextLink: InboxLinkItem = {
  id: 'src_link_1',
  url: 'https://www.tiktok.com/t/ZPLaXhYUP/',
  createdAt: '2026-10-20T12:00:00.000Z',
  platform: 'tiktok',
  kind: 'tiktok-short',
  processingStatus: 'completed',
  title: null,
  author: null,
  placeName: null,
  hasHelpfulContext: false,
  resolutionStatus: 'unresolved',
  places: [],
};

it('shows a TikTok label and explains that adding a caption or photos can help', () => {
  const model = buildInboxScreen({ uploads: [], toReviewPlaceIds: [], addedAnotherWay: [], now: null });
  render(<InboxScreen model={model} linkItems={[noContextLink]} />);

  expect(screen.getByText('TikTok · shared link')).toBeInTheDocument();
  expect(screen.getByText('Paste the caption or add photos from your gallery to help find places.')).toBeInTheDocument();
  expect(screen.getByText('This short link could not be expanded, but it is saved.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', noContextLink.url);
  expect(screen.getByRole('button', { name: 'Save a link' })).toBeInTheDocument();
});

it('offers the photo import for a post the reader detected as a carousel', () => {
  const model = buildInboxScreen({ uploads: [], toReviewPlaceIds: [], addedAnotherWay: [], now: null });
  const carousel: InboxLinkItem = {
    ...noContextLink,
    id: 'src_link_2',
    kind: 'tiktok-video',
    contentKind: 'photo',
    resolutionStatus: 'not-needed',
  };
  render(<InboxScreen model={model} linkItems={[carousel]} />);

  expect(screen.getByRole('button', { name: 'Import photos to find places' })).toBeInTheDocument();
});

it('hides the photo import for a post that is not a carousel', () => {
  const model = buildInboxScreen({ uploads: [], toReviewPlaceIds: [], addedAnotherWay: [], now: null });
  const video: InboxLinkItem = {
    ...noContextLink,
    id: 'src_link_3',
    kind: 'tiktok-video',
    contentKind: 'video',
    resolutionStatus: 'not-needed',
  };
  render(<InboxScreen model={model} linkItems={[video]} />);

  expect(screen.queryByRole('button', { name: 'Import photos to find places' })).not.toBeInTheDocument();
});

it('keeps the photo import disabled only while an import is recent enough to still be running', () => {
  const model = buildInboxScreen({ uploads: [], toReviewPlaceIds: [], addedAnotherWay: [], now: null });
  const importing: InboxLinkItem = {
    ...noContextLink,
    kind: 'tiktok-video',
    contentKind: 'photo',
    resolutionStatus: 'not-needed',
    photoImportStatus: 'importing',
  };
  render(
    <InboxScreen
      model={model}
      linkItems={[
        { ...importing, id: 'src_link_running', photoImportRequestedAt: new Date(Date.now() - 60_000).toISOString() },
        // Its request was killed before it could record an outcome.
        { ...importing, id: 'src_link_stale', photoImportRequestedAt: new Date(Date.now() - 11 * 60_000).toISOString() },
      ]}
    />,
  );

  expect(screen.getByRole('button', { name: 'Importing photos…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Import photos to find places' })).toBeEnabled();
});

it('says the imported photos are read to find places and that a place keeps only one of them', () => {
  const model = buildInboxScreen({ uploads: [], toReviewPlaceIds: [], addedAnotherWay: [], now: null });
  const carousel: InboxLinkItem = {
    ...noContextLink,
    kind: 'tiktok-video',
    contentKind: 'photo',
    resolutionStatus: 'not-needed',
  };
  render(
    <InboxScreen
      model={model}
      linkItems={[
        { ...carousel, id: 'src_link_offered' },
        { ...carousel, id: 'src_link_done', photoImportStatus: 'imported', photoImportCount: 3 },
      ]}
    />,
  );

  expect(screen.getByRole('button', { name: 'Import photos to find places' })).toBeInTheDocument();
  expect(screen.getByText('3 photos imported and queued to read.')).toBeInTheDocument();
  expect(screen.getByText('Each photo is read to find places, but a place keeps only one of them.')).toBeInTheDocument();
});
