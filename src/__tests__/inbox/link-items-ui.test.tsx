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
  expect(screen.getByText('Add the caption or photos to help find places.')).toBeInTheDocument();
  expect(screen.getByText('This short link could not be expanded, but it is saved.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', noContextLink.url);
  expect(screen.getByRole('button', { name: 'Save a link' })).toBeInTheDocument();
});
