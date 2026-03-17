"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import GlassCard from "./GlassCard";

type RoleIsolationBlockerProps = {
  forbiddenProfileKey: "mindpass-patient-profile" | "mindpass-therapist-profile";
  title: string;
  description: string;
  children: ReactNode;
};

export default function RoleIsolationBlocker({
  forbiddenProfileKey,
  title,
  description,
  children,
}: RoleIsolationBlockerProps) {
  const [blockState] = useState<"checking" | "blocked" | "allowed">(() => {
    if (typeof window === "undefined") {
      return "checking";
    }

    const activeSession = window.localStorage.getItem("mindpass-active-session");
    const forbiddenSession =
      forbiddenProfileKey === "mindpass-therapist-profile"
        ? "therapist"
        : "patient";

    return activeSession === forbiddenSession &&
      window.localStorage.getItem(forbiddenProfileKey)
      ? "blocked"
      : "allowed";
  });

  if (blockState === "checking") {
    return null;
  }

  if (blockState === "blocked") {
    return (
      <GlassCard className="glass-panel p-6 sm:p-8">
        <div className="space-y-4">
          <div className="glass-chip-muted w-fit px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--text-faint)]">
            Role Isolation
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              {description}
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  return <>{children}</>;
}
