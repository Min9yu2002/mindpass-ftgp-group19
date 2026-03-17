import Link from "next/link";
import GlassCard from "./GlassCard";

type QuickActionCardProps = {
  href: string;
  title: string;
  description: string;
  tag: string;
};

export default function QuickActionCard({
  href,
  title,
  description,
  tag,
}: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="block transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
    >
      <GlassCard className="glass-panel h-full p-5">
        <div className="mb-6 flex items-center justify-between gap-4">
          <span className="text-xs uppercase tracking-[0.24em] text-violet-200/80">
            {tag}
          </span>
          <span className="glass-chip-muted px-3 py-1 text-xs text-[var(--text-muted)]">
            Open
          </span>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm leading-6 text-[var(--text-muted)]">{description}</p>
      </GlassCard>
    </Link>
  );
}
