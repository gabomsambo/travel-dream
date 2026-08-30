import {
  ACTIVITY_JOBS_STORAGE_KEY,
  formatActiveSummary,
  formatCompleteSummary,
  parsePersistedJobs,
  persistableJobs,
  toActivityJob,
} from '@/lib/activity-jobs'
import { emptyMassUploadCounts } from '@/lib/mass-upload/status-view'

const counts = {
  ...emptyMassUploadCounts,
  completed: 487,
  failed: 9,
  stalled: 4,
}

describe('activity job copy', () => {
  it('formats an in-flight mass-upload summary with ETA', () => {
    expect(
      formatActiveSummary({
        counts: { ...emptyMassUploadCounts, completed: 183, queued: 300, extracting: 17 },
        total: 500,
        placesCreated: 42,
        estimatedMinutesRemaining: 6,
      })
    ).toBe('Processing 183 of 500 · 42 places found · ~6 min')
  })

  it('formats a terminal summary with failed and retry counts', () => {
    expect(
      formatCompleteSummary({
        counts,
        placesCreated: 118,
      })
    ).toBe('487 processed · 9 failed · 4 need retry · 118 places found')
  })

  it('omits zero failed/retry buckets on a clean finish', () => {
    expect(
      formatCompleteSummary({
        counts: { ...emptyMassUploadCounts, completed: 500 },
        placesCreated: 1,
      })
    ).toBe('500 processed · 1 place found')
  })
})

describe('activity job persistence', () => {
  it('round-trips complete jobs and drops in-flight ones', () => {
    const complete = toActivityJob('ses_done', counts, 500, 118, null, true)
    const active = toActivityJob(
      'ses_live',
      { ...emptyMassUploadCounts, queued: 3, completed: 1 },
      4,
      1,
      2,
      false
    )
    expect(active.phase).toBe('active')
    expect(complete.phase).toBe('complete')

    const stored = persistableJobs([active, complete], 'user_a')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('ses_done')

    const revived = parsePersistedJobs(JSON.stringify(stored), 'user_a')
    expect(revived).toHaveLength(1)
    expect(revived[0].id).toBe('ses_done')
    expect(revived[0].phase).toBe('complete')
    expect(revived[0].summary).toContain('487 processed')
    expect(revived[0].announced).toBe(true)
  })

  it('ignores corrupt storage instead of throwing', () => {
    expect(parsePersistedJobs('not-json', 'user_a')).toEqual([])
    expect(parsePersistedJobs(JSON.stringify([{ id: 1 }]), 'user_a')).toEqual([])
  })

  it('does not revive another user\'s persisted jobs', () => {
    const stored = persistableJobs([toActivityJob('ses_done', counts, 500, 118, null, true)], 'user_a')
    expect(parsePersistedJobs(JSON.stringify(stored), 'user_b')).toEqual([])
  })

  it('uses a stable localStorage key', () => {
    expect(ACTIVITY_JOBS_STORAGE_KEY).toBe('td:activity-jobs:v1')
  })
})
