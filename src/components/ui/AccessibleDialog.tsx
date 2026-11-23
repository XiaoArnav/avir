'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

export interface AccessibleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidthClassName?: string;
  ariaLabel?: string;
}

export const AccessibleDialog: React.FC<AccessibleDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidthClassName = 'max-w-xl',
  ariaLabel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Focus trap query selector
  const getFocusableElements = useCallback(() => {
    if (!dialogRef.current) return [];
    return Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }, []);

  // Handle open/close side effects: focus management, background scroll lock, Escape key
  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first focusable element or dialog container
    const timer = setTimeout(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 50);

    // Keyboard handlers (Escape to close, Tab to cycle)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = getFocusableElements();
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previous element
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isOpen, onClose, getFocusableElements]);

  if (!isOpen) return null;

  const titleId = 'accessible-dialog-title';
  const descId = 'accessible-dialog-desc';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        // Close on backdrop click if clicking directly on overlay
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`w-full ${maxWidthClassName} bg-white dark:bg-zinc-950 border border-stone-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="space-y-0.5 pr-4">
            <h2 id={titleId} className="text-base sm:text-lg font-bold text-ink dark:text-white tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-ink-muted dark:text-zinc-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-stone-200/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors focus-visible-ring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};
