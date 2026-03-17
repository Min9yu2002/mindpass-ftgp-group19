import GlassCard from "./GlassCard";
import StatusBadge from "./StatusBadge";

type SummaryCardProps = {
  label: string;
  value: string;
  detail: string;
  badge?: string;
  tone?: "neutral" | "success" | "warning";
};

export default function SummaryCard({
  label,
  value,
  detail,
  badge,
  tone = "neutral",
}: SummaryCardProps) {
  return (
    <GlassCard className="glass-panel p-5">
      <div className="mb-8 flex items-start justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">{label}</p>
        {badge ? <StatusBadge label={badge} tone={tone} /> : null}
      </div>
      <p className="mb-2 text-3xl font-semibold text-white">{value}</p>
      <p className="text-sm text-[var(--text-muted)]">{detail}</p>
    </GlassCard>
  );
}
