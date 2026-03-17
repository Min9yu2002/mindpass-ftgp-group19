"use client";

import { useEffect, useState } from "react";

type AuthMode = "create" | "login" | "therapist";

type AuthTabsProps = {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
};

// 替換這裡的文案，直接把 Web3 的靈魂寫在 UI 上
const tabs: { value: AuthMode; label: string }[] = [
  { value: "create", label: "Create Profile" }, // 避免用 Account，用 Profile 更有匿名感
  { value: "login", label: "Wallet Login" },    // 明確告訴使用者這是錢包登入
  { value: "therapist", label: "Therapist (SBT)" }, // 加上 SBT (靈魂綁定代幣)，展現學術與技術專業度
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
    <div className={`auth-switcher liquid-glass-soft auth-switcher--${mode}`}>
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
