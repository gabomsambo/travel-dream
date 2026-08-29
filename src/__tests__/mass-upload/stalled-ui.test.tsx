/**
 * The `stalled` status is new product surface, not an internal detail: an image
 * that was interrupted too many times must reach the owner as "needs retry",
 * visibly distinct from `failed`, and must count towards progress so the run can
 * finish.
 *
 * This renders the real page against the real polling hook, with only `fetch`
 * stubbed with the payload `/api/mass-upload/status` returns.
 *
 * Set `UI_EVIDENCE_DIR` to also write the rendered markup out for review:
 *   UI_EVIDENCE_DIR=/tmp/evidence npx jest src/__tests__/mass-upload/stalled-ui.test.tsx
 */
import { render, screen, waitFor } from '@testing-library/react'

// The blob client is ESM-only and unused on the processing screen.
jest.mock('@vercel/blob/client', () => ({ upload: jest.fn() }))

import { MassUploadPage } from '@/components/mass-upload/mass-upload-page'

const SESSION_ID = 'ses_loadtest'

interface Counts {
  uploaded?: number
  queued?: number
  extracting?: number
  enriching?: number
  completed?: number
  failed?: number
  stalled?: number
  cancelled?: number
}

function statusPayload(counts: Counts, total: number, placesCreated: number) {
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
    timestamp: '2026-07-26T00:00:00.000Z',
  }
}

/** Resume an active session on mount, then answer status polls. */
function mockApis(payload: ReturnType<typeof statusPayload>) {
  ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (String(url).startsWith('/api/upload/sessions?limit=')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'success',
          sessions: [
            {
              id: SESSION_ID,
              status: 'active',
              startedAt: new Date().toISOString(),
              meta: { uploadedFiles: Array.from({ length: payload.total }, (_, i) => `src_${i}`) },
            },
          ],
        }),
      })
    }
    if (String(url).startsWith('/api/mass-upload/status')) {
      return Promise.resolve({ ok: true, json: async () => payload })
    }
    return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
  })
}

async function dumpEvidence(name: string, title: string) {
  const dir = process.env.UI_EVIDENCE_DIR
  if (!dir) return
  const { writeFileSync, readFileSync, existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const cssPath = join(dir, 'app.css')
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : ''
  writeFileSync(
    join(dir, `${name}.html`),
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>${css}</style><style>body{padding:2.5rem;background:#f8fafc}` +
      `.evidence-title{font:600 13px ui-sans-serif,system-ui;color:#64748b;margin-bottom:1.5rem}</style></head>` +
      `<body><div class="evidence-title">${title}</div>${document.body.innerHTML}</body></html>`
  )
}

describe('mass upload UI — stalled screenshots surface as "needs retry"', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('shows a "needs retry" badge while processing, distinct from "failed"', async () => {
    mockApis(statusPayload({ queued: 12, extracting: 4, completed: 481, stalled: 3 }, 500, 672))
    render(<MassUploadPage />)

    expect(await screen.findByText('3 needs retry')).toBeInTheDocument()
    // Stalled items count as processed so the bar reflects real progress.
    expect(screen.getByText('484 of 500 processed')).toBeInTheDocument()
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument()

    await dumpEvidence('ui-processing-needs-retry', 'Processing — 3 screenshots surfaced as "needs retry", none failed')
  })

  it('explains on the completion screen that stalled images are not bad images', async () => {
    mockApis(statusPayload({ completed: 497, stalled: 3 }, 500, 698))
    render(<MassUploadPage />)

    await waitFor(() => expect(screen.getByText('Processing Complete!')).toBeInTheDocument())
    expect(
      screen.getByText(/3 screenshots kept getting interrupted/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Nothing is wrong with those images/i)).toBeInTheDocument()
    expect(screen.queryByText(/failed to process/i)).not.toBeInTheDocument()

    await dumpEvidence('ui-complete-needs-retry', 'Complete — 497 completed, 3 "needs retry", 0 failed')
  })

  it('still finishes the run when every remaining screenshot stalled', async () => {
    mockApis(statusPayload({ completed: 0, stalled: 2 }, 2, 0))
    render(<MassUploadPage />)

    // A run that ends entirely in `stalled` must not poll forever.
    await waitFor(() => expect(screen.getByText('Processing Complete!')).toBeInTheDocument())
    expect(screen.getByText(/upload them again to retry/i)).toBeInTheDocument()
  })
})
