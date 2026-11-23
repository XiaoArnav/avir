/**
 * Avir Saved City Comparisons Service
 * Provides versioned, bounded, client-side localStorage persistence for city pairs
 * with schema validation and safe recovery in restricted browser environments.
 */

export interface SavedCityRecord {
  name: string;
  country: string;
  countryCode?: string | null;
  latitude?: number;
  longitude?: number;
  aqi: number | null;
  pm25: number | null;
  timestamp?: string | null;
}

export interface SavedCityComparisonRecord {
  id: string;
  version: 1;
  savedAt: string; // ISO string
  cityA: SavedCityRecord;
  cityB: SavedCityRecord;
  ratio?: number | null;
  note?: string;
}

const STORAGE_KEY = 'avir:saved_comparisons:v1';
const MAX_SAVED_COMPARISONS = 10;

class SavedComparisonsService {
  /**
   * Safe check for browser localStorage availability.
   */
  isStorageAvailable(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      const testKey = '__avir_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves all valid saved comparisons from local storage.
   * Silently discards malformed or corrupted records.
   */
  getSavedComparisons(): SavedCityComparisonRecord[] {
    if (!this.isStorageAvailable()) return [];

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Validate schema for each entry
      const valid: SavedCityComparisonRecord[] = [];
      for (const item of parsed) {
        if (
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          item.version === 1 &&
          typeof item.savedAt === 'string' &&
          item.cityA &&
          typeof item.cityA.name === 'string' &&
          typeof item.cityA.country === 'string' &&
          item.cityB &&
          typeof item.cityB.name === 'string' &&
          typeof item.cityB.country === 'string'
        ) {
          valid.push(item as SavedCityComparisonRecord);
        }
      }

      return valid;
    } catch (err) {
      console.warn('Failed to parse saved city comparisons:', err);
      return [];
    }
  }

  /**
   * Saves a new comparison pair. Bounded to MAX_SAVED_COMPARISONS (FIFO eviction).
   */
  saveComparison(
    data: Omit<SavedCityComparisonRecord, 'id' | 'savedAt' | 'version'>
  ): { success: boolean; record?: SavedCityComparisonRecord; error?: string } {
    if (!this.isStorageAvailable()) {
      return { success: false, error: 'Local storage is unavailable or disabled in this browser context.' };
    }

    try {
      const current = this.getSavedComparisons();
      const record: SavedCityComparisonRecord = {
        ...data,
        id: `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        version: 1,
        savedAt: new Date().toISOString(),
      };

      // Deduplicate: If identical city pair already exists, update it to the top
      const filtered = current.filter(
        (c) =>
          !(
            (c.cityA.name.toLowerCase() === record.cityA.name.toLowerCase() &&
              c.cityB.name.toLowerCase() === record.cityB.name.toLowerCase()) ||
            (c.cityA.name.toLowerCase() === record.cityB.name.toLowerCase() &&
              c.cityB.name.toLowerCase() === record.cityA.name.toLowerCase())
          )
      );

      // Prepend newest and enforce bound limit
      const updated = [record, ...filtered].slice(0, MAX_SAVED_COMPARISONS);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      return { success: true, record };
    } catch (err: any) {
      console.warn('Failed to save city comparison:', err);
      return { success: false, error: err?.message || 'Storage error' };
    }
  }

  /**
   * Removes a saved comparison by ID.
   */
  removeSavedComparison(id: string): boolean {
    if (!this.isStorageAvailable()) return false;
    try {
      const current = this.getSavedComparisons();
      const filtered = current.filter((c) => c.id !== id);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clears all saved comparisons.
   */
  clearAllSavedComparisons(): void {
    if (!this.isStorageAvailable()) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

export const savedComparisonsService = new SavedComparisonsService();
