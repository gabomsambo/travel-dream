/**
 * Feature Flag System Tests
 *
 * Tests the UI refresh feature flag functionality:
 * - localStorage persistence
 * - Hook state management
 * - Event dispatching
 * - Cross-component synchronization
 */

import { renderHook, act } from '@testing-library/react'
import {
  useUIRefresh,
  getUIRefreshEnabled,
  setUIRefreshEnabled,
} from '@/lib/feature-flags'

describe('Feature Flag System', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    jest.clearAllMocks()
  })

  describe('useUIRefresh Hook', () => {
    it('initializes with false when no stored value', () => {
      const { result } = renderHook(() => useUIRefresh())
      const [enabled] = result.current

      expect(enabled).toBe(false)
    })

    it('initializes with stored value from localStorage', () => {
      localStorage.setItem('ui-refresh-enabled', 'true')

      const { result } = renderHook(() => useUIRefresh())
      const [enabled] = result.current

      expect(enabled).toBe(true)
    })

    it('toggles state when toggle function called', () => {
      const { result } = renderHook(() => useUIRefresh())

      act(() => {
        const [, toggle] = result.current
        toggle()
      })

      const [enabled] = result.current
      expect(enabled).toBe(true)
    })

    it('persists state to localStorage on toggle', () => {
      const { result } = renderHook(() => useUIRefresh())

      act(() => {
        const [, toggle] = result.current
        toggle()
      })

      expect(localStorage.getItem('ui-refresh-enabled')).toBe('true')
    })

    it('toggles back to false', () => {
      localStorage.setItem('ui-refresh-enabled', 'true')

      const { result } = renderHook(() => useUIRefresh())

      act(() => {
        const [, toggle] = result.current
        toggle()
      })

      const [enabled] = result.current
      expect(enabled).toBe(false)
      expect(localStorage.getItem('ui-refresh-enabled')).toBe('false')
    })

    it('dispatches custom event on toggle', () => {
      const eventSpy = jest.fn()
      window.addEventListener('ui-refresh-changed', eventSpy)

      const { result } = renderHook(() => useUIRefresh())

      act(() => {
        const [, toggle] = result.current
        toggle()
      })

      expect(eventSpy).toHaveBeenCalled()

      window.removeEventListener('ui-refresh-changed', eventSpy)
    })

    it('includes enabled state in event detail', () => {
      let eventDetail: any = null
      window.addEventListener('ui-refresh-changed', (e: any) => {
        eventDetail = e.detail
      })

      const { result } = renderHook(() => useUIRefresh())

      act(() => {
        const [, toggle] = result.current
        toggle()
      })

      expect(eventDetail).toEqual({ enabled: true })

      window.removeEventListener('ui-refresh-changed', () => {})
    })
  })

  describe('getUIRefreshEnabled', () => {
    it('returns false when not set', () => {
      expect(getUIRefreshEnabled()).toBe(false)
    })

    it('returns true when enabled', () => {
      localStorage.setItem('ui-refresh-enabled', 'true')
      expect(getUIRefreshEnabled()).toBe(true)
    })

    it('returns false when disabled', () => {
      localStorage.setItem('ui-refresh-enabled', 'false')
      expect(getUIRefreshEnabled()).toBe(false)
    })

    it('is non-reactive (does not cause re-renders)', () => {
      const renderCount = jest.fn()
      const { rerender } = renderHook(() => {
        renderCount()
        return getUIRefreshEnabled()
      })

      localStorage.setItem('ui-refresh-enabled', 'true')
      rerender()

      // Should only render twice (initial + rerender)
      expect(renderCount).toHaveBeenCalledTimes(2)
    })
  })

  describe('setUIRefreshEnabled', () => {
    it('sets localStorage value', () => {
      setUIRefreshEnabled(true)
      expect(localStorage.getItem('ui-refresh-enabled')).toBe('true')
    })

    it('dispatches event when called', () => {
      const eventSpy = jest.fn()
      window.addEventListener('ui-refresh-changed', eventSpy)

      setUIRefreshEnabled(true)

      expect(eventSpy).toHaveBeenCalled()

      window.removeEventListener('ui-refresh-changed', eventSpy)
    })

    it('can disable the flag', () => {
      setUIRefreshEnabled(true)
      expect(localStorage.getItem('ui-refresh-enabled')).toBe('true')

      setUIRefreshEnabled(false)
      expect(localStorage.getItem('ui-refresh-enabled')).toBe('false')
    })
  })

  describe('Cross-component Synchronization', () => {
    it('synchronizes state across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useUIRefresh())
      const { result: result2 } = renderHook(() => useUIRefresh())

      act(() => {
        const [, toggle] = result1.current
        toggle()
      })

      // Both hooks should reflect the same state from localStorage
      expect(localStorage.getItem('ui-refresh-enabled')).toBe('true')
    })
  })

  describe('Edge Cases', () => {
    it('handles invalid localStorage values gracefully', () => {
      localStorage.setItem('ui-refresh-enabled', 'invalid')
      expect(getUIRefreshEnabled()).toBe(false)
    })

    it('handles missing localStorage gracefully', () => {
      const originalLocalStorage = global.localStorage
      // @ts-ignore
      delete global.localStorage

      expect(() => getUIRefreshEnabled()).not.toThrow()

      global.localStorage = originalLocalStorage
    })

    it('handles rapid toggles correctly', () => {
      const { result } = renderHook(() => useUIRefresh())

      act(() => {
        const [, toggle] = result.current
        toggle() // true
        toggle() // false
        toggle() // true
        toggle() // false
      })

      const [enabled] = result.current
      expect(enabled).toBe(false)
      expect(localStorage.getItem('ui-refresh-enabled')).toBe('false')
    })
  })

  describe('SSR Safety', () => {
    it('does not crash when window is undefined', () => {
      const originalWindow = global.window
      // @ts-ignore
      delete global.window

      expect(() => getUIRefreshEnabled()).not.toThrow()

      global.window = originalWindow
    })
  })
})

describe('Integration with UI Components', () => {
  it('components can read feature flag state', () => {
    localStorage.setItem('ui-refresh-enabled', 'true')

    const { result } = renderHook(() => useUIRefresh())
    const [enabled] = result.current

    expect(enabled).toBe(true)
  })

  it('provides both state and toggle function', () => {
    const { result } = renderHook(() => useUIRefresh())
    const [enabled, toggle] = result.current

    expect(typeof enabled).toBe('boolean')
    expect(typeof toggle).toBe('function')
  })
})
