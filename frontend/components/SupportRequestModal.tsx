"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

type SupportRequestModalProps = {
  sessionId: string;
  reporterWallet: string;
  reporterRole: "patient" | "therapist";
  initialIssueType?: string;
  onClose: () => void;
};

const ISSUE_TYPE_OPTIONS = [
  { value: "patient_no_show", label: "Patient no-show settlement" },
  { value: "therapist_no_show", label: "Therapist no-show settlement" },
  { value: "mutual_unstarted", label: "Mutual unstarted settlement" },
  { value: "refund_question", label: "Refund question" },
  { value: "other", label: "Other" },
] as const;

export default function SupportRequestModal({
  sessionId,
  reporterWallet,
  reporterRole,
  initialIssueType = "other",
  onClose,
}: SupportRequestModalProps) {
  const [issueType, setIssueType] = useState(initialIssueType);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!supabase || !sessionId || !reporterWallet || !issueType || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const { error } = await supabase.from("support_requests").insert({
      session_id: sessionId,
      reporter_wallet: reporterWallet.toLowerCase(),
      reporter_role: reporterRole,
      issue_type: issueType,
      message: message.trim() || null,
    });

    if (error) {
      setErrorMessage(
        "Unable to submit your support request right now. Please try again.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitted(true);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-6 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
          Contact Us
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
          Submit a support request
        </h2>

        {isSubmitted ? (
          <>
            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
              Your support request has been recorded. Our team can review it from
              the database-backed support queue.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="button-primary rounded-full px-5 py-3 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Issue Type
                </span>
                <select
                  value={issueType}
                  onChange={(event) => setIssueType(event.target.value)}
                  className="mt-3 w-full rounded-[20px] border border-black/[0.06] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none dark:border-white/[0.08] dark:bg-[#1d1d1f]/80"
                >
                  {ISSUE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Message
                </span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  placeholder="Tell us what happened."
                  className="mt-3 w-full rounded-[20px] border border-black/[0.06] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] dark:border-white/[0.08] dark:bg-[#1d1d1f]/80"
                />
              </label>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
                <p className="text-sm text-red-600 dark:text-red-300">{errorMessage}</p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="button-primary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Submitting..." : "Submit request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
