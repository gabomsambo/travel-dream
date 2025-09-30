import { renderHook, act } from '@testing-library/react'
import { useVirtualGrid, useScrollPerformance, getOptimalVirtualizationSettings } from '../use-virtual-grid'

// Mock data for testing
const mockPlaces = Array.from({ length: 1000 }, (_, i) => ({
  id: `place-${i}`,
  name: `Place ${i}`,
  confidence: Math.random(),
  tags: i % 3 === 0 ? ['tag1', 'tag2', 'tag3'] : ['tag1'],
  notes: i % 5 === 0 ? 'This is a longer note that will affect height calculation' : null,
}))

// Mock window methods
const mockAddEventListener = jest.fn()
const mockRemoveEventListener = jest.fn()
const mockRequestAnimationFrame = jest.fn()
const mockCancelAnimationFrame = jest.fn()

Object.defineProperty(window, 'addEventListener', {
  value: mockAddEventListener,
})

Object.defineProperty(window, 'removeEventListener', {
  value: mockRemoveEventListener,
})

Object.defineProperty(window, 'requestAnimationFrame', {
  value: mockRequestAnimationFrame,
})

Object.defineProperty(window, 'cancelAnimationFrame', {
  value: mockCancelAnimationFrame,
})

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
  },
})

// Mock navigator for device detection
Object.defineProperty(navigator, 'hardwareConcurrency', {
  value: 4,
  configurable: true,
})

Object.defineProperty(navigator, 'deviceMemory', {
  value: 8,
  configurable: true,
})

describe('useVirtualGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset window size
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
    })
  })

  describe('Basic Functionality', () => {
    it('determines when virtualization should be enabled', () => {
      const { result } = renderHook(() =>
        useVirtualGrid(mockPlaces.slice(0, 100), { threshold: 200 })
      )

      expect(result.current.shouldVirtualize).toBe(false)

      const { result: result2 } = renderHook(() =>
        useVirtualGrid(mockPlaces, { threshold: 200 })
      )

      expect(result2.current.shouldVirtualize).toBe(true)
    })

    it('uses default configuration when none provided', () => {
      const { result } = renderHook(() => useVirtualGrid(mockPlaces.slice(0, 100)))

      expect(result.current.config.threshold).toBe(500)
      expect(result.current.config.containerHeight).toBe(600)
      expect(result.current.config.estimatedItemHeight).toBe(280)
      expect(result.current.config.overscan).toBe(5)
    })

    it('merges custom configuration with defaults', () => {
      const customConfig = {
        threshold: 100,
        containerHeight: 400,
      }

      const { result } = renderHook(() => useVirtualGrid(mockPlaces, customConfig))

      expect(result.current.config.threshold).toBe(100)
      expect(result.current.config.containerHeight).toBe(400)
      expect(result.current.config.estimatedItemHeight).toBe(280) // Default
      expect(result.current.config.overscan).toBe(5) // Default
    })
  })

  describe('Responsive Columns', () => {
    it('updates columns based on window width', () => {
      const { result } = renderHook(() => useVirtualGrid(mockPlaces))

      // Start with lg (1024px)
      expect(result.current.currentColumns).toBe(3)

      // Simulate resize to xl
      Object.defineProperty(window, 'innerWidth', {
        value: 1280,
        configurable: true,
      })

      act(() => {
        const resizeEvent = new Event('resize')
        window.dispatchEvent(resizeEvent)
      })

      expect(result.current.currentColumns).toBe(4)
    })

    it('handles mobile screen sizes', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 600,
        configurable: true,
      })

      const { result } = renderHook(() => useVirtualGrid(mockPlaces))

      expect(result.current.currentColumns).toBe(1)
    })

    it('uses custom column configuration', () => {
      const customColumns = {
        sm: 2,
        md: 3,
        lg: 4,
        xl: 5,
      }

      Object.defineProperty(window, 'innerWidth', {
        value: 1280,
        configurable: true,
      })

      const { result } = renderHook(() =>
        useVirtualGrid(mockPlaces, { columns: customColumns })
      )

      expect(result.current.currentColumns).toBe(5)
    })
  })

  describe('Performance Metrics', () => {
    it('calculates estimated total height', () => {
      const { result } = renderHook(() =>
        useVirtualGrid(mockPlaces.slice(0, 12), {
          estimatedItemHeight: 300,
        })
      )

      // 12 items, 3 columns = 4 rows, 300px each = 1200px
      expect(result.current.estimatedTotalHeight).toBe(1200)
    })

    it('tracks performance metrics when enabled', () => {
      const { result } = renderHook(() =>
        useVirtualGrid(mockPlaces, {
          enablePerformanceMonitoring: true,
        })
      )

      expect(result.current.performanceMetrics.totalItems).toBe(mockPlaces.length)
      expect(result.current.performanceMetrics.virtualizationEnabled).toBe(true)
    })

    it('provides performance suggestions', () => {
      const { result } = renderHook(() =>
        useVirtualGrid(mockPlaces.slice(0, 2000), {
          threshold: 500,
          enablePerformanceMonitoring: true,
        })
      )

      expect(result.current.performanceSuggestions.length).toBeGreaterThan(0)
    })
  })

  describe('Grid Props Generation', () => {
    it('generates virtual grid props correctly', () => {
      const { result } = renderHook(() =>
        useVirtualGrid(mockPlaces, {
          containerHeight: 500,
          estimatedItemHeight: 250,
          overscan: 3,
        })
      )

      const virtualProps = result.current.getVirtualGridProps()

      expect(virtualProps.places).toBe(mockPlaces)
      expect(virtualProps.containerHeight).toBe(500)
      expect(virtualProps.itemHeight).toBe(250)
      expect(virtualProps.overscan).toBe(3)
    })

    it('generates regular grid props correctly', () => {
      const { result } = renderHook(() => useVirtualGrid(mockPlaces))

      const regularProps = result.current.getRegularGridProps()

      expect(regularProps.places).toBe(mockPlaces)
    })
  })

  describe('Dynamic Updates', () => {
    it('updates when items change', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useVirtualGrid(items, { threshold: 200 }),
        { initialProps: { items: mockPlaces.slice(0, 100) } }
      )

      expect(result.current.shouldVirtualize).toBe(false)

      rerender({ items: mockPlaces })

      expect(result.current.shouldVirtualize).toBe(true)
    })

    it('recalculates metrics when configuration changes', () => {
      const { result, rerender } = renderHook(
        ({ config }) => useVirtualGrid(mockPlaces, config),
        {
          initialProps: {
            config: { estimatedItemHeight: 200 },
          },
        }
      )

      const initialHeight = result.current.estimatedTotalHeight

      rerender({ config: { estimatedItemHeight: 400 } })

      expect(result.current.estimatedTotalHeight).toBe(initialHeight * 2)
    })
  })
})

describe('useScrollPerformance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequestAnimationFrame.mockImplementation((callback) => {
      setTimeout(callback, 16) // Simulate 60fps
      return 1
    })
  })

  it('initializes with default metrics', () => {
    const { result } = renderHook(() => useScrollPerformance(true))

    expect(result.current.averageFrameTime).toBe(0)
    expect(result.current.scrollEvents).toBe(0)
    expect(result.current.droppedFrames).toBe(0)
    expect(result.current.isScrolling).toBe(false)
  })

  it('tracks scroll events', () => {
    const { result } = renderHook(() => useScrollPerformance(true))

    act(() => {
      const scrollEvent = new Event('scroll')
      window.dispatchEvent(scrollEvent)
    })

    expect(result.current.scrollEvents).toBe(1)
    expect(result.current.isScrolling).toBe(true)
  })

  it('detects when scrolling stops', (done) => {
    const { result } = renderHook(() => useScrollPerformance(true))

    act(() => {
      const scrollEvent = new Event('scroll')
      window.dispatchEvent(scrollEvent)
    })

    expect(result.current.isScrolling).toBe(true)

    // Wait for scrolling to stop
    setTimeout(() => {
      expect(result.current.isScrolling).toBe(false)
      done()
    }, 200)
  })

  it('does not track when disabled', () => {
    const { result } = renderHook(() => useScrollPerformance(false))

    act(() => {
      const scrollEvent = new Event('scroll')
      window.dispatchEvent(scrollEvent)
    })

    expect(result.current.scrollEvents).toBe(0)
  })

  it('cleans up event listeners on unmount', () => {
    const { unmount } = renderHook(() => useScrollPerformance(true))

    unmount()

    expect(mockRemoveEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    })
    expect(mockCancelAnimationFrame).toHaveBeenCalled()
  })
})

describe('getOptimalVirtualizationSettings', () => {
  beforeEach(() => {
    // Reset navigator properties
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      value: 4,
      configurable: true,
    })

    Object.defineProperty(navigator, 'deviceMemory', {
      value: 8,
      configurable: true,
    })

    Object.defineProperty(navigator, 'connection', {
      value: {
        effectiveType: '4g',
      },
      configurable: true,
    })
  })

  it('returns default settings for capable devices', () => {
    const settings = getOptimalVirtualizationSettings()

    expect(settings).toEqual({})
  })

  it('adjusts settings for low-end devices', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      value: 2,
      configurable: true,
    })

    Object.defineProperty(navigator, 'deviceMemory', {
      value: 2,
      configurable: true,
    })

    const settings = getOptimalVirtualizationSettings()

    expect(settings.threshold).toBe(200)
    expect(settings.overscan).toBe(3)
    expect(settings.estimatedItemHeight).toBe(250)
  })

  it('adjusts settings for slow connections', () => {
    Object.defineProperty(navigator, 'connection', {
      value: {
        effectiveType: 'slow-2g',
      },
      configurable: true,
    })

    const settings = getOptimalVirtualizationSettings()

    expect(settings.threshold).toBe(100)
  })

  it('handles missing navigator properties gracefully', () => {
    // Remove properties
    delete (navigator as any).hardwareConcurrency
    delete (navigator as any).deviceMemory
    delete (navigator as any).connection

    const settings = getOptimalVirtualizationSettings()

    expect(settings).toBeDefined()
  })

  it('handles server-side rendering', () => {
    // Mock server environment
    const originalWindow = window
    delete (global as any).window

    const settings = getOptimalVirtualizationSettings()

    expect(settings).toBeDefined()

    // Restore window
    ;(global as any).window = originalWindow
  })
})

describe('Edge Cases and Error Handling', () => {
  it('handles empty items array', () => {
    const { result } = renderHook(() => useVirtualGrid([]))

    expect(result.current.shouldVirtualize).toBe(false)
    expect(result.current.currentColumns).toBeGreaterThan(0)
    expect(result.current.estimatedTotalHeight).toBe(0)
  })

  it('handles very large item counts', () => {
    const largeItemSet = Array.from({ length: 100000 }, (_, i) => ({
      id: `item-${i}`,
    }))

    const { result } = renderHook(() =>
      useVirtualGrid(largeItemSet, { threshold: 1000 })
    )

    expect(result.current.shouldVirtualize).toBe(true)
    expect(result.current.performanceSuggestions.length).toBeGreaterThan(0)
  })

  it('handles extreme window sizes', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 100, // Very small
      configurable: true,
    })

    const { result } = renderHook(() => useVirtualGrid(mockPlaces))

    expect(result.current.currentColumns).toBe(1)

    Object.defineProperty(window, 'innerWidth', {
      value: 5000, // Very large
      configurable: true,
    })

    act(() => {
      const resizeEvent = new Event('resize')
      window.dispatchEvent(resizeEvent)
    })

    expect(result.current.currentColumns).toBe(4) // Should cap at xl columns
  })

  it('handles performance monitoring with zero items', () => {
    const { result } = renderHook(() =>
      useVirtualGrid([], { enablePerformanceMonitoring: true })
    )

    expect(result.current.performanceMetrics.totalItems).toBe(0)
    expect(result.current.performanceSuggestions).toEqual([])
  })
})