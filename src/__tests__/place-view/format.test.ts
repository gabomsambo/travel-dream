import {
  confidenceLabel,
  describeSource,
  displayUrl,
  formatDateOnly,
  formatDateTime,
  formatSavedDate,
  formatTime,
  linkLabel,
  safeExternalUrl,
  summarizeHours,
} from '@/lib/place-view/format'

describe('formatDateOnly', () => {
  it('formats a calendar day without shifting it across time zones', () => {
    // new Date('2026-11-18') is UTC midnight, which renders as Nov 17 west of Greenwich.
    expect(formatDateOnly('2026-11-18')).toBe('Wed, Nov 18, 2026')
    expect(formatDateOnly('2026-11-18', { weekday: false, year: false })).toBe('Nov 18')
  })

  it('passes through values it cannot parse and ignores empty ones', () => {
    expect(formatDateOnly('next spring')).toBe('next spring')
    expect(formatDateOnly(null)).toBeNull()
    expect(formatDateOnly('')).toBeNull()
  })
})

describe('formatSavedDate / formatTime', () => {
  it('reads timestamps as UTC calendar dates', () => {
    expect(formatSavedDate('2024-04-14T23:30:00.000Z')).toBe('Apr 14, 2024')
    expect(formatSavedDate('not a date')).toBeNull()
  })

  it('renders 24h times as 12h', () => {
    expect(formatTime('05:30')).toBe('5:30 AM')
    expect(formatTime('00:00')).toBe('12:00 AM')
    expect(formatTime('17:05')).toBe('5:05 PM')
    expect(formatTime('sunset')).toBe('sunset')
  })
})

describe('formatDateTime', () => {
  it('renders a labelled UTC date-time that cannot shift across time zones', () => {
    expect(formatDateTime('2026-09-30T10:00:00.000Z')).toBe('September 30, 2026, 10:00 AM UTC')
    expect(formatDateTime('2026-09-30T23:30:00.000Z')).toBe('September 30, 2026, 11:30 PM UTC')
    expect(formatDateTime('2026-01-01T00:05:00.000Z')).toBe('January 1, 2026, 12:05 AM UTC')
    expect(formatDateTime('not a date')).toBeNull()
    expect(formatDateTime(null)).toBeNull()
  })
})

describe('summarizeHours', () => {
  const week = (value: string) =>
    Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, value]))

  it('says "Open 24 hours" for 00:00-23:59 every day', () => {
    expect(summarizeHours(week('00:00-23:59'))?.summary).toBe('Open 24 hours, every day')
  })

  it('groups consecutive days that share hours', () => {
    const hours = { ...week('09:00-17:00'), saturday: 'closed', sunday: 'closed' }
    const summary = summarizeHours(hours)
    expect(summary?.summary).toBe('Mon–Fri 9:00 AM–5:00 PM · Sat–Sun Closed')
    expect(summary?.days).toHaveLength(7)
  })

  it('accepts a closed-days list and capitalised day keys', () => {
    const summary = summarizeHours({ Monday: '10:00-14:00', closed: ['sunday'] })
    expect(summary?.summary).toBe('Mon 10:00 AM–2:00 PM · Sun Closed')
  })

  it('returns null when there is nothing to show', () => {
    expect(summarizeHours(null)).toBeNull()
    expect(summarizeHours({})).toBeNull()
  })
})

describe('links and URLs', () => {
  it('prefers the stored title and falls back to the hostname', () => {
    expect(linkLabel({ url: 'https://www.japan-guide.com/e/e3915.html', title: 'japan-guide: Fushimi Inari' })).toEqual({
      title: 'japan-guide: Fushimi Inari',
      domain: 'japan-guide.com',
    })
    expect(linkLabel({ url: 'https://inari.jp/en/', title: null })).toEqual({ title: 'inari.jp', domain: 'inari.jp' })
  })

  it('only turns http(s) values into hrefs', () => {
    expect(safeExternalUrl('https://inari.jp/en/')).toBe('https://inari.jp/en/')
    expect(safeExternalUrl('inari.jp/en')).toBe('https://inari.jp/en')
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,hi')).toBeNull()
    expect(safeExternalUrl('  ')).toBeNull()
  })

  it('shortens URLs for display', () => {
    expect(displayUrl('https://www.inari.jp/en/')).toBe('inari.jp/en')
  })
})

describe('describeSource', () => {
  it('names the platform and lists author, date and file', () => {
    const d = describeSource({
      type: 'screenshot',
      createdAt: '2024-04-14T09:00:00.000Z',
      meta: { platform: 'instagram', author: '@wanderwithmaya', filename: 'IMG_4412.PNG' },
    })
    expect(d.title).toBe('Instagram screenshot')
    expect(d.detail).toEqual(['@wanderwithmaya', 'Apr 14, 2024', 'IMG_4412.PNG'])
    expect(d.url).toBeNull()
  })

  it('falls back to the type and the URL host', () => {
    const d = describeSource({ type: 'url', createdAt: '2024-05-01T09:00:00.000Z', meta: { url: 'https://www.japan-guide.com/e/e3915.html' } })
    expect(d.title).toBe('Web page')
    expect(d.detail).toEqual(['japan-guide.com', 'May 1, 2024'])
    expect(d.url).toBe('https://www.japan-guide.com/e/e3915.html')
  })
})

describe('confidenceLabel', () => {
  it('keeps the record card thresholds', () => {
    expect(confidenceLabel(0.94)).toEqual({ label: 'High (94%)', tone: 'high' })
    expect(confidenceLabel(0.85).tone).toBe('medium')
    expect(confidenceLabel(0.62)).toEqual({ label: 'Low (62%)', tone: 'low' })
    expect(confidenceLabel(0.3).tone).toBe('very-low')
    expect(confidenceLabel(null)).toEqual({ label: 'Unknown', tone: 'unknown' })
  })
})
