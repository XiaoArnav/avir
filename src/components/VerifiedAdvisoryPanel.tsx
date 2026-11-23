'use client';

import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Info,
  Clock,
  MapPin,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';
import { OfficialGrapStatus } from '@/domain/regulatory-orders';
import { officialOrderService } from '@/services/advisories/official-order-service';

interface VerifiedAdvisoryPanelProps {
  status: OfficialGrapStatus;
  cityName: string;
  className?: string;
  showDetails?: boolean;
}

export const VerifiedAdvisoryPanel: React.FC<VerifiedAdvisoryPanelProps> = ({
  status,
  cityName,
  className = '',
  showDetails = true,
}) => {
  const isVerified = status.verification === 'verified';
  const isNotApplicable = status.verification === 'not_applicable';
  const isUnknown = status.verification === 'unknown';
  const isConflicting = status.verification === 'conflicting';

  // Get governing orders
  const governingOrders = status.governingOrderIds
    .map((id) => officialOrderService.getOrderById(id))
    .filter((o): o is NonNullable<typeof o> => o !== null);

  const stageBadgeStyle = () => {
    if (isNotApplicable) {
      return 'bg-stone-500/10 border-stone-500/20 text-stone-600 dark:text-zinc-400';
    }
    if (isUnknown) {
      return 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400';
    }
    if (isConflicting) {
      return 'bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-400';
    }
    switch (status.highestActiveStage) {
      case 4:
        return 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-400';
      case 3:
        return 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-400';
      case 2:
        return 'bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-400';
      case 1:
        return 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400';
      default:
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400';
    }
  };

  const formattedEffectiveDate = status.effectiveAt
    ? new Date(status.effectiveAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <section
      role="region"
      aria-label="Verified Regulatory Advisory and CAQM GRAP Intelligence"
      className={`rounded-2xl bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 p-5 shadow-sm space-y-4 transition-colors ${className}`}
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-zinc-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 flex items-center justify-center">
            {isVerified ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : isNotApplicable ? (
              <Info className="w-4 h-4 text-stone-500 dark:text-zinc-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
          </div>
          <div>
            <h3 className="text-xs uppercase font-mono font-bold tracking-wider text-ink dark:text-white">
              Official Regulatory Status &amp; GRAP Intelligence
            </h3>
            <p className="text-[11px] text-ink-muted dark:text-zinc-400">
              CAQM Statutory Mandates • National Capital Region (NCR)
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${stageBadgeStyle()}`}
          >
            {isNotApplicable
              ? 'Not Applicable (Outside NCR)'
              : isUnknown
              ? 'Official Status Unverified'
              : isConflicting
              ? 'Conflicting Directives'
              : status.highestActiveStage !== null
              ? `CAQM Stage-${status.highestActiveStage} Active`
              : 'No Emergency Stages Active'}
          </span>
        </div>
      </div>

      {/* Primary Status Explanation */}
      <div className="space-y-2">
        <div className="text-xs text-ink dark:text-zinc-200 leading-relaxed font-sans">
          {status.explanation}
        </div>

        {/* Territorial & Effective Date Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-mono text-ink-muted dark:text-zinc-400 pt-1">
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-stone-400 dark:text-zinc-500" />
            <span>Jurisdiction: <strong>{status.jurisdiction}</strong></span>
          </span>
          {formattedEffectiveDate && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 shrink-0 text-stone-400 dark:text-zinc-500" />
              <span>Effective Since: {formattedEffectiveDate}</span>
            </span>
          )}
        </div>
      </div>

      {/* Detailed Governing Order References */}
      {showDetails && governingOrders.length > 0 && (
        <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink dark:text-white">
            <FileCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Authoritative Statutory Orders in Force:</span>
          </div>
          <div className="space-y-2">
            {governingOrders.map((order) => (
              <div
                key={order.id}
                className="text-[11px] text-ink-muted dark:text-zinc-300 pl-3 border-l-2 border-stone-300 dark:border-zinc-700 space-y-0.5"
              >
                <div className="font-semibold text-ink dark:text-white flex items-center justify-between gap-2">
                  <span>{order.title}</span>
                  <a
                    href={order.officialSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                    aria-label={`View official order ${order.orderNumber || ''} on CAQM portal`}
                  >
                    <span>View Gazette</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <div className="text-[10px] font-mono text-stone-500 dark:text-zinc-500">
                  {order.issuingAuthority} • {order.orderNumber || 'Government Gazette'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Independent Restrictions Notice */}
      {showDetails && status.independentRestrictions.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-[11px]">
              Independent Precautionary Directives Active:
            </div>
            <ul className="list-disc list-inside text-[11px] text-amber-800 dark:text-amber-300/90 space-y-0.5">
              {status.independentRestrictions.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Regulatory Truthfulness Disclaimer */}
      <div className="text-[10px] text-stone-400 dark:text-zinc-500 leading-normal border-t border-stone-100 dark:border-zinc-900 pt-2">
        <strong>Regulatory Transparency Notice:</strong> Avir never derives legally binding CAQM GRAP stages solely from ambient numerical AQI measurements. Legal enforcement requires an authentic gazette notification issued by the Commission for Air Quality Management.
      </div>
    </section>
  );
};
