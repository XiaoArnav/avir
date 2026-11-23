'use client';

import React, { useState, useRef } from 'react';
import { X, Key, Cpu, ShieldCheck, Check } from 'lucide-react';
import { useAccessibleDialog } from '@/components/ui/AccessibleDialog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  geminiApiKey: string;
  onSaveKey: (key: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  geminiApiKey,
  onSaveKey,
}) => {
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [saved, setSaved] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useAccessibleDialog({ isOpen, onClose, dialogRef });

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveKey(keyInput.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 border border-stone-300 dark:border-zinc-800 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 transition-colors focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-sage-600 dark:text-white" />
            <h2 id="settings-title" className="text-base font-bold text-ink dark:text-white">
              AI Engine &amp; Telemetry Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800 text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white focus-visible-ring cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-ink-muted dark:text-zinc-300">
          <div className="p-3 rounded-xl bg-stone-50 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-ink dark:text-zinc-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-sage-600 dark:text-white" />
            <span>
              <strong>Dual-Engine Safety:</strong> Avir includes an integrated, zero-crash deterministic offline engine. Providing a Gemini API key enables custom cloud neural reasoning.
            </span>
          </div>

          <div>
            <label htmlFor="gemini-key" className="block font-semibold text-ink dark:text-zinc-200 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-sage-600 dark:text-zinc-400" />
              <span>Google Gemini API Key (Optional)</span>
            </label>
            <input
              id="gemini-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 bg-stone-50 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 rounded-xl text-ink dark:text-white font-mono placeholder-stone-400 dark:placeholder-zinc-600 focus:outline-none focus:border-ink dark:focus:border-white transition-colors"
            />
            <p className="text-[10px] text-stone-500 dark:text-zinc-500 mt-1">
              Keys remain strictly local to your browser session. Never transmitted to third-party databases.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-stone-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-100 dark:bg-zinc-900 hover:bg-stone-200 dark:hover:bg-zinc-800 text-ink dark:text-zinc-300 transition-colors border border-stone-300 dark:border-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-ink hover:bg-stone-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black flex items-center gap-1.5 transition-colors shadow-sm"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{saved ? 'Saved' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
