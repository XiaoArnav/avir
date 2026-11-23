/**
 * Avir Telemetry Observability & Health Monitoring Logger
 * Step 23: Observability, Latency Metrics & Upstream Outage Tracking
 * 
 * Records structured performance telemetry across upstream data providers
 * (Open-Meteo, OpenAQ, CPCB, Google Gemini) and provides aggregated health metrics.
 */

export interface TelemetryLogEntry {
  timestamp: string;
  provider: string;
  operation: string;
  durationMs: number;
  success: boolean;
  statusCode?: number;
  errorCategory?: string;
  errorMessage?: string;
}

export interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  successRatePercent: number;
}

export interface TelemetryHealthSummary {
  status: 'healthy' | 'degraded' | 'critical';
  totalRequests: number;
  overallSuccessRate: number;
  averageLatencyMs: number;
  providerMetrics: Record<string, ProviderMetrics>;
  recentErrors: Array<{
    timestamp: string;
    provider: string;
    category: string;
    message: string;
  }>;
}

export class TelemetryLogger {
  private logs: TelemetryLogEntry[] = [];
  private maxLogs: number;

  constructor(maxLogs: number = 500) {
    this.maxLogs = maxLogs;
  }

  /**
   * Records an API or telemetry operation outcome.
   */
  record(entry: Omit<TelemetryLogEntry, 'timestamp'>): void {
    if (this.logs.length >= this.maxLogs) {
      this.logs.shift(); // Evict oldest log entry
    }

    this.logs.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Helper to measure and record an async operation.
   */
  async track<T>(
    provider: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      this.record({
        provider,
        operation,
        durationMs,
        success: true,
        statusCode: 200,
      });
      return result;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      this.record({
        provider,
        operation,
        durationMs,
        success: false,
        statusCode: err?.status || 500,
        errorCategory: err?.name || 'UpstreamError',
        errorMessage: err?.message || 'Unknown upstream failure',
      });
      throw err;
    }
  }

  /**
   * Computes an aggregate health and performance summary.
   */
  getHealthSummary(): TelemetryHealthSummary {
    if (this.logs.length === 0) {
      return {
        status: 'healthy',
        totalRequests: 0,
        overallSuccessRate: 100,
        averageLatencyMs: 0,
        providerMetrics: {},
        recentErrors: [],
      };
    }

    const byProvider: Record<string, TelemetryLogEntry[]> = {};
    for (const log of this.logs) {
      if (!byProvider[log.provider]) {
        byProvider[log.provider] = [];
      }
      byProvider[log.provider].push(log);
    }

    const providerMetrics: Record<string, ProviderMetrics> = {};
    let totalSuccess = 0;
    let totalDuration = 0;

    for (const [provider, entries] of Object.entries(byProvider)) {
      const successful = entries.filter((e) => e.success);
      const failed = entries.filter((e) => !e.success);
      const durations = entries.map((e) => e.durationMs).sort((a, b) => a - b);

      const avg = Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
      const p95Idx = Math.floor(durations.length * 0.95);
      const p95 = durations[p95Idx] ?? durations[durations.length - 1];

      totalSuccess += successful.length;
      totalDuration += entries.reduce((sum, d) => sum + d.durationMs, 0);

      providerMetrics[provider] = {
        totalRequests: entries.length,
        successfulRequests: successful.length,
        failedRequests: failed.length,
        averageLatencyMs: avg,
        p95LatencyMs: p95,
        successRatePercent: Math.round((successful.length / entries.length) * 1000) / 10,
      };
    }

    const overallSuccessRate = Math.round((totalSuccess / this.logs.length) * 1000) / 10;
    const overallAvgLatency = Math.round(totalDuration / this.logs.length);

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (overallSuccessRate < 60) {
      status = 'critical';
    } else if (overallSuccessRate < 90 || overallAvgLatency > 3000) {
      status = 'degraded';
    }

    const recentErrors = this.logs
      .filter((e) => !e.success)
      .slice(-10)
      .map((e) => ({
        timestamp: e.timestamp,
        provider: e.provider,
        category: e.errorCategory || 'Error',
        message: e.errorMessage || 'Unknown error',
      }));

    return {
      status,
      totalRequests: this.logs.length,
      overallSuccessRate,
      averageLatencyMs: overallAvgLatency,
      providerMetrics,
      recentErrors,
    };
  }

  /**
   * Resets internal logs (useful for test isolation).
   */
  clear(): void {
    this.logs = [];
  }
}

// Global telemetry logger singleton
export const telemetryLogger = new TelemetryLogger(500);
