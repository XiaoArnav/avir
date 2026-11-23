/**
 * Avir Indoor Air Quality Service
 * Step 15: Indoor Air-Cleaning Studio & Physics Calculations
 * 
 * Replaces hardcoded CADR guarantees (B-006), static 2023 pricing (B-007),
 * and misleading medical terminology (B-008) with transparent physical models.
 */

import {
  AirCleanerSpec,
  CFM_TO_M3_PER_HOUR,
  IaqCostBreakdown,
} from '@/domain/indoor-air-types';

export const DIY_PURIFIER_PRESETS: AirCleanerSpec[] = [
  {
    id: 'cr-box-4-filter',
    name: '4-Filter Corsi-Rosenthal Box',
    cadrCfm: 450,
    cadrM3PerHour: Math.round(450 * CFM_TO_M3_PER_HOUR * 10) / 10,
    powerWatts: 55,
    noiseDb: 52,
    isDiy: true,
    filterType: 'MERV13',
    description: 'Standard 4-sided cube design with 20" box fan, cardboard shroud, and MERV 13 pleated filters.',
  },
  {
    id: 'cr-box-5-filter',
    name: '5-Filter Corsi-Rosenthal Box',
    cadrCfm: 520,
    cadrM3PerHour: Math.round(520 * CFM_TO_M3_PER_HOUR * 10) / 10,
    powerWatts: 55,
    noiseDb: 50,
    isDiy: true,
    filterType: 'MERV13',
    description: '5-sided design with bottom filter elevation stand, reducing filter face velocity and noise.',
  },
  {
    id: 'single-filter-diy',
    name: 'Single-Filter Fan Attachment',
    cadrCfm: 280,
    cadrM3PerHour: Math.round(280 * CFM_TO_M3_PER_HOUR * 10) / 10,
    powerWatts: 45,
    noiseDb: 54,
    isDiy: true,
    filterType: 'MERV13',
    description: 'Budget build strapping a single 20x20" MERV 13 filter to the intake side of a 20" box fan.',
  },
  {
    id: 'commercial-hepa-medium',
    name: 'Commercial HEPA Purifier (Medium Room)',
    cadrCfm: 250,
    cadrM3PerHour: Math.round(250 * CFM_TO_M3_PER_HOUR * 10) / 10,
    powerWatts: 40,
    noiseDb: 48,
    isDiy: false,
    filterType: 'HEPA',
    description: 'Typical commercial cylindrical or flat-panel HEPA air purifier for bedrooms.',
  },
  {
    id: 'commercial-hepa-large',
    name: 'Commercial HEPA Purifier (Large Room)',
    cadrCfm: 400,
    cadrM3PerHour: Math.round(400 * CFM_TO_M3_PER_HOUR * 10) / 10,
    powerWatts: 65,
    noiseDb: 56,
    isDiy: false,
    filterType: 'HEPA',
    description: 'Heavy-duty commercial residential unit designed for open floor plans.',
  },
];

export const DEFAULT_IAQ_COST_BASELINE: IaqCostBreakdown = {
  boxFanCost: 1500,
  filtersCost: 1600, // ~₹400 x 4 MERV 13 filters
  shroudTapeCost: 350,
  totalDiyCost: 3450,
  commercialPurifierComparisonCost: 14000,
  currency: 'INR',
  lastUpdated: 'November 2026',
  isUserOverridden: false,
};

/**
 * Computes the bill of materials for DIY air cleaner builds, allowing complete user cost customization.
 */
export function calculateDiyPurifierBillOfMaterials(
  presetId: string,
  customCosts?: Partial<IaqCostBreakdown>
): IaqCostBreakdown {
  const isCustom = customCosts !== undefined && Object.keys(customCosts).length > 0;

  // Multiplier for filter quantity depending on preset
  let filterCount = 4;
  if (presetId === 'cr-box-5-filter') filterCount = 5;
  if (presetId === 'single-filter-diy') filterCount = 1;

  const defaultFiltersCost = filterCount * 400;

  const boxFanCost = customCosts?.boxFanCost ?? DEFAULT_IAQ_COST_BASELINE.boxFanCost;
  const filtersCost = customCosts?.filtersCost ?? defaultFiltersCost;
  const shroudTapeCost = customCosts?.shroudTapeCost ?? DEFAULT_IAQ_COST_BASELINE.shroudTapeCost;
  const commercialPurifierComparisonCost =
    customCosts?.commercialPurifierComparisonCost ??
    DEFAULT_IAQ_COST_BASELINE.commercialPurifierComparisonCost;

  const totalDiyCost = boxFanCost + filtersCost + shroudTapeCost;

  return {
    boxFanCost,
    filtersCost,
    shroudTapeCost,
    totalDiyCost,
    commercialPurifierComparisonCost,
    currency: customCosts?.currency || 'INR',
    lastUpdated: isCustom ? 'Custom User Inputs' : DEFAULT_IAQ_COST_BASELINE.lastUpdated,
    isUserOverridden: isCustom,
  };
}
