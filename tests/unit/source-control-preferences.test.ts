import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_SOURCE_PREFERENCE,
  loadSourcePreference,
  saveSourcePreference,
  resetSourcePreference,
  isValidSourcePreference,
} from '@/services/source-control/source-preferences';
import { SourcePreference } from '@/services/source-control/source-control-types';

describe('Avir Source Control — Preferences & Privacy Storage (Unit)', () => {
  const storageMap = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('1. returns default preference when localStorage is empty', () => {
    const pref = loadSourcePreference();
    expect(pref).toEqual(DEFAULT_SOURCE_PREFERENCE);
    expect(pref.mode).toBe('automatic');
    expect(pref.version).toBe(1);
    expect(pref.allowFallbackToModel).toBe(false);
  });

  it('2. successfully validates a compliant SourcePreference object', () => {
    const custom: SourcePreference = {
      version: 1,
      mode: 'official_ground',
      allowFallbackToModel: true,
      providerId: 'cpcb',
    };
    expect(isValidSourcePreference(custom)).toBe(true);
  });

  it('3. rejects invalid or malformed preference schemas', () => {
    expect(isValidSourcePreference(null)).toBe(false);
    expect(isValidSourcePreference({})).toBe(false);
    expect(isValidSourcePreference({ version: 2, mode: 'automatic' })).toBe(false);
    expect(isValidSourcePreference({ version: 1, mode: 'invalid_mode' })).toBe(false);
    expect(isValidSourcePreference({ version: 1, mode: 'specific_station', stationId: 123 })).toBe(false);
  });

  it('4. persists valid preference and reloads it accurately from localStorage', () => {
    const custom: SourcePreference = {
      version: 1,
      mode: 'openaq',
      allowFallbackToModel: true,
      providerId: 'openaq',
      stationId: 'loc-789',
      stationName: 'US Diplomatic Post: New Delhi',
    };

    saveSourcePreference(custom);
    const reloaded = loadSourcePreference();

    expect(reloaded).toEqual(custom);
    expect(reloaded.mode).toBe('openaq');
    expect(reloaded.stationName).toBe('US Diplomatic Post: New Delhi');
  });

  it('5. gracefully falls back to default if localStorage contains corrupted JSON', () => {
    mockStorage.setItem('avir_source_preference_v1', '{corrupt json invalid!!');
    const pref = loadSourcePreference();
    expect(pref).toEqual(DEFAULT_SOURCE_PREFERENCE);
  });

  it('6. gracefully falls back to default if localStorage contains an invalid mode', () => {
    mockStorage.setItem(
      'avir_source_preference_v1',
      JSON.stringify({ version: 1, mode: 'fabricated_super_sensor' })
    );
    const pref = loadSourcePreference();
    expect(pref).toEqual(DEFAULT_SOURCE_PREFERENCE);
  });

  it('7. resets preferences to automatic defaults and cleans localStorage upon reset', () => {
    saveSourcePreference({
      version: 1,
      mode: 'atmospheric_model',
      allowFallbackToModel: false,
    });

    const reset = resetSourcePreference();
    expect(reset).toEqual(DEFAULT_SOURCE_PREFERENCE);

    const reloaded = loadSourcePreference();
    expect(reloaded.mode).toBe('automatic');
  });

  it('8. strictly guarantees zero GPS storage in source preference (Privacy Guarantee)', () => {
    const custom: SourcePreference = {
      version: 1,
      mode: 'official_ground',
      allowFallbackToModel: true,
      stationId: 'delhi-anand-vihar',
      stationName: 'Anand Vihar CAAQMS',
    };

    saveSourcePreference(custom);

    const storedRaw = mockStorage.getItem('avir_source_preference_v1');
    expect(storedRaw).toBeTruthy();
    expect(storedRaw).not.toContain('latitude');
    expect(storedRaw).not.toContain('longitude');
    expect(storedRaw).not.toContain('coords');
    expect(storedRaw).not.toContain('gps');
  });
});
