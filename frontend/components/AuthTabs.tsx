"use client";

import { useEffect, useState } from "react";

type AuthMode = "create" | "login" | "therapist";
type PatientAuthMode = Exclude<AuthMode, "therapist">;

type AuthTabsProps = {
  mode: PatientAuthMode;
  onChange: (mode: PatientAuthMode) => void;
};

const tabs: { value: PatientAuthMode; label: string }[] = [
  { value: "create", label: "Initialize Vault" },
  { value: "login", label: "Quick Access" },
];

export default function AuthTabs({ mode, onChange }: AuthTabsProps) {
  const activeIndex = tabs.findIndex((tab) => tab.value === mode);
  const [previousIndex, setPreviousIndex] = useState(activeIndex);
  const motionClass =
    activeIndex === previousIndex
      ? ""
      : activeIndex > previousIndex
        ? "auth-switcher__indicator--forward"
        : "auth-switcher__indicator--backward";

  useEffect(() => {
    setPreviousIndex(activeIndex);
  }, [activeIndex]);

  return (
    <div
      className={`auth-switcher liquid-glass-soft auth-switcher--${mode}`}
      style={{ ["--auth-tab-count" as string]: tabs.length }}
    >
      <div
        className={`auth-switcher__indicator ${motionClass}`}
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`auth-tab auth-switcher__option text-sm font-medium ${
            mode === tab.value ? "auth-tab-active" : ""
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
