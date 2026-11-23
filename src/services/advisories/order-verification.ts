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

/**
 * Validates whether a URL originates strictly from an allowlisted government authority domain.
 * Blocks arbitrary URLs, open proxies, IP addresses, and SSRF attack vectors.
 */
export function isAuthoritativeGovernmentDomain(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Reject IP addresses (IPv4 or IPv6)
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[') || hostname === 'localhost') {
      return false;
    }

    return AUTHORITATIVE_GOVERNMENT_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
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
  if (!o.officialSourceUrl || typeof o.officialSourceUrl !== 'string') {
    errors.push('Official source URL must be specified');
  } else if (!isAuthoritativeGovernmentDomain(o.officialSourceUrl)) {
    errors.push(`Official source URL must belong to an allowlisted government domain (${AUTHORITATIVE_GOVERNMENT_DOMAINS.join(', ')})`);
  }

  // Date validation (ISO 8601)
  const validateIsoDate = (field: string, val: unknown, required: boolean): string | null => {
    if (val === null || val === undefined || val === '') {
      if (required) errors.push(`${field} is required`);
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
  const validActions = ['invoke', 'revoke', 'amend', 'clarify', 'independent_restriction'];
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
  if (!Array.isArray(o.jurisdiction) || o.jurisdiction.length === 0) {
    errors.push('Jurisdiction must be a non-empty array of covered territories');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const sanitizedOrder: RegulatoryOrder = {
    id: String(o.id).trim(),
    issuingAuthority: String(o.issuingAuthority).trim(),
    title: String(o.title).trim(),
    orderNumber: typeof o.orderNumber === 'string' ? o.orderNumber.trim() : null,
    officialSourceUrl: String(o.officialSourceUrl).trim(),
    publishedAt,
    effectiveFrom,
    effectiveUntil,
    jurisdiction: (o.jurisdiction as string[]).map((j) => String(j).trim()),
    jurisdictionBasis: typeof o.jurisdictionBasis === 'string' ? o.jurisdictionBasis.trim() : null,
    action: o.action as RegulatoryOrder['action'],
    grapStage: (o.grapStage as RegulatoryOrder['grapStage']) ?? null,
    status: o.status as RegulatoryVerificationStatus,
    verifiedAt,
    supersedesOrderIds: Array.isArray(o.supersedesOrderIds) ? o.supersedesOrderIds.map(String) : [],
    notes: Array.isArray(o.notes) ? o.notes.map(String) : [],
  };

  return { isValid: true, errors: [], sanitizedOrder };
}
