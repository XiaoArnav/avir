'use client';

import React, { useState } from 'react';
import { X, Key, Cpu, ShieldCheck, Check } from 'lucide-react';

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-white" />
            <h2 id="settings-title" className="text-base font-bold text-white">
              AI Engine &amp; Telemetry Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-zinc-300">
          <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-white" />
            <span>
              <strong>Dual-Engine Safety:</strong> Avir includes an integrated, zero-crash deterministic offline engine. Providing a Gemini API key enables custom cloud neural reasoning.
            </span>
          </div>

          <div>
            <label htmlFor="gemini-key" className="block font-semibold text-zinc-200 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-400" />
              <span>Google Gemini API Key (Optional)</span>
            </label>
            <input
              id="gemini-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-white"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Keys remain strictly local to your browser session. Never transmitted to third-party databases.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors border border-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-white hover:bg-zinc-200 text-black flex items-center gap-1.5 transition-colors shadow-sm"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{saved ? 'Saved' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
