/**
 * Source Preference Persistence Service
 * 
 * Manages client-side storage of user-selected environmental sources with
 * strict schema validation and privacy guarantees.
 * 
 * Strict Privacy Invariants:
 * - Never persist raw GPS coordinates.
 * - Never bundle user geolocation into source preference payload.
 * - Safely handle corrupted JSON and version upgrades.
 */

import { SourcePreference, SourceSelectionMode } from './source-control-types';

export const SOURCE_PREFERENCE_STORAGE_KEY = 'avir_source_preference_v1';

export const DEFAULT_SOURCE_PREFERENCE: SourcePreference = {
  version: 1,
  mode: 'automatic',
  allowFallbackToModel: false,
};

const VALID_MODES: Set<SourceSelectionMode> = new Set([
  'automatic',
  'official_ground',
  'openaq',
  'atmospheric_model',
  'specific_station',
]);

/**
 * Checks whether raw data satisfies the SourcePreference contract.
 */
export function isValidSourcePreference(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return false;
  const mode = obj.mode as SourceSelectionMode;
  if (!mode || !VALID_MODES.has(mode)) return false;
  if (obj.stationId !== undefined && typeof obj.stationId !== 'string') return false;
  if (obj.providerId !== undefined && typeof obj.providerId !== 'string') return false;
  return true;
}

/**
 * Validates and sanitizes a raw preference object against the version 1 schema.
 */
export function validateSourcePreference(raw: unknown): SourcePreference {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SOURCE_PREFERENCE };
  }

  const obj = raw as Record<string, unknown>;

  // Version must match 1
  if (obj.version !== 1) {
    return { ...DEFAULT_SOURCE_PREFERENCE };
  }

  // Mode must be a valid SourceSelectionMode
  const mode = obj.mode as SourceSelectionMode;
  if (!mode || !VALID_MODES.has(mode)) {
    return { ...DEFAULT_SOURCE_PREFERENCE };
  }

  const sanitized: SourcePreference = {
    version: 1,
    mode,
    allowFallbackToModel: Boolean(obj.allowFallbackToModel),
  };

  if (typeof obj.providerId === 'string' && obj.providerId.trim().length > 0) {
    sanitized.providerId = obj.providerId.trim().slice(0, 64);
  }

  if (typeof obj.stationId === 'string' && obj.stationId.trim().length > 0) {
    sanitized.stationId = obj.stationId.trim().slice(0, 128);
  }

  if (typeof obj.stationName === 'string' && obj.stationName.trim().length > 0) {
    sanitized.stationName = obj.stationName.trim().slice(0, 128);
  }

  return sanitized;
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

/**
 * Loads the active source preference from local storage.
 * Returns default automatic preference if unconfigured or running on server.
 */
export function loadSourcePreference(): SourcePreference {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_SOURCE_PREFERENCE };
  }

  try {
    const raw = storage.getItem(SOURCE_PREFERENCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOURCE_PREFERENCE };

    const parsed = JSON.parse(raw);
    return validateSourcePreference(parsed);
  } catch (err) {
    console.warn('[SourcePreferences] Failed to parse stored source preference, falling back to default:', err);
    return { ...DEFAULT_SOURCE_PREFERENCE };
  }
}

/**
 * Persists a validated source preference to local storage.
 */
export function saveSourcePreference(preference: SourcePreference): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const sanitized = validateSourcePreference(preference);
    // Explicit privacy strip: never persist coordinates or user location
    const persistentPayload: SourcePreference = {
      version: 1,
      mode: sanitized.mode,
      allowFallbackToModel: sanitized.allowFallbackToModel,
      providerId: sanitized.providerId,
      stationId: sanitized.stationId,
      stationName: sanitized.stationName,
    };
    storage.setItem(SOURCE_PREFERENCE_STORAGE_KEY, JSON.stringify(persistentPayload));
  } catch (err) {
    console.warn('[SourcePreferences] Failed to persist source preference to localStorage:', err);
  }
}

/**
 * Resets user source preference back to automatic mode.
 */
export function resetSourcePreference(): SourcePreference {
  const defaultPref = { ...DEFAULT_SOURCE_PREFERENCE };
  saveSourcePreference(defaultPref);
  return defaultPref;
}
