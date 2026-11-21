/**
 * Avir Advanced Atmospheric & Exposure Domain Logic
 * Mathematical models for Diurnal Forecasts, City Shootouts, Commute Doses,
 * Filter Lifespan, Wind Vectors, School Advisories, and Social Bulletins.
 */

import { HourlyAtmosphericPoint } from './types';

// ---------------------------------------------------------------------------
// 1. DIURNAL SAFE HOURS FORECAST LOGIC
// ---------------------------------------------------------------------------

export interface DiurnalWindowAnalysis {
  bestVentingWindow: {
    startHour: number;
    endHour: number;
    averageAqi: number;
    averageBlh: number;
    recommendation: string;
  };
  worstInversionWindow: {
    startHour: number;
    endHour: number;
    averageAqi: number;
    averageBlh: number;
    warning: string;
  };
  hourlyPoints: HourlyAtmosphericPoint[];
}

export function analyzeDiurnalWindows(
  hourlyPoints: HourlyAtmosphericPoint[]
): DiurnalWindowAnalysis {
  if (!hourlyPoints || hourlyPoints.length === 0) {
    return {
      bestVentingWindow: {
        startHour: 12,
        endHour: 16,
        averageAqi: 120,
        averageBlh: 850,
        recommendation: 'Optimal solar boundary layer expansion. Open windows briefly for fresh air exchange.',
      },
      worstInversionWindow: {
        startHour: 5,
        endHour: 9,
        averageAqi: 280,
        averageBlh: 150,
        warning: 'Nighttime thermal radiation cooling creates a shallow atmospheric lid trapping particulate matter.',
      },
      hourlyPoints: [],
    };
  }

  // Afternoon solar window typically 12:00 to 16:00
  const daytimeSlice = hourlyPoints.filter((p) => p.hour >= 11 && p.hour <= 16);
  const nightMorningSlice = hourlyPoints.filter(
    (p) => (p.hour >= 4 && p.hour <= 9) || p.hour >= 21
  );

  const avgDayAqi = daytimeSlice.length
    ? Math.round(daytimeSlice.reduce((s, p) => s + p.usAqi, 0) / daytimeSlice.length)
    : 120;
  const avgDayBlh = daytimeSlice.length
    ? Math.round(daytimeSlice.reduce((s, p) => s + p.boundaryLayerHeight, 0) / daytimeSlice.length)
    : 850;

  const avgNightAqi = nightMorningSlice.length
    ? Math.round(nightMorningSlice.reduce((s, p) => s + p.usAqi, 0) / nightMorningSlice.length)
    : 280;
  const avgNightBlh = nightMorningSlice.length
    ? Math.round(nightMorningSlice.reduce((s, p) => s + p.boundaryLayerHeight, 0) / nightMorningSlice.length)
    : 150;

  return {
    bestVentingWindow: {
      startHour: 12,
      endHour: 16,
      averageAqi: avgDayAqi,
      averageBlh: avgDayBlh,
      recommendation:
        avgDayAqi <= 150
          ? 'Solar boundary ceiling at peak height (~' + avgDayBlh + 'm). Safest window for errands, ventilation, and outdoor workouts.'
          : 'Particulate density drops during peak solar heating. Limit outdoor activities to moderate intensity.',
    },
    worstInversionWindow: {
      startHour: 5,
      endHour: 9,
      averageAqi: avgNightAqi,
      averageBlh: avgNightBlh,
      warning:
        'Active thermal inversion lid at ~' + avgNightBlh + 'm trapping vehicle and biomass exhaust at human breathing height.',
    },
    hourlyPoints,
  };
}

// ---------------------------------------------------------------------------
// 2. CITY VS. CITY SHOOTOUT COMPARATOR
// ---------------------------------------------------------------------------

export interface CityComparisonResult {
  cityA: { name: string; country: string; aqi: number; pm25: number; cigarettes: number };
  cityB: { name: string; country: string; aqi: number; pm25: number; cigarettes: number };
  toxicityMultiplier: number;
  dirtierCityName: string;
  cleanerCityName: string;
  cigaretteDifferential: number;
  verdict: string;
}

export function calculateCityComparison(
  cityA: { name: string; country: string; aqi: number; pm25: number },
  cityB: { name: string; country: string; aqi: number; pm25: number }
): CityComparisonResult {
  const cigA = Math.round((cityA.pm25 / 22) * 10) / 10;
  const cigB = Math.round((cityB.pm25 / 22) * 10) / 10;

  const higher = cityA.aqi >= cityB.aqi ? cityA : cityB;
  const lower = cityA.aqi >= cityB.aqi ? cityB : cityA;

  const minAqi = Math.max(1, lower.aqi);
  const multiplier = Math.round((higher.aqi / minAqi) * 10) / 10;
  const cigDiff = Math.abs(Math.round((cigA - cigB) * 10) / 10);

  let verdict = '';
  if (multiplier <= 1.15) {
    verdict = `${cityA.name} and ${cityB.name} currently share comparable atmospheric quality levels.`;
  } else {
    verdict = `${higher.name}'s ambient air is ${multiplier}× more polluted than ${lower.name}, exposing residents to an extra ~${cigDiff} cigarettes per day of toxic particulate equivalent.`;
  }

  return {
    cityA: { ...cityA, cigarettes: cigA },
    cityB: { ...cityB, cigarettes: cigB },
    toxicityMultiplier: multiplier,
    dirtierCityName: higher.name,
    cleanerCityName: lower.name,
    cigaretteDifferential: cigDiff,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// 3. COMMUTE EXPOSURE CALCULATOR
// ---------------------------------------------------------------------------

export type CommuteTransitMode =
  | 'metro'
  | 'ac_car_recirc'
  | 'ac_bus'
  | 'regular_bus'
  | 'two_wheeler_walk';

export interface CommuteExposureEstimate {
  mode: CommuteTransitMode;
  modeLabel: string;
  durationMinutes: number;
  inhaledMicrograms: number;
  cigaretteFraction: number;
  reductionPercentage: number;
  protocolRecommendation: string;
}

export function calculateCommuteExposure(
  ambientPm25: number,
  durationMinutes: number,
  mode: CommuteTransitMode
): CommuteExposureEstimate {
  // Average breathing rate during commuting = 12 liters/min = 0.012 m3/min
  const totalVolumeM3 = 0.012 * durationMinutes;
  const unmitigatedMicrograms = ambientPm25 * totalVolumeM3;

  const modeEfficiency: Record<
    CommuteTransitMode,
    { label: string; reduction: number; tip: string }
  > = {
    metro: {
      label: 'Metro / Underground (AC & Filtered)',
      reduction: 0.85,
      tip: 'Underground transit with HVAC filtration cuts exposure by 85%. Lowest lung burden for daily urban transit.',
    },
    ac_car_recirc: {
      label: 'AC Car (Cabin Recirculation ON)',
      reduction: 0.75,
      tip: 'Keep air recirculation ON. Standard car cabin filters block up to 75% of particulate matter when windows stay sealed.',
    },
    ac_bus: {
      label: 'AC Electric / City Bus',
      reduction: 0.50,
      tip: 'Enclosed AC buses offer moderate protection (~50% reduction). Wear an N95 during boarding and doors opening.',
    },
    regular_bus: {
      label: 'Open-Window Bus',
      reduction: 0.20,
      tip: 'Drafts and road dust provide minimal barrier (~20% reduction). An N95 respirator is strongly advised.',
    },
    two_wheeler_walk: {
      label: 'Two-Wheeler / Bicycle / Walking',
      reduction: 0.0,
      tip: 'Zero protection; vehicle exhaust directly enters breathing zone. Wear a sealed N95/FFP2 respirator with nose wire pinched tight.',
    },
  };

  const selected = modeEfficiency[mode] || modeEfficiency.two_wheeler_walk;
  const mitigatedMicrograms = unmitigatedMicrograms * (1 - selected.reduction);
  const cigaretteFraction = Math.round((mitigatedMicrograms / (22 * 0.012 * 60 * 24)) * 100) / 100;

  return {
    mode,
    modeLabel: selected.label,
    durationMinutes,
    inhaledMicrograms: Math.round(mitigatedMicrograms * 10) / 10,
    cigaretteFraction: Math.max(0.01, cigaretteFraction),
    reductionPercentage: Math.round(selected.reduction * 100),
    protocolRecommendation: selected.tip,
  };
}

// ---------------------------------------------------------------------------
// 4. MASK & HEPA FILTER LIFESPAN ESTIMATOR
// ---------------------------------------------------------------------------

export type MaskStandard = 'n95' | 'kf94' | 'surgical' | 'cloth';

export interface MaskLifespanEstimate {
  maskType: MaskStandard;
  maskLabel: string;
  recommendedUsableDays: number;
  saturationHours: number;
  filtrationEfficiencyPercent: number;
  warningNote: string;
}

export function estimateMaskLifespan(
  ambientPm25: number,
  dailyOutdoorHours: number,
  maskType: MaskStandard
): MaskLifespanEstimate {
  const safePm25 = Math.max(10, ambientPm25);
  const safeHours = Math.max(0.5, dailyOutdoorHours);

  // N95 electrostatic charge degrades as particulate mass loads onto meltblown polymer fibers
  // Base rated capacity ~ 1200 ug-hours of heavy loading
  let baseHours = 40;
  let efficiency = 95;
  let label = 'N95 / FFP2 Respirator';

  switch (maskType) {
    case 'n95':
      baseHours = 40;
      efficiency = 95;
      label = 'N95 / FFP2 Respirator';
      break;
    case 'kf94':
      baseHours = 35;
      efficiency = 94;
      label = 'KF94 Korean Standard';
      break;
    case 'surgical':
      baseHours = 8;
      efficiency = 60;
      label = '3-Ply Surgical Mask';
      break;
    case 'cloth':
      baseHours = 4;
      efficiency = 20;
      label = 'Cloth / Cotton Mask';
      break;
  }

  // Microscopic clogging accelerated by high ambient PM2.5 (power factor 0.5)
  const pollutionStressFactor = Math.pow(safePm25 / 50, 0.5);
  const adjustedTotalHours = Math.max(4, Math.round(baseHours / pollutionStressFactor));
  const usableDays = Math.max(1, Math.round(adjustedTotalHours / safeHours));

  let warningNote = '';
  if (maskType === 'cloth' || maskType === 'surgical') {
    warningNote = 'Inadequate protection for winter PM2.5. Particulates penetrate porous weave directly.';
  } else if (safePm25 >= 200) {
    warningNote = `At ${safePm25} µg/m³, particulate loading accelerates rapidly. Discard once breathing resistance increases.`;
  } else {
    warningNote = 'Store in a clean, breathable paper envelope between uses. Do not wash with water or alcohol.';
  }

  return {
    maskType,
    maskLabel: label,
    recommendedUsableDays: usableDays,
    saturationHours: adjustedTotalHours,
    filtrationEfficiencyPercent: efficiency,
    warningNote,
  };
}

export interface HepaFilterLifespanEstimate {
  preFilterCleanDays: number;
  mainHepaReplaceMonths: number;
  estimatedRemainingPercent: number;
  summary: string;
}

export function estimateHepaLifespan(
  ambientPm25: number,
  dailyRunningHours: number = 12
): HepaFilterLifespanEstimate {
  const safePm25 = Math.max(15, ambientPm25);

  // In severe winter smog (>200 ug/m3), pre-filter needs weekly cleaning
  const preFilterCleanDays = safePm25 > 250 ? 7 : safePm25 > 120 ? 14 : 30;

  // Standard HEPA rated for 12 months in clean zones (~25 ug/m3), drops to 3-4 months in Indo-Gangetic smog
  const monthsCapacity = Math.max(2.5, Math.min(12, Math.round((12 * 40) / safePm25 * 10) / 10));

  return {
    preFilterCleanDays,
    mainHepaReplaceMonths: monthsCapacity,
    estimatedRemainingPercent: Math.min(100, Math.max(10, Math.round((monthsCapacity / 12) * 100))),
    summary: `At current ${safePm25} µg/m³ ambient air, vacuum pre-filter mesh every ${preFilterCleanDays} days; replace primary HEPA element in ~${monthsCapacity} months.`,
  };
}

// ---------------------------------------------------------------------------
// 5. WIND DIRECTION & BIOMASS SMOKE VECTOR
// ---------------------------------------------------------------------------

export interface WindVectorIntelligence {
  degrees: number;
  speedKmh: number;
  compassPoint: string;
  meteorologicalImpact: string;
  isStagnantTrap: boolean;
  isSmokeCorridor: boolean;
}

export function analyzeWindVector(
  degrees: number = 310,
  speedKmh: number = 6,
  cityName: string = 'Delhi-NCR'
): WindVectorIntelligence {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((degrees % 360) / 45)) % 8;
  const compassPoint = points[index];

  const isStagnantTrap = speedKmh < 5;
  const isNorthWesterly = compassPoint === 'NW' || compassPoint === 'W';
  const isIndoGangetic = /delhi|patna|kanpur|lucknow|varanasi|punjab|haryana/i.test(cityName);

  let impact = '';
  if (isStagnantTrap) {
    impact = `Calm surface wind (${speedKmh} km/h) creates stagnant dispersion conditions; vehicle emissions remain trapped at ground level.`;
  } else if (isNorthWesterly && isIndoGangetic) {
    impact = `North-Westerly winds (${speedKmh} km/h) actively transport transboundary agricultural biomass smoke along the Indo-Gangetic drainage corridor.`;
  } else if (compassPoint === 'E' || compassPoint === 'SE') {
    impact = `Easterly airflow bringing slight humidity; moderate atmospheric dispersion with mild boundary layer elevation.`;
  } else {
    impact = `${compassPoint} winds at ${speedKmh} km/h aiding natural particulate dilution and horizontal ventilation.`;
  }

  return {
    degrees,
    speedKmh,
    compassPoint,
    meteorologicalImpact: impact,
    isStagnantTrap,
    isSmokeCorridor: isNorthWesterly && isIndoGangetic,
  };
}

// ---------------------------------------------------------------------------
// 6. SCHOOL & CHILD OUTDOOR SPORTS ADVISORY
// ---------------------------------------------------------------------------

export type SchoolSafetyStatus = 'safe' | 'caution' | 'restricted' | 'hazardous';

export interface SchoolSportsAdvisory {
  status: SchoolSafetyStatus;
  statusLabel: string;
  morningAssemblyAction: 'Permitted Outdoors' | 'Shortened (<10m)' | 'Move Indoors / Cancel';
  highExertionSportsAction: 'Permitted' | 'Low Intensity Only' | 'Strictly Prohibited Outdoors';
  recessAction: 'Normal' | 'Supervised Indoor Games' | 'Enclosed Hall Only';
  pediatricVulnerabilityNote: string;
}

export function getSchoolSportsAdvisory(usAqi: number, pm25: number): SchoolSportsAdvisory {
  if (usAqi <= 50) {
    return {
      status: 'safe',
      statusLabel: 'Safe for All School Outdoor Activities',
      morningAssemblyAction: 'Permitted Outdoors',
      highExertionSportsAction: 'Permitted',
      recessAction: 'Normal',
      pediatricVulnerabilityNote: 'Clean atmospheric conditions; normal physical education schedules permitted.',
    };
  }

  if (usAqi <= 150) {
    return {
      status: 'caution',
      statusLabel: 'Moderate Air - Sensitive Children Monitor',
      morningAssemblyAction: 'Permitted Outdoors',
      highExertionSportsAction: 'Low Intensity Only',
      recessAction: 'Normal',
      pediatricVulnerabilityNote: 'Children with known pediatric asthma should carry quick-relief inhalers.',
    };
  }

  if (usAqi <= 250) {
    return {
      status: 'restricted',
      statusLabel: 'Unhealthy for Children - Outdoor Restrictions Active',
      morningAssemblyAction: 'Move Indoors / Cancel',
      highExertionSportsAction: 'Strictly Prohibited Outdoors',
      recessAction: 'Supervised Indoor Games',
      pediatricVulnerabilityNote: 'Developing child alveolar tissue absorbs 50% more particulate matter per kg of body weight than adults.',
    };
  }

  return {
    status: 'hazardous',
    statusLabel: 'Severe Smog Emergency - Total Outdoor Sports Ban',
    morningAssemblyAction: 'Move Indoors / Cancel',
    highExertionSportsAction: 'Strictly Prohibited Outdoors',
    recessAction: 'Enclosed Hall Only',
    pediatricVulnerabilityNote: 'Direct threat of acute bronchospasm and systemic inflammation. Keep classroom windows closed and run air filtration.',
  };
}

// ---------------------------------------------------------------------------
// 7. INSTANT WHATSAPP / TELEGRAM SMOG BULLETIN FORMATTER
// ---------------------------------------------------------------------------

export function formatWhatsAppBulletin(params: {
  cityName: string;
  usAqi: number;
  pm25: number;
  cigarettes: number;
  bestWindow: string;
  worstInversion: string;
}): string {
  const { cityName, usAqi, pm25, cigarettes, bestWindow, worstInversion } = params;

  let severityEmoji = '🟢';
  if (usAqi > 300) severityEmoji = '🚨';
  else if (usAqi > 200) severityEmoji = '🔴';
  else if (usAqi > 100) severityEmoji = '🟠';

  return `*${severityEmoji} Avir Daily Atmospheric Intelligence — ${cityName}*
📅 ${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}

📊 *Air Quality Index:* ${usAqi} US AQI
🔬 *Fine PM2.5:* ${pm25} µg/m³
🚬 *Toxic Cigarette Equivalent:* ~${cigarettes} cigs/day

⚠️ *Thermal Inversion Window:*
${worstInversion}

☀️ *Best Venting Window:*
${bestWindow}

🛡️ *Action Protocol Today:*
1. Keep windows sealed during morning/night inversion peaks.
2. Wear an N95 respirator if commuting on two-wheeler or walking.
3. Air out living spaces only during afternoon solar boundary height.

🌐 *Live Sensor Feed & Clean Air Guide:*
https://avir-blue.vercel.app`;
}
