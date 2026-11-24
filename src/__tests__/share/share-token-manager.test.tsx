/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ShareTokenManager } from '@/components/share/share-token-manager';
import { PhoneShareGuide } from '@/components/share/phone-share-guide';
import type { ShareTokenSummary } from '@/types/share-tokens';

jest.mock('@/lib/notify', () => ({ notify: { success: jest.fn(), error: jest.fn() } }));

const EXISTING: ShareTokenSummary = {
  id: 'stk_old',
  name: 'Old iPad',
  tokenPrefix: 'td_share_Ab12',
  scope: 'link-import',
  createdAt: '2026-11-01T10:00:00.000Z',
  lastUsedAt: null,
};
const CREATED: ShareTokenSummary = { ...EXISTING, id: 'stk_new', name: 'My iPhone', tokenPrefix: 'td_share_Zz99' };
const SECRET = 'td_share_Zz99secretvalue';

function mockFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; status?: number; body: unknown }) {
  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    const r = handler(url, init);
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body };
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => jest.restoreAllMocks());

it('lists tokens by name and prefix, never a secret', () => {
  render(<ShareTokenManager initialTokens={[EXISTING]} />);
  const list = screen.getByRole('list', { name: 'Share tokens' });
  expect(within(list).getByText('Old iPad')).toBeInTheDocument();
  expect(within(list).getByText('td_share_Ab12…')).toBeInTheDocument();
  expect(list).toHaveTextContent('Never used');
});

it('creates a named token and shows its secret once', async () => {
  const fetchMock = mockFetch(() => ({ ok: true, status: 201, body: { token: CREATED, secret: SECRET } }));
  const onCreated = jest.fn();
  render(<ShareTokenManager initialTokens={[EXISTING]} onCreated={onCreated} />);

  fireEvent.change(screen.getByLabelText('Token name'), { target: { value: 'My iPhone' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create token' }));

  await waitFor(() => expect(screen.getByLabelText('new share token')).toHaveTextContent(SECRET));
  expect(fetchMock).toHaveBeenCalledWith('/api/share-tokens', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ name: 'My iPhone' }),
  }));
  expect(screen.getByText(/You will not be able to see it again/)).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Share tokens' })).getByText('My iPhone')).toBeInTheDocument();
  expect(onCreated).toHaveBeenCalledWith(SECRET);
});

it('shows the server\'s reason when a token cannot be created', async () => {
  mockFetch(() => ({ ok: false, status: 409, body: { error: 'You already have 20 share tokens.' } }));
  render(<ShareTokenManager initialTokens={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('You already have 20 share tokens.');
});

it('revokes a token after confirmation', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  const fetchMock = mockFetch(() => ({ ok: true, body: { revoked: true } }));
  render(<ShareTokenManager initialTokens={[EXISTING]} />);

  fireEvent.click(screen.getByRole('button', { name: 'Revoke Old iPad' }));

  await waitFor(() => expect(screen.queryByText('Old iPad')).not.toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledWith('/api/share-tokens/stk_old', { method: 'DELETE' });
  expect(screen.getByText('No share tokens yet.')).toBeInTheDocument();
});

it('says tokens are unavailable when the list could not be loaded', () => {
  render(<ShareTokenManager initialTokens={null} />);
  expect(screen.getByText(/not available right now/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create token' })).not.toBeInTheDocument();
});

it('phone guide: gives the endpoint to paste and fills the Authorization value once a token exists', async () => {
  mockFetch(() => ({ ok: true, status: 201, body: { token: CREATED, secret: SECRET } }));
  render(
    <PhoneShareGuide endpoint="https://tabi.test/api/share/links" appOrigin="https://tabi.test" initialTokens={[]} />,
  );
  expect(screen.getByLabelText('Shortcut URL')).toHaveTextContent('https://tabi.test/api/share/links');
  expect(screen.getAllByText('Show in Share Sheet', { selector: 'strong' }).length).toBeGreaterThan(0);
  expect(screen.getByText('Get Contents of URL', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Authorization header value')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Create token' }));

  await waitFor(() =>
    expect(screen.getByLabelText('Authorization header value')).toHaveTextContent(`Bearer ${SECRET}`),
  );
});
