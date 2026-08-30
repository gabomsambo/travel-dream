import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActivityProvider, useActivityJobs } from '@/components/activity/activity-provider'
import { ActivityBell } from '@/components/activity/activity-bell'
import { ProcessingBanner } from '@/components/mass-upload/processing-banner'
import { toastWithNavigate } from '@/lib/toast-navigate'
import { activityJobsStorageKey } from '@/lib/activity-jobs'

jest.mock('@/lib/toast-navigate', () => ({
  toastWithNavigate: jest.fn(),
}))

const mockedToast = toastWithNavigate as jest.MockedFunction<typeof toastWithNavigate>

const SESSION_ID = 'session_bell-1'

function statusPayload(counts: Record<string, number>, total: number, placesCreated: number) {
  return {
    status: 'success',
    sessionId: SESSION_ID,
    counts: {
      uploaded: 0,
      queued: 0,
      extracting: 0,
      enriching: 0,
      completed: 0,
      failed: 0,
      stalled: 0,
      cancelled: 0,
      ...counts,
    },
    total,
    placesCreated,
    failedErrors: [],
  }
}

function mockNetwork(opts: {
  sessions?: Array<Record<string, unknown>>
  status?: ReturnType<typeof statusPayload> | (() => ReturnType<typeof statusPayload>)
  statusOk?: boolean
}) {
  ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || 'GET'
    if (url.startsWith('/api/upload/sessions?status=active&hasUploads=true&limit=')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          sessions: opts.sessions ?? [
            {
              id: SESSION_ID,
              status: 'active',
              startedAt: new Date().toISOString(),
              meta: { uploadedFiles: ['src_1', 'src_2'] },
            },
          ],
        }),
      })
    }
    if (url.startsWith('/api/mass-upload/status')) {
      if (opts.statusOk === false) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      }
      const payload = typeof opts.status === 'function' ? opts.status() : opts.status
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => payload,
      })
    }
    if (method === 'PATCH') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success' }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
  })
}

function JobProbe() {
  const { jobs, connectionState, acknowledge, observeSession } = useActivityJobs()
  return (
    <div>
      <div data-testid="phases">{jobs.map(job => job.phase).join(',')}</div>
      <div data-testid="summaries">{jobs.map(job => job.summary).join('|')}</div>
      <div data-testid="connection">{connectionState}</div>
      <button type="button" onClick={() => observeSession(SESSION_ID)}>observe</button>
      {jobs.map(job => (
        <button key={job.id} type="button" onClick={() => acknowledge(job.id)}>
          dismiss {job.id}
        </button>
      ))}
    </div>
  )
}

describe('ActivityProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    mockedToast.mockClear()
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('discovers an active session and shows live progress', async () => {
    mockNetwork({
      status: statusPayload({ queued: 317, extracting: 17, completed: 183 }, 500, 42),
    })

    render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
        <ProcessingBanner />
      </ActivityProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('phases')).toHaveTextContent('active')
    })
    expect(screen.getByTestId('summaries')).toHaveTextContent(
      'Processing 183 of 500 · 42 places found'
    )
    expect(screen.getByRole('link', { name: /Details/ })).toHaveAttribute('href', '/mass-upload')
    expect(mockedToast).not.toHaveBeenCalled()
  })

  it('announces a terminal job once, persists it, and keeps it after remount', async () => {
    mockNetwork({
      status: statusPayload({ completed: 487, failed: 9, stalled: 4 }, 500, 118),
    })

    const { unmount } = render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
        <ProcessingBanner />
      </ActivityProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('phases')).toHaveTextContent('complete')
    })
    expect(screen.getByTestId('summaries')).toHaveTextContent(
      '487 processed · 9 failed · 4 need retry · 118 places found'
    )
    expect(screen.queryByText(/Processing /)).not.toBeInTheDocument()
    expect(mockedToast).toHaveBeenCalledTimes(1)
    expect(mockedToast).toHaveBeenCalledWith(
      'Processing finished · 487 processed · 4 need retry.',
      '/mass-upload',
      { type: 'warning', actionLabel: 'Review upload' }
    )
    expect(localStorage.getItem(activityJobsStorageKey('user_a'))).toContain('session_bell-1')

    unmount()
    mockedToast.mockClear()

    render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
      </ActivityProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('phases')).toHaveTextContent('complete')
    })
    expect(mockedToast).not.toHaveBeenCalled()
  })

  it('clears a terminal job when the user acknowledges it', async () => {
    mockNetwork({
      status: statusPayload({ completed: 10 }, 10, 3),
    })

    render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
      </ActivityProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('phases')).toHaveTextContent('complete')
    })

    await userEvent.click(screen.getByRole('button', { name: `dismiss ${SESSION_ID}` }))

    await waitFor(() => {
      expect(screen.getByTestId('phases')).toHaveTextContent('')
    })
    expect(localStorage.getItem(activityJobsStorageKey('user_a'))).toBe('[]')
  })

  it('does not hydrate a completion persisted by another user', async () => {
    const stored = [{
      id: 'session_user-a',
      ownerUserId: 'user_a',
      kind: 'mass-upload',
      counts: statusPayload({ completed: 10 }, 10, 3).counts,
      total: 10,
      placesCreated: 3,
      announced: true,
      updatedAt: new Date().toISOString(),
    }]
    localStorage.setItem(activityJobsStorageKey('user_a'), JSON.stringify(stored))
    mockNetwork({ sessions: [] })

    render(
      <ActivityProvider ownerUserId="user_b">
        <JobProbe />
      </ActivityProvider>
    )

    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('live'))
    expect(screen.getByTestId('phases')).toHaveTextContent('')
    expect(screen.getByTestId('summaries')).toHaveTextContent('')
  })

  it('ignores a status response that resolves after the owner changes', async () => {
    let resolveStatus: ((response: Response) => void) | undefined
    let discoveryCount = 0
    ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo) => {
      const url = String(input)
      if (url.startsWith('/api/upload/sessions?')) {
        discoveryCount += 1
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            sessions: discoveryCount === 1 ? [{
              id: SESSION_ID,
              status: 'active',
              startedAt: new Date().toISOString(),
              meta: { uploadedFiles: ['src_1'] },
            }] : [],
          }),
        })
      }
      if (url.startsWith('/api/mass-upload/status')) {
        return new Promise(resolve => { resolveStatus = resolve })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    })

    const { rerender } = render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
      </ActivityProvider>
    )
    await waitFor(() => expect(resolveStatus).toBeDefined())

    rerender(
      <ActivityProvider ownerUserId="user_b">
        <JobProbe />
      </ActivityProvider>
    )
    await act(async () => {
      resolveStatus?.({
        ok: true,
        status: 200,
        json: async () => statusPayload({ completed: 10 }, 10, 3),
      } as Response)
    })

    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('live'))
    expect(screen.getByTestId('phases')).toHaveTextContent('')
    expect(localStorage.getItem(activityJobsStorageKey('user_b'))).toBeNull()
  })

  it('keeps a completed job when an older active poll resolves late', async () => {
    const statusResolvers: Array<(response: Response) => void> = []
    ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/upload/sessions?') && (init?.method || 'GET') === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            sessions: [{
              id: SESSION_ID,
              status: 'active',
              startedAt: new Date().toISOString(),
              meta: { uploadedFiles: ['src_1'] },
            }],
          }),
        })
      }
      if (url.startsWith('/api/mass-upload/status')) {
        return new Promise(resolve => { statusResolvers.push(resolve) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success' }) })
    })

    render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
      </ActivityProvider>
    )
    await waitFor(() => expect(statusResolvers).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'observe' }))
    await waitFor(() => expect(statusResolvers).toHaveLength(2))

    await act(async () => {
      statusResolvers[1]({
        ok: true,
        status: 200,
        json: async () => statusPayload({ completed: 10 }, 10, 3),
      } as Response)
    })
    await waitFor(() => expect(screen.getByTestId('phases')).toHaveTextContent('complete'))

    await act(async () => {
      statusResolvers[0]({
        ok: true,
        status: 200,
        json: async () => statusPayload({ queued: 9, completed: 1 }, 10, 1),
      } as Response)
    })

    expect(screen.getByTestId('phases')).toHaveTextContent('complete')
    expect(localStorage.getItem(activityJobsStorageKey('user_a'))).toContain('"completed":10')
  })

  it('says so when polling fails instead of pretending numbers are current', async () => {
    mockNetwork({ statusOk: false })

    render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
        <ActivityBell />
      </ActivityProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('connection')).toHaveTextContent('paused')
    })

    await userEvent.click(screen.getByRole('button', { name: /Activity/ }))
    expect(await screen.findByText(/Updates paused — retrying/)).toBeInTheDocument()
  })

  it('marks updates paused when an explicitly observed poll fails', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((input: RequestInfo) => {
      const url = String(input)
      if (url.startsWith('/api/upload/sessions?')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'success', sessions: [] }),
        })
      }
      if (url.startsWith('/api/mass-upload/status')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    })

    render(
      <ActivityProvider ownerUserId="user_a">
        <JobProbe />
      </ActivityProvider>
    )
    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('live'))

    await userEvent.click(screen.getByRole('button', { name: 'observe' }))

    await waitFor(() => expect(screen.getByTestId('connection')).toHaveTextContent('paused'))
  })

  it('shows a bell indicator while work is active and lists it in the popover', async () => {
    mockNetwork({
      status: statusPayload({ queued: 300, completed: 183, extracting: 17 }, 500, 42),
    })

    render(
      <ActivityProvider ownerUserId="user_a">
        <ActivityBell />
      </ActivityProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('activity-bell-indicator')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Activity, 1 in progress/ }))
    expect(await screen.findByText('Mass upload')).toBeInTheDocument()
    expect(screen.getByText(/Processing 183 of 500 · 42 places found/)).toBeInTheDocument()
  })
})
