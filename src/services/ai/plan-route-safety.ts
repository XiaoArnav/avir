import { inspectPromptInjection } from '@/lib/security/sanitizer';

const UNSAFE_MEDICAL_OR_GUARANTEE_PATTERNS = [
  /\b(asthma|copd|angina|pregnan(?:t|cy)|bronchitis|emphysema|cardiovascular disease)\b/i,
  /\b(diagnos(?:e|ed|is)|prescrib(?:e|ed|ing)|prescription|cure|treat(?:s|ing)? your)\b/i,
  /\b(zero health risk|completely safe|guaranteed safe|100% safe)\b/i,
];

export interface ValidatedAiExplanationFields {
  summary: string;
  narrative: string;
  actionableRecommendations: string[];
  healthContext: string;
}

/**
 * Checks whether LLM-generated prose includes medical claims, prescriptions, or safety guarantees.
 */
export function containsUnsafeMedicalOrGuaranteeClaim(text: string): boolean {
  return UNSAFE_MEDICAL_OR_GUARANTEE_PATTERNS.some((re) => re.test(text));
}

/**
 * Validates that an LLM output field is non-empty, length-bounded, free of hallucinated digits,
 * free of unsafe medical claims, and clean of prompt-injection patterns.
 */
export function isSafeAiText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 1500 &&
    !/\d/.test(value.replace(/\b(?:PM2\.5|PM10|N95|FFP2|CO2)\b/gi, '')) &&
    !containsUnsafeMedicalOrGuaranteeClaim(value) &&
    !inspectPromptInjection(value).isThreatDetected
  );
}

/**
 * Parses and validates the JSON payload returned by Gemini, rejecting unsafe or fabricated responses.
 */
export function parseAndValidateGeminiExplanation(
  candidateText: string
): ValidatedAiExplanationFields {
  const parsedRaw: unknown = JSON.parse(candidateText);
  const parsedObj =
    parsedRaw && typeof parsedRaw === 'object' && !Array.isArray(parsedRaw)
      ? (parsedRaw as Record<string, unknown>)
      : null;

  if (
    !parsedObj ||
    !Array.isArray(parsedObj.actionableRecommendations) ||
    parsedObj.actionableRecommendations.length === 0 ||
    parsedObj.actionableRecommendations.length > 8 ||
    !isSafeAiText(parsedObj.summary) ||
    !isSafeAiText(parsedObj.narrative) ||
    !isSafeAiText(parsedObj.healthContext) ||
    !parsedObj.actionableRecommendations.every(isSafeAiText)
  ) {
    throw new Error('Unusable explanation');
  }

  return {
    summary: parsedObj.summary.trim(),
    narrative: parsedObj.narrative.trim(),
    actionableRecommendations: parsedObj.actionableRecommendations.map((r) => r.trim()),
    healthContext: parsedObj.healthContext.trim(),
  };
}
