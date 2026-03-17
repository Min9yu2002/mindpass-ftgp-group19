import type { ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
};

export default function GlassCard({
  children,
  className = "",
}: GlassCardProps) {
  return (
    <div className={`liquid-glass rounded-[28px] ${className}`}>
      {children}
    </div>
  );
}
