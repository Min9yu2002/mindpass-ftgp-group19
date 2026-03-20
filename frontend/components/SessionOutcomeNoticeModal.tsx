"use client";

type SessionOutcomeNoticeModalProps = {
  title: string;
  message: string;
  onClose: () => void;
  onContactUs: () => void;
};

export default function SessionOutcomeNoticeModal({
  title,
  message,
  onClose,
  onContactUs,
}: SessionOutcomeNoticeModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
          Session Outcome
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
          {message}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onContactUs}
            className="button-primary rounded-full px-5 py-3 text-sm font-medium"
          >
            Contact Us
          </button>
        </div>
      </div>
    </div>
  );
}
