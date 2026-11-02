/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SaveLinkForm } from '@/components/mass-upload/save-link-form';

it('posts the pasted URL and optional caption, then reports the saved item', async () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: 'success', sourceId: 'src_link' }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  const onSaved = jest.fn();
  render(<SaveLinkForm onSaved={onSaved} />);

  fireEvent.change(screen.getByLabelText('TikTok or Instagram link'), {
    target: { value: '  https://www.tiktok.com/t/ZPLaXhYUP/  ' },
  });
  fireEvent.change(screen.getByLabelText(/Caption/), {
    target: { value: 'Try the cafe in Lisbon' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save to Inbox' }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith('/api/inbox/links', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ url: 'https://www.tiktok.com/t/ZPLaXhYUP/', caption: 'Try the cafe in Lisbon' }),
  }));
  global.fetch = originalFetch;
});
