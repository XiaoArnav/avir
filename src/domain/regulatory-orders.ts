/**
 * AVIR — Regulatory Orders & Official GRAP Intelligence Domain
 * Step 8: Verified CAQM Orders, Jurisdiction Mapping, and Regulatory Intelligence
 */

export type RegulatoryVerificationStatus =
  | 'verified_official'
  | 'unverified'
  | 'expired'
  | 'superseded'
  | 'revoked'
  | 'conflicting'
  | 'unavailable';

export type RegulatoryOrderAction =
  | 'invoke'
  | 'revoke'
  | 'amend'
  | 'clarify'
  | 'independent_restriction'
  | 'invoke_stage'
  | 'revoke_stage'
  | 'independent_directive';

export type GrapStage = 1 | 2 | 3 | 4;

export interface JurisdictionTarget {
  region: string;
  applicableDistricts?: string[];
}

export type RegulatoryOrderJurisdiction = string[] | JurisdictionTarget;

export interface RegulatoryOrder {
  id: string;
  issuingAuthority: string;
  title: string;
  orderNumber: string | null;
  officialSourceUrl: string;
  sourceUrl?: string;
  summary?: string;
  publishedAt: string | null; // ISO 8601
  effectiveFrom: string | null; // ISO 8601
  effectiveUntil: string | null; // ISO 8601 or null if indefinite until revoked
  jurisdiction: RegulatoryOrderJurisdiction;
  jurisdictionBasis?: string | null;
  action: RegulatoryOrderAction;
  grapStage: GrapStage | null;
  status: RegulatoryVerificationStatus;
  verifiedAt?: string | null;
  verificationDate?: string | null;
  supersedesOrderIds?: string[];
  notes?: string[];
  specificDirectives?: string[];
  restrictions?: {
    constructionBanned?: boolean;
    dgSetRestrictions?: boolean;
    schoolInstructionMode?: string;
    vehicleRestrictions?: string[];
    [key: string]: unknown;
  };
  revokesStage?: GrapStage;
}

export type GrapVerificationLevel =
  | 'verified'
  | 'unknown'
  | 'conflicting'
  | 'not_applicable';

export interface OfficialGrapStatus {
  jurisdiction: string;
  verification: GrapVerificationLevel;
  highestActiveStage: GrapStage | null;
  activeStages: GrapStage[];
  governingOrderIds: string[];
  independentRestrictionOrderIds: string[];
  effectiveAt: string | null;
  lastVerifiedAt: string | null;
  explanation: string;
  independentRestrictions: string[];
}

export interface JurisdictionAssessment {
  isNcr: boolean;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  regionName: string;
  details: string;
}

export type AdvisoryEvidenceLevel =
  | 'official_directive'
  | 'evidence_based_guidance'
  | 'general_precaution'
  | 'insufficient_data';

export interface HealthAdvisory {
  id: string;
  title: string;
  message: string;
  evidenceLevel: AdvisoryEvidenceLevel;
  sourceUrls: string[];
  sourceNames: string[];
  effectiveAt: string | null;
  generatedAt: string;
  jurisdiction: string | null;
  dataFreshness: string;
  limitations: string[];
}
