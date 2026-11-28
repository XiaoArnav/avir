/**
 * Avir Planning Domain Types & Secure AI Architecture Contracts
 * Step 16: Secure AI Planning & Three-Tier Architecture
 */

import { DailySchedule, RoutineActivity } from './routine-types';

export type OptimizationStatus = 'optimal' | 'partial' | 'unfeasible' | 'unavailable';

export interface ActivityShiftDetail {
  activityId: string;
  activityName: string;
  originalStart: string; // "HH:mm"
  originalEnd: string;   // "HH:mm"
  proposedStart: string; // "HH:mm"
  proposedEnd: string;   // "HH:mm"
  shiftMinutes: number;
  originalMassUg: number;
  optimizedMassUg: number;
  savingsUg: number;
  savingsPercent: number;
  reason: string;
}

export interface DeterministicPlanResult {
  status: OptimizationStatus;
  statusMessage: string;
  planFingerprint: string;
  baselineExposureUg: number;
  optimizedExposureUg: number;
  absoluteSavingsUg: number;
  percentageSavings: number;
  activityShifts: ActivityShiftDetail[];
  unalteredActivities: RoutineActivity[];
  calculationTimestamp: string;
  forecastProvenance: {
    provider: string;
    forecastStart: string;
    forecastHoursEvaluated: number;
    isSynthetic: false;
    sourceClassification?: 'official_atmospheric_model' | 'atmospheric_model' | 'user_supplied_scenario' | 'unavailable';
    isVerifiedAtmosphericModel?: boolean;
  };
  limitations: string[];
}

export interface AiPlanExplanation {
  summary: string;
  narrative: string;
  actionableRecommendations: string[];
  healthContext: string;
  modelAttribution: string;
  generatedAt: string;
  isDeterministicVerified: true;
}

export type GeneralizedSensitivity = 'standard' | 'sensitive' | 'highly_sensitive';

export interface PlanApiRequestPayload {
  city: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  schedule: DailySchedule;
  generalizedSensitivity?: GeneralizedSensitivity;
}

export interface PlanApiResponse {
  success: boolean;
  deterministicPlan: DeterministicPlanResult;
  aiExplanation?: AiPlanExplanation;
  error?: string;
  validationErrors?: string[];
}
