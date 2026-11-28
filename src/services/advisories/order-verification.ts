/**
 * AVIR — Regulatory Order Verification & Security Validation
 * Step 8: Strict Allowlisting, Ingestion Sanitization, and Validation Gates
 */

import { RegulatoryOrder, RegulatoryVerificationStatus } from '@/domain/regulatory-orders';

export const AUTHORITATIVE_GOVERNMENT_DOMAINS = [
  'caqm.nic.in',
  'cpcb.nic.in',
  'cpcbccr.com',
  'ncdc.mohfw.gov.in',
  'pib.gov.in',
  'delhi.gov.in',
  'edudel.nic.in',
  'parivesh.nic.in',
] as const;

export const STRICT_GOV_DOMAIN_ALLOWLIST = AUTHORITATIVE_GOVERNMENT_DOMAINS;

/**
 * Validates whether a URL originates strictly from an allowlisted government authority domain with https.
 * Blocks arbitrary URLs, open proxies, IP addresses, insecure protocols, and SSRF attack vectors.
 */
export function validateOrderSourceUrl(urlStr: string): { isValid: boolean; error?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string' };
  }

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Protocol must be https:' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Reject IP addresses (IPv4 or IPv6) or localhost
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[') || hostname === 'localhost') {
      return { isValid: false, error: 'IP addresses and localhost are strictly prohibited' };
    }

    const isGov = AUTHORITATIVE_GOVERNMENT_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isGov) {
      return {
        isValid: false,
        error: `Official source URL must belong to an allowlisted government domain (${AUTHORITATIVE_GOVERNMENT_DOMAINS.join(', ')})`,
      };
    }

    return { isValid: true };
  } catch (err: unknown) {
    return {
      isValid: false,
      error: err instanceof Error && err.message ? err.message : 'Invalid URL',
    };
  }
}

/**
 * Validates whether a URL originates strictly from an allowlisted government authority domain.
 */
export function isAuthoritativeGovernmentDomain(urlStr: string): boolean {
  return validateOrderSourceUrl(urlStr).isValid;
}

export interface OrderValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedOrder?: RegulatoryOrder;
}

/**
 * Validates a regulatory order record against strict schema, security, and temporal invariants.
 */
export function validateRegulatoryOrder(raw: unknown): OrderValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { isValid: false, errors: ['Order must be a non-null object'] };
  }

  const o = raw as Record<string, unknown>;

  // ID validation
  if (!o.id || typeof o.id !== 'string' || o.id.trim().length === 0) {
    errors.push('Order ID must be a non-empty string');
  }

  // Issuing Authority
  if (!o.issuingAuthority || typeof o.issuingAuthority !== 'string' || o.issuingAuthority.trim().length === 0) {
    errors.push('Issuing authority must be specified');
  }

  // Title
  if (!o.title || typeof o.title !== 'string' || o.title.trim().length === 0) {
    errors.push('Title must be specified');
  }

  // Official Source URL Security & Domain Allowlist
  const rawUrl = o.officialSourceUrl || o.sourceUrl;
  if (!rawUrl || typeof rawUrl !== 'string') {
    errors.push('Official source URL must be specified');
  } else {
    const urlValidation = validateOrderSourceUrl(rawUrl);
    if (!urlValidation.isValid) {
      errors.push(urlValidation.error || 'Official source URL is invalid');
    }
  }

  // Date validation (ISO 8601)
  const validateIsoDate = (field: string, val: unknown, required: boolean): string | null => {
    if (val === null || val === undefined) {
      if (required) errors.push(`${field} is required`);
      return null;
    }
    if (val === '') {
      errors.push(`${field} cannot be empty`);
      return null;
    }
    if (typeof val !== 'string') {
      errors.push(`${field} must be an ISO 8601 string`);
      return null;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      errors.push(`${field} contains an invalid date format`);
      return null;
    }
    return val;
  };

  const publishedAt = validateIsoDate('publishedAt', o.publishedAt, false);
  const effectiveFrom = validateIsoDate('effectiveFrom', o.effectiveFrom, true);
  const effectiveUntil = validateIsoDate('effectiveUntil', o.effectiveUntil, false);
  const verifiedAt = validateIsoDate('verifiedAt', o.verifiedAt, false);

  if (effectiveFrom && effectiveUntil) {
    if (new Date(effectiveUntil).getTime() < new Date(effectiveFrom).getTime()) {
      errors.push('effectiveUntil cannot precede effectiveFrom');
    }
  }

  // Action validation
  const validActions = [
    'invoke',
    'revoke',
    'amend',
    'clarify',
    'independent_restriction',
    'invoke_stage',
    'revoke_stage',
    'independent_directive',
  ];
  if (!o.action || typeof o.action !== 'string' || !validActions.includes(o.action)) {
    errors.push(`Action must be one of: ${validActions.join(', ')}`);
  }

  // GRAP Stage validation
  if (o.grapStage !== null && o.grapStage !== undefined) {
    if (![1, 2, 3, 4].includes(o.grapStage as number)) {
      errors.push('grapStage must be 1, 2, 3, 4, or null');
    }
  }

  // Status validation
  const validStatuses: RegulatoryVerificationStatus[] = [
    'verified_official',
    'unverified',
    'expired',
    'superseded',
    'revoked',
    'conflicting',
    'unavailable',
  ];
  if (!o.status || typeof o.status !== 'string' || !validStatuses.includes(o.status as RegulatoryVerificationStatus)) {
    errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  // Jurisdiction
  let sanitizedJurisdiction: RegulatoryOrder['jurisdiction'] | null = null;
  if (Array.isArray(o.jurisdiction)) {
    if (o.jurisdiction.length === 0) {
      errors.push('Jurisdiction must be a non-empty array of covered territories');
    } else {
      sanitizedJurisdiction = o.jurisdiction.map((j) => String(j).trim());
    }
  } else if (o.jurisdiction && typeof o.jurisdiction === 'object') {
    const jObj = o.jurisdiction as Record<string, unknown>;
    if (!jObj.region || typeof jObj.region !== 'string' || jObj.region.trim().length === 0) {
      errors.push('Jurisdiction region must be specified');
    } else {
      sanitizedJurisdiction = {
        region: String(jObj.region).trim(),
        applicableDistricts: Array.isArray(jObj.applicableDistricts)
          ? jObj.applicableDistricts.map(String)
          : undefined,
      };
    }
  } else {
    errors.push('Jurisdiction must be specified');
  }

  if (errors.length > 0 || !sanitizedJurisdiction) {
    return { isValid: false, errors };
  }

  const sanitizedOrder: RegulatoryOrder = {
    id: String(o.id).trim(),
    issuingAuthority: String(o.issuingAuthority).trim(),
    title: String(o.title).trim(),
    orderNumber: typeof o.orderNumber === 'string' ? o.orderNumber.trim() : null,
    officialSourceUrl: String(rawUrl).trim(),
    sourceUrl: String(rawUrl).trim(),
    summary: typeof o.summary === 'string' ? o.summary.trim() : undefined,
    publishedAt,
    effectiveFrom,
    effectiveUntil,
    jurisdiction: sanitizedJurisdiction,
    jurisdictionBasis: typeof o.jurisdictionBasis === 'string' ? o.jurisdictionBasis.trim() : null,
    action: o.action as RegulatoryOrder['action'],
    grapStage: (o.grapStage as RegulatoryOrder['grapStage']) ?? null,
    status: o.status as RegulatoryVerificationStatus,
    verifiedAt,
    verificationDate: typeof o.verificationDate === 'string' ? o.verificationDate : verifiedAt,
    supersedesOrderIds: Array.isArray(o.supersedesOrderIds) ? o.supersedesOrderIds.map(String) : [],
    notes: Array.isArray(o.notes) ? o.notes.map(String) : [],
    specificDirectives: Array.isArray(o.specificDirectives) ? o.specificDirectives.map(String) : undefined,
    restrictions:
      o.restrictions && typeof o.restrictions === 'object' && !Array.isArray(o.restrictions)
        ? (o.restrictions as RegulatoryOrder['restrictions'])
        : undefined,
    revokesStage: [1, 2, 3, 4].includes(o.revokesStage as number)
      ? (o.revokesStage as RegulatoryOrder['revokesStage'])
      : undefined,
  };

  return { isValid: true, errors: [], sanitizedOrder };
}
