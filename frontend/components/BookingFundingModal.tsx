"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BOOKING_STEP_ETH,
  clampSelfPayChoice,
  resolveFundingChoice,
  SESSION_FEE_ETH,
} from "../lib/booking";

type BookingFundingModalProps = {
  therapistName: string;
  subsidyBalance: number;
  isSubmitting: boolean;
  errorMessage?: string;
  requestKind?: "booking" | "wait_queue";
  onClose: () => void;
  onConfirm: (payload: {
    selfPay: number;
    subsidyAmount: number;
    fundingSource: "subsidy" | "mixed" | "wallet";
  }) => Promise<void> | void;
};

function formatEth(value: number) {
  return `${value.toFixed(4)} ETH`;
}

export default function BookingFundingModal({
  therapistName,
  subsidyBalance,
  isSubmitting,
  errorMessage = "",
  requestKind = "booking",
  onClose,
  onConfirm,
}: BookingFundingModalProps) {
  const minimumSelfPay = useMemo(
    () => clampSelfPayChoice(subsidyBalance, 0, SESSION_FEE_ETH),
    [subsidyBalance],
  );
  const [selfPay, setSelfPay] = useState(minimumSelfPay);
  const [ackPenaltyPolicy, setAckPenaltyPolicy] = useState(false);
  const [ackIllegalPolicy, setAckIllegalPolicy] = useState(false);
  const [ackSingleBooking, setAckSingleBooking] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSubmitting, onClose]);

  const fundingChoice = useMemo(
    () => resolveFundingChoice(subsidyBalance, selfPay, SESSION_FEE_ETH),
    [selfPay, subsidyBalance],
  );
  const subsidyAmount = fundingChoice.patientSubsidyChoiceEth;
  const fundingSource = fundingChoice.fundingSource;
  const canConfirm =
    ackPenaltyPolicy && ackIllegalPolicy && ackSingleBooking && !isSubmitting;
  const isWaitQueueRequest = requestKind === "wait_queue";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={isSubmitting ? undefined : onClose}
    >
      <div
        className="liquid-glass-strong relative w-full max-w-2xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
              {isWaitQueueRequest ? "Wait Queue" : "Booking Request"}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              {isWaitQueueRequest
                ? `Join ${therapistName}'s wait queue`
                : `Confirm session with ${therapistName}`}
            </h2>
            {isWaitQueueRequest ? (
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                The provider is currently busy. Join the queue now and leave anytime
                without charge.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="glass-chip-muted flex h-10 w-10 items-center justify-center rounded-full text-lg text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Close booking modal"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                Total Fee
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {formatEth(SESSION_FEE_ETH)}
              </p>
            </div>
            <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                Subsidy Balance
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {formatEth(subsidyBalance)}
              </p>
            </div>
            <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                Funding Mode
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)] capitalize">
                {fundingSource}
              </p>
            </div>
          </div>

          <div className="liquid-glass-soft rounded-[24px] px-5 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Self-funded amount
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Move the slider to decide how much you will personally fund.
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                {formatEth(selfPay)}
              </span>
            </div>

            <input
              type="range"
              min={minimumSelfPay}
              max={SESSION_FEE_ETH}
              step={BOOKING_STEP_ETH}
              value={selfPay}
              onChange={(event) =>
                setSelfPay(
                  clampSelfPayChoice(
                    subsidyBalance,
                    Number(event.target.value),
                    SESSION_FEE_ETH,
                  ),
                )
              }
              className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[var(--accent-primary)]"
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-500/8 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Government subsidy
                </p>
                <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
                  {formatEth(subsidyAmount)}
                </p>
              </div>
              <div className="rounded-[20px] border border-violet-400/20 bg-violet-500/8 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                  Self-funded amount
                </p>
                <p className="mt-2 text-lg font-semibold text-violet-700 dark:text-violet-200">
                  {formatEth(selfPay)}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="liquid-glass-soft flex items-start gap-3 rounded-[20px] px-4 py-4">
              <input
                type="checkbox"
                checked={ackPenaltyPolicy}
                onChange={(event) => setAckPenaltyPolicy(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
              />
              <span className="text-sm leading-6 text-[var(--text-secondary)]">
                I understand that if the provider accepts and I do not complete
                payment / entry in time, the booking may be cancelled or
                penalised according to platform rules.
              </span>
            </label>
            <label className="liquid-glass-soft flex items-start gap-3 rounded-[20px] px-4 py-4">
              <input
                type="checkbox"
                checked={ackIllegalPolicy}
                onChange={(event) => setAckIllegalPolicy(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
              />
              <span className="text-sm leading-6 text-[var(--text-secondary)]">
                I understand that illegal real-world criminal disclosures may
                result in immediate termination, reporting, and account
                restrictions.
              </span>
            </label>
            <label className="liquid-glass-soft flex items-start gap-3 rounded-[20px] px-4 py-4">
              <input
                type="checkbox"
                checked={ackSingleBooking}
                onChange={(event) => setAckSingleBooking(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
              />
              <span className="text-sm leading-6 text-[var(--text-secondary)]">
                I understand that I may only keep one active booking at a time.
              </span>
            </label>
          </div>

          {errorMessage ? (
            <div className="rounded-[20px] border border-red-400/20 bg-red-500/8 px-4 py-4">
              <p className="text-sm text-red-600 dark:text-red-300">
                {errorMessage}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                void onConfirm({
                  selfPay,
                  subsidyAmount,
                  fundingSource,
                })
              }
              disabled={!canConfirm}
              className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Submitting..."
                : isWaitQueueRequest
                  ? "Join Wait Queue"
                  : "Confirm Booking Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
