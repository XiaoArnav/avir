/**
 * Avir Resilient Circuit Breaker
 * Step 23: Upstream Outage Handling & Circuit Breakers
 * 
 * Protects Avir from cascading failures during external upstream provider outages
 * (Open-Meteo, OpenAQ, CPCB, Google Gemini).
 * Transitions between CLOSED, OPEN, and HALF_OPEN states to ensure fast failure
 * and graceful fallback to stale cache without blocking execution threads.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;     // Consecutive failures before opening (default 4)
  recoveryTimeoutMs?: number;    // Milliseconds in OPEN state before trying HALF_OPEN (default 20,000)
  name?: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  public readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 4;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 20_000;
    this.name = options.name ?? 'default-circuit';
  }

  getState(): CircuitState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  /**
   * Executes an asynchronous operation through the circuit breaker.
   * If the circuit is OPEN, immediately executes the fallback without calling fn.
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T> | T): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      if (fallback) {
        return await fallback();
      }
      throw new Error(`CircuitBreaker[${this.name}] is OPEN. Upstream requests temporarily paused.`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (fallback) {
        return await fallback();
      }
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    } else {
      this.state = 'CLOSED';
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.successCount = 0;
    }
  }

  /**
   * Manually resets the circuit breaker to CLOSED state.
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  getMetrics() {
    return {
      name: this.name,
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
