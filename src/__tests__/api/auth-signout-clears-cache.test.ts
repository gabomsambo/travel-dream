/**
 * @jest-environment node
 *
 * The Library's index sits in the browser's HTTP cache (`private, immutable`), so
 * signing out has to empty that cache; a shared browser must not hand the next
 * account the previous account's library.
 */
import { NextRequest } from 'next/server'

const handlerPost = jest.fn()
jest.mock('@/lib/auth', () => ({ handlers: { GET: jest.fn(), POST: (req: Request) => handlerPost(req) } }))

import { POST } from '@/app/api/auth/[...nextauth]/route'

const post = (path: string) => POST(new NextRequest(`http://localhost/api/auth/${path}`, { method: 'POST' }))

beforeEach(() => {
  handlerPost.mockReset()
  handlerPost.mockImplementation(async () => new Response(null, { status: 302 }))
})

describe('POST /api/auth/*', () => {
  it('empties the browser cache when signing out', async () => {
    const res = await post('signout')
    expect(res.headers.get('Clear-Site-Data')).toBe('"cache"')
    expect(res.status).toBe(302)
  })

  it('leaves every other auth call alone', async () => {
    for (const path of ['callback/credentials', 'signin/google', 'csrf']) {
      expect((await post(path)).headers.get('Clear-Site-Data')).toBeFalsy()
    }
  })
})
