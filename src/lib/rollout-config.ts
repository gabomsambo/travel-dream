export interface RolloutConfig {
  enabled: boolean
  percentage: number
  startDate: string
  phases: RolloutPhase[]
}

export interface RolloutPhase {
  name: string
  percentage: number
  duration: number
  metrics: MetricThreshold[]
}

export interface MetricThreshold {
  name: string
  operator: 'lt' | 'gt'
  threshold: number
}

export const ROLLOUT_CONFIG: RolloutConfig = {
  enabled: true,
  percentage: 10,
  startDate: '2025-10-11',
  phases: [
    {
      name: 'Alpha',
      percentage: 10,
      duration: 2,
      metrics: [
        { name: 'errorRate', operator: 'lt', threshold: 0.01 },
        { name: 'p95LoadTime', operator: 'lt', threshold: 3000 }
      ]
    },
    {
      name: 'Beta',
      percentage: 25,
      duration: 3,
      metrics: [
        { name: 'errorRate', operator: 'lt', threshold: 0.01 },
        { name: 'adoptionRate', operator: 'gt', threshold: 0.5 }
      ]
    },
    {
      name: 'Gamma',
      percentage: 50,
      duration: 3,
      metrics: [
        { name: 'errorRate', operator: 'lt', threshold: 0.01 }
      ]
    },
    {
      name: 'Full Rollout',
      percentage: 100,
      duration: 0,
      metrics: []
    }
  ]
}

export function getCurrentPhase(percentage: number): RolloutPhase | null {
  const sortedPhases = [...ROLLOUT_CONFIG.phases].sort((a, b) => a.percentage - b.percentage)

  for (const phase of sortedPhases) {
    if (percentage <= phase.percentage) {
      return phase
    }
  }

  return sortedPhases[sortedPhases.length - 1] || null
}

export function getNextPhase(currentPercentage: number): RolloutPhase | null {
  const sortedPhases = [...ROLLOUT_CONFIG.phases].sort((a, b) => a.percentage - b.percentage)

  for (const phase of sortedPhases) {
    if (phase.percentage > currentPercentage) {
      return phase
    }
  }

  return null
}

export function validateMetrics(metrics: Record<string, number>, phase: RolloutPhase): {
  passed: boolean
  failures: string[]
} {
  const failures: string[] = []

  for (const threshold of phase.metrics) {
    const value = metrics[threshold.name]

    if (value === undefined) {
      failures.push(`Missing metric: ${threshold.name}`)
      continue
    }

    const passed = threshold.operator === 'lt'
      ? value < threshold.threshold
      : value > threshold.threshold

    if (!passed) {
      failures.push(
        `${threshold.name}: ${value} ${threshold.operator === 'lt' ? '>=' : '<='} ${threshold.threshold}`
      )
    }
  }

  return {
    passed: failures.length === 0,
    failures
  }
}
