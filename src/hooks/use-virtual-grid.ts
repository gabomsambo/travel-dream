"use client"

import { useState, useEffect, useMemo } from 'react'

// Configuration for when to enable virtualization
export interface VirtualGridConfig {
  // Minimum number of items before virtualization kicks in
  threshold: number

  // Container height for virtual scrolling
  containerHeight: number

  // Estimated item height for calculations
  estimatedItemHeight: number

  // Number of items to render outside visible area
  overscan: number

  // Responsive column configuration
  columns: {
    sm: number
    md: number
    lg: number
    xl: number
  }

  // Performance monitoring
  enablePerformanceMonitoring: boolean
}

export const DEFAULT_VIRTUAL_GRID_CONFIG: VirtualGridConfig = {
  threshold: 500, // Enable virtualization for 500+ items
  containerHeight: 600, // 600px container height
  estimatedItemHeight: 280, // Estimated place card height
  overscan: 5, // Render 5 extra items outside viewport
  columns: {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4
  },
  enablePerformanceMonitoring: false
}

// Performance metrics for monitoring virtual grid performance
interface PerformanceMetrics {
  renderTime: number
  scrollPerformance: number
  memoryUsage: number
  itemsRendered: number
  totalItems: number
  virtualizationEnabled: boolean
  lastMeasurement: number
}

// Hook for managing virtual grid state and performance
export function useVirtualGrid<T>(
  items: T[],
  config: Partial<VirtualGridConfig> = {}
) {
  const finalConfig = { ...DEFAULT_VIRTUAL_GRID_CONFIG, ...config }

  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    scrollPerformance: 0,
    memoryUsage: 0,
    itemsRendered: 0,
    totalItems: items.length,
    virtualizationEnabled: items.length >= finalConfig.threshold,
    lastMeasurement: Date.now()
  })

  // Determine if virtualization should be enabled
  const shouldVirtualize = useMemo(() => {
    return items.length >= finalConfig.threshold
  }, [items.length, finalConfig.threshold])

  // Update performance metrics whenever items or virtualization state changes
  useEffect(() => {
    setPerformanceMetrics(prev => ({
      ...prev,
      totalItems: items.length,
      virtualizationEnabled: shouldVirtualize,
      lastMeasurement: Date.now()
    }))
  }, [items.length, shouldVirtualize])

  // Monitor detailed performance if enabled
  useEffect(() => {
    if (!finalConfig.enablePerformanceMonitoring) return

    const measurePerformance = () => {
      const renderStart = performance.now()

      // Simulate render measurement
      requestAnimationFrame(() => {
        const renderEnd = performance.now()
        const renderTime = renderEnd - renderStart

        // Memory usage estimation (rough approximation)
        const memoryEstimate = items.length * 0.5 // KB per item estimate

        setPerformanceMetrics(prev => ({
          ...prev,
          renderTime,
          memoryUsage: memoryEstimate
        }))
      })
    }

    measurePerformance()
  }, [items.length, finalConfig.enablePerformanceMonitoring])

  // Calculate responsive columns based on screen width
  const [currentColumns, setCurrentColumns] = useState(finalConfig.columns.lg)

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth
      if (width >= 1280) {
        setCurrentColumns(finalConfig.columns.xl)
      } else if (width >= 1024) {
        setCurrentColumns(finalConfig.columns.lg)
      } else if (width >= 768) {
        setCurrentColumns(finalConfig.columns.md)
      } else {
        setCurrentColumns(finalConfig.columns.sm)
      }
    }

    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [finalConfig.columns])

  // Calculate estimated total height for virtual scrolling
  const estimatedTotalHeight = useMemo(() => {
    const rows = Math.ceil(items.length / currentColumns)
    return rows * finalConfig.estimatedItemHeight
  }, [items.length, currentColumns, finalConfig.estimatedItemHeight])

  // Performance optimization suggestions
  const performanceSuggestions = useMemo(() => {
    const suggestions: string[] = []

    // Suggest virtualization for large datasets
    if (items.length > 1000 && !shouldVirtualize) {
      suggestions.push('Consider lowering virtualization threshold for better performance')
    }

    // Suggest performance monitoring for very large datasets
    if (items.length > 2000 && !finalConfig.enablePerformanceMonitoring) {
      suggestions.push('Enable performance monitoring for large datasets')
    }

    // Check render performance if monitoring is enabled
    if (finalConfig.enablePerformanceMonitoring && performanceMetrics.renderTime > 16) {
      suggestions.push('Render time is high, consider optimizing component rendering')
    }

    // Check memory usage if monitoring is enabled
    if (finalConfig.enablePerformanceMonitoring && performanceMetrics.memoryUsage > 10000) {
      suggestions.push('High memory usage detected, consider implementing data pagination')
    }

    // Suggest overscan adjustment for very large lists
    if (items.length > 5000 && finalConfig.overscan > 3) {
      suggestions.push('Consider reducing overscan for very large lists')
    }

    return suggestions
  }, [items.length, shouldVirtualize, performanceMetrics, finalConfig])

  return {
    // Configuration
    config: finalConfig,

    // State
    shouldVirtualize,
    currentColumns,
    estimatedTotalHeight,

    // Performance
    performanceMetrics,
    performanceSuggestions,

    // Utilities
    getVirtualGridProps: () => ({
      places: items,
      containerHeight: finalConfig.containerHeight,
      itemHeight: finalConfig.estimatedItemHeight,
      overscan: finalConfig.overscan,
      columnsConfig: finalConfig.columns
    }),

    getRegularGridProps: () => ({
      places: items
    })
  }
}

// Hook for monitoring scroll performance
export function useScrollPerformance(enabled = false) {
  const [metrics, setMetrics] = useState({
    averageFrameTime: 0,
    scrollEvents: 0,
    droppedFrames: 0,
    isScrolling: false
  })

  useEffect(() => {
    if (!enabled) return

    let animationFrameId: number
    let lastScrollTime = 0
    let scrollEventCount = 0
    let frameStartTime = 0
    let totalFrameTime = 0
    let frameCount = 0

    const handleScroll = () => {
      const now = Date.now()
      lastScrollTime = now
      scrollEventCount++

      setMetrics(prev => ({
        ...prev,
        scrollEvents: scrollEventCount,
        isScrolling: true
      }))

      // Stop scrolling detection after 150ms of no scroll events
      setTimeout(() => {
        if (Date.now() - lastScrollTime >= 150) {
          setMetrics(prev => ({
            ...prev,
            isScrolling: false
          }))
        }
      }, 150)
    }

    const measureFramePerformance = () => {
      if (frameStartTime > 0) {
        const frameTime = performance.now() - frameStartTime
        totalFrameTime += frameTime
        frameCount++

        if (frameTime > 16.67) { // Dropped frame (60fps = 16.67ms per frame)
          setMetrics(prev => ({
            ...prev,
            droppedFrames: prev.droppedFrames + 1
          }))
        }

        setMetrics(prev => ({
          ...prev,
          averageFrameTime: totalFrameTime / frameCount
        }))
      }

      frameStartTime = performance.now()
      animationFrameId = requestAnimationFrame(measureFramePerformance)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    animationFrameId = requestAnimationFrame(measureFramePerformance)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(animationFrameId)
    }
  }, [enabled])

  return metrics
}

// Utility to determine optimal virtualization settings based on device
export function getOptimalVirtualizationSettings(): Partial<VirtualGridConfig> {
  if (typeof window === 'undefined') {
    return DEFAULT_VIRTUAL_GRID_CONFIG
  }

  // Detect device capabilities
  const isLowEndDevice = navigator.hardwareConcurrency <= 2
  const isSlowConnection = 'connection' in navigator &&
    (navigator as any).connection?.effectiveType === 'slow-2g'
  const hasLimitedMemory = 'deviceMemory' in navigator &&
    (navigator as any).deviceMemory <= 4

  // Adjust settings based on device capabilities
  const settings: Partial<VirtualGridConfig> = {}

  if (isLowEndDevice || hasLimitedMemory) {
    settings.threshold = 200 // Lower threshold for weaker devices
    settings.overscan = 3    // Fewer overscan items
    settings.estimatedItemHeight = 250 // Smaller items
  }

  if (isSlowConnection) {
    settings.threshold = 100 // Even lower threshold for slow connections
  }

  return settings
}