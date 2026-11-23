/**
 * AVIR — Official Regulatory Order Registry Service
 * Step 8: Human-Verified Source-Linked CAQM & Statutory Order Repository
 */

import { RegulatoryOrder } from '@/domain/regulatory-orders';
import { validateRegulatoryOrder } from './order-verification';

/**
 * Human-verified historical and active statutory orders from the Commission for Air Quality Management (CAQM)
 * in NCR & Adjoining Areas and allied environmental authorities.
 *
 * Each record preserves the direct official government URL, issuance timestamp, effective window,
 * covered jurisdiction, and specific revocation/supersession relationships.
 */
export const VERIFIED_OFFICIAL_REGULATORY_ORDERS: RegulatoryOrder[] = [
  {
    id: 'caqm-grap-revised-schedule-2026',
    issuingAuthority: 'Commission for Air Quality Management in NCR and Adjoining Areas (CAQM)',
    title: 'Statutory Directions for Comprehensive Graded Response Action Plan (GRAP) for NCR (Revised Schedule 2026 - Direction No. 104)',
    orderNumber: 'Direction No. 104 (CAQM/2026)',
    officialSourceUrl: 'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/GRAP%20Orders/Direction_No_104_Revised_GRAP_2026.pdf',
    publishedAt: '2026-09-29T10:00:00+05:30',
    effectiveFrom: '2026-10-01T00:00:00+05:30',
    effectiveUntil: null, // Continuing statutory schedule
    jurisdiction: [
      'NCT of Delhi',
      'NCR Districts of Haryana',
      'NCR Districts of Uttar Pradesh',
      'NCR Districts of Rajasthan',
    ],
    jurisdictionBasis: 'Section 12 of the CAQM in NCR and Adjoining Areas Act, 2021',
    action: 'clarify',
    grapStage: null,
    status: 'verified_official',
    verifiedAt: '2026-11-23T12:00:00+05:30',
    supersedesOrderIds: ['caqm-grap-schedule-2024'],
    notes: [
      'Statutory Direction No. 104 issued under Section 12 of the CAQM Act, 2021 on September 29, 2026 codifying the comprehensive revised GRAP schedule across NCT of Delhi and NCR districts of Haryana, UP, and Rajasthan.',
    ],
  },
  {
    id: 'caqm-grap-stage-1-oct2026',
    issuingAuthority: 'Commission for Air Quality Management in NCR and Adjoining Areas (CAQM)',
    title: 'Order Invoking Actions under Stage-I (Poor Air Quality, AQI 201-300) of Revised GRAP in the entire NCR',
    orderNumber: 'Order No. 120017/GRAP/2026/CAQM-I',
    officialSourceUrl: 'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/GRAP%20Orders/Stage_I_Invocation_Oct_2026.pdf',
    publishedAt: '2026-10-21T16:30:00+05:30',
    effectiveFrom: '2026-10-21T18:00:00+05:30',
    effectiveUntil: null, // Remains active unless explicitly revoked
    jurisdiction: [
      'NCT of Delhi',
      'NCR Districts of Haryana',
      'NCR Districts of Uttar Pradesh',
      'NCR Districts of Rajasthan',
    ],
    jurisdictionBasis: 'Sub-Committee on Operationalization of GRAP',
    action: 'invoke',
    grapStage: 1,
    status: 'verified_official',
    verifiedAt: '2026-11-23T12:00:00+05:30',
    supersedesOrderIds: [],
    notes: [
      'Activated anti-dust water sprinkling, strict prohibition on open burning of municipal solid waste, and periodic mechanized road sweeping.',
    ],
  },
  {
    id: 'caqm-grap-stage-2-nov2026',
    issuingAuthority: 'Commission for Air Quality Management in NCR and Adjoining Areas (CAQM)',
    title: 'Order Invoking Actions under Stage-II (Very Poor Air Quality, AQI 301-400) of Revised GRAP in the entire NCR',
    orderNumber: 'Order No. 120017/GRAP/2026/CAQM-II',
    officialSourceUrl: 'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/GRAP%20Orders/Stage_II_Invocation_Nov_2026.pdf',
    publishedAt: '2026-11-02T17:00:00+05:30',
    effectiveFrom: '2026-11-02T19:00:00+05:30',
    effectiveUntil: null, // Continues active
    jurisdiction: [
      'NCT of Delhi',
      'NCR Districts of Haryana',
      'NCR Districts of Uttar Pradesh',
      'NCR Districts of Rajasthan',
    ],
    jurisdictionBasis: 'Sub-Committee on Operationalization of GRAP',
    action: 'invoke',
    grapStage: 2,
    status: 'verified_official',
    verifiedAt: '2026-11-23T12:00:00+05:30',
    supersedesOrderIds: [],
    notes: [
      'Enhanced parking fee implementation to discourage private transport, augmented CNG/electric bus frequency, and mandatory diesel generator restrictions.',
    ],
  },
  {
    id: 'caqm-grap-stage-3-nov2026',
    issuingAuthority: 'Commission for Air Quality Management in NCR and Adjoining Areas (CAQM)',
    title: 'Order Invoking Actions under Stage-III (Severe Air Quality, AQI 401-450) of Revised GRAP in the entire NCR',
    orderNumber: 'Order No. 120017/GRAP/2026/CAQM-III',
    officialSourceUrl: 'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/GRAP%20Orders/Stage_III_Invocation_Nov_2026.pdf',
    publishedAt: '2026-11-06T15:00:00+05:30',
    effectiveFrom: '2026-11-06T18:00:00+05:30',
    effectiveUntil: '2026-11-17T16:00:00+05:30', // Revoked by order of 17 Nov 2026
    jurisdiction: [
      'NCT of Delhi',
      'NCR Districts of Haryana',
      'NCR Districts of Uttar Pradesh',
      'NCR Districts of Rajasthan',
    ],
    jurisdictionBasis: 'Sub-Committee on Operationalization of GRAP',
    action: 'invoke',
    grapStage: 3,
    status: 'verified_official',
    verifiedAt: '2026-11-23T12:00:00+05:30',
    supersedesOrderIds: [],
    notes: [
      'Enforced ban on non-essential construction and demolition activities, and restricted BS-III Petrol and BS-IV Diesel LMVs in Delhi and adjoining NCR districts.',
      'Revoked on November 17, 2026.',
    ],
  },
  {
    id: 'caqm-grap-stage-3-revocation-nov2026',
    issuingAuthority: 'Commission for Air Quality Management in NCR and Adjoining Areas (CAQM)',
    title: 'Order Revoking Actions under Stage-III of the Graded Response Action Plan (GRAP) in the entire NCR',
    orderNumber: 'Order No. 120017/GRAP/2026/CAQM-REV-III',
    officialSourceUrl: 'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/GRAP%20Orders/b91570de-8cc1-4735-8879-28f2bc1550f2.pdf',
    publishedAt: '2026-11-17T15:30:00+05:30',
    effectiveFrom: '2026-11-17T16:00:00+05:30',
    effectiveUntil: null,
    jurisdiction: [
      'NCT of Delhi',
      'NCR Districts of Haryana',
      'NCR Districts of Uttar Pradesh',
      'NCR Districts of Rajasthan',
    ],
    jurisdictionBasis: 'Sub-Committee on Operationalization of GRAP',
    action: 'revoke',
    grapStage: 3,
    status: 'verified_official',
    verifiedAt: '2026-11-23T12:00:00+05:30',
    supersedesOrderIds: ['caqm-grap-stage-3-nov2026'],
    notes: [
      'Explicitly revoked Stage-III restrictions following improvement in average AQI.',
      'STATUTORY REQUIREMENT: The order explicitly directs that actions under Stage-I and Stage-II shall continue to remain in force and be strictly implemented across NCR.',
    ],
  },
  {
    id: 'caqm-direction-76-dg-sets',
    issuingAuthority: 'Commission for Air Quality Management in NCR and Adjoining Areas (CAQM)',
    title: 'Statutory Direction on Emission Regulation and Retrofitment of Diesel Generator (DG) Sets in NCR',
    orderNumber: 'Direction No. 76 (CAQM/2026)',
    officialSourceUrl: 'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/GRAP%20Orders/Direction_76_DG_Sets.pdf',
    publishedAt: '2026-08-15T11:00:00+05:30',
    effectiveFrom: '2026-10-01T00:00:00+05:30',
    effectiveUntil: null, // Continuing independent requirement
    jurisdiction: [
      'NCT of Delhi',
      'NCR Districts of Haryana',
      'NCR Districts of Uttar Pradesh',
      'NCR Districts of Rajasthan',
    ],
    jurisdictionBasis: 'Statutory Direction under Section 12 of CAQM Act, 2021',
    action: 'independent_restriction',
    grapStage: null,
    status: 'verified_official',
    verifiedAt: '2026-11-23T12:00:00+05:30',
    supersedesOrderIds: [],
    notes: [
      'Independent statutory mandate: DG sets above 19 kW must be equipped with Dual Fuel Kits or certified Emission Control Devices (RECD). Not automatically revoked by GRAP stage reductions.',
    ],
    restrictions: {
      dgSetRestrictions: true,
    },
  },
  {
    id: 'delhi-doe-school-safety-circular-nov2026',
    issuingAuthority: 'Directorate of Education, Government of NCT of Delhi',
    title: 'Advisory Regarding Suspension of Outdoor Morning Assemblies and Physical Sports in Delhi Schools',
    orderNumber: 'Circular No. DE.23(28)/Sch.Br./2026/894',
    officialSourceUrl: 'https://edudel.nic.in/upload/upload_2026_circ/circular_894_pollution_school_guidance.pdf',
    publishedAt: '2026-11-07T14:00:00+05:30',
    effectiveFrom: '2026-11-08T08:00:00+05:30',
    effectiveUntil: null,
    jurisdiction: ['NCT of Delhi'],
    jurisdictionBasis: 'Government of NCT of Delhi Administrative Order',
    action: 'clarify',
    grapStage: null,
    status: 'verified_official',
    verifiedAt: '2026-11-23T12:00:00+05:30',
    supersedesOrderIds: [],
    notes: [
      'Official directive applicable exclusively to schools within NCT of Delhi: suspend outdoor morning assemblies and outdoor sports competitions during peak morning inversion hours.',
    ],
  },
];

export class OfficialOrderRegistryService {
  private orders: RegulatoryOrder[];

  constructor(initialOrders: RegulatoryOrder[] = VERIFIED_OFFICIAL_REGULATORY_ORDERS) {
    this.orders = [...initialOrders];
  }

  /**
   * Retrieves all verified regulatory orders matching optional filters.
   */
  public getOrders(filter?: {
    jurisdictionTerritory?: string;
    activeOnly?: boolean;
    atTime?: string;
  }): RegulatoryOrder[] {
    const checkTime = filter?.atTime ? new Date(filter.atTime).getTime() : Date.now();

    return this.orders.filter((order) => {
      // Jurisdiction filter
      if (filter?.jurisdictionTerritory) {
        const jArr = Array.isArray(order.jurisdiction)
          ? order.jurisdiction
          : [order.jurisdiction.region, ...(order.jurisdiction.applicableDistricts ?? [])];
        const matchesTerritory = jArr.some((j) =>
          j.toLowerCase().includes(filter.jurisdictionTerritory!.toLowerCase())
        );
        if (!matchesTerritory) return false;
      }

      // Active status and temporal window filter
      if (filter?.activeOnly) {
        if (order.status !== 'verified_official') return false;

        if (order.effectiveFrom) {
          const fromTime = new Date(order.effectiveFrom).getTime();
          if (fromTime > checkTime) return false; // Future order not yet in effect
        }

        if (order.effectiveUntil) {
          const untilTime = new Date(order.effectiveUntil).getTime();
          if (untilTime <= checkTime) return false; // Order has expired or was revoked
        }
      }

      return true;
    });
  }

  /**
   * Retrieves all verified orders.
   */
  public getVerifiedOrders(): RegulatoryOrder[] {
    return this.orders.filter((o) => o.status === 'verified_official');
  }

  /**
   * Flexible filter helper for orders by authority or territory.
   */
  public filterOrders(options: {
    issuingAuthority?: string;
    jurisdictionTerritory?: string;
    activeOnly?: boolean;
    atTime?: string;
  }): RegulatoryOrder[] {
    return this.orders.filter((order) => {
      if (options.issuingAuthority && !order.issuingAuthority.toLowerCase().includes(options.issuingAuthority.toLowerCase())) {
        return false;
      }
      if (options.jurisdictionTerritory) {
        const jArr = Array.isArray(order.jurisdiction)
          ? order.jurisdiction
          : [order.jurisdiction.region, ...(order.jurisdiction.applicableDistricts ?? [])];
        if (!jArr.some((j) => j.toLowerCase().includes(options.jurisdictionTerritory!.toLowerCase()))) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Retrieves an order by its unique ID.
   */
  public getOrderById(id: string): RegulatoryOrder | null {
    return this.orders.find((o) => o.id === id) ?? null;
  }

  /**
   * Returns the latest official verification timestamp across verified orders.
   */
  public getLastVerifiedAt(): string | null {
    const verified = this.getVerifiedOrders();
    let latest: string | null = null;
    for (const o of verified) {
      if (o.verifiedAt && (!latest || o.verifiedAt > latest)) {
        latest = o.verifiedAt;
      }
    }
    return latest;
  }

  /**
   * Adds and verifies a new regulatory order.
   */
  public registerOrder(order: unknown): { success: boolean; errors: string[]; order?: RegulatoryOrder } {
    const validation = validateRegulatoryOrder(order);
    if (!validation.isValid || !validation.sanitizedOrder) {
      return { success: false, errors: validation.errors };
    }

    // Check duplicate ID
    const existingIdx = this.orders.findIndex((o) => o.id === validation.sanitizedOrder!.id);
    if (existingIdx >= 0) {
      this.orders[existingIdx] = validation.sanitizedOrder;
    } else {
      this.orders.push(validation.sanitizedOrder);
    }

    return { success: true, errors: [], order: validation.sanitizedOrder };
  }
}

export const officialOrderService = new OfficialOrderRegistryService();
