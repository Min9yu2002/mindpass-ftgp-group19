type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  const alignmentClass = align === "center" ? "text-center" : "text-left";

  return (
    <div className={alignmentClass}>
      <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{title}</h2>
      {description ? (
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
