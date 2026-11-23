/**
/**
 * Avir Rate Limiting & Abuse Prevention Engine
 * Step 22: Abuse Control & In-Memory Sliding-Window Rate Limiter
 * 
 * Protects expensive compute routes (e.g. /api/ai/plan) against denial-of-service,
 * automated quota exhaustion, and unauthenticated brute force attacks.
 */

import { NextRequest } from 'next/server';

interface RateLimitRecord {
  timestamps: number[];
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export class SlidingWindowRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private windowMs: number;
  private maxRequests: number;

  constructor(maxRequests: number = 15, windowMs: number = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Evaluates the rate limit for a client identifier using a sliding window.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps outside the active sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const resetMs = Math.max(0, oldestInWindow + this.windowMs - now);
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetMs,
      };
    }

    // Allow request and record timestamp
    record.timestamps.push(now);

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - record.timestamps.length,
      resetMs: this.windowMs,
    };
  }

  /**
   * Resets rate limit records (useful for testing or administrative clear).
   */
  reset(): void {
    this.records.clear();
  }

  /**
   * Evicts expired records to prevent unbounded memory growth.
   */
  prune(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }
}

/**
 * Safely extracts client IP address from request headers without trusting spoofed values.
 * In production behind Vercel or cloud proxies:
 * - x-forwarded-for contains client IP as the first comma-separated token
 * - x-real-ip contains the direct connecting peer
 */
export function extractClientIp(req: NextRequest): string {
  // 1. Inspect x-forwarded-for
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map((ip) => ip.trim());
    if (ips[0] && isValidIp(ips[0])) {
      return ips[0];
    }
  }

  // 2. Inspect x-real-ip
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp && isValidIp(xRealIp.trim())) {
    return xRealIp.trim();
  }

  return 'anonymous-client';
}

/**
 * Simple IPv4 and IPv6 format validator to prevent injection in cache keys.
 */
function isValidIp(ip: string): boolean {
  // IPv4 basic check
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  // IPv6 basic check
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^[0-9a-fA-F:]+$/;

  return ipv4Regex.test(ip) || (ip.includes(':') && ipv6Regex.test(ip));
}

// Global default limiter for AI endpoint (15 requests per 60 seconds per IP)
export const aiPlanRateLimiter = new SlidingWindowRateLimiter(15, 60_000);
