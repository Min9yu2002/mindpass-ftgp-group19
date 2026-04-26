import GlassCard from "./GlassCard";

type FeatureCardProps = {
  title: string;
  description: string;
  eyebrow: string;
};

export default function FeatureCard({
  title,
  description,
  eyebrow,
}: FeatureCardProps) {
  return (
    <GlassCard className="glass-panel h-full p-6">
      <div className="glass-highlight mb-4 flex h-11 w-11 items-center justify-center rounded-2xl text-sm text-violet-100">
        {eyebrow === "Privacy" ? (
          <>
            <img
              src="/privacy-icon-light.svg"
              alt=""
              aria-hidden="true"
              className="h-7 w-7 object-contain dark:hidden"
            />
            <img
              src="/privacy-icon-dark.svg"
              alt=""
              aria-hidden="true"
              className="hidden h-7 w-7 object-contain dark:block"
            />
          </>
        ) : (
          eyebrow.slice(0, 1)
        )}
      </div>
      <p className="mb-3 text-xs uppercase tracking-[0.24em] text-violet-100/55">
        {eyebrow}
      </p>
      <h3 className="mb-3 text-xl font-semibold text-white">{title}</h3>
      <p className="text-sm leading-6 text-[var(--text-muted)]">{description}</p>
    </GlassCard>
  );
}
