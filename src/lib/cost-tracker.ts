import { Redis } from '@upstash/redis';
import { withErrorHandling } from './db-utils';

// Cost tracking interfaces
export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface CostRecord {
  id: string;
  sourceId: string;
  provider: string;
  model: string;
  tokens: TokenUsage;
  cost_usd: number;
  confidence_avg: number;
  places_extracted: number;
  processing_time_ms: number;
  timestamp: string;
  date: string; // YYYY-MM-DD format
}

export interface BudgetConfig {
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number; // Percentage (0-100)
  emergencyStopThreshold: number; // Percentage (0-100)
}

export interface CostTrackerConfig {
  budget: BudgetConfig;
  redis: {
    url: string;
    token: string;
  };
  retention: {
    dailyDataDays: number;
    monthlyDataMonths: number;
  };
  alerting: {
    enabled: boolean;
    webhookUrl?: string;
  };
}

export const DEFAULT_COST_TRACKER_CONFIG: CostTrackerConfig = {
  budget: {
    dailyLimit: parseFloat(process.env.LLM_DAILY_COST_LIMIT_USD || '10.0'),
    monthlyLimit: parseFloat(process.env.LLM_MONTHLY_COST_LIMIT_USD || '300.0'),
    warningThreshold: 80,
    emergencyStopThreshold: 95
  },
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
  },
  retention: {
    dailyDataDays: 90, // 3 months of daily data
    monthlyDataMonths: 24 // 2 years of monthly data
  },
  alerting: {
    enabled: false,
    webhookUrl: process.env.COST_ALERT_WEBHOOK_URL
  }
};

export interface DailyStats {
  date: string;
  total_cost: number;
  total_tokens: TokenUsage;
  total_sources: number;
  total_places: number;
  avg_confidence: number;
  providers: Record<string, {
    cost: number;
    tokens: TokenUsage;
    sources: number;
  }>;
  budget_remaining: number;
  budget_used_percentage: number;
}

export interface MonthlyStats {
  month: string; // YYYY-MM format
  total_cost: number;
  total_tokens: TokenUsage;
  total_sources: number;
  total_places: number;
  avg_confidence: number;
  daily_breakdown: DailyStats[];
  budget_remaining: number;
  budget_used_percentage: number;
}

export interface BudgetStatus {
  daily: {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
    status: 'safe' | 'warning' | 'critical' | 'exceeded';
  };
  monthly: {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
    status: 'safe' | 'warning' | 'critical' | 'exceeded';
  };
  emergency_stop_triggered: boolean;
}

export class CostTrackerService {
  private config: CostTrackerConfig;
  private redis: Redis | null;
  private isInitialized = false;
  private redisEnabled = false;

  constructor(config: CostTrackerConfig = DEFAULT_COST_TRACKER_CONFIG) {
    this.config = config;

    // Only initialize Redis if credentials are provided
    if (this.config.redis.url && this.config.redis.token) {
      try {
        this.redis = new Redis({
          url: this.config.redis.url,
          token: this.config.redis.token
        });
        this.redisEnabled = true;
      } catch (error) {
        console.warn('[CostTracker] Redis initialization skipped:', error instanceof Error ? error.message : 'Invalid configuration');
        this.redis = null;
        this.redisEnabled = false;
      }
    } else {
      console.warn('[CostTracker] Redis not configured - cost tracking will be in-memory only');
      this.redis = null;
      this.redisEnabled = false;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Validate Redis connection only if enabled
      if (this.redisEnabled && this.redis) {
        await this.redis!.ping();
        // Initialize daily and monthly buckets if needed
        await this.ensureBuckets();
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize cost tracker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Record a cost entry
  async recordCost(record: Omit<CostRecord, 'id' | 'timestamp' | 'date'>): Promise<void> {
    return withErrorHandling(async () => {
      await this.initialize();

      const now = new Date();
      const costRecord: CostRecord = {
        ...record,
        id: `cost_${now.getTime()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0]
      };

      const date = costRecord.date;
      const month = date.substring(0, 7); // YYYY-MM

      // Store individual record
      await this.redis!.setex(
        `cost:record:${costRecord.id}`,
        86400 * this.config.retention.dailyDataDays,
        JSON.stringify(costRecord)
      );

      // Update daily stats
      await this.updateDailyStats(date, costRecord);

      // Update monthly stats
      await this.updateMonthlyStats(month, costRecord);

      // Check budget limits and trigger alerts if necessary
      const budgetStatus = await this.getBudgetStatus();
      if (budgetStatus.daily.status === 'critical' || budgetStatus.monthly.status === 'critical') {
        await this.triggerAlert(budgetStatus, costRecord);
      }

    }, 'recordCost');
  }

  // Get current budget status
  async getBudgetStatus(): Promise<BudgetStatus> {
    return withErrorHandling(async () => {
      await this.initialize();

      const today = new Date().toISOString().split('T')[0];
      const thisMonth = today.substring(0, 7);

      const [dailyStats, monthlyStats] = await Promise.all([
        this.getDailyStats(today),
        this.getMonthlyStats(thisMonth)
      ]);

      const dailyUsed = dailyStats?.total_cost || 0;
      const monthlyUsed = monthlyStats?.total_cost || 0;

      const dailyPercentage = (dailyUsed / this.config.budget.dailyLimit) * 100;
      const monthlyPercentage = (monthlyUsed / this.config.budget.monthlyLimit) * 100;

      const getStatus = (percentage: number) => {
        if (percentage >= 100) return 'exceeded';
        if (percentage >= this.config.budget.emergencyStopThreshold) return 'critical';
        if (percentage >= this.config.budget.warningThreshold) return 'warning';
        return 'safe';
      };

      return {
        daily: {
          used: dailyUsed,
          limit: this.config.budget.dailyLimit,
          remaining: Math.max(0, this.config.budget.dailyLimit - dailyUsed),
          percentage: dailyPercentage,
          status: getStatus(dailyPercentage)
        },
        monthly: {
          used: monthlyUsed,
          limit: this.config.budget.monthlyLimit,
          remaining: Math.max(0, this.config.budget.monthlyLimit - monthlyUsed),
          percentage: monthlyPercentage,
          status: getStatus(monthlyPercentage)
        },
        emergency_stop_triggered: dailyPercentage >= this.config.budget.emergencyStopThreshold ||
                                  monthlyPercentage >= this.config.budget.emergencyStopThreshold
      };
    }, 'getBudgetStatus');
  }

  // Check if processing should be allowed based on budget
  async canProcessSource(estimatedCost: number): Promise<{ allowed: boolean; reason?: string }> {
    return withErrorHandling(async () => {
      const budgetStatus = await this.getBudgetStatus();

      if (budgetStatus.emergency_stop_triggered) {
        return {
          allowed: false,
          reason: 'Emergency stop triggered - budget threshold exceeded'
        };
      }

      if (budgetStatus.daily.remaining < estimatedCost) {
        return {
          allowed: false,
          reason: 'Daily budget insufficient for estimated cost'
        };
      }

      if (budgetStatus.monthly.remaining < estimatedCost) {
        return {
          allowed: false,
          reason: 'Monthly budget insufficient for estimated cost'
        };
      }

      return { allowed: true };
    }, 'canProcessSource');
  }

  // Get daily statistics
  async getDailyStats(date: string): Promise<DailyStats | null> {
    return withErrorHandling(async () => {
      await this.initialize();

      const statsKey = `cost:daily:${date}`;
      const data = await this.redis!.get(statsKey);

      if (!data) {
        return null;
      }

      return JSON.parse(data as string) as DailyStats;
    }, 'getDailyStats');
  }

  // Get monthly statistics
  async getMonthlyStats(month: string): Promise<MonthlyStats | null> {
    return withErrorHandling(async () => {
      await this.initialize();

      const statsKey = `cost:monthly:${month}`;
      const data = await this.redis!.get(statsKey);

      if (!data) {
        return null;
      }

      return JSON.parse(data as string) as MonthlyStats;
    }, 'getMonthlyStats');
  }

  // Get cost history for a date range
  async getCostHistory(startDate: string, endDate: string): Promise<DailyStats[]> {
    return withErrorHandling(async () => {
      await this.initialize();

      const start = new Date(startDate);
      const end = new Date(endDate);
      const days: DailyStats[] = [];

      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        const dayStats = await this.getDailyStats(dateStr);

        if (dayStats) {
          days.push(dayStats);
        } else {
          // Create empty stats for missing days
          days.push({
            date: dateStr,
            total_cost: 0,
            total_tokens: { input: 0, output: 0, total: 0 },
            total_sources: 0,
            total_places: 0,
            avg_confidence: 0,
            providers: {},
            budget_remaining: this.config.budget.dailyLimit,
            budget_used_percentage: 0
          });
        }
      }

      return days;
    }, 'getCostHistory');
  }

  // Get top expensive sources
  async getTopExpensiveSources(limit: number = 10): Promise<Array<CostRecord & { efficiency: number }>> {
    return withErrorHandling(async () => {
      await this.initialize();

      // Get recent cost records
      const keys = await this.redis!.keys('cost:record:*');
      const records: CostRecord[] = [];

      // Batch get records (in chunks to avoid memory issues)
      const CHUNK_SIZE = 100;
      for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
        const chunk = keys.slice(i, i + CHUNK_SIZE);
        const values = await this.redis!.mget(...chunk);

        values.forEach(value => {
          if (value) {
            records.push(JSON.parse(value as string));
          }
        });
      }

      // Calculate efficiency (places per dollar) and sort
      const enrichedRecords = records.map(record => ({
        ...record,
        efficiency: record.cost_usd > 0 ? record.places_extracted / record.cost_usd : 0
      }));

      return enrichedRecords
        .sort((a, b) => b.cost_usd - a.cost_usd)
        .slice(0, limit);
    }, 'getTopExpensiveSources');
  }

  // Update configuration
  updateConfig(newConfig: Partial<CostTrackerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Reinitialize Redis connection if Redis config changed
    if (newConfig.redis) {
      this.redis = new Redis({
        url: this.config.redis.url,
        token: this.config.redis.token
      });
      this.isInitialized = false;
    }
  }

  // Clean up old data based on retention policy
  async cleanup(): Promise<{ deletedRecords: number; deletedDays: number; deletedMonths: number }> {
    return withErrorHandling(async () => {
      await this.initialize();

      const now = new Date();
      const cutoffDate = new Date(now.getTime() - this.config.retention.dailyDataDays * 24 * 60 * 60 * 1000);
      const cutoffMonth = new Date(now.getTime() - this.config.retention.monthlyDataMonths * 30 * 24 * 60 * 60 * 1000);

      let deletedRecords = 0;
      let deletedDays = 0;
      let deletedMonths = 0;

      // Clean up old records
      const recordKeys = await this.redis!.keys('cost:record:*');
      for (const key of recordKeys) {
        const record = await this.redis!.get(key);
        if (record) {
          const parsed = JSON.parse(record as string) as CostRecord;
          if (new Date(parsed.date) < cutoffDate) {
            await this.redis!.del(key);
            deletedRecords++;
          }
        }
      }

      // Clean up old daily stats
      const dailyKeys = await this.redis!.keys('cost:daily:*');
      for (const key of dailyKeys) {
        const date = key.split(':')[2];
        if (new Date(date) < cutoffDate) {
          await this.redis!.del(key);
          deletedDays++;
        }
      }

      // Clean up old monthly stats
      const monthlyKeys = await this.redis!.keys('cost:monthly:*');
      for (const key of monthlyKeys) {
        const month = key.split(':')[2];
        const monthDate = new Date(month + '-01');
        if (monthDate < cutoffMonth) {
          await this.redis!.del(key);
          deletedMonths++;
        }
      }

      return { deletedRecords, deletedDays, deletedMonths };
    }, 'cleanup');
  }

  // Private helper methods
  private async ensureBuckets(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);

    // Ensure daily bucket exists
    const dailyExists = await this.redis!.exists(`cost:daily:${today}`);
    if (!dailyExists) {
      const emptyDaily: DailyStats = {
        date: today,
        total_cost: 0,
        total_tokens: { input: 0, output: 0, total: 0 },
        total_sources: 0,
        total_places: 0,
        avg_confidence: 0,
        providers: {},
        budget_remaining: this.config.budget.dailyLimit,
        budget_used_percentage: 0
      };
      await this.redis!.setex(`cost:daily:${today}`, 86400 * this.config.retention.dailyDataDays, JSON.stringify(emptyDaily));
    }

    // Ensure monthly bucket exists
    const monthlyExists = await this.redis!.exists(`cost:monthly:${thisMonth}`);
    if (!monthlyExists) {
      const emptyMonthly: MonthlyStats = {
        month: thisMonth,
        total_cost: 0,
        total_tokens: { input: 0, output: 0, total: 0 },
        total_sources: 0,
        total_places: 0,
        avg_confidence: 0,
        daily_breakdown: [],
        budget_remaining: this.config.budget.monthlyLimit,
        budget_used_percentage: 0
      };
      await this.redis!.setex(`cost:monthly:${thisMonth}`, 86400 * 30 * this.config.retention.monthlyDataMonths, JSON.stringify(emptyMonthly));
    }
  }

  private async updateDailyStats(date: string, record: CostRecord): Promise<void> {
    const key = `cost:daily:${date}`;
    let stats = await this.getDailyStats(date);

    if (!stats) {
      stats = {
        date,
        total_cost: 0,
        total_tokens: { input: 0, output: 0, total: 0 },
        total_sources: 0,
        total_places: 0,
        avg_confidence: 0,
        providers: {},
        budget_remaining: this.config.budget.dailyLimit,
        budget_used_percentage: 0
      };
    }

    // Update aggregates
    stats.total_cost += record.cost_usd;
    stats.total_tokens.input += record.tokens.input;
    stats.total_tokens.output += record.tokens.output;
    stats.total_tokens.total += record.tokens.total;
    stats.total_sources += 1;
    stats.total_places += record.places_extracted;

    // Update average confidence
    stats.avg_confidence = (stats.avg_confidence * (stats.total_sources - 1) + record.confidence_avg) / stats.total_sources;

    // Update provider stats
    if (!stats.providers[record.provider]) {
      stats.providers[record.provider] = {
        cost: 0,
        tokens: { input: 0, output: 0, total: 0 },
        sources: 0
      };
    }
    stats.providers[record.provider].cost += record.cost_usd;
    stats.providers[record.provider].tokens.input += record.tokens.input;
    stats.providers[record.provider].tokens.output += record.tokens.output;
    stats.providers[record.provider].tokens.total += record.tokens.total;
    stats.providers[record.provider].sources += 1;

    // Update budget info
    stats.budget_remaining = Math.max(0, this.config.budget.dailyLimit - stats.total_cost);
    stats.budget_used_percentage = (stats.total_cost / this.config.budget.dailyLimit) * 100;

    await this.redis!.setex(key, 86400 * this.config.retention.dailyDataDays, JSON.stringify(stats));
  }

  private async updateMonthlyStats(month: string, record: CostRecord): Promise<void> {
    const key = `cost:monthly:${month}`;
    let stats = await this.getMonthlyStats(month);

    if (!stats) {
      stats = {
        month,
        total_cost: 0,
        total_tokens: { input: 0, output: 0, total: 0 },
        total_sources: 0,
        total_places: 0,
        avg_confidence: 0,
        daily_breakdown: [],
        budget_remaining: this.config.budget.monthlyLimit,
        budget_used_percentage: 0
      };
    }

    // Update aggregates (same logic as daily)
    stats.total_cost += record.cost_usd;
    stats.total_tokens.input += record.tokens.input;
    stats.total_tokens.output += record.tokens.output;
    stats.total_tokens.total += record.tokens.total;
    stats.total_sources += 1;
    stats.total_places += record.places_extracted;
    stats.avg_confidence = (stats.avg_confidence * (stats.total_sources - 1) + record.confidence_avg) / stats.total_sources;

    // Update budget info
    stats.budget_remaining = Math.max(0, this.config.budget.monthlyLimit - stats.total_cost);
    stats.budget_used_percentage = (stats.total_cost / this.config.budget.monthlyLimit) * 100;

    await this.redis!.setex(key, 86400 * 30 * this.config.retention.monthlyDataMonths, JSON.stringify(stats));
  }

  private async triggerAlert(budgetStatus: BudgetStatus, record: CostRecord): Promise<void> {
    if (!this.config.alerting.enabled || !this.config.alerting.webhookUrl) {
      return;
    }

    try {
      const alertData = {
        type: 'budget_alert',
        timestamp: new Date().toISOString(),
        budget_status: budgetStatus,
        triggering_record: record,
        emergency_stop: budgetStatus.emergency_stop_triggered
      };

      const response = await fetch(this.config.alerting.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      });

      if (!response.ok) {
        console.error('Failed to send budget alert:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending budget alert:', error);
    }
  }
}

// Export singleton instance for shared use
export const costTrackerService = new CostTrackerService();