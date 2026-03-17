"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const themes = ["light", "dark", "system"] as const;

function LightIcon() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M18 12a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
        clipRule="evenodd"
      />
      <path
        fill="currentColor"
        d="M17 6.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 7.742a1 1 0 1 1 1.618 1.176L24.1 11.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 13.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM29.722 20.795a1 1 0 0 1-.619 1.902l-2.853-.927a1 1 0 1 1 .618-1.902l2.854.927ZM25.862 27.159a1 1 0 0 1-1.618 1.175l-1.763-2.427a1 1 0 1 1 1.618-1.175l1.763 2.427ZM19 30.038a1 1 0 0 1-2 0v-3a1 1 0 1 1 2 0v3ZM11.755 28.334a1 1 0 0 1-1.618-1.175l1.764-2.427a1 1 0 1 1 1.618 1.175l-1.764 2.427ZM6.896 22.697a1 1 0 1 1-.618-1.902l2.853-.927a1 1 0 1 1 .618 1.902l-2.853.927ZM6.278 15.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 8.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
      />
    </svg>
  );
}

function DarkIcon() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.5 8.473a10.968 10.968 0 0 1 8.785-.97 7.435 7.435 0 0 0-3.737 4.672l-.09.373A7.454 7.454 0 0 0 28.732 20.4a10.97 10.97 0 0 1-5.232 7.125l-.497.27c-5.014 2.566-11.175.916-14.234-3.813l-.295-.483C5.53 18.403 7.13 11.93 12.017 8.77l.483-.297Zm4.234.616a8.946 8.946 0 0 0-2.805.883l-.429.234A9 9 0 0 0 10.206 22.5l.241.395A9 9 0 0 0 22.5 25.794l.416-.255a8.94 8.94 0 0 0 2.167-1.99 9.433 9.433 0 0 1-2.782-.313c-5.043-1.352-8.036-6.535-6.686-11.578l.147-.491c.242-.745.573-1.44.972-2.078Z"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 21a1 1 0 0 1 1-1h24a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1ZM12 25a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H13a1 1 0 0 1-1-1ZM15 29a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1ZM18 13a6 6 0 0 1 5.915 7h-2.041A4.005 4.005 0 0 0 18 15a4 4 0 0 0-3.874 5h-2.041A6 6 0 0 1 18 13ZM17 7.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 8.742a1 1 0 1 1 1.618 1.176L24.1 12.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 14.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM6.278 16.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 9.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z"
      />
    </svg>
  );
}

const themeMeta = {
  light: { label: "Light", icon: LightIcon },
  dark: { label: "Dark", icon: DarkIcon },
  system: { label: "System", icon: SystemIcon },
} as const;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [previousIndex, setPreviousIndex] = useState(0);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const activeTheme = theme ?? "system";
  const activeIndex = themes.indexOf(activeTheme);
  const motionClass =
    activeIndex === previousIndex
      ? ""
      : activeIndex > previousIndex
        ? "theme-switcher__indicator--forward"
        : "theme-switcher__indicator--backward";

  useEffect(() => {
    setPreviousIndex(activeIndex);
  }, [activeIndex]);

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={`theme-switcher liquid-glass-floating fixed right-6 bottom-6 left-auto z-50 theme-switcher--${activeTheme}`}
      role="group"
      aria-label="Theme switcher"
    >
      <span className="sr-only">Choose theme</span>
      <div
        className={`theme-switcher__indicator ${motionClass}`}
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />

      {themes.map((themeName) => {
        const isActive = activeTheme === themeName;

        return (
          <button
            key={themeName}
            type="button"
            onClick={() => setTheme(themeName)}
            className={`theme-switcher__option ${
              isActive ? "theme-switcher__option--active" : ""
            }`}
            aria-pressed={isActive}
            aria-label={`Set theme to ${themeMeta[themeName].label}`}
          >
            <span className="theme-switcher__icon" aria-hidden="true">
              {(() => {
                const Icon = themeMeta[themeName].icon;
                return <Icon />;
              })()}
            </span>
            <span className="theme-switcher__label">
              {themeMeta[themeName].label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
