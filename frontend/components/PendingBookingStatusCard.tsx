import StatusBadge from "./StatusBadge";

type PendingBookingStatusCardProps = {
  label: string;
  title: string;
  message: string;
  tone?: "neutral" | "success" | "warning" | "brand";
  details?: Array<{ label: string; value: string }>;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
};

export default function PendingBookingStatusCard({
  label,
  title,
  message,
  tone = "warning",
  details = [],
  actionLabel,
  onAction,
  actionDisabled = false,
}: PendingBookingStatusCardProps) {
  return (
    <div className="glass-panel liquid-glass-strong mb-6 rounded-[28px] border border-white/10 px-5 py-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Session Status
            </span>
            <StatusBadge label={label} tone={tone} />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-muted)]">
            {message}
          </p>
        </div>

        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className="button-primary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      {details.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {details.map((detail) => (
            <div
              key={`${detail.label}:${detail.value}`}
              className="liquid-glass-soft rounded-[22px] px-4 py-4"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                {detail.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                {detail.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
