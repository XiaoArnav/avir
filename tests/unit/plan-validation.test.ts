import { describe, it, expect } from 'vitest';
import {
  validatePlanRequestPayload,
  sanitizeUserHealthContext,
} from '@/services/ai/plan-validator';

describe('Step 16 — Secure AI Planning: Validation & Data Minimization', () => {
  describe('Input Payload Schema & Boundary Validation (B-012)', () => {
    it('validates a well-formed plan request payload', () => {
      const validPayload = {
        city: 'Bengaluru',
        coordinates: { lat: 12.9716, lng: 77.5946 },
        schedule: {
          id: 'sched-1',
          name: 'Urban Schedule',
          timezone: 'Asia/Kolkata',
          createdAt: '2026-11-23T00:00:00Z',
          updatedAt: '2026-11-23T00:00:00Z',
          activities: [
            {
              id: 'act-1',
              name: 'Morning Walk',
              startTime: '07:00',
              endTime: '08:00',
              durationMinutes: 60,
              intensity: 'moderate',
              environment: 'outdoor',
              isFlexible: true,
            },
          ],
        },
        generalizedSensitivity: 'sensitive',
      };

      const result = validatePlanRequestPayload(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing or empty city name', () => {
      const invalid = {
        city: '   ',
        coordinates: { lat: 12.97, lng: 77.59 },
      };
      const result = validatePlanRequestPayload(invalid as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('City name is required'))).toBe(true);
    });

    it('rejects out-of-bounds geographic coordinates', () => {
      const invalid = {
        city: 'Delhi',
        coordinates: { lat: 120.5, lng: 77.2 }, // Lat > 90
        schedule: { id: 's', name: 's', activities: [] },
      };
      const result = validatePlanRequestPayload(invalid as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Latitude'))).toBe(true);
    });

    it('rejects payload with excessive activity count (> 15) to prevent DoS', () => {
      const excessiveActivities = Array.from({ length: 20 }, (_, i) => ({
        id: `act-${i}`,
        name: `Activity ${i}`,
        startTime: '08:00',
        endTime: '09:00',
        durationMinutes: 60,
        intensity: 'light' as const,
        environment: 'indoor_clean' as const,
        isFlexible: false,
      }));

      const payload = {
        city: 'Delhi',
        coordinates: { lat: 28.61, lng: 77.21 },
        schedule: {
          id: 'large-sched',
          name: 'Large Schedule',
          timezone: 'UTC',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          activities: excessiveActivities,
        },
      };

      const result = validatePlanRequestPayload(payload as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds limit'))).toBe(true);
    });
  });

  describe('Data Minimization (B-011)', () => {
    it('sanitizes detailed clinical flags into generalized sensitivity tiers', () => {
      // Sensitive respiratory diagnosis
      const respiratoryProfile = {
        hasAsthmaOrRespiratory: true,
        hasCardiovascularCondition: false,
        isPregnant: false,
        ageGroup: 'adult' as const,
      };
      const tier1 = sanitizeUserHealthContext(respiratoryProfile);
      expect(tier1).toBe('sensitive');
      // No raw diagnosis names exposed in returned string!
      expect(tier1).not.toContain('Asthma');

      // High sensitivity (child + cardiovascular or pregnant)
      const highProfile = {
        hasAsthmaOrRespiratory: true,
        hasCardiovascularCondition: true,
        isPregnant: false,
        ageGroup: 'child' as const,
      };
      const tier2 = sanitizeUserHealthContext(highProfile);
      expect(tier2).toBe('highly_sensitive');

      // Standard adult profile
      const standardProfile = {
        hasAsthmaOrRespiratory: false,
        hasCardiovascularCondition: false,
        isPregnant: false,
        ageGroup: 'adult' as const,
      };
      const tier3 = sanitizeUserHealthContext(standardProfile);
      expect(tier3).toBe('standard');
    });
  });
});
