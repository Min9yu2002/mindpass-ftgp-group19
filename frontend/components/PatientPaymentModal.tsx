"use client";

import { useEffect, useMemo, useState } from "react";

type PatientPaymentModalProps = {
  providerName: string;
  totalFee: number;
  subsidyApplied: number;
  walletRequired: number;
  paymentDueAt?: string | null;
  isSubmitting: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
};

function formatEth(value: number) {
  return `${value.toFixed(4)} ETH`;
}

function getSecondsLeft(paymentDueAt?: string | null) {
  if (!paymentDueAt) {
    return null;
  }

  const target = new Date(paymentDueAt).getTime();
  if (Number.isNaN(target)) {
    return null;
  }

  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function PatientPaymentModal({
  providerName,
  totalFee,
  subsidyApplied,
  walletRequired,
  paymentDueAt,
  isSubmitting,
  errorMessage = "",
  onCancel,
  onConfirm,
}: PatientPaymentModalProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    getSecondsLeft(paymentDueAt),
  );

  useEffect(() => {
    if (getSecondsLeft(paymentDueAt) === null) {
      return;
    }

    const updateCountdown = () => {
      const next = getSecondsLeft(paymentDueAt);
      if (next === null) {
        return;
      }
      setSecondsLeft(next);
    };

    const intervalId = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [paymentDueAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onCancel();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSubmitting, onCancel]);

  const confirmLabel = useMemo(
    () => (walletRequired <= 0 ? "Start Chat" : "Pay & Start Chat"),
    [walletRequired],
  );

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={isSubmitting ? undefined : onCancel}
    >
      <div
        className="liquid-glass-strong relative w-full max-w-xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Payment Confirmation
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              Provider accepted your request
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Confirm funding for your session with {providerName}.
            </p>
          </div>
          {secondsLeft !== null ? (
            <div className="glass-chip px-4 py-2 text-sm font-semibold text-[var(--accent-primary-strong)]">
              {formatCountdown(secondsLeft)}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Total Fee
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
              {formatEth(totalFee)}
            </p>
          </div>
          <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-500/8 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
              Subsidy Applied
            </p>
            <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
              {formatEth(subsidyApplied)}
            </p>
          </div>
          <div className="rounded-[22px] border border-violet-400/20 bg-violet-500/8 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              Self-funded now
            </p>
            <p className="mt-2 text-lg font-semibold text-violet-700 dark:text-violet-200">
              {formatEth(walletRequired)}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-[22px] border border-amber-400/20 bg-amber-400/10 px-4 py-4">
          <p className="text-sm leading-6 text-amber-700 dark:text-amber-200">
            Please confirm payment within 3 minutes. If you do not confirm in
            time, the booking will expire and you will need to book again.
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-[20px] border border-red-400/20 bg-red-500/8 px-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-300">
              {errorMessage}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isSubmitting}
            className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
