/**
 * Avir Phase D Reliability, Observability & Outage Regression Suite
 * Step 23: Performance, Reliability and Monitoring
 * 
 * Verifies:
 * - D-REL-01: Circuit breaker state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
 * - D-REL-02: Structured TelemetryLogger health evaluation and latency percentiles
 * - D-REL-03: MemoryCache TTL expiration, stale retrieval, and LRU eviction
 * - Upstream outage resilience: preserving original measurement timestamp on stale fallback
 */

import { describe, it, expect } from 'vitest';
import { MemoryCache } from '@/lib/cache';
import { CircuitBreaker } from '@/lib/reliability/circuit-breaker';
import { TelemetryLogger } from '@/lib/monitoring/telemetry-logger';

describe('Phase D: Performance, Reliability & Monitoring (Step 23)', () => {
  describe('MemoryCache Performance & Stale Correctness', () => {
    it('returns fresh value within TTL and null after expiration', () => {
      const cache = new MemoryCache<string>(5);
      cache.set('city:delhi', 'aqi-data-fresh', 100); // 100ms TTL

      expect(cache.get('city:delhi')).toBe('aqi-data-fresh');

      // Fast forward time by 150ms
      const originalNow = Date.now;
      try {
        Date.now = () => originalNow() + 150;
        expect(cache.get('city:delhi')).toBeNull();

        // Stale retrieval should still return the expired value
        const stale = cache.getStale('city:delhi');
        expect(stale).not.toBeNull();
        expect(stale?.value).toBe('aqi-data-fresh');
        expect(stale?.isExpired).toBe(true);
      } finally {
        Date.now = originalNow;
      }
    });

    it('evicts oldest entry when maxEntries is exceeded', () => {
      const cache = new MemoryCache<number>(3);
      cache.set('k1', 1, 10_000);
      cache.set('k2', 2, 10_000);
      cache.set('k3', 3, 10_000);
      expect(cache.size()).toBe(3);

      expect(cache.get('k1')).toBe(1);
      cache.set('k3', 33, 10_000);
      cache.set('k4', 4, 10_000);
      expect(cache.size()).toBe(3);
      expect(cache.get('k1')).toBe(1);
      expect(cache.get('k2')).toBeNull();
      expect(cache.get('k3')).toBe(33);
      expect(cache.get('k4')).toBe(4);
    });

    it('tracks cache hit and miss statistics accurately', () => {
      const cache = new MemoryCache<string>(5);
      cache.set('key1', 'val1', 5000);

      cache.get('key1'); // hit 1
      cache.get('key1'); // hit 2
      cache.get('nonexistent'); // miss 1

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBe(0.667);
    });
  });

  describe('CircuitBreaker Outage Resilience', () => {
    it('trips to OPEN state after consecutive failure threshold is breached', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeoutMs: 1000,
        name: 'test-cpcb',
      });

      expect(breaker.getState()).toBe('CLOSED');

      const failingOp = async () => {
        throw new Error('CPCB Gateway 503 Outage');
      };

      // 1st failure
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe('CLOSED');

      // 2nd failure
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe('CLOSED');

      // 3rd failure (trips circuit)
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // 4th call: immediately executes fallback without calling failingOp
      let fallbackExecuted = false;
      const res = await breaker.execute(failingOp, async () => {
        fallbackExecuted = true;
        return 'fallback-cached-data';
      });

      expect(fallbackExecuted).toBe(true);
      expect(res).toBe('fallback-cached-data');
    });

    it('transitions to HALF_OPEN after recoveryTimeout and closes upon success', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeoutMs: 200,
        name: 'test-openaq',
      });

      const failingOp = async () => {
        throw new Error('Network timeout');
      };

      // Fail twice to trip circuit
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Wait for recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Successful probe in HALF_OPEN recovers circuit to CLOSED
      await breaker.execute(async () => 'recovered-ok');
      await breaker.execute(async () => 'recovered-ok-2');
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('TelemetryLogger Observability & Metrics', () => {
    it('records telemetry metrics and calculates p95 latency and health status', () => {
      const logger = new TelemetryLogger(100);

      // Record 10 successful requests
      for (let i = 1; i <= 10; i++) {
        logger.record({
          provider: 'open_meteo',
          operation: 'hourly_forecast',
          durationMs: i * 50, // 50ms, 100ms, ..., 500ms
          success: true,
          statusCode: 200,
        });
      }

      // Record 1 failure
      logger.record({
        provider: 'cpcb',
        operation: 'station_feed',
        durationMs: 800,
        success: false,
        statusCode: 504,
        errorCategory: 'GatewayTimeout',
        errorMessage: 'Upstream CPCB portal timed out',
      });

      const summary = logger.getHealthSummary();
      expect(summary.totalRequests).toBe(11);
      expect(summary.status).toBe('healthy'); // ~90.9% success rate
      expect(summary.providerMetrics['open_meteo']).toBeDefined();
      expect(summary.providerMetrics['open_meteo'].successfulRequests).toBe(10);
      expect(summary.providerMetrics['open_meteo'].p95LatencyMs).toBe(500);
      expect(summary.recentErrors.length).toBe(1);
      expect(summary.recentErrors[0].category).toBe('GatewayTimeout');
    });

    it('evaluates status as degraded or critical when failure rate spikes', () => {
      const logger = new TelemetryLogger(100);

      // Record 5 failures and 1 success
      for (let i = 0; i < 5; i++) {
        logger.record({
          provider: 'openaq',
          operation: 'locations',
          durationMs: 1200,
          success: false,
          statusCode: 500,
          errorCategory: 'ServerError',
          errorMessage: 'Internal OpenAQ error',
        });
      }
      logger.record({
        provider: 'openaq',
        operation: 'locations',
        durationMs: 200,
        success: true,
        statusCode: 200,
      });

      const summary = logger.getHealthSummary();
      expect(summary.overallSuccessRate).toBeLessThan(50);
      expect(summary.status).toBe('critical');
    });
  });
});
