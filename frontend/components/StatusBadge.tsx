type StatusTone = "neutral" | "success" | "warning";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

const toneClasses: Record<StatusTone, string> = {
  neutral: "glass-chip-muted text-[var(--text-secondary)]",
  success: "glass-chip text-[var(--accent-primary-strong)]",
  warning: "glass-chip border-amber-300/24 text-amber-200 dark:text-amber-100",
};

export default function StatusBadge({
  label,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-[0.18em] backdrop-blur-xl ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
