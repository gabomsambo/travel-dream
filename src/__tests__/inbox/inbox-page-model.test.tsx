import { fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server.node'
import { InboxPageClient } from '@/components/inbox/inbox-page-client'
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { buildInboxScreen, formatUploadWhen } from '@/lib/inbox-page-model'
import type {
  InboxUploadBatch,
  InboxUploadPlace,
  InboxUploadScreenshot,
} from '@/types/inbox-uploads'

const NOW = new Date('2026-10-23T15:00:00.000Z')
const EARLIER = '2026-10-12T15:00:00.000Z'

function place(partial: Pick<InboxUploadPlace, 'id' | 'name' | 'status'> & Partial<InboxUploadPlace>): InboxUploadPlace {
  return { city: null, country: null, sourceIds: [partial.id], createdAt: '', ...partial }
}

function shot(partial: Pick<InboxUploadScreenshot, 'sourceId'> & Partial<InboxUploadScreenshot>): InboxUploadScreenshot {
  return {
    name: partial.name ?? partial.sourceId,
    imageUrl: null,
    processingStatus: 'completed',
    outcome: 'places',
    createdPlaceIds: [],
    linkedPlaceIds: [],
    outcomeDerived: false,
    ...partial,
  }
}

function batch(partial: Pick<InboxUploadBatch, 'sessionId' | 'uploadedAt'> & Partial<InboxUploadBatch>): InboxUploadBatch {
  return {
    screenshotCount: partial.screenshots?.length ?? 0,
    placesRead: 0,
    newPlaces: 0,
    screenshots: [],
    outcomeDerived: false,
    ...partial,
    rows: {
      toReview: { placeIds: [], sourceIds: [], places: [], checkCount: null },
      added: { placeIds: [], sourceIds: [], places: [] },
      notAPlace: { placeIds: [], sourceIds: [], places: [] },
      alreadyInLibrary: { placeIds: [], sourceIds: [], places: [] },
      uploadedBefore: { items: [] },
      noPlaceFound: { sourceIds: [] },
      couldNotRead: { sourceIds: [], items: [] },
      stillReading: { sourceIds: [] },
      cancelled: { sourceIds: [] },
      ...partial.rows,
    },
  }
}

function show(uploads: InboxUploadBatch[], uploadId?: string) {
  return buildInboxScreen({
    uploads,
    toReviewPlaceIds: uploads.flatMap((upload) => upload.rows.toReview.placeIds),
    addedAnotherWay: [],
    now: NOW,
    uploadId,
  })
}

describe('inbox page model', () => {
  it('reviews one upload, and only the newest upload, without the whole inbox', () => {
    const older = batch({
      sessionId: 'session_older',
      uploadedAt: EARLIER,
      rows: {
        toReview: {
          placeIds: ['P1', 'P2'],
          sourceIds: ['src_old'],
          places: [place({ id: 'P1', name: 'Older one', status: 'inbox' }), place({ id: 'P2', name: 'Older two', status: 'inbox' })],
          checkCount: null,
        },
      },
    })
    const newest = batch({
      sessionId: 'session_newest',
      uploadedAt: '2026-10-23T18:00:00.000Z',
      rows: {
        toReview: {
          placeIds: ['P3'],
          sourceIds: ['src_new'],
          places: [place({ id: 'P3', name: 'Newest', status: 'inbox' })],
          checkCount: null,
        },
      },
    })
    render(<InboxScreen model={show([newest, older])} />)

    const whole = screen.getAllByRole('link', { name: 'Review 3 places' })
    expect(whole.length).toBeGreaterThan(0)
    for (const link of whole) {
      expect(link).toHaveAttribute('href', '/review')
    }
    const justNewest = screen.getAllByRole('link', { name: 'or just the newest upload (1)' })
    expect(justNewest.some((link) => link.closest('.fixed'))).toBe(true)
    for (const link of justNewest) {
      expect(link).toHaveAttribute('href', '/review?upload=session_newest')
    }
    expect(screen.getByRole('link', { name: 'Review 2' })).toHaveAttribute(
      'href',
      '/review?upload=session_older'
    )
    expect(screen.getByRole('link', { name: 'Review 1' })).toHaveAttribute(
      'href',
      '/review?upload=session_newest'
    )
  })

  it('starts an upload review at the first queued place and keeps a screenshot place', () => {
    const upload = batch({
      sessionId: 'session_two',
      uploadedAt: NOW.toISOString(),
      screenshots: [
        shot({ sourceId: 'src_old', createdPlaceIds: ['P1'] }),
        shot({ sourceId: 'src_new', createdPlaceIds: ['P2'] }),
      ],
      rows: {
        toReview: {
          placeIds: ['P1', 'P2'],
          sourceIds: ['src_old', 'src_new'],
          places: [
            place({ id: 'P1', name: 'Older', status: 'inbox', sourceIds: ['src_old'] }),
            place({ id: 'P2', name: 'Newer', status: 'inbox', sourceIds: ['src_new'] }),
          ],
          checkCount: null,
        },
      },
    })
    const home = render(<InboxScreen model={show([upload])} />)
    for (const link of screen.getAllByRole('link', { name: 'Review 2 places' })) {
      expect(link).toHaveAttribute('href', '/review')
    }
    expect(screen.getByRole('link', { name: 'Review 2' })).toHaveAttribute('href', '/review?upload=session_two')
    home.unmount()

    render(<InboxScreen model={show([upload], 'session_two')} />)
    expect(screen.getByRole('link', { name: 'Review 2 places' })).toHaveAttribute('href', '/review?upload=session_two')
    expect(screen.getAllByRole('link', { name: 'Review' }).map((link) => link.getAttribute('href')).sort()).toEqual([
      '/review?upload=session_two&placeId=P1',
      '/review?upload=session_two&placeId=P2',
    ])
  })

  it('opens places added another way on the one the queue ranks first', () => {
    render(
      <InboxScreen
        model={buildInboxScreen({
          uploads: [],
          toReviewPlaceIds: [],
          addedAnotherWay: [
            { id: 'H_new', name: 'Newer Cafe', createdAt: '2026-10-23T12:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
            { id: 'H_old', name: 'Older Cafe', createdAt: '2026-10-23T10:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
          ],
          now: NOW,
        })}
      />
    )
    expect(screen.getByText('Newer Cafe and Older Cafe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/review?placeId=H_old')
    for (const link of screen.getAllByRole('link', { name: 'Review 2 places' })) {
      expect(link).toHaveAttribute('href', '/review')
    }
  })

  it('opens same-time hand-added places on the smaller id, which the queue ranks first', () => {
    render(
      <InboxScreen
        model={buildInboxScreen({
          uploads: [],
          toReviewPlaceIds: [],
          addedAnotherWay: [
            { id: 'H_new', name: 'Newer Cafe', createdAt: '2026-10-23T12:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
            { id: 'H_a', name: 'Alpha Cafe', createdAt: '2026-10-23T10:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
            { id: 'H_b', name: 'Beta Cafe', createdAt: '2026-10-23T10:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
          ],
          now: NOW,
        })}
      />
    )
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/review?placeId=H_a')
  })

  it('opens a screenshot on the inbox place the queue ranks first', () => {
    const sameTime = '2026-10-23T12:00:00.000Z'
    const upload = batch({
      sessionId: 'session_shot',
      uploadedAt: NOW.toISOString(),
      screenshots: [
        shot({ sourceId: 'src_mix', createdPlaceIds: ['plc_new'], linkedPlaceIds: ['plc_old'] }),
        shot({ sourceId: 'src_tie', createdPlaceIds: ['plc_b'], linkedPlaceIds: ['plc_a'] }),
      ],
      rows: {
        toReview: {
          placeIds: ['plc_new', 'plc_old', 'plc_b', 'plc_a'],
          sourceIds: ['src_mix', 'src_tie'],
          places: [
            place({ id: 'plc_new', name: 'Created later', status: 'inbox', createdAt: '2026-10-23T12:00:02.000Z', sourceIds: ['src_mix'] }),
            place({ id: 'plc_old', name: 'Linked earlier', status: 'inbox', createdAt: '2026-10-23T10:00:01.000Z', sourceIds: ['src_mix'] }),
            place({ id: 'plc_b', name: 'Bee', status: 'inbox', createdAt: sameTime, sourceIds: ['src_tie'] }),
            place({ id: 'plc_a', name: 'Aye', status: 'inbox', createdAt: sameTime, sourceIds: ['src_tie'] }),
          ],
          checkCount: null,
        },
      },
    })
    render(<InboxScreen model={show([upload], 'session_shot')} />)
    expect(screen.getByRole('link', { name: 'Review 4 places' })).toHaveAttribute('href', '/review?upload=session_shot')
    expect(screen.getAllByRole('link', { name: 'Review' }).map((link) => link.getAttribute('href'))).toEqual([
      '/review?upload=session_shot&placeId=plc_old',
      '/review?upload=session_shot&placeId=plc_a',
    ])
  })

  it('opens added another way on the sourced place the queue ranks first', () => {
    render(
      <InboxScreen
        model={buildInboxScreen({
          uploads: [],
          toReviewPlaceIds: [],
          addedAnotherWay: [
            { id: 'P_src_b', name: 'Bee', createdAt: '2026-10-23T11:00:00.000Z', sourceCreatedAt: '2026-10-23T12:00:00.000Z', sourceId: 'src_b' },
            { id: 'P_src_a', name: 'Aye', createdAt: '2026-10-23T09:00:00.000Z', sourceCreatedAt: '2026-10-23T12:00:00.000Z', sourceId: 'src_a' },
            { id: 'H_old', name: 'Older Cafe', createdAt: '2026-10-23T08:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
          ],
          now: NOW,
        })}
      />
    )
    expect(screen.getByText('Bee, Aye and Older Cafe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/review?placeId=P_src_a')
  })

  it('offers the newest upload when hand-added places make the hero larger', () => {
    const upload = batch({
      sessionId: 'session_only',
      uploadedAt: NOW.toISOString(),
      rows: {
        toReview: {
          placeIds: ['P1', 'P2', 'P3'],
          sourceIds: ['src'],
          places: [
            place({ id: 'P1', name: 'One', status: 'inbox' }),
            place({ id: 'P2', name: 'Two', status: 'inbox' }),
            place({ id: 'P3', name: 'Three', status: 'inbox' }),
          ],
          checkCount: null,
        },
      },
    })
    render(
      <InboxScreen
        model={buildInboxScreen({
          uploads: [upload],
          toReviewPlaceIds: ['P1', 'P2', 'P3'],
          addedAnotherWay: [
            { id: 'H_new', name: 'Newer Cafe', createdAt: '2026-10-23T12:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
            { id: 'H_old', name: 'Older Cafe', createdAt: '2026-10-23T10:00:00.000Z', sourceCreatedAt: '', sourceId: '' },
          ],
          now: NOW,
        })}
      />
    )
    expect(screen.getByRole('heading', { name: '5 new places to review' })).toBeInTheDocument()
    const scoped = screen.getAllByRole('link', { name: 'or just the newest upload (3)' })
    expect(scoped.length).toBeGreaterThan(0)
    for (const link of scoped) {
      expect(link).toHaveAttribute('href', '/review?upload=session_only')
    }
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/review?placeId=H_old')
    for (const link of screen.getAllByRole('link', { name: 'Review 5 places' })) {
      expect(link).toHaveAttribute('href', '/review')
    }
  })

  it('names a skipped file by the day of the earlier upload and ignores a bad timestamp', () => {
    const sentence = formatUploadWhen(EARLIER, NOW).sentence
    const dated = batch({
      sessionId: 'session_skip',
      uploadedAt: '2026-10-23T12:00:00.000Z',
      rows: {
        uploadedBefore: {
          items: [{
            originalName: 'again.jpg',
            duplicateOfSourceId: 'src_old',
            duplicateOfSessionId: 'session_old',
            duplicateOfUploadedAt: EARLIER,
          }, {
            originalName: 'broken.jpg',
            duplicateOfSourceId: null,
            duplicateOfSessionId: null,
            duplicateOfUploadedAt: 'not-a-date',
          }],
        },
      },
    })
    render(<InboxScreen model={show([dated], 'session_skip')} />)
    expect(screen.getByText(`Uploaded before, in your ${sentence} upload · skipped`)).toBeInTheDocument()
    expect(screen.getByText('Uploaded before · skipped')).toBeInTheDocument()
  })

  it('uses a sentence for a skip from earlier today and keeps Today on the card title', () => {
    const earlierToday = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString()
    const when = formatUploadWhen(earlierToday, NOW)
    const upload = batch({
      sessionId: 'session_today',
      uploadedAt: NOW.toISOString(),
      screenshots: [shot({ sourceId: 'src_new', createdPlaceIds: ['p_new'] })],
      rows: {
        toReview: {
          placeIds: ['p_new'],
          sourceIds: ['src_new'],
          places: [place({ id: 'p_new', name: 'Still New', status: 'inbox' })],
          checkCount: null,
        },
        uploadedBefore: {
          items: [{
            originalName: 'again.jpg',
            duplicateOfSourceId: 'src_old',
            duplicateOfSessionId: 'session_old',
            duplicateOfUploadedAt: earlierToday,
          }],
        },
      },
    })
    const card = formatUploadWhen(NOW.toISOString(), NOW)
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    render(<InboxScreen model={show([upload])} />)
    expect(when.today).toBe(true)
    expect(when.sentence).toBeTruthy()
    expect(card.heading.startsWith('Today,')).toBe(true)
    expect(screen.getByRole('heading', { name: new RegExp(escapeRegExp(card.heading)) })).toBeInTheDocument()
    expect(screen.getByText(`again.jpg was already in your ${when.sentence} upload, so we skipped it.`)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`your ${escapeRegExp(when.heading)} upload`))).not.toBeInTheDocument()

    render(<InboxScreen model={show([upload], 'session_today')} />)
    expect(screen.getByRole('heading', { name: card.heading })).toBeInTheDocument()
    expect(screen.getByText(`Uploaded before, in your ${when.sentence} upload · skipped`)).toBeInTheDocument()
  })

  it('captions reading tiles from place status and counts skips, stalls, and cancellations', () => {
    const inboxPlace = place({ id: 'p_inbox', name: 'Still Inbox', status: 'inbox', sourceIds: ['src_link'] })
    const saved = place({ id: 'p_saved', name: 'Saved Place', status: 'library', sourceIds: ['src_saved'] })
    const archived = place({ id: 'p_arch', name: 'Not A Place', status: 'archived', sourceIds: ['src_arch'] })
    const reading = batch({
      sessionId: 'session_reading',
      uploadedAt: '2026-10-23T14:00:00.000Z',
      screenshotCount: 6,
      screenshots: [
        shot({ sourceId: 'src_link', linkedPlaceIds: ['p_inbox'] }),
        shot({ sourceId: 'src_saved', createdPlaceIds: ['p_saved'] }),
        shot({ sourceId: 'src_arch', createdPlaceIds: ['p_arch'] }),
        shot({ sourceId: 'src_stalled', outcome: 'couldNotRead', processingStatus: 'stalled' }),
        shot({ sourceId: 'src_cancelled', outcome: 'cancelled', processingStatus: 'cancelled' }),
        shot({ sourceId: 'src_wait', outcome: 'stillReading', processingStatus: 'queued' }),
      ],
      rows: {
        toReview: { placeIds: ['p_inbox'], sourceIds: ['src_link'], places: [inboxPlace], checkCount: null },
        added: { placeIds: ['p_saved'], sourceIds: ['src_saved'], places: [saved] },
        notAPlace: { placeIds: ['p_arch'], sourceIds: ['src_arch'], places: [archived] },
        uploadedBefore: {
          items: [{
            originalName: 'again.jpg',
            duplicateOfSourceId: null,
            duplicateOfSessionId: null,
            duplicateOfUploadedAt: null,
          }],
        },
        couldNotRead: {
          sourceIds: ['src_stalled'],
          items: [{ sourceId: 'src_stalled', status: 'stalled', error: 'hold' }],
        },
        stillReading: { sourceIds: ['src_wait'] },
        cancelled: { sourceIds: ['src_cancelled'] },
      },
    })
    render(<InboxScreen model={show([reading])} />)
    expect(screen.getByText('✓ 1 new place')).toBeInTheDocument()
    expect(screen.getByText('✓ 1 place added')).toBeInTheDocument()
    expect(screen.getByText('✓ 1 place set aside')).toBeInTheDocument()
    expect(screen.queryByText(/in Library/)).not.toBeInTheDocument()
    expect(screen.getByText('So far: 1 new place · 1 added · 1 not a place · 1 uploaded before · 1 still trying · 1 cancelled')).toBeInTheDocument()
  })

  it('counts a set-aside place in the reading footer when that is the only decision so far', () => {
    const archived = place({ id: 'p_arch', name: 'Not A Place', status: 'archived', sourceIds: ['src_arch'] })
    const reading = batch({
      sessionId: 'session_only_arch',
      uploadedAt: '2026-10-23T14:00:00.000Z',
      screenshots: [
        shot({ sourceId: 'src_arch', createdPlaceIds: ['p_arch'] }),
        shot({ sourceId: 'src_wait', outcome: 'stillReading', processingStatus: 'queued' }),
      ],
      rows: {
        notAPlace: { placeIds: ['p_arch'], sourceIds: ['src_arch'], places: [archived] },
        stillReading: { sourceIds: ['src_wait'] },
      },
    })
    render(<InboxScreen model={show([reading])} />)
    expect(screen.getByText('✓ 1 place set aside')).toBeInTheDocument()
    expect(screen.getByText('So far: 1 not a place')).toBeInTheDocument()
    expect(screen.queryByText('So far: still reading')).not.toBeInTheDocument()
  })

  it('counts a set-aside place on a screenshot that still has other places', () => {
    const still = place({ id: 'p_new', name: 'Still New', status: 'inbox', sourceIds: ['src_mix'] })
    const archived = place({ id: 'p_arch', name: 'Not A Place', status: 'archived', sourceIds: ['src_mix'] })
    const saved = place({ id: 'p_saved', name: 'Saved Here', status: 'library', sourceIds: ['src_saved'] })
    const archivedSaved = place({ id: 'p_arch_saved', name: 'Set Aside Too', status: 'archived', sourceIds: ['src_saved'] })
    const reading = batch({
      sessionId: 'session_mix_arch',
      uploadedAt: '2026-10-23T14:00:00.000Z',
      screenshots: [
        shot({ sourceId: 'src_mix', createdPlaceIds: ['p_new', 'p_arch'] }),
        shot({ sourceId: 'src_saved', createdPlaceIds: ['p_saved', 'p_arch_saved'] }),
        shot({ sourceId: 'src_wait', outcome: 'stillReading', processingStatus: 'queued' }),
      ],
      rows: {
        toReview: { placeIds: ['p_new'], sourceIds: ['src_mix'], places: [still], checkCount: null },
        added: { placeIds: ['p_saved'], sourceIds: ['src_saved'], places: [saved] },
        notAPlace: {
          placeIds: ['p_arch', 'p_arch_saved'],
          sourceIds: ['src_mix', 'src_saved'],
          places: [archived, archivedSaved],
        },
        stillReading: { sourceIds: ['src_wait'] },
      },
    })
    const home = render(<InboxScreen model={show([reading])} />)
    expect(screen.getByText('✓ 1 new place · 1 place set aside')).toBeInTheDocument()
    expect(screen.getByText('✓ 1 place added · 1 place set aside')).toBeInTheDocument()
    expect(screen.getByText('So far: 1 new place · 1 added · 2 not a place')).toBeInTheDocument()
    home.unmount()

    render(<InboxScreen model={show([reading], 'session_mix_arch')} />)
    expect(screen.getByText('1 new place to review · 1 place set aside as not a place')).toBeInTheDocument()
    expect(screen.getByText('1 place added to your Library · 1 place set aside as not a place')).toBeInTheDocument()
  })

  it('counts saved and matched places on a reading tile that still has a new place', () => {
    const still = place({ id: 'p_new', name: 'Still New', status: 'inbox', sourceIds: ['src_new'] })
    const saved = place({ id: 'p_saved', name: 'Saved Here', status: 'library', sourceIds: ['src_created', 'src_new'] })
    const matched = place({ id: 'p_match', name: 'Already Had', status: 'library', sourceIds: ['src_new'] })
    const reading = batch({
      sessionId: 'session_tile',
      uploadedAt: '2026-10-23T14:00:00.000Z',
      screenshots: [
        shot({ sourceId: 'src_created', createdPlaceIds: ['p_saved'] }),
        shot({ sourceId: 'src_new', createdPlaceIds: ['p_new'], linkedPlaceIds: ['p_saved', 'p_match'] }),
        shot({ sourceId: 'src_wait', outcome: 'stillReading', processingStatus: 'queued' }),
      ],
      rows: {
        toReview: { placeIds: ['p_new'], sourceIds: ['src_new'], places: [still], checkCount: null },
        added: { placeIds: ['p_saved'], sourceIds: ['src_created', 'src_new'], places: [saved] },
        alreadyInLibrary: { placeIds: ['p_match'], sourceIds: ['src_new'], places: [matched] },
        stillReading: { sourceIds: ['src_wait'] },
      },
    })
    render(<InboxScreen model={show([reading])} />)
    expect(screen.getByText('✓ 1 place added')).toBeInTheDocument()
    expect(screen.getByText('✓ 1 new place · 1 in Library · 1 place added')).toBeInTheDocument()
    expect(screen.queryByText('✓ 1 new place · 2 in Library')).not.toBeInTheDocument()
  })

  it('files a sibling link to a place this upload saved under Added', () => {
    const saved = place({ id: 'p_saved', name: 'Plaza', status: 'library', sourceIds: ['src_created', 'src_linked'] })
    const matched = place({ id: 'p_match', name: 'Pancake House', status: 'library', sourceIds: ['src_linked'] })
    const upload = batch({
      sessionId: 'session_sibling',
      uploadedAt: EARLIER,
      screenshots: [
        shot({ sourceId: 'src_created', createdPlaceIds: ['p_saved'] }),
        shot({ sourceId: 'src_linked', linkedPlaceIds: ['p_saved'] }),
        shot({ sourceId: 'src_both', linkedPlaceIds: ['p_saved', 'p_match'] }),
      ],
      rows: {
        added: { placeIds: ['p_saved'], sourceIds: ['src_created', 'src_linked', 'src_both'], places: [saved] },
        alreadyInLibrary: { placeIds: ['p_match'], sourceIds: ['src_both'], places: [matched] },
      },
    })
    render(<InboxScreen model={show([upload], 'session_sibling')} />)
    expect(screen.getByRole('button', { name: 'Added to your Library 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Matched your Library 1' })).toBeInTheDocument()
    expect(screen.getAllByText('1 place added to your Library')).toHaveLength(2)
    expect(screen.getByText('1 place added to your Library · 1 place already in your Library · this screenshot was added to them')).toBeInTheDocument()
    expect(screen.queryByText('1 place already in your Library · this screenshot was added to them')).not.toBeInTheDocument()
  })

  it('keeps Matched for linked library places and gives saved places their own chip', () => {
    const matched = place({ id: 'p_match', name: 'Pancake House', status: 'library', sourceIds: ['src_match'] })
    const saved = place({ id: 'p_saved', name: 'Plaza', status: 'library', sourceIds: ['src_saved'] })
    const upload = batch({
      sessionId: 'session_done',
      uploadedAt: EARLIER,
      screenshots: [
        shot({ sourceId: 'src_match', linkedPlaceIds: ['p_match'] }),
        shot({ sourceId: 'src_saved', createdPlaceIds: ['p_saved'] }),
      ],
      rows: {
        alreadyInLibrary: { placeIds: ['p_match'], sourceIds: ['src_match'], places: [matched] },
        added: { placeIds: ['p_saved'], sourceIds: ['src_saved'], places: [saved] },
      },
    })
    render(<InboxScreen model={show([upload], 'session_done')} />)
    expect(screen.getByRole('button', { name: 'Matched your Library 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Added to your Library 1' })).toBeInTheDocument()
    expect(screen.getByText('1 place already in your Library · this screenshot was added to them')).toBeInTheDocument()
    expect(screen.getByText('1 place added to your Library')).toBeInTheDocument()
  })

  it('counts a place saved from this upload apart from a library match', () => {
    const still = place({ id: 'p_new', name: 'Still New', status: 'inbox', sourceIds: ['src_partial'] })
    const saved = place({ id: 'p_saved', name: 'Saved Here', status: 'library', sourceIds: ['src_partial', 'src_both'] })
    const matched = place({ id: 'p_match', name: 'Already Had', status: 'library', sourceIds: ['src_both'] })
    const upload = batch({
      sessionId: 'session_mix',
      uploadedAt: EARLIER,
      screenshots: [
        shot({ sourceId: 'src_partial', createdPlaceIds: ['p_new', 'p_saved'] }),
        shot({ sourceId: 'src_both', createdPlaceIds: ['p_saved'], linkedPlaceIds: ['p_match'] }),
      ],
      rows: {
        toReview: { placeIds: ['p_new'], sourceIds: ['src_partial'], places: [still], checkCount: null },
        added: { placeIds: ['p_saved'], sourceIds: ['src_partial', 'src_both'], places: [saved] },
        alreadyInLibrary: { placeIds: ['p_match'], sourceIds: ['src_both'], places: [matched] },
      },
    })
    render(<InboxScreen model={show([upload], 'session_mix')} />)
    expect(screen.getByText('1 new place to review · 1 place added to your Library')).toBeInTheDocument()
    const mixed = '1 place added to your Library · 1 place already in your Library · this screenshot was added to them'
    expect(screen.getByText(mixed)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Added to your Library 1' }))
    expect(screen.getByText(mixed)).toBeInTheDocument()
    expect(screen.queryByText('Still New')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Matched your Library 1' }))
    expect(screen.getByText(mixed)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '✓ Saved Here' })).toBeInTheDocument()
    expect(screen.queryByText('Still New')).not.toBeInTheDocument()
  })

  it('says today on the caught-up library link only for an upload from today', () => {
    const saved = place({ id: 'p_saved', name: 'Plaza', status: 'library' })
    const older = batch({
      sessionId: 'session_old',
      uploadedAt: EARLIER,
      rows: { added: { placeIds: ['p_saved'], sourceIds: ['src'], places: [saved] } },
    })
    render(<InboxScreen model={show([older])} />)
    expect(screen.getByRole('link', { name: 'See these places in your Library' })).toHaveAttribute('href', '/library')
    expect(screen.queryByRole('link', { name: /today/i })).not.toBeInTheDocument()
  })

  it('formats an upload time with the browser clock', () => {
    const uploadedAt = '2026-10-12T15:00:00.000Z'
    const upload = batch({
      sessionId: 'session_old',
      uploadedAt,
      screenshots: [shot({ sourceId: 'src_old', outcome: 'noPlaceFound', processingStatus: 'completed' })],
    })
    render(
      <InboxPageClient
        uploads={[upload]}
        toReviewPlaceIds={[]}
        addedAnotherWay={[]}
        uploadId="session_old"
      />
    )
    expect(screen.getByRole('heading', { name: formatUploadWhen(uploadedAt, new Date()).heading })).toBeInTheDocument()
  })

  it('renders the inbox on the server without deciding today or the clock', () => {
    const upload = batch({
      sessionId: 'session_now',
      uploadedAt: new Date().toISOString(),
      screenshots: [shot({ sourceId: 'src', name: 'coro.jpg', createdPlaceIds: ['p1'] })],
      newPlaces: 1,
      placesRead: 1,
      rows: {
        toReview: {
          placeIds: ['p1'],
          sourceIds: ['src'],
          places: [place({ id: 'p1', name: 'Medanos de Coro', status: 'inbox' })],
          checkCount: null,
        },
      },
    })
    const html = renderToString(
      <InboxPageClient
        uploads={[upload]}
        toReviewPlaceIds={['p1']}
        addedAnotherWay={[]}
      />
    )
    expect(html).toContain('Medanos de Coro')
    expect(html).toContain('Review 1 place')
    expect(html).not.toContain('Today,')
    expect(html).not.toMatch(/\b\d{1,2}:\d{2}\b/)
  })
})
