/**
 * AVIR — Verified Health Advisory Service
 * Step 8: Strict Evidence-Tier Separation, Medical Safety Safeguards, and Transparent Guidance
 */

import {
  HealthAdvisory,
  AdvisoryEvidenceLevel,
  OfficialGrapStatus,
} from '@/domain/regulatory-orders';

export interface AdvisoryInputParams {
  cityName: string;
  admin1?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  pm25: number | null | undefined;
  usAqi: number | null | undefined;
  timestamp?: string | null;
  provenance?: 'observed' | 'modeled_forecast' | 'derived_calculation' | 'unavailable';
  officialGrapStatus?: OfficialGrapStatus;
  userContext?: {
    isSensitiveGroup?: boolean; // Asthmatic, elderly, child, cardiac history
    isOutdoorWorker?: boolean;
  };
}

export interface AdvisoryEligibilityResult {
  isEligibleForEvidenceGuidance: boolean;
  reason?: string;
}

/**
 * Validates whether environmental telemetry is sufficiently verified and fresh
 * to support evidence-based health guidance.
 */
export function validateAdvisoryEligibility(params: AdvisoryInputParams): AdvisoryEligibilityResult {
  const hasValidPm25 =
    typeof params.pm25 === 'number' && Number.isFinite(params.pm25) && params.pm25 >= 0;
  const hasValidAqi =
    typeof params.usAqi === 'number' && Number.isFinite(params.usAqi) && params.usAqi >= 0;

  if (!hasValidPm25 && !hasValidAqi) {
    return {
      isEligibleForEvidenceGuidance: false,
      reason: 'Neither valid PM2.5 mass concentration nor valid AQI reading was provided.',
    };
  }

  // Validate timestamp freshness (max 24 hours old)
  if (params.timestamp) {
    const obsTime = new Date(params.timestamp).getTime();
    if (!isNaN(obsTime)) {
      const ageHours = (Date.now() - obsTime) / (3600 * 1000);
      if (ageHours > 24) {
        return {
          isEligibleForEvidenceGuidance: false,
          reason: `Telemetry observation is stale (${Math.round(ageHours)} hours old).`,
        };
      }
    }
  }

  return { isEligibleForEvidenceGuidance: true };
}

/**
 * Generates structured, evidence-tiered health advisories.
 * Explicitly separates:
 * 1. Official Regulatory Directives (government orders)
 * 2. Evidence-Based Health Guidance (environmental observations + established public-health literature)
 * 3. General Precautionary Guidance (baseline clean-air recommendations)
 */
export function generateHealthAdvisories(params: AdvisoryInputParams): HealthAdvisory[] {
  const advisories: HealthAdvisory[] = [];
  const nowIso = new Date().toISOString();
  const eligibility = validateAdvisoryEligibility(params);

  // -------------------------------------------------------------
  // TIER 1: OFFICIAL REGULATORY DIRECTIVE (If official order active)
  // -------------------------------------------------------------
  if (params.officialGrapStatus && params.officialGrapStatus.verification === 'verified') {
    const grap = params.officialGrapStatus;
    if (grap.highestActiveStage !== null) {
      advisories.push({
        id: `official-grap-stage-${grap.highestActiveStage}`,
        title: `Official CAQM Statutory Directive: Stage-${grap.highestActiveStage} Active`,
        message: `${grap.explanation} Mandatory restrictions apply across the entire NCR. All residential, commercial, and industrial facilities must comply with official gazette directions.`,
        evidenceLevel: 'official_directive',
        sourceUrls: [
          'https://caqm.nic.in/',
          'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/GRAP%20Orders/b91570de-8cc1-4735-8879-28f2bc1550f2.pdf',
        ],
        sourceNames: [
          'Commission for Air Quality Management in NCR & Adjoining Areas (CAQM)',
          'Statutory Gazette Orders',
        ],
        effectiveAt: grap.effectiveAt,
        generatedAt: nowIso,
        jurisdiction: grap.jurisdiction,
        dataFreshness: `Verified against official register as of ${grap.lastVerifiedAt || 'today'}`,
        limitations: [
          'Statutory orders are legally binding only within the National Capital Region.',
          'Penalties and enforcement are executed by state pollution control boards and district administrations.',
        ],
      });
    }

    if (grap.independentRestrictions.length > 0) {
      advisories.push({
        id: 'official-independent-restrictions',
        title: 'Official CAQM Independent Statutory Directives Active',
        message: `Continuing statutory mandates: ${grap.independentRestrictions.join('; ')}. These directions remain enforceable independent of GRAP stage revocations.`,
        evidenceLevel: 'official_directive',
        sourceUrls: ['https://caqm.nic.in/'],
        sourceNames: ['CAQM Statutory Directions under Section 12 of CAQM Act, 2021'],
        effectiveAt: grap.effectiveAt,
        generatedAt: nowIso,
        jurisdiction: grap.jurisdiction,
        dataFreshness: 'Verified active statutory direction',
        limitations: [
          'Applies to covered equipment and activities across the entire NCR.',
        ],
      });
    }
  }

  // -------------------------------------------------------------
  // TIER 2: EVIDENCE-BASED HEALTH GUIDANCE (If data is valid)
  // -------------------------------------------------------------
  if (eligibility.isEligibleForEvidenceGuidance) {
    const aqi = params.usAqi ?? 0;
    const pm25 = params.pm25 ?? 0;
    const isSensitive = Boolean(params.userContext?.isSensitiveGroup);
    const isOutdoor = Boolean(params.userContext?.isOutdoorWorker);

    let title = '';
    let message = '';
    const precautions: string[] = [];

    if (aqi <= 50) {
      title = 'Satisfactory Ambient Conditions — General Outdoor Guidance';
      message =
        'Ambient air quality is satisfactory. Fine particulate concentrations pose minimal acute respiratory risk for the general population.';
      precautions.push('Normal outdoor physical activity and ventilation are supported.');
      precautions.push('Individuals with hyper-reactive airways should follow standard personal medical action plans.');
    } else if (aqi <= 100) {
      title = 'Moderate Air Quality — Sensitive Individuals Monitor Symptoms';
      message =
        'Air quality is acceptable; however, fine dust concentrations may cause mild irritation in unusually sensitive individuals.';
      precautions.push('Individuals with diagnosed asthma or COPD should carry prescribed relief medication.');
      precautions.push('Unusually sensitive children should take more breaks during prolonged outdoor play.');
    } else if (aqi <= 150) {
      title = 'Unhealthy for Sensitive Groups — Exposure Reduction Recommended';
      message =
        'Members of sensitive groups (children, older adults, individuals with asthma, heart disease, or lung disease) may experience health effects. General public is less likely to be affected.';
      precautions.push('Sensitive groups should reduce prolonged or heavy outdoor exertion.');
      precautions.push('Move high-intensity cardiovascular training indoors or schedule during afternoon hours when thermal dispersion is highest.');
      precautions.push('Keep indoor classroom and living spaces filtered if mechanical HEPA filtration is available.');
    } else if (aqi <= 200) {
      title = 'Unhealthy Air — All Individuals Should Limit Prolonged Outdoor Exertion';
      message =
        'Elevated fine particulate concentrations can cause coughing, throat irritation, and airway constriction across the general population. Sensitive groups may experience more severe acute symptoms.';
      precautions.push('Everyone should reduce prolonged or heavy outdoor exertion.');
      precautions.push('Sensitive groups should avoid all outdoor physical exertion.');
      precautions.push('Wear a certified, well-fitted N95/FFP2 respirator when outdoor exposure is unavoidable.');
      precautions.push('Run mechanical HEPA filtration indoors and minimize natural door/window drafting during nocturnal inversion hours.');
    } else if (aqi <= 300) {
      title = 'Very Unhealthy Air Quality — Significant Health Alert';
      message =
        'High pollution emergency. The risk of respiratory inflammation, asthma exacerbations, and cardiovascular stress is significantly heightened for all residents.';
      precautions.push('Avoid outdoor running, sports, and intense physical work.');
      precautions.push('Outdoor workers should wear fit-tested N95 respirators with scheduled rest breaks in filtered indoor environments.');
      precautions.push('Keep indoor living areas sealed; run air purifiers in sealed rooms.');
      precautions.push('Consult a healthcare professional promptly if experiencing chest tightness, wheezing, or severe shortness of breath.');
    } else {
      title = 'Hazardous Air Quality — Severe Public Health Advisory';
      message =
        'Severe smog emergency. Serious threat of acute bronchospasm, systemic inflammation, and respiratory distress. Health warnings of emergency conditions for the entire population.';
      precautions.push('Remain indoors as much as possible with windows and doors securely closed.');
      precautions.push('Avoid all outdoor physical activity and sports.');
      precautions.push('Operate HEPA purifiers continuously in sealed bedrooms.');
      precautions.push('Seek immediate emergency medical attention for severe chest pain, extreme breathlessness, or persistent coughing.');
    }

    if (isSensitive) {
      message += ' (Sensitive respiratory/cardiac profile active: heightened precaution recommended).';
    }
    if (isOutdoor) {
      precautions.push('Occupational note: Outdoor workers should request protective personal respirators from employers.');
    }

    advisories.push({
      id: 'evidence-health-guidance',
      title,
      message: `${message}\n\nRecommended Protective Precautions:\n• ${precautions.join('\n• ')}`,
      evidenceLevel: 'evidence_based_guidance',
      sourceUrls: [
        'https://ncdc.mohfw.gov.in/',
        'https://cpcb.nic.in/',
      ],
      sourceNames: [
        'National Centre for Disease Control (NCDC), Ministry of Health & Family Welfare',
        'Central Pollution Control Board Health Guidelines',
      ],
      effectiveAt: params.timestamp || nowIso,
      generatedAt: nowIso,
      jurisdiction: params.cityName,
      dataFreshness: `Derived from ${params.provenance || 'telemetry feed'} reading (${aqi} AQI, ${pm25} µg/m³ PM2.5)`,
      limitations: [
        'Not a substitute for personalized clinical medical advice or diagnosis.',
        'Indoor air quality may vary significantly depending on room sealing, air exchange rates, and filtration efficiency.',
      ],
    });
  } else {
    // -------------------------------------------------------------
    // TIER 3 / 4: INSUFFICIENT DATA / GENERAL PRECAUTION
    // -------------------------------------------------------------
    advisories.push({
      id: 'insufficient-data-advisory',
      title: 'Current Air Quality Telemetry Unverified — General Clean-Air Guidance',
      message:
        'Current air-quality measurements could not be verified for this location. Follow local official government notices and check the latest published air-quality information on official monitoring portals (cpcb.nic.in / Sameer app).',
      evidenceLevel: 'insufficient_data',
      sourceUrls: ['https://cpcb.nic.in/', 'https://caqm.nic.in/'],
      sourceNames: ['Central Pollution Control Board', 'CAQM'],
      effectiveAt: null,
      generatedAt: nowIso,
      jurisdiction: params.cityName,
      dataFreshness: 'Telemetry unavailable — zero synthetic numbers substituted',
      limitations: [
        'Specific numerical thresholds cannot be evaluated without verified real-time measurements.',
        'Observe visible ambient visibility and regional weather bulletins.',
      ],
    });
  }

  // -------------------------------------------------------------
  // TIER 3: GENERAL PRECAUTIONARY CLEAN-AIR GUIDANCE (Always safe)
  // -------------------------------------------------------------
  advisories.push({
    id: 'general-precautionary-guidance',
    title: 'Baseline Community Air Protection Measures',
    message:
      'Community Clean-Air Principles:\n1. Zero Open Waste Burning: Do not burn leaves, garbage, or plastic biomass. Report burning incidents immediately.\n2. Dust Suppression: Sprinkle water on unpaved pathways, driveways, and construction perimeters.\n3. Vehicle Maintenance: Ensure up-to-date Pollution Under Control (PUC) certification and avoid vehicle idling.\n4. Vulnerable Support: Ensure senior citizens and individuals with chronic respiratory conditions have access to medications.',
    evidenceLevel: 'general_precaution',
    sourceUrls: ['https://cpcb.nic.in/'],
    sourceNames: ['CPCB Clean Air Baseline Protocols'],
    effectiveAt: null,
    generatedAt: nowIso,
    jurisdiction: params.cityName,
    dataFreshness: 'Universal precautionary protocol',
    limitations: [
      'Universal voluntary civic guidelines; does not constitute a formal emergency decree.',
    ],
  });

  return advisories;
}
