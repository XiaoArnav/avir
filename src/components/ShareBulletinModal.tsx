'use client';

import React, { useState } from 'react';
import { formatWhatsAppBulletin } from '@/domain/advanced-air-math';
import { Share2, X, Check, Copy, MessageCircle, Send } from 'lucide-react';

interface ShareBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityName: string;
  usAqi: number;
  pm25: number;
  cigarettes: number;
  bestWindow?: string;
  worstInversion?: string;
}

export const ShareBulletinModal: React.FC<ShareBulletinModalProps> = ({
  isOpen,
  onClose,
  cityName,
  usAqi,
  pm25,
  cigarettes,
  bestWindow = '12:30 PM - 3:30 PM (Solar boundary layer expanded)',
  worstInversion = '5:00 AM - 9:00 AM & 8:00 PM - 11:00 PM (Active inversion trap)',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const bulletinText = formatWhatsAppBulletin({
    cityName,
    usAqi,
    pm25,
    cigarettes,
    bestWindow,
    worstInversion,
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(bulletinText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(bulletinText)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink dark:text-white">
                Share Daily Smog Bulletin
              </h3>
              <p className="text-xs text-ink-muted dark:text-zinc-400">
                1-tap social briefing for family, WhatsApp &amp; Telegram groups
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Message Preview Card */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono font-bold text-ink-muted dark:text-zinc-400 uppercase">
            Live Preview
          </label>
          <div className="p-4 rounded-xl bg-stone-100 dark:bg-zinc-950 border border-stone-300 dark:border-zinc-800 font-mono text-xs text-ink dark:text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto select-all">
            {bulletinText}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-ink dark:text-white font-semibold text-xs transition-colors border border-stone-200 dark:border-zinc-700"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Text</span>
              </>
            )}
          </button>

          <button
            onClick={handleShareWhatsApp}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Share to WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};
