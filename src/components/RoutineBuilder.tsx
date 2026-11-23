'use client';

import React, { useState, useEffect } from 'react';
import {
  DailySchedule,
  RoutineActivity,
  ActivityIntensity,
  ActivityEnvironment,
  calculateActivityDurationMinutes,
  validateRoutineActivity,
} from '@/domain/routine-types';
import {
  createDefaultSchedule,
  addActivityToSchedule,
  updateActivityInSchedule,
  deleteActivityFromSchedule,
  duplicateActivityInSchedule,
  reorderActivitiesInSchedule,
} from '@/services/routines/routine-manager';
import {
  loadScheduleFromStorage,
  saveScheduleToStorage,
  resetScheduleInStorage,
  clearAllRoutineStorage,
} from '@/services/routines/routine-storage';
import { calculateDailyScheduleExposure } from '@/services/exposure/exposure-engine';
import { ActivityShiftDetail, AiPlanExplanation } from '@/domain/planning-types';
import {
  Clock,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Activity,
  Shield,
  Layers,
  Edit2,
  Check,
  X,
} from 'lucide-react';

interface RoutineBuilderProps {
  currentPm25: number | null;
  onScheduleChange?: (schedule: DailySchedule) => void;
  onOptimizeClick?: () => void;
  isOptimizing?: boolean;
  proposedShifts?: ActivityShiftDetail[];
  onAcceptShift?: (activityId: string, newStart: string, newEnd: string) => void;
  onRejectShift?: (activityId: string) => void;
  aiExplanation?: AiPlanExplanation;
}

export const RoutineBuilder: React.FC<RoutineBuilderProps> = ({
  currentPm25,
  onScheduleChange,
  onOptimizeClick,
  isOptimizing = false,
  proposedShifts,
  onAcceptShift,
  onRejectShift,
  aiExplanation,
}) => {
  const [schedule, setSchedule] = useState<DailySchedule>(() => loadScheduleFromStorage());
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Partial<RoutineActivity> | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Notify parent on change
  const updateScheduleState = (newSchedule: DailySchedule) => {
    setSchedule(newSchedule);
    saveScheduleToStorage(newSchedule);
    if (onScheduleChange) {
      onScheduleChange(newSchedule);
    }
  };

  const handleAcceptShift = (activityId: string, proposedStart: string, proposedEnd: string) => {
    const updated: DailySchedule = {
      ...schedule,
      activities: schedule.activities.map(a =>
        a.id === activityId
          ? {
              ...a,
              startTime: proposedStart,
              endTime: proposedEnd,
              durationMinutes: calculateActivityDurationMinutes(proposedStart, proposedEnd),
            }
          : a
      ),
      updatedAt: new Date().toISOString(),
    };
    updateScheduleState(updated);
    if (onAcceptShift) {
      onAcceptShift(activityId, proposedStart, proposedEnd);
    }
  };

  const isPmValid = typeof currentPm25 === 'number' && !isNaN(currentPm25) && currentPm25 >= 0;
  const exposure = calculateDailyScheduleExposure(schedule, isPmValid ? currentPm25 : (null as any));

  const handleOpenAdd = () => {
    setEditingActivity({
      name: '',
      startTime: '07:00',
      endTime: '08:00',
      intensity: 'moderate',
      environment: 'outdoor',
      isFlexible: true,
      allowableStartRange: { earliest: '06:00', latest: '09:00' },
    });
    setFormErrors([]);
    setIsEditingModalOpen(true);
  };

  const handleOpenEdit = (act: RoutineActivity) => {
    setEditingActivity({ ...act });
    setFormErrors([]);
    setIsEditingModalOpen(true);
  };

  const handleSaveActivity = () => {
    if (!editingActivity) return;

    const validation = validateRoutineActivity(editingActivity);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    try {
      if (editingActivity.id) {
        // Update
        const updated = updateActivityInSchedule(schedule, editingActivity.id, editingActivity);
        updateScheduleState(updated);
      } else {
        // Add
        const added = addActivityToSchedule(schedule, editingActivity as any);
        updateScheduleState(added);
      }
      setIsEditingModalOpen(false);
      setEditingActivity(null);
    } catch (e: any) {
      setFormErrors([e.message]);
    }
  };

  const handleDelete = (id: string) => {
    if (schedule.activities.length <= 1) {
      alert('Your schedule must have at least one activity.');
      return;
    }
    const updated = deleteActivityFromSchedule(schedule, id);
    updateScheduleState(updated);
  };

  const handleDuplicate = (id: string) => {
    const updated = duplicateActivityInSchedule(schedule, id);
    updateScheduleState(updated);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = reorderActivitiesInSchedule(schedule, index, toIndex);
    updateScheduleState(reordered);
  };

  const handleResetDefaults = () => {
    if (confirm('Reset daily routine to default urban schedule?')) {
      const reset = resetScheduleInStorage();
      updateScheduleState(reset);
    }
  };

  const handleClear = () => {
    if (confirm('Delete all stored schedule data? This will clear local data.')) {
      clearAllRoutineStorage();
      const fresh = createDefaultSchedule();
      updateScheduleState(fresh);
    }
  };

  return (
    <section
      aria-label="Personal Routine Builder"
      className="rounded-2xl glass-panel p-6 sm:p-8 border border-stone-300 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0c0e]/95 space-y-6 shadow-sm transition-colors"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-ink-muted dark:text-zinc-400 uppercase tracking-wider mb-1">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>Daily Schedule Builder (Step 11)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink dark:text-white tracking-tight flex items-center gap-2">
            <span>{schedule.name}</span>
          </h2>
          <p className="text-xs text-ink-muted dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Model your real 24-hour activities, physical exertion intensities, and microenvironments. Verified server-side exposure models integrate directly with atmospheric forecasts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Activity</span>
          </button>
          {onOptimizeClick && (
            <button
              onClick={onOptimizeClick}
              disabled={isOptimizing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isOptimizing ? 'Optimizing...' : 'Optimize with Forecast'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Exposure Summary Card */}
      {exposure.status === 'unavailable' ? (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1">
          <div className="font-semibold text-sm">Exposure estimate unavailable</div>
          <p className="text-xs text-stone-600 dark:text-zinc-400">
            A valid PM2.5 measurement or forecast is required to estimate exposure.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-800 text-xs">
          <div>
            <div className="text-ink-muted dark:text-zinc-400 font-semibold uppercase text-[10px] tracking-wider font-mono">
              Total Modeled Exposure
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-bold text-ink dark:text-white">
                {exposure.totalInhaledMassUg}
              </span>
              <span className="font-mono text-ink-muted dark:text-zinc-400">µg PM2.5</span>
            </div>
            <p className="mt-0.5 text-[11px] text-stone-500">
              Across {exposure.totalDurationHours} scheduled hours
            </p>
          </div>

          <div>
            <div className="text-ink-muted dark:text-zinc-400 font-semibold uppercase text-[10px] tracking-wider font-mono">
              Average Inhaled Air Quality
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-bold text-ink dark:text-white">
                {exposure.averageEffectiveConcentrationUgM3}
              </span>
              <span className="font-mono text-ink-muted dark:text-zinc-400">µg/m³</span>
            </div>
            <p className="mt-0.5 text-[11px] text-stone-500">
              Ambient air: {currentPm25} µg/m³
            </p>
          </div>

          <div>
            <div className="text-ink-muted dark:text-zinc-400 font-semibold uppercase text-[10px] tracking-wider font-mono">
              Activities Count
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-bold text-ink dark:text-white">
                {schedule.activities.length}
              </span>
              <span className="font-mono text-ink-muted dark:text-zinc-400">
                ({schedule.activities.filter(a => a.isFlexible).length} flexible)
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-stone-500">
              Timezone: {schedule.timezone}
            </p>
          </div>
        </div>
      )}

      {/* AI Explanation Banner */}
      {aiExplanation && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-blue-700 dark:text-blue-400 flex-wrap">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span>{aiExplanation.summary}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
              {aiExplanation.modelAttribution}
            </span>
          </div>
          {aiExplanation.narrative && (
            <p className="text-stone-700 dark:text-zinc-300 leading-relaxed">
              {aiExplanation.narrative}
            </p>
          )}
          {aiExplanation.actionableRecommendations && aiExplanation.actionableRecommendations.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 text-stone-600 dark:text-zinc-400">
              {aiExplanation.actionableRecommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Activity List */}
      <div className="space-y-3">
        {schedule.activities.map((act, index) => {
          const actExposure = exposure.activityBreakdowns.find(b => b.activityId === act.id);
          const shiftProposal = proposedShifts?.find(s => s.activityId === act.id);
          return (
            <div
              key={act.id}
              className="p-4 rounded-xl bg-white dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800/80 hover:border-stone-300 dark:hover:border-zinc-700 transition-all shadow-xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-ink dark:text-white">
                      {act.name}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-stone-100 dark:bg-zinc-800 text-ink dark:text-zinc-300 border border-stone-200 dark:border-zinc-700">
                      {act.startTime} - {act.endTime} ({act.durationMinutes}m)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                      {act.intensity}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 border border-stone-200 dark:border-zinc-700">
                      {act.environment.replace('_', ' ')}
                    </span>
                    {act.isFlexible ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                        Flexible ({act.allowableStartRange?.earliest} - {act.allowableStartRange?.latest})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-stone-400 dark:text-zinc-500">
                        Fixed
                      </span>
                    )}
                  </div>
                  {act.notes && (
                    <p className="text-[11px] text-ink-muted dark:text-zinc-400">
                      {act.notes}
                    </p>
                  )}
                </div>

                {/* Inhaled Dose & Action Buttons */}
                <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-ink dark:text-white">
                      {exposure.status === 'available' ? `${actExposure?.inhaledMassUg ?? 0} µg` : '—'}
                    </div>
                    <div className="text-[10px] font-mono text-stone-400 dark:text-zinc-500">
                      inhaled mass
                    </div>
                  </div>

                  <div className="flex items-center gap-1 border-l border-stone-200 dark:border-zinc-800 pl-3">
                    <button
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      aria-label="Move activity up"
                      className="p-1 rounded text-stone-400 hover:text-ink dark:hover:text-white disabled:opacity-30"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === schedule.activities.length - 1}
                      aria-label="Move activity down"
                      className="p-1 rounded text-stone-400 hover:text-ink dark:hover:text-white disabled:opacity-30"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(act)}
                      aria-label="Edit activity"
                      className="p-1 rounded text-stone-400 hover:text-blue-500"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(act.id)}
                      aria-label="Duplicate activity"
                      className="p-1 rounded text-stone-400 hover:text-ink dark:hover:text-white"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(act.id)}
                      aria-label="Delete activity"
                      className="p-1 rounded text-stone-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Proposed Shift Banner */}
              {shiftProposal && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Shift Proposal: {shiftProposal.proposedStart} - {shiftProposal.proposedEnd}</span>
                      <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-300">
                        (-{shiftProposal.savingsUg} µg, {shiftProposal.savingsPercent}% lower)
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-600 dark:text-zinc-400 mt-0.5">
                      {shiftProposal.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => handleAcceptShift(act.id, shiftProposal.proposedStart, shiftProposal.proposedEnd)}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-all shadow-xs"
                    >
                      Accept Shift
                    </button>
                    <button
                      onClick={() => onRejectShift?.(act.id)}
                      className="px-2.5 py-1 rounded bg-stone-200 hover:bg-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-ink dark:text-zinc-300 text-[11px] transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Routine Footer Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-200 dark:border-zinc-800/80 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1 text-ink-muted dark:text-zinc-400 hover:text-ink dark:hover:text-white"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Urban Defaults</span>
          </button>
          <span className="text-stone-300 dark:text-zinc-700">|</span>
          <button
            onClick={handleClear}
            className="text-stone-400 hover:text-rose-500"
          >
            Clear Stored Schedule
          </button>
        </div>

        <div className="text-[11px] text-stone-400 dark:text-zinc-500">
          Saved locally in browser (Schema V1) • Zero cloud tracking
        </div>
      </div>

      {/* Edit / Add Activity Modal Dialog */}
      {isEditingModalOpen && editingActivity && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink dark:text-white">
                {editingActivity.id ? 'Edit Routine Activity' : 'Add New Activity'}
              </h3>
              <button
                onClick={() => setIsEditingModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-ink dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formErrors.length > 0 && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs space-y-1">
                {formErrors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold text-ink dark:text-white">Activity Name:</span>
                <input
                  type="text"
                  value={editingActivity.name || ''}
                  onChange={(e) => setEditingActivity({ ...editingActivity, name: e.target.value })}
                  placeholder="e.g. Evening Cardio Walk"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 font-sans"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-semibold text-ink dark:text-white">Start Time (24h):</span>
                  <input
                    type="time"
                    value={editingActivity.startTime || '07:00'}
                    onChange={(e) => setEditingActivity({ ...editingActivity, startTime: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-ink dark:text-white">End Time (24h):</span>
                  <input
                    type="time"
                    value={editingActivity.endTime || '08:00'}
                    onChange={(e) => setEditingActivity({ ...editingActivity, endTime: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 font-mono"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-semibold text-ink dark:text-white">Exertion Intensity:</span>
                  <select
                    value={editingActivity.intensity || 'moderate'}
                    onChange={(e) => setEditingActivity({ ...editingActivity, intensity: e.target.value as ActivityIntensity })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800"
                  >
                    <option value="resting">Resting (8 L/min)</option>
                    <option value="light">Light (12 L/min)</option>
                    <option value="moderate">Moderate (25 L/min)</option>
                    <option value="vigorous">Vigorous (45 L/min)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-ink dark:text-white">Environment:</span>
                  <select
                    value={editingActivity.environment || 'outdoor'}
                    onChange={(e) => setEditingActivity({ ...editingActivity, environment: e.target.value as ActivityEnvironment })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800"
                  >
                    <option value="outdoor">Outdoor Ambient (100%)</option>
                    <option value="indoor_unfiltered">Indoor Unfiltered (75%)</option>
                    <option value="indoor_clean">Indoor Clean / HEPA (20%)</option>
                    <option value="transit_bus">Bus Transit (55%)</option>
                    <option value="transit_car">Car Recirculation (30%)</option>
                    <option value="transit_metro">Metro Train (25%)</option>
                    <option value="transit_active">Roadway Walk/Cycle (115%)</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={editingActivity.isFlexible || false}
                  onChange={(e) => setEditingActivity({ ...editingActivity, isFlexible: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-ink dark:text-white">Allow Forecast Optimizer to Shift Time</span>
              </label>

              {editingActivity.isFlexible && (
                <div className="p-3 rounded-xl bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] text-ink-muted dark:text-zinc-400">Earliest Allowed:</span>
                    <input
                      type="time"
                      value={editingActivity.allowableStartRange?.earliest || '05:00'}
                      onChange={(e) =>
                        setEditingActivity({
                          ...editingActivity,
                          allowableStartRange: {
                            earliest: e.target.value,
                            latest: editingActivity.allowableStartRange?.latest || '10:00',
                          },
                        })
                      }
                      className="w-full px-2 py-1 rounded border border-stone-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 font-mono"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-ink-muted dark:text-zinc-400">Latest Allowed:</span>
                    <input
                      type="time"
                      value={editingActivity.allowableStartRange?.latest || '10:00'}
                      onChange={(e) =>
                        setEditingActivity({
                          ...editingActivity,
                          allowableStartRange: {
                            earliest: editingActivity.allowableStartRange?.earliest || '05:00',
                            latest: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1 rounded border border-stone-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 font-mono"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-zinc-800">
              <button
                onClick={() => setIsEditingModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-zinc-700 text-ink dark:text-zinc-300 text-xs font-semibold hover:bg-stone-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveActivity}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                Save Activity
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
