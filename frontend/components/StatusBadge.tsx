type StatusTone = "neutral" | "success" | "warning" | "brand";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

const toneClasses: Record<StatusTone, string> = {
  neutral: "glass-chip-muted text-[var(--text-secondary)]",
  success: "glass-chip text-[var(--accent-primary-strong)]",
  warning: "glass-chip border-amber-300/24 text-amber-200 dark:text-amber-100",
  brand:
    "border-amber-400/30 bg-amber-300/14 text-amber-700 shadow-[0_0_14px_rgba(251,191,36,0.12)] dark:border-yellow-300/30 dark:bg-yellow-300/10 dark:text-yellow-200 dark:shadow-[0_0_18px_rgba(253,224,71,0.18)]",
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
