/**
 * In-Memory LRU Cache with TTL & Stale-While-Revalidate Support
 * Provides sub-millisecond retrieval and prevents redundant API roundtrips.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

export class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      // Retain in cache for stale fallback, but return null for fresh requests
      return null;
    }

    return entry.value;
  }

  /**
   * Retrieves an entry even if expired, for graceful offline/error fallback.
   * Returns whether the entry is expired so the caller can mark it as 'stale'.
   */
  getStale(key: string): { value: T; isExpired: boolean; storedAt: number } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    return {
      value: entry.value,
      isExpired: Date.now() > entry.expiresAt,
      storedAt: entry.storedAt,
    };
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      storedAt: Date.now(),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global telemetry cache singleton
export const telemetryCache = new MemoryCache<any>(150);
