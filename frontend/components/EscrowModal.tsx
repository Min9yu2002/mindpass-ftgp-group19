"use client";

import { useEffect, useState } from "react";
import type { Therapist } from "../lib/mock-therapists";

type EscrowModalProps = {
  therapist: Therapist;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
};

export default function EscrowModal({
  therapist,
  onClose,
  onSuccess,
}: EscrowModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isProcessing) {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      setShow(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isProcessing, onClose]);

  const handleConfirm = async () => {
    if (isProcessing) {
      return;
    }

    setIsProcessing(true);

    window.setTimeout(async () => {
      setIsProcessing(false);
      await onSuccess();
    }, 2500);
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm transition-opacity duration-500 ease-out ${
        show ? "opacity-100" : "opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="escrow-modal-title"
      onClick={isProcessing ? undefined : onClose}
    >
      <div
        className={`liquid-glass-strong relative w-full max-w-2xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-2xl transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 sm:p-7 ${
          show ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Escrow Preview
            </p>
            <h2
              id="escrow-modal-title"
              className="mt-3 text-2xl font-semibold text-[var(--text-primary)]"
            >
              Confirm Session & Escrow
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="control-secondary flex h-10 w-10 items-center justify-center rounded-full text-lg disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Close escrow modal"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Therapist
            </p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
              {therapist.name}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {therapist.specialty}
            </p>
          </div>

          <div className="rounded-2xl bg-black/5 p-4 font-mono text-sm text-[var(--text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] dark:bg-black/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between gap-4 py-2">
              <span>Session Duration</span>
              <span className="text-[var(--text-primary)]">50 Minutes</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-black/5 py-2 dark:border-white/5">
              <span>Escrow Amount</span>
              <span className="text-[var(--text-primary)]">0.005 ETH</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-black/5 py-2 dark:border-white/5">
              <span>Network Fee (Gas)</span>
              <span className="text-[var(--text-primary)]">~0.0001 ETH</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4 border-t border-black/10 pt-3 text-base font-semibold dark:border-white/10">
              <span>Total</span>
              <span className="text-[var(--text-primary)]">0.0051 ETH</span>
            </div>
          </div>

          <p className="text-sm leading-6 text-[var(--text-muted)]">
            By continuing, 0.005 Sepolia ETH will be locked in the session escrow.
            If the therapist declines or five minutes pass, your funds are
            automatically refunded.
          </p>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="button-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-80"
            >
              {isProcessing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Awaiting MetaMask Signature...
                </>
              ) : (
                "Sign & Lock Funds"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
