"use client";

import ModalPortal from "./ModalPortal";

type SessionReadyDetail = {
  label: string;
  value: string;
};

type SessionReadyModalProps = {
  label: string;
  title: string;
  message: string;
  details: SessionReadyDetail[];
  primaryLabel?: string;
  secondaryLabel?: string;
  isSubmitting?: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
};

export default function SessionReadyModal({
  label,
  title,
  message,
  details,
  primaryLabel = "Enter Chat",
  secondaryLabel = "Later",
  isSubmitting = false,
  onPrimary,
  onSecondary,
}: SessionReadyModalProps) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/72 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
            {label}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">
            {title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--text-muted)] sm:text-base">
            {message}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {details.map((detail) => (
              <div
                key={`${detail.label}:${detail.value}`}
                className="liquid-glass-soft rounded-[22px] px-4 py-4"
              >
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  {detail.label}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                  {detail.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onSecondary}
              disabled={isSubmitting}
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={onPrimary}
              disabled={isSubmitting}
              className="button-primary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Opening..." : primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
