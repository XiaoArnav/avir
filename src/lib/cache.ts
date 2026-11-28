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
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      // Retain in cache for stale fallback, but return null for fresh requests
      this.misses++;
      return null;
    }

    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /**
   * Retrieves an entry even if expired, for graceful offline/error fallback.
   * Returns whether the entry is expired so the caller can mark it as 'stale'.
   */
  getStale(key: string): { value: T; isExpired: boolean; storedAt: number } | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const isExpired = Date.now() > entry.expiresAt;
    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return {
      value: entry.value,
      isExpired,
      storedAt: entry.storedAt,
    };
  }

  set(key: string, value: T, ttlMs: number): void {
    this.cache.delete(key);
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
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
    this.hits = 0;
    this.misses = 0;
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): { hits: number; misses: number; size: number; hitRatio: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRatio: total > 0 ? Math.round((this.hits / total) * 1000) / 1000 : 0,
    };
  }
}

// Global telemetry cache singleton
export const telemetryCache = new MemoryCache<object>(150);
