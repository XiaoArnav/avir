/**
 * Deterministic AI Environmental Assistant & Structured Explanation Generator
 *
 * Provides rule-based, evidence-distinguished explanations and actionable recommendations
 * when external LLMs are unavailable, unconfigured, timed out, or rejected by validators.
 *
 * Scientific Invariants:
 * - Zero Hallucinated Numbers: Quantitative exposures come strictly from deterministic engines.
 * - Explicit Evidence Tiers: Distinguishes observed data (A), validated forecasts (B),
 *   general atmospheric principles (C), and unavailable/undetermined conditions (D).
 * - Accurate Source & Standard Provenance: Never guesses freshness, model/monitor identity, or AQI scale.
 * - Safety Invariant: Explicitly disclaims medical diagnosis, clinical prescriptions, or zero-risk guarantees.
 */

import {
  ActionableRecommendation,
  EnvironmentalDecisionContext,
  StructuredPlanExplanation,
} from './decision-context';

interface ForecastEvidenceSummary {
  hasForecastPm25: boolean;
  cleanestPoint: { hourLabel: string; pm25: number; boundaryLayerHeight: number | null } | null;
  peakPoint: { hourLabel: string; pm25: number } | null;
  hasAfternoonCleanerWindow: boolean;
  afternoonCleanerRange: string | null;
  afternoonCleanerPm25: number | null;
  hasBlhData: boolean;
  blhPeakValue: number | null;
  blhPeakHour: string | null;
}

interface ResolvedForecastClock {
  hour: number | null;
  minute: number | null;
  label: string;
  rangeLabel: string | null;
  isLocalTimeKnown: boolean;
}

function isUsableIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

function resolveForecastClock(
  timeStr: string,
  cityTimezone?: string | null,
  entryTimezone?: string | null
): ResolvedForecastClock {
  const offsetMatch = timeStr.trim().match(/(Z|[+-](\d{2}):?(\d{2}))$/i);
  const effectiveCityTz = isUsableIanaTimezone(cityTimezone) ? cityTimezone.trim() : null;
  const effectiveEntryTz =
    isUsableIanaTimezone(entryTimezone) &&
    entryTimezone.trim().toUpperCase() !== 'UTC' &&
    entryTimezone.trim().toUpperCase() !== 'GMT'
      ? entryTimezone.trim()
      : null;
  const targetTz = effectiveCityTz ?? effectiveEntryTz;

  if (offsetMatch) {
    const parsed = new Date(timeStr);
    if (!Number.isNaN(parsed.getTime())) {
      if (targetTz) {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: targetTz,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(parsed);
        const hRaw = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
        const mRaw = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
        const hStr = String(hRaw).padStart(2, '0');
        const mStr = String(mRaw).padStart(2, '0');
        const endHStr = String((hRaw + 1) % 24).padStart(2, '0');
        return {
          hour: hRaw,
          minute: mRaw,
          label: `${hStr}:${mStr}`,
          rangeLabel: `${hStr}:${mStr} - ${endHStr}:${mStr}`,
          isLocalTimeKnown: true,
        };
      }

      const rawIsoWall = timeStr.match(/T(\d{2}):(\d{2})/);
      const isZeroOffset =
        offsetMatch[1].toUpperCase() === 'Z' ||
        (offsetMatch[2] === '00' && offsetMatch[3] === '00');
      if (!isZeroOffset && rawIsoWall) {
        // Explicit non-UTC offset encodes local wall clock directly
        const hRaw = parseInt(rawIsoWall[1], 10);
        const mRaw = parseInt(rawIsoWall[2], 10);
        const endHStr = String((hRaw + 1) % 24).padStart(2, '0');
        return {
          hour: hRaw,
          minute: mRaw,
          label: `${rawIsoWall[1]}:${rawIsoWall[2]}`,
          rangeLabel: `${rawIsoWall[1]}:${rawIsoWall[2]} - ${endHStr}:${rawIsoWall[2]}`,
          isLocalTimeKnown: true,
        };
      }

      // Bare UTC timestamp without a target local timezone: preserve UTC explicitly, do not guess local solar hour
      const utcH = String(parsed.getUTCHours()).padStart(2, '0');
      const utcM = String(parsed.getUTCMinutes()).padStart(2, '0');
      return {
        hour: null,
        minute: parsed.getUTCMinutes(),
        label: `${utcH}:${utcM} UTC`,
        rangeLabel: null,
        isLocalTimeKnown: false,
      };
    }
  }

  // Naive ISO local wall-clock timestamp (YYYY-MM-DDTHH:mm)
  const naiveIso = timeStr.trim().match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
  if (naiveIso) {
    const hRaw = parseInt(naiveIso[1], 10);
    const mRaw = parseInt(naiveIso[2], 10);
    const endHStr = String((hRaw + 1) % 24).padStart(2, '0');
    return {
      hour: hRaw,
      minute: mRaw,
      label: `${naiveIso[1]}:${naiveIso[2]}`,
      rangeLabel: `${naiveIso[1]}:${naiveIso[2]} - ${endHStr}:${naiveIso[2]}`,
      isLocalTimeKnown: true,
    };
  }

  const parsedFallback = new Date(timeStr);
  if (!Number.isNaN(parsedFallback.getTime())) {
    const utcH = String(parsedFallback.getUTCHours()).padStart(2, '0');
    const utcM = String(parsedFallback.getUTCMinutes()).padStart(2, '0');
    return {
      hour: null,
      minute: parsedFallback.getUTCMinutes(),
      label: `${utcH}:${utcM} UTC`,
      rangeLabel: null,
      isLocalTimeKnown: false,
    };
  }

  return {
    hour: null,
    minute: null,
    label: timeStr,
    rangeLabel: null,
    isLocalTimeKnown: false,
  };
}

function analyzeForecastEvidence(context: EnvironmentalDecisionContext): ForecastEvidenceSummary {
  const entries = context.hourlyForecast ?? [];
  const cityTz = context.city.timezone;
  const resolvedEntries = entries.map((pt) => ({
    pt,
    clock: resolveForecastClock(pt.time, cityTz, pt.timezone),
  }));

  const validPmEntries = resolvedEntries.filter(
    (entry): entry is { pt: typeof entry.pt & { pm25: number }; clock: ResolvedForecastClock } =>
      typeof entry.pt.pm25 === 'number' && Number.isFinite(entry.pt.pm25)
  );

  const validBlhEntries = resolvedEntries.filter(
    (entry): entry is {
      pt: typeof entry.pt & { boundaryLayerHeight: number };
      clock: ResolvedForecastClock;
    } =>
      typeof entry.pt.boundaryLayerHeight === 'number' &&
      Number.isFinite(entry.pt.boundaryLayerHeight)
  );

  let cleanestPoint: ForecastEvidenceSummary['cleanestPoint'] = null;
  let peakPoint: ForecastEvidenceSummary['peakPoint'] = null;

  if (validPmEntries.length > 0) {
    const minEntry = validPmEntries.reduce((best, cur) =>
      cur.pt.pm25 < best.pt.pm25 ? cur : best
    );
    const maxEntry = validPmEntries.reduce((worst, cur) =>
      cur.pt.pm25 > worst.pt.pm25 ? cur : worst
    );
    cleanestPoint = {
      hourLabel: minEntry.clock.label,
      pm25: minEntry.pt.pm25,
      boundaryLayerHeight:
        typeof minEntry.pt.boundaryLayerHeight === 'number' &&
        Number.isFinite(minEntry.pt.boundaryLayerHeight)
          ? minEntry.pt.boundaryLayerHeight
          : null,
    };
    peakPoint = {
      hourLabel: maxEntry.clock.label,
      pm25: maxEntry.pt.pm25,
    };
  }

  const afternoonEntries = validPmEntries.filter(
    (e) => e.clock.isLocalTimeKnown && e.clock.hour !== null && e.clock.hour >= 12 && e.clock.hour <= 16
  );
  const morningEntries = validPmEntries.filter(
    (e) => e.clock.isLocalTimeKnown && e.clock.hour !== null && e.clock.hour >= 5 && e.clock.hour <= 10
  );

  let hasAfternoonCleanerWindow = false;
  let afternoonCleanerRange: string | null = null;
  let afternoonCleanerPm25: number | null = null;

  if (afternoonEntries.length > 0) {
    const bestAfternoon = afternoonEntries.reduce((best, cur) =>
      cur.pt.pm25 < best.pt.pm25 ? cur : best
    );
    const referenceHigh =
      morningEntries.length > 0
        ? Math.max(...morningEntries.map((e) => e.pt.pm25))
        : context.currentPollutants.pm25 ?? null;

    if (referenceHigh !== null && bestAfternoon.pt.pm25 < referenceHigh) {
      hasAfternoonCleanerWindow = true;
      afternoonCleanerPm25 = bestAfternoon.pt.pm25;
      afternoonCleanerRange = bestAfternoon.clock.rangeLabel ?? bestAfternoon.clock.label;
    }
  }

  let blhPeakValue: number | null = null;
  let blhPeakHour: string | null = null;
  if (validBlhEntries.length > 0) {
    const maxBlh = validBlhEntries.reduce((best, cur) =>
      cur.pt.boundaryLayerHeight > best.pt.boundaryLayerHeight ? cur : best
    );
    blhPeakValue = maxBlh.pt.boundaryLayerHeight;
    blhPeakHour = maxBlh.clock.label;
  }

  return {
    hasForecastPm25: validPmEntries.length > 0,
    cleanestPoint,
    peakPoint,
    hasAfternoonCleanerWindow,
    afternoonCleanerRange,
    afternoonCleanerPm25,
    hasBlhData: validBlhEntries.length > 0,
    blhPeakValue,
    blhPeakHour,
  };
}

function formatStandardLabel(standard: EnvironmentalDecisionContext['currentPollutants']['aqiStandard']): string | null {
  if (standard === 'cpcb') return 'CPCB NAQI';
  if (standard === 'epa') return 'US EPA AQI';
  return null;
}

function resolveSourceKindLabel(source: EnvironmentalDecisionContext['source']): string {
  const provider = source.provider?.trim();
  if (!provider || provider.toLowerCase() === 'unavailable' || provider.toLowerCase() === 'unknown source') {
    return 'Source Unverified / Unavailable';
  }
  if (source.sourceType === 'atmospheric_model' || (source.sourceType == null && source.isModel === true)) {
    return 'Atmospheric Model Estimate';
  }
  if (source.sourceType === 'physical_monitor' || (source.sourceType == null && source.isModel === false)) {
    return 'Physical Ground Monitor';
  }
  if (source.sourceType === 'derived_consensus') {
    return 'Derived Multi-Source Consensus';
  }
  if (source.sourceType === 'client_supplied') {
    return 'Client-Supplied Data';
  }
  return 'Unverified Source Classification';
}

export function generateDeterministicStructuredExplanation(
  context: EnvironmentalDecisionContext,
  deterministicPlan?: any
): StructuredPlanExplanation {
  const cityName = context.city.name;
  const pm25 = context.currentPollutants.pm25;
  const aqi = context.currentPollutants.aqi;
  const standardLabel = formatStandardLabel(context.currentPollutants.aqiStandard);
  const sensitivity = context.userContext.generalizedSensitivity;
  const sourceName = context.source.provider;
  const sourceKindLabel = resolveSourceKindLabel(context.source);
  const freshness =
    typeof context.source.freshnessHours === 'number' && Number.isFinite(context.source.freshnessHours)
      ? context.source.freshnessHours
      : null;

  const forecastEvidence = analyzeForecastEvidence(context);
  const firstShift =
    deterministicPlan && Array.isArray(deterministicPlan.activityShifts) && deterministicPlan.activityShifts.length > 0
      ? deterministicPlan.activityShifts[0]
      : null;

  // 1. Situation Summary (Evidence-grounded only; never invents model estimates or meteorological state)
  let situationSummary = `Current ambient air quality in ${cityName} `;
  if (pm25 !== null && pm25 !== undefined) {
    const roundedPm = Math.round(pm25);
    const aqiNote =
      aqi !== null && aqi !== undefined && standardLabel
        ? ` (${standardLabel} ${Math.round(aqi)})`
        : '';
    if (pm25 <= 30) {
      situationSummary += `is characterized by low particulate concentrations (${roundedPm} µg/m³ PM2.5${aqiNote}), offering favorable conditions for routine activities.`;
    } else if (pm25 <= 60) {
      situationSummary += `is characterized by moderate particulate concentrations (${roundedPm} µg/m³ PM2.5${aqiNote}). Sensitive individuals should consider minor adjustments.`;
    } else if (pm25 <= 120) {
      situationSummary += `is characterized by elevated particulate levels (${roundedPm} µg/m³ PM2.5${aqiNote}). Limiting intense outdoor exertion helps reduce inhaled particulate mass.`;
    } else {
      situationSummary += `is characterized by severely elevated particulate pollution (${roundedPm} µg/m³ PM2.5${aqiNote}). Minimize outdoor exertion and prioritize filtered indoor air.`;
    }
  } else if (aqi !== null && aqi !== undefined && standardLabel) {
    situationSummary += `reports ${standardLabel} ${Math.round(aqi)}, while direct PM2.5 concentration data is unavailable for dose calculation.`;
  } else {
    situationSummary += `cannot be determined directly because verified PM2.5 and AQI observations are currently unavailable.`;
  }

  // 2. Actionable Recommendations (Strictly separates Observation / Forecast / Principle / Unavailable)
  const actionableRecommendations: ActionableRecommendation[] = [];

  // 2.1 Outdoor Activity Recommendation
  if (pm25 === null || pm25 === undefined) {
    actionableRecommendations.push({
      id: 'rec-outdoor-unavailable',
      category: 'outdoor_activity',
      action:
        firstShift && firstShift.proposedStart && firstShift.proposedEnd
          ? `Follow your forecast-optimized schedule window (${firstShift.proposedStart} - ${firstShift.proposedEnd}) and verify local readings before vigorous outdoor exercise`
          : 'Confirm live local air-quality telemetry before scheduling prolonged or vigorous outdoor exertion',
      why: 'General principle: elevated particulate pollution increases respiratory dose during vigorous exercise, though direct current PM2.5 cannot be determined from the supplied payload.',
      supportingData:
        aqi !== null && aqi !== undefined && standardLabel
          ? `Supplied ${standardLabel} is ${Math.round(aqi)}, but direct PM2.5 observation is unavailable.`
          : 'Direct PM2.5 measurement is unavailable; condition severity cannot be determined.',
      applicableWindow:
        firstShift && firstShift.proposedStart && firstShift.proposedEnd
          ? `${firstShift.proposedStart} - ${firstShift.proposedEnd}`
          : forecastEvidence.cleanestPoint
            ? `Lowest forecast PM2.5 near ${forecastEvidence.cleanestPoint.hourLabel}`
            : undefined,
      uncertainty: 'Current outdoor PM2.5 exposure cannot be quantified without an active measurement feed.',
      alternativeChoice: 'Exercise indoors in an air-filtered room whenever local conditions appear hazy or telemetry is unavailable.',
      evidenceProvenance:
        forecastEvidence.hasForecastPm25
          ? `${sourceName} hourly forecast (${sourceKindLabel}); live PM2.5 unavailable`
          : `General environmental precaution (current PM2.5 unavailable)`,
    });
  } else if (pm25 > 60) {
    const validatedWindow =
      firstShift && firstShift.proposedStart && firstShift.proposedEnd
        ? `${firstShift.proposedStart} - ${firstShift.proposedEnd}`
        : forecastEvidence.hasAfternoonCleanerWindow
          ? forecastEvidence.afternoonCleanerRange!
          : forecastEvidence.cleanestPoint && forecastEvidence.cleanestPoint.pm25 < pm25
            ? `Around ${forecastEvidence.cleanestPoint.hourLabel}`
            : null;

    const blhDetail =
      forecastEvidence.hasBlhData && forecastEvidence.blhPeakValue !== null
        ? ` Validated boundary-layer data reaches ${Math.round(forecastEvidence.blhPeakValue)} m around ${forecastEvidence.blhPeakHour}.`
        : '';

    const hasValidatedBetterWindow = validatedWindow !== null;

    actionableRecommendations.push({
      id: 'rec-outdoor-1',
      category: 'outdoor_activity',
      action: hasValidatedBetterWindow
        ? `Shift vigorous outdoor cardio to the lower-concentration forecast window (${validatedWindow})`
        : 'Shift vigorous outdoor cardio indoors to a filtered space until lower PM2.5 readings are verified',
      why: hasValidatedBetterWindow
        ? 'Supplied forecast data indicates lower particulate concentrations during the shifted interval; daytime solar heating can also expand the planetary boundary layer and disperse surface emissions.'
        : 'General scientific principle: atmospheric stagnation can trap surface particulates while daytime planetary boundary layer growth may aid dispersion, though forecast timing data is unavailable for this location.',
      supportingData: hasValidatedBetterWindow
        ? `Observed PM2.5 is ${Math.round(pm25)} µg/m³${standardLabel ? ` (${standardLabel})` : ''}. Validated hourly forecast indicates lower PM2.5 (${
            forecastEvidence.afternoonCleanerPm25 !== null
              ? `${Math.round(forecastEvidence.afternoonCleanerPm25)} µg/m³`
              : forecastEvidence.cleanestPoint
                ? `${Math.round(forecastEvidence.cleanestPoint.pm25)} µg/m³`
                : 'reduced concentration'
          }) in the shifted window.${blhDetail}`
        : `Observed PM2.5 is elevated at ${Math.round(pm25)} µg/m³${standardLabel ? ` (${standardLabel})` : ''}; hourly forecast and boundary-layer dispersion data were not supplied to confirm a cleaner outdoor window.`,
      applicableWindow: hasValidatedBetterWindow ? validatedWindow! : 'Pending verified forecast or lower readings',
      uncertainty: hasValidatedBetterWindow
        ? 'Local micro-climate wind shifts and street canyon emissions can cause localized deviations from hourly forecasts.'
        : 'Without hourly forecast or boundary-layer measurements, the timing of any afternoon improvement cannot be determined.',
      alternativeChoice: 'Conduct high-intensity workouts in an enclosed, air-filtered indoor space.',
      evidenceProvenance: hasValidatedBetterWindow
        ? `${sourceName} (${sourceKindLabel}) & validated hourly forecast`
        : `${sourceName} (${sourceKindLabel}) & general atmospheric dispersion principle (forecast window unavailable)`,
    });
  } else {
    const metricDetails = `${Math.round(pm25)} µg/m³ PM2.5${
      aqi !== null && aqi !== undefined && standardLabel ? ` (${standardLabel} ${Math.round(aqi)})` : ''
    }`;
    actionableRecommendations.push({
      id: 'rec-outdoor-normal',
      category: 'outdoor_activity',
      action: 'Maintain planned outdoor activities while monitoring real-time air-quality updates',
      why: 'Supplied PM2.5 readings are at low-to-moderate levels relative to recreational thresholds.',
      supportingData: `Reported observation/estimate: ${metricDetails}.`,
      applicableWindow: forecastEvidence.hasForecastPm25 ? 'Checked against supplied forecast hours' : 'Based on current reading only',
      uncertainty: forecastEvidence.hasForecastPm25
        ? 'Local traffic spikes or weather shifts can still cause short-term variation between hourly intervals.'
        : 'Hourly forecast series was not provided, so later-day concentration changes cannot be determined.',
      alternativeChoice: 'Shift to lighter intensity or indoor exercise if subsequent updates rise above moderate levels.',
      evidenceProvenance: `${sourceName} (${sourceKindLabel})`,
    });
  }

  // 2.2 Commuting Recommendation (Qualitative principles only; zero fabricated 40-80% or rush-hour claims)
  const commuteMode = context.userContext.commuteMode || 'mixed';
  if (pm25 !== null && pm25 !== undefined && pm25 > 90) {
    actionableRecommendations.push({
      id: 'rec-commute-1',
      category: 'commuting',
      action:
        commuteMode === 'walking' || commuteMode === 'cycling'
          ? 'Wear a well-fitted particulate respirator (N95/FFP2) during outdoor transit, or switch to enclosed transit'
          : 'Keep vehicle windows closed and set cabin ventilation to internal recirculation with clean cabin filters',
      why: 'General exposure principle: busy roadway corridors concentrate tailpipe and brake/tire particulate emissions, raising inhaled dose during open-air travel.',
      supportingData: `Supplied ambient PM2.5 is ${Math.round(pm25)} µg/m³. Individual cabin or respirator filtration efficiency depends on filter condition and seal rather than a measured personal percentage here.`,
      uncertainty: 'Exact personal exposure reduction varies with cabin filter grade, seal fit, door openings, and traffic density.',
      alternativeChoice: 'Prefer secondary routes away from heavy diesel traffic or enclosed rail/metro transit.',
      evidenceProvenance: `${sourceName} (${sourceKindLabel}) & general particulate exposure-mitigation principle`,
    });
  }

  // 2.3 Indoor Air Quality Guidance (Zero fabricated 50-70% infiltration claims or unverified morning inversions)
  const purification = context.userContext.indoorAirPurification || 'unknown';
  actionableRecommendations.push({
    id: 'rec-indoor-1',
    category: 'indoor_air',
    action:
      purification === 'hepa_purifier'
        ? 'Operate your HEPA air purifier continuously in primary occupied rooms and keep exterior doors/windows closed during elevated outdoor PM2.5'
        : 'Use mechanical HEPA filtration if available in primary living/sleeping spaces and limit unsealed outdoor air exchange when outdoor PM2.5 is elevated',
    why: 'General building-science principle: outdoor fine particulate matter can infiltrate indoor spaces through open windows and building air leakage without mechanical filtration.',
    supportingData: forecastEvidence.hasAfternoonCleanerWindow && forecastEvidence.afternoonCleanerRange
      ? `Validated forecast identifies a lower outdoor concentration window around ${forecastEvidence.afternoonCleanerRange}; actual building infiltration fraction is not measured here.`
      : pm25 !== null && pm25 !== undefined
        ? `Supplied outdoor PM2.5 is ${Math.round(pm25)} µg/m³; local indoor infiltration rate and hourly outdoor dispersion timing are not measured here.`
        : 'Outdoor particulate concentration and indoor infiltration rate were not supplied.',
    applicableWindow: forecastEvidence.afternoonCleanerRange
      ? `Prefer natural ventilation check around ${forecastEvidence.afternoonCleanerRange}`
      : 'When outdoor PM2.5 is verified low',
    uncertainty: 'Room volume, purifier CADR, air-exchange rate, and window sealing determine indoor particulate levels.',
    alternativeChoice: 'Seal visible window drafts during high-pollution periods and limit indoor combustion sources (cooking smoke, incense).',
    evidenceProvenance: 'General indoor air quality management principle',
  });

  // 2.4 Sensitive Population Precautions (No clinical prescriptions; no fabricated afternoon claim)
  if (sensitivity !== 'standard') {
    const sensitiveCleanerHint =
      forecastEvidence.hasAfternoonCleanerWindow && forecastEvidence.afternoonCleanerRange
        ? `If outdoor errands are necessary, the supplied forecast shows lower concentrations around ${forecastEvidence.afternoonCleanerRange}.`
        : 'Check verified live local PM2.5 readings before stepping outside and defer non-essential errands during elevated readings.';

    actionableRecommendations.push({
      id: 'rec-sensitive-1',
      category: 'sensitive_group',
      action:
        sensitivity === 'highly_sensitive'
          ? 'Strictly minimize unnecessary outdoor physical exertion and follow your personal care plan from a qualified healthcare clinician'
          : 'Limit prolonged outdoor exposure and take periodic breaks in air-filtered indoor environments',
      why: 'General environmental health principle: elevated particulate pollution places higher burden on individuals in higher-sensitivity tiers.',
      supportingData: `Evaluated under generalized sensitivity tier "${sensitivity}"${standardLabel ? ` (${standardLabel} context)` : ''}. No personal clinical diagnoses are processed or inferred.`,
      uncertainty: 'Individual physiological responses vary and cannot be predicted from ambient air-quality measurements alone.',
      alternativeChoice: sensitiveCleanerHint,
      evidenceProvenance: `Generalized sensitivity tier policy (${sensitivity})`,
    });
  }

  // 2.5 Sustainable Habit Recommendation
  actionableRecommendations.push({
    id: 'rec-sustainable-1',
    category: 'sustainable_habit',
    action: 'Consolidate discretionary motor-vehicle trips and avoid open burning of garden or household waste',
    why: 'General air-quality principle: local primary combustion emissions add directly to neighborhood particulate concentrations.',
    supportingData: 'Applies as a general source-reduction principle regardless of hourly dispersion conditions.',
    uncertainty: 'Neighborhood meteorological dispersion determines how strongly local emission reductions affect nearby concentrations.',
    alternativeChoice: 'Use municipal waste collection and shared or electrified transit where practical.',
    evidenceProvenance: 'General urban emissions source-reduction principle',
  });

  // 3. Schedule Adjustments from Deterministic Plan
  const scheduleAdjustments: Array<{
    activityName: string;
    originalTime: string;
    proposedTime: string;
    rationale: string;
  }> = [];

  if (deterministicPlan && Array.isArray(deterministicPlan.activityShifts)) {
    deterministicPlan.activityShifts.forEach((shift: any) => {
      scheduleAdjustments.push({
        activityName: shift.activityName,
        originalTime: `${shift.originalStart} - ${shift.originalEnd}`,
        proposedTime: `${shift.proposedStart} - ${shift.proposedEnd}`,
        rationale: shift.reason || 'Rescheduled to lower-exposure forecast interval.',
      });
    });
  }

  // 4. Evidence References & Honest Provenance Disclosures
  const evidenceReferences = [
    `Data Provider: ${sourceName} (${sourceKindLabel})`,
    freshness !== null
      ? `Measurement Freshness: Reported ${freshness} hour(s) ago`
      : context.source.observationTime
        ? `Observation Time: ${context.source.observationTime} (elapsed freshness hours not calculated)`
        : 'Measurement Freshness: Unavailable (observation timestamp not provided)',
  ];

  if (forecastEvidence.hasForecastPm25) {
    evidenceReferences.push(
      `Hourly Forecast Scope: ${context.hourlyForecast!.length} interval(s) supplied`
    );
  }

  if (context.weather?.windSpeedKmh !== undefined && context.weather?.windSpeedKmh !== null) {
    evidenceReferences.push(
      `Atmospheric Weather: Wind speed ${Math.round(context.weather.windSpeedKmh)} km/h, direction ${context.weather.windDirectionDeg ?? 'variable'}°`
    );
  }

  if (context.fireHotspotSummary?.regionalHotspotCount) {
    evidenceReferences.push(
      `Regional Satellite Context: ${context.fireHotspotSummary.regionalHotspotCount} thermal hotspot detection(s) reported in wider regional sector`
    );
  }

  let uncertaintyDisclosure: string;
  if (context.source.sourceType === 'atmospheric_model' || (context.source.sourceType == null && context.source.isModel === true)) {
    uncertaintyDisclosure =
      'Values derived from an atmospheric numerical model. Gridded model estimates provide spatial coverage but smooth hyper-local emission spikes.';
  } else if (
    (context.source.sourceType === 'physical_monitor' || (context.source.sourceType == null && context.source.isModel === false)) &&
    !sourceKindLabel.includes('Unverified')
  ) {
    uncertaintyDisclosure = `Values reported from physical monitoring station${
      context.source.stationName ? ` (${context.source.stationName})` : ''
    }${
      context.source.distanceKm != null ? ` located ~${Math.round(context.source.distanceKm)} km from target coordinates` : ''
    }. Station readings reflect ambient conditions around the monitor.`;
  } else {
    uncertaintyDisclosure =
      'Source classification or verification metadata is unavailable for part or all of this context. Treat qualitative recommendations as general precautionary guidance and consult local official advisories.';
  }

  const safetyLimitations = [
    'General Information Only: Avir provides environmental intelligence, not personal medical diagnoses or clinical prescriptions.',
    'No Absolute Safety Guarantee: Adjusting outdoor timing reduces relative inhaled particulate exposure where forecast data exists, but cannot guarantee zero health risk.',
    'Dynamic Weather Changes: Sudden wind shifts, rain, or local combustion can diverge rapidly from earlier readings or forecasts.',
  ];

  const ventilationAdvice =
    pm25 !== null && pm25 !== undefined && pm25 > 80
      ? forecastEvidence.afternoonCleanerRange
        ? `Keep exterior windows closed during high PM2.5 readings; if fresh air is needed, verify outdoor readings remain lower around ${forecastEvidence.afternoonCleanerRange}.`
        : 'Keep exterior windows closed during elevated PM2.5 readings until verified local telemetry indicates improved outdoor air quality.'
      : forecastEvidence.afternoonCleanerRange
        ? `Keep indoor ventilation aligned with lower-PM2.5 forecast periods such as ${forecastEvidence.afternoonCleanerRange}.`
        : 'Check current local outdoor PM2.5 telemetry before opening windows for natural ventilation.';

  const commuteAdviceRecommendation =
    pm25 !== null && pm25 !== undefined && pm25 > 90
      ? 'Minimize prolonged open-air transit along high-traffic corridors. If walking or cycling, wear a well-fitted N95/FFP2 respirator.'
      : pm25 !== null && pm25 !== undefined
        ? 'Regular transit routes are acceptable at current reported concentrations; avoid idling near heavy diesel exhaust when possible.'
        : 'Ambient particulate data is currently unavailable; avoid heavy-traffic exhaust corridors when visibility or air conditions appear degraded.';

  return {
    situationSummary,
    actionableRecommendations,
    scheduleAdjustments,
    indoorGuidance: {
      ventilationAdvice,
      filtrationAdvice:
        'Use true HEPA filtration in frequently occupied rooms and maintain manufacturer-recommended filter replacement schedules.',
      caution: 'Avoid ionizer-based cleaners that can emit secondary ozone. Keep cooking areas mechanically vented.',
    },
    commuteAdvice: {
      recommendation: commuteAdviceRecommendation,
      lowerExposureOption:
        'Plan travel along secondary streets away from heavy-duty diesel traffic or enclosed metro/rail transit where available.',
    },
    evidenceReferences,
    uncertaintyDisclosure,
    safetyLimitations,
    modelAttribution: 'Deterministic Environmental Intelligence Engine (Server-Side)',
    generatedAt: new Date().toISOString(),
    isDeterministicVerified: true,
    explanationSource: 'deterministic_fallback',
    summarySource: 'deterministic_fallback',
    recommendationsSource: 'deterministic',
  };
}
