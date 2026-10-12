import { act, render, screen, waitFor } from '@testing-library/react';
import { Sidebar } from '@/components/navigation/sidebar';

const CLUSTERS_URL =
  '/api/places/duplicates?mode=clusters&minConfidence=0.7&limit=1000&includeReasoning=false';

type MediaListener = (event: { matches: boolean; media: string }) => void;

function installMatchMedia(matchesDesktop: boolean) {
  const listeners = new Set<MediaListener>();
  let desktop = matchesDesktop;
  window.matchMedia = jest.fn().mockImplementation((query: string) => {
    const isDesktopQuery = query === '(min-width: 768px)';
    return {
      get matches() {
        return isDesktopQuery ? desktop : false;
      },
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: (_type: string, handler: MediaListener) => {
        if (isDesktopQuery) listeners.add(handler);
      },
      removeEventListener: (_type: string, handler: MediaListener) => {
        listeners.delete(handler);
      },
      dispatchEvent: jest.fn(),
    };
  }) as unknown as typeof window.matchMedia;

  return {
    resize(nextDesktop: boolean) {
      desktop = nextDesktop;
      for (const listener of listeners) {
        listener({ matches: nextDesktop, media: '(min-width: 768px)' });
      }
    },
  };
}

describe('sidebar To-review count', () => {
  beforeEach(() => {
    installMatchMedia(false);
    (global.fetch as jest.Mock).mockReset();
  });

  it('does not scan duplicates while the sidebar is hidden on a phone', async () => {
    render(<Sidebar />);

    await act(async () => {
      await Promise.resolve();
    });
    window.dispatchEvent(new Event('td:duplicates-changed'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Duplicates/ })).toBeInTheDocument();
  });

  it('loads the To-review count once the desktop sidebar is visible', async () => {
    installMatchMedia(true);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { totalClusters: 3 } }),
    });

    render(<Sidebar />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(CLUSTERS_URL);
    });
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('starts the scan when the viewport grows to the desktop breakpoint', async () => {
    const viewport = installMatchMedia(false);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { totalClusters: 2 } }),
    });

    render(<Sidebar />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(global.fetch).not.toHaveBeenCalled();

    act(() => {
      viewport.resize(true);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(CLUSTERS_URL);
    });
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
