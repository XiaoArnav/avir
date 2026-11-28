import { getAQICategory } from '@/domain/air-math';
import { getCpcbCategory } from '@/domain/cpcb-naqi';
import { GeneralizedSensitivity } from '@/domain/planning-types';
import { DecisionSourceType, EnvironmentalDecisionContext } from '@/services/ai/decision-context';
import {
  RawAiPlanBody,
  extractVerifiedCoordinates,
  isValidTimeZone,
  sanitizeTextLabel,
} from '@/services/ai/plan-route-input';

/**
 * Sanitizes free-text labels and pins derived generalized sensitivity on a validated context.
 */
export function normalizeValidatedDecisionContext(
  ctx: EnvironmentalDecisionContext,
  sensitivity: EnvironmentalDecisionContext['userContext']['generalizedSensitivity']
): EnvironmentalDecisionContext {
  return {
    ...ctx,
    city: {
      ...ctx.city,
      name: sanitizeTextLabel(ctx.city.name, 'Selected City'),
    },
    source: {
      ...ctx.source,
      provider: sanitizeTextLabel(ctx.source.provider, 'Client-Supplied Source'),
      stationName:
        typeof ctx.source.stationName === 'string'
          ? sanitizeTextLabel(ctx.source.stationName, 'Monitoring Station')
          : ctx.source.stationName ?? undefined,
    },
    userContext: {
      generalizedSensitivity: sensitivity,
      commuteMode: ctx.userContext.commuteMode ?? 'mixed',
      indoorAirPurification: ctx.userContext.indoorAirPurification ?? 'unknown',
    },
  };
}

/**
 * Classifies environmental source provenance without elevating unverified/unavailable feeds.
 */
export function classifySourceProvenance(rawBody: RawAiPlanBody): {
  provider: string;
  isModel: boolean | null;
  sourceType: DecisionSourceType;
  stationName?: string;
  distanceKm?: number;
} {
  const rawExplicitSource =
    typeof rawBody.currentAmbientSource === 'string' && rawBody.currentAmbientSource.trim()
      ? sanitizeTextLabel(rawBody.currentAmbientSource, 'Client-Supplied Ambient Source')
      : typeof rawBody.source?.provider === 'string' && rawBody.source.provider.trim()
        ? sanitizeTextLabel(rawBody.source.provider, 'Client-Supplied Source')
        : null;

  if (rawBody.selectedSourceUnavailable) {
    return {
      provider: rawExplicitSource || 'Unavailable',
      isModel: null,
      sourceType: 'unknown',
    };
  }

  const metricsProvenance = rawBody.currentAmbientProvenance || rawBody.metrics?.provenance;
  const metricsProvider =
    metricsProvenance === 'observed' && typeof rawBody.metrics?.groundStation?.provider === 'string'
      ? rawBody.metrics.groundStation.provider.trim()
      : typeof rawBody.metrics?.sourceAttribution === 'string' && rawBody.metrics.sourceAttribution.trim()
        ? rawBody.metrics.sourceAttribution.trim()
        : null;

  const provider = rawExplicitSource || metricsProvider || 'Unknown Source';
  const normalizedLower = provider.toLowerCase();
  const isUnverifiedName =
    /\b(unknown|unverified|unavailable)\b/.test(normalizedLower) ||
    normalizedLower === 'client-supplied ambient source';

  if (isUnverifiedName) {
    return {
      provider: rawExplicitSource || 'Unavailable',
      isModel: null,
      sourceType: 'unknown',
    };
  }

  let isModel: boolean | null = null;
  let sourceType: DecisionSourceType = 'unknown';

  if (rawBody.source?.isModel === true || metricsProvenance === 'modeled_forecast') {
    isModel = true;
    sourceType = 'atmospheric_model';
  } else if (
    rawBody.source?.isModel === false &&
    rawBody.source?.provider &&
    !isUnverifiedName
  ) {
    isModel = false;
    sourceType = 'physical_monitor';
  } else if (
    metricsProvenance === 'observed' &&
    rawBody.metrics?.groundStation?.stationState !== 'registry_only'
  ) {
    isModel = false;
    sourceType = 'physical_monitor';
  } else if (metricsProvenance === 'derived_calculation') {
    isModel = null;
    sourceType = 'derived_consensus';
  } else if (rawBody.currentAmbientSource && !rawBody.currentAmbientProvenance) {
    isModel = null;
    sourceType = 'client_supplied';
  }

  const stationName =
    typeof rawBody.source?.stationName === 'string' && rawBody.source.stationName.trim()
      ? sanitizeTextLabel(rawBody.source.stationName, 'Monitoring Station')
      : sourceType === 'physical_monitor' && typeof rawBody.metrics?.groundStation?.stationName === 'string'
        ? rawBody.metrics.groundStation.stationName.trim()
        : undefined;

  const rawDist =
    typeof rawBody.source?.distanceKm === 'number' && Number.isFinite(rawBody.source.distanceKm)
      ? rawBody.source.distanceKm
      : sourceType === 'physical_monitor' &&
          typeof rawBody.metrics?.groundStation?.distanceKm === 'number' &&
          Number.isFinite(rawBody.metrics.groundStation.distanceKm)
        ? rawBody.metrics.groundStation.distanceKm
        : undefined;

  return {
    provider,
    isModel,
    sourceType,
    stationName,
    distanceKm: rawDist,
  };
}

/**
 * Builds an EnvironmentalDecisionContext from flat request fields when no nested context was supplied.
 * Preserves malformed explicit values so boundary validateDecisionContext rejects them consistently.
 */
export function buildFallbackDecisionContext(
  rawBody: RawAiPlanBody,
  sensitivity: GeneralizedSensitivity
): EnvironmentalDecisionContext {
  const cityName =
    typeof rawBody.city === 'string' && rawBody.city.trim()
      ? sanitizeTextLabel(rawBody.city, 'Selected Location')
      : 'Unspecified Location';

  const { latitude, longitude } = extractVerifiedCoordinates(rawBody);

  const explicitTimezone = rawBody.timezone ?? rawBody.schedule?.timezone;
  const fallbackTimezone = rawBody.metrics?.timezone;
  const timezone =
    explicitTimezone !== undefined && explicitTimezone !== null && explicitTimezone !== ''
      ? (isValidTimeZone(explicitTimezone) ? explicitTimezone.trim() : (explicitTimezone as string))
      : isValidTimeZone(fallbackTimezone)
        ? fallbackTimezone.trim()
        : null;

  const sourceInfo = classifySourceProvenance(rawBody);

  const explicitObsTime = rawBody.source?.observationTime;
  const fallbackObsTime =
    rawBody.metrics?.timestamp ??
    (sourceInfo.sourceType === 'physical_monitor' ? rawBody.metrics?.groundStation?.observedAt : undefined);
  const observationTime =
    explicitObsTime !== undefined && explicitObsTime !== null
      ? (typeof explicitObsTime === 'string' ? explicitObsTime.trim() : (explicitObsTime as string))
      : typeof fallbackObsTime === 'string' &&
          fallbackObsTime.trim().length > 0 &&
          !Number.isNaN(Date.parse(fallbackObsTime))
        ? fallbackObsTime.trim()
        : null;

  // Resolve PM2.5, PM10, AQI and AQI Standard without cross-labeling EPA AQI as CPCB or mixing providers
  const sourceUnavailable = Boolean(rawBody.selectedSourceUnavailable);
  const hasExplicitSourceOverride =
    rawBody.currentAmbientPm25 !== undefined ||
    rawBody.currentAmbientUsAqi !== undefined ||
    rawBody.currentAmbientCpcbAqi !== undefined ||
    sourceUnavailable;

  const pm25 = sourceUnavailable
    ? null
    : typeof rawBody.currentAmbientPm25 === 'number' && Number.isFinite(rawBody.currentAmbientPm25)
      ? rawBody.currentAmbientPm25
      : !hasExplicitSourceOverride &&
          typeof rawBody.metrics?.pm25 === 'number' &&
          Number.isFinite(rawBody.metrics.pm25)
        ? rawBody.metrics.pm25
        : null;

  // Only read metrics.pm10 when ambient measurements were not overridden by another single-pollutant provider
  const sameSourceAsMetrics =
    !hasExplicitSourceOverride ||
    (typeof rawBody.currentAmbientSource === 'string' &&
      typeof rawBody.metrics?.sourceAttribution === 'string' &&
      rawBody.currentAmbientSource.trim().toLowerCase() ===
        rawBody.metrics.sourceAttribution.trim().toLowerCase());
  const pm10 =
    !sourceUnavailable &&
    sameSourceAsMetrics &&
    typeof rawBody.metrics?.pm10 === 'number' &&
    Number.isFinite(rawBody.metrics.pm10)
      ? rawBody.metrics.pm10
      : null;

  const epaAqi = sourceUnavailable
    ? null
    : typeof rawBody.currentAmbientUsAqi === 'number' && Number.isFinite(rawBody.currentAmbientUsAqi)
      ? rawBody.currentAmbientUsAqi
      : !hasExplicitSourceOverride &&
          typeof rawBody.metrics?.usAqi === 'number' &&
          Number.isFinite(rawBody.metrics.usAqi)
        ? rawBody.metrics.usAqi
        : null;

  const cpcbAqi = sourceUnavailable
    ? null
    : typeof rawBody.currentAmbientCpcbAqi === 'number' && Number.isFinite(rawBody.currentAmbientCpcbAqi)
      ? rawBody.currentAmbientCpcbAqi
      : !hasExplicitSourceOverride &&
          typeof rawBody.metrics?.cpcbAqi === 'number' &&
          Number.isFinite(rawBody.metrics.cpcbAqi)
        ? rawBody.metrics.cpcbAqi
        : null;

  let aqi: number | null = null;
  let aqiStandard: 'cpcb' | 'epa' | 'unavailable' = 'unavailable';

  if (rawBody.aqiStandard === 'cpcb') {
    aqiStandard = 'cpcb';
    aqi = cpcbAqi; // Never copy epaAqi into CPCB without standard-specific derivation
  } else if (rawBody.aqiStandard === 'epa') {
    aqiStandard = 'epa';
    aqi = epaAqi;
  } else if (epaAqi !== null) {
    aqiStandard = 'epa';
    aqi = epaAqi;
  } else if (cpcbAqi !== null) {
    aqiStandard = 'cpcb';
    aqi = cpcbAqi;
  }

  let category: string | null = null;
  if (aqi !== null) {
    category =
      aqiStandard === 'cpcb'
        ? (typeof rawBody.metrics?.cpcbCategory === 'string' ? rawBody.metrics.cpcbCategory : getCpcbCategory(aqi))
        : getAQICategory(aqi);
  } else {
    category = 'Unavailable';
  }

  const rawForecastList: unknown[] | null = Array.isArray(rawBody.hourlyForecast)
    ? rawBody.hourlyForecast
    : Array.isArray(rawBody.metrics?.hourlyForecast)
      ? rawBody.metrics.hourlyForecast
      : null;

  const normalizedForecast = rawForecastList
    ? rawForecastList.map((pt: unknown) => {
        if (!pt || typeof pt !== 'object' || Array.isArray(pt)) return pt;
        const ptObj = pt as Record<string, unknown>;
        const resolvedTime = ptObj.validAtUtc ?? ptObj.timestamp ?? ptObj.time;
        const entry: Record<string, unknown> = {
          time: resolvedTime,
          pm25: ptObj.pm25UgM3 !== undefined ? ptObj.pm25UgM3 : (ptObj.pm25 ?? null),
          aqi: ptObj.aqi !== undefined ? ptObj.aqi : (ptObj.usAqi ?? null),
          windSpeedKmh: ptObj.windSpeedKmh !== undefined ? ptObj.windSpeedKmh : (ptObj.windSpeed ?? null),
          boundaryLayerHeight: ptObj.boundaryLayerHeight ?? null,
        };
        if (ptObj.units !== undefined) entry.units = ptObj.units;
        if (typeof ptObj.timezone === 'string' && ptObj.timezone.trim()) {
          entry.timezone = ptObj.timezone.trim();
        }
        return entry;
      })
    : rawBody.hourlyForecast;

  const sanitizedCountry =
    rawBody.country === undefined || rawBody.country === null
      ? null
      : typeof rawBody.country === 'string' && rawBody.country.trim()
        ? sanitizeTextLabel(rawBody.country, 'Unspecified Country')
        : (rawBody.country as string);

  const rawFreshness = rawBody.source?.freshnessHours;
  const freshness =
    rawFreshness !== undefined && rawFreshness !== null ? (rawFreshness as number) : null;

  const sanitizedTemp =
    typeof rawBody.metrics?.temperature === 'number' &&
    Number.isFinite(rawBody.metrics.temperature) &&
    rawBody.metrics.temperature >= -80 &&
    rawBody.metrics.temperature <= 70
      ? rawBody.metrics.temperature
      : rawBody.metrics?.temperature !== undefined && rawBody.metrics?.temperature !== null
        ? rawBody.metrics.temperature
        : null;

  const sanitizedHumidity =
    rawBody.metrics?.humidity !== undefined && rawBody.metrics?.humidity !== null
      ? rawBody.metrics.humidity
      : null;

  const sanitizedWindSpeed =
    rawBody.metrics?.windSpeed !== undefined && rawBody.metrics?.windSpeed !== null
      ? rawBody.metrics.windSpeed
      : null;

  const sanitizedWindDirection =
    rawBody.metrics?.windDirection !== undefined && rawBody.metrics?.windDirection !== null
      ? rawBody.metrics.windDirection
      : null;

  return {
    city: {
      name: cityName,
      latitude,
      longitude,
      country: sanitizedCountry,
      timezone,
    },
    source: {
      provider: sourceInfo.provider,
      sourceType: sourceInfo.sourceType,
      isModel: sourceInfo.isModel,
      observationTime,
      freshnessHours: freshness,
      stationName: sourceInfo.stationName,
      distanceKm: sourceInfo.distanceKm,
    },
    currentPollutants: {
      pm25,
      pm10,
      aqi,
      aqiStandard,
      category,
    },
    weather: {
      temperatureC: sanitizedTemp,
      relativeHumidity: sanitizedHumidity,
      windSpeedKmh: sanitizedWindSpeed,
      windDirectionDeg: sanitizedWindDirection,
    },
    userContext: {
      generalizedSensitivity: sensitivity,
      commuteMode: rawBody.commuteMode ?? 'mixed',
      indoorAirPurification: rawBody.indoorAirPurification ?? 'unknown',
    },
    schedule: rawBody.schedule,
    hourlyForecast: normalizedForecast as EnvironmentalDecisionContext['hourlyForecast'],
  };
}
