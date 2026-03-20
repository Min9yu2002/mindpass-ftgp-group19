"use client";

import type { ReactNode } from "react";

type SessionCompletionModalProps = {
  eyebrow?: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  errorMessage?: string;
  isSubmitting?: boolean;
  submittingLabel?: string;
  showCancel?: boolean;
  isConfirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function SessionCompletionModal({
  eyebrow = "Session Completion",
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  errorMessage = "",
  isSubmitting = false,
  submittingLabel = "Completing...",
  showCancel = true,
  isConfirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: SessionCompletionModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
          {message}
        </p>

        {children ? <div className="mt-5">{children}</div> : null}

        {errorMessage ? (
          <div className="mt-5 rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-300">{errorMessage}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || isConfirmDisabled}
            className="rounded-full bg-red-500 px-5 py-3 text-sm font-medium text-white shadow-[0_14px_32px_rgba(239,68,68,0.28)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? submittingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
