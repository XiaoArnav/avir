import React from 'react';
import { AQICategory, AtmosphericMetrics } from '@/domain/types';
import { ShieldCheck, AlertTriangle, Wind, Home, Footprints, CalendarClock } from 'lucide-react';

export interface ActionDecisionCardProps {
  metrics: AtmosphericMetrics | null;
  category: AQICategory | 'Unavailable';
  onOpenDailyPlan?: () => void;
  className?: string;
}

export const ActionDecisionCard: React.FC<ActionDecisionCardProps> = ({
  metrics,
  category,
  onOpenDailyPlan,
  className = '',
}) => {
  // Derive actionable guidance directly from validated environmental parameters
  const aqi = metrics?.usAqi ?? null;
  const pm25 = metrics?.pm25 ?? null;

  const getActionGuidance = () => {
    if (aqi === null || pm25 === null) {
      return {
        severityText: 'Awaiting telemetry to evaluate today’s exposure risk.',
        outdoorText: 'Check local ground monitors before high-intensity outdoor training.',
        indoorText: 'Keep air purifiers running on auto mode; avoid heavy indoor cooking smoke.',
      };
    }

    if (aqi <= 50) {
      return {
        severityText: 'Air quality is pristine. Ambient particulate concentrations meet WHO clean air baselines.',
        outdoorText: 'Ideal for all outdoor activities, workouts, and children’s sports.',
        indoorText: 'Open windows freely for natural cross-ventilation throughout the day.',
      };
    }

    if (aqi <= 100) {
      return {
        severityText: 'Moderate air quality. Unusually sensitive individuals may experience mild respiratory symptoms.',
        outdoorText: 'Acceptable for outdoor exercise. Sensitive groups should monitor for coughing or shortness of breath.',
        indoorText: 'Air out rooms during midday convective mixing windows (12:00 PM – 3:30 PM).',
      };
    }

    if (aqi <= 150) {
      return {
        severityText: 'Unhealthy for Sensitive Groups. Children, elderly adults, and individuals with asthma should take precautions.',
        outdoorText: 'Reduce prolonged or heavy exertion outdoors. Consider wearing a well-fitted N95 mask.',
        indoorText: 'Keep windows closed during early morning and night; run Corsi-Rosenthal / HEPA filtration indoors.',
      };
    }

    if (aqi <= 200) {
      return {
        severityText: 'Unhealthy smog. Increased likelihood of adverse respiratory symptoms across the general population.',
        outdoorText: 'Avoid strenuous outdoor cardio (running, cycling). N95 respirator strongly recommended outdoors.',
        indoorText: 'Keep windows sealed. Run air purifiers on high fan settings in occupied bedrooms.',
      };
    }

    if (aqi <= 300) {
      return {
        severityText: 'Very Unhealthy air alert. Health warnings of emergency conditions for vulnerable populations.',
        outdoorText: 'Avoid outdoor exercise entirely. Shift routines indoors or to afternoon solar dispersion slots.',
        indoorText: 'Seal drafts with weatherstripping. Run active filtration to keep indoor PM2.5 below 15 µg/m³.',
      };
    }

    return {
      severityText: 'Hazardous (Severe Smog Alert). Serious risk of respiratory distress and cardiovascular stress.',
      outdoorText: 'Remain indoors with doors and windows closed. Eliminate all outdoor exertion.',
      indoorText: 'Operate Corsi-Rosenthal boxes or high-CADR HEPA purifiers continuously on maximum flow.',
    };
  };

  const guidance = getActionGuidance();

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 p-5 sm:p-6 shadow-sm space-y-4 transition-colors ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-zinc-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-ink dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Today’s Action Guide • What to Do Right Now</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400 mt-0.5">
            Evidence-based precautions calibrated to current particulate concentration
          </p>
        </div>

        {onOpenDailyPlan && (
          <button
            type="button"
            onClick={onOpenDailyPlan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-semibold transition-all shadow-xs active:scale-95 shrink-0 self-start sm:self-auto cursor-pointer focus-visible-ring"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>Optimize Daily Schedule &rarr;</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Answer 1: How bad is the air? */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-ink dark:text-white">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>1. Air Quality Status</span>
          </div>
          <p className="text-ink-muted dark:text-zinc-300 leading-relaxed">
            {guidance.severityText}
          </p>
        </div>

        {/* Answer 2: Can I go outside? */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-ink dark:text-white">
            <Footprints className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>2. Outdoor Activity</span>
          </div>
          <p className="text-ink-muted dark:text-zinc-300 leading-relaxed">
            {guidance.outdoorText}
          </p>
        </div>

        {/* Answer 3: When should I ventilate? */}
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-ink dark:text-white">
            <Home className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>3. Ventilation &amp; Clean Home</span>
          </div>
          <p className="text-ink-muted dark:text-zinc-300 leading-relaxed">
            {guidance.indoorText}
          </p>
        </div>
      </div>
    </div>
  );
};
