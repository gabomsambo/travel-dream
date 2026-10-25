import * as React from 'react'
import { render } from '@testing-library/react'

/**
 * The Library's gallery mounts only the rows near the screen of its scroll box, the (app) shell's
 * <main>. jsdom has no layout, so that box measures 0 and the gallery shows one default screen.
 * A test that reads places spread over the whole page gives it a tall one instead.
 */
export function stubTallMain(height = 100_000) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return (this as HTMLElement).tagName === 'MAIN' ? height : 0
      },
    })
  })
  afterAll(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original)
    else delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight
  })
}

/** render() inside a <main>, the scroll box the gallery windows against; rerender() keeps it there. */
export function renderInMain(ui: React.ReactElement) {
  const view = render(<main>{ui}</main>)
  return { ...view, rerender: (next: React.ReactElement) => view.rerender(<main>{next}</main>) }
}
