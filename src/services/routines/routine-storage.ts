/**
 * Avir Routine Storage Service
 * Step 11: Local Persistence, Schema Versioning & Privacy Data Deletion
 */

import { DailySchedule, validateDailySchedule } from '@/domain/routine-types';
import { createDefaultSchedule } from './routine-manager';

export const ROUTINE_STORAGE_KEY = 'AVIR_ROUTINE_STORAGE_V1';

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

/**
 * Safely saves a DailySchedule to localStorage with schema validation.
 * Handles SSR and storage quota errors gracefully.
 */
export function saveScheduleToStorage(schedule: DailySchedule): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  const validation = validateDailySchedule(schedule);
  if (!validation.isValid) {
    console.warn('Cannot persist invalid schedule:', validation.errors);
    return false;
  }

  try {
    const payload = JSON.stringify(schedule);
    storage.setItem(ROUTINE_STORAGE_KEY, payload);
    return true;
  } catch (error: any) {
    if (error?.name === 'QuotaExceededError') {
      console.error('LocalStorage quota exceeded while saving routine schedule.');
    } else {
      console.error('Failed to save schedule to localStorage:', error);
    }
    return false;
  }
}

/**
 * Loads the active DailySchedule from localStorage.
 * If missing, invalid, or corrupted, safely returns the default urban schedule.
 */
export function loadScheduleFromStorage(): DailySchedule {
  const storage = getStorage();
  if (!storage) {
    return createDefaultSchedule();
  }

  try {
    const raw = storage.getItem(ROUTINE_STORAGE_KEY);
    if (!raw) {
      const defaultSched = createDefaultSchedule();
      saveScheduleToStorage(defaultSched);
      return defaultSched;
    }

    const parsed = JSON.parse(raw);
    const validation = validateDailySchedule(parsed);
    if (!validation.isValid) {
      console.warn('Persisted schedule failed validation; resetting to default:', validation.errors);
      const defaultSched = createDefaultSchedule();
      saveScheduleToStorage(defaultSched);
      return defaultSched;
    }

    return parsed as DailySchedule;
  } catch (error) {
    console.warn('Corrupted schedule data in localStorage; falling back to default:', error);
    const defaultSched = createDefaultSchedule();
    saveScheduleToStorage(defaultSched);
    return defaultSched;
  }
}

/**
 * Resets the active schedule in localStorage to the default schedule.
 */
export function resetScheduleInStorage(): DailySchedule {
  const defaultSched = createDefaultSchedule();
  saveScheduleToStorage(defaultSched);
  return defaultSched;
}

/**
 * Completely purges all stored routine schedules from localStorage.
 */
export function clearAllRoutineStorage(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(ROUTINE_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear routine storage:', e);
    }
  }
}
