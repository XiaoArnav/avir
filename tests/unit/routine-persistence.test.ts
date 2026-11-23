import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveScheduleToStorage,
  loadScheduleFromStorage,
  resetScheduleInStorage,
  clearAllRoutineStorage,
  ROUTINE_STORAGE_KEY,
} from '@/services/routines/routine-storage';
import { createDefaultSchedule } from '@/services/routines/routine-manager';

describe('Step 11 — Routine Persistence & LocalStorage Safety', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    });
  });

  it('loads default schedule when storage is empty', () => {
    const loaded = loadScheduleFromStorage();
    expect(loaded).toBeDefined();
    expect(loaded.name).toBe('Default Urban Routine');
    expect(loaded.activities.length).toBeGreaterThan(0);
  });

  it('persists and retrieves updated schedule correctly', () => {
    const schedule = createDefaultSchedule();
    schedule.name = 'Custom My Schedule';
    const saved = saveScheduleToStorage(schedule);
    expect(saved).toBe(true);

    const retrieved = loadScheduleFromStorage();
    expect(retrieved.name).toBe('Custom My Schedule');
    expect(retrieved.activities).toHaveLength(schedule.activities.length);
  });

  it('handles corrupted storage data by falling back safely to default schedule', () => {
    mockStorage[ROUTINE_STORAGE_KEY] = 'INVALID_JSON_CORRUPTED{[';
    const loaded = loadScheduleFromStorage();
    expect(loaded).toBeDefined();
    expect(loaded.name).toBe('Default Urban Routine');
  });

  it('handles QuotaExceededError gracefully without crashing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    const schedule = createDefaultSchedule();
    const result = saveScheduleToStorage(schedule);
    expect(result).toBe(false);
    consoleSpy.mockRestore();
  });

  it('resets schedule to defaults and clears custom routine data', () => {
    const schedule = createDefaultSchedule();
    schedule.name = 'To be wiped';
    saveScheduleToStorage(schedule);

    const reset = resetScheduleInStorage();
    expect(reset.name).toBe('Default Urban Routine');

    clearAllRoutineStorage();
    expect(mockStorage[ROUTINE_STORAGE_KEY]).toBeUndefined();
  });
});
