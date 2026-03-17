"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function GlobalNavbar() {
  const pathname = usePathname();

  if (pathname.startsWith("/chat")) {
    return null;
  }

  const isLoggedIn =
    pathname.includes("/dashboard") ||
    pathname.includes("/therapist-portal") ||
    pathname.includes("/admin-portal") ||
    pathname.includes("/session-lobby") ||
    pathname.includes("/provider-lobby") ||
    pathname.includes("/chat");

  return (
    <nav className="liquid-glass-floating glass-navbar-surface fixed top-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 items-center justify-between rounded-full px-8 py-3 transition-all duration-500">
      <Link href="/" className="flex items-center gap-3">
        <div className="glass-chip-muted flex h-10 w-10 items-center justify-center text-sm font-semibold text-[var(--text-primary)]">
          M
        </div>
        <div>
          <p className="text-sm font-semibold tracking-[0.22em] text-black dark:text-white">
            MindPass
          </p>
          <p className="text-xs text-black/55 dark:text-white/55">
            Privacy-first support
          </p>
        </div>
      </Link>

      {!isLoggedIn ? (
        <>
          <div className="hidden items-center gap-6 md:flex">
            <Link
              href="/#features"
              className="nav-link text-sm"
            >
              Features
            </Link>
            <Link
              href="/#how-it-works"
              className="nav-link text-sm"
            >
              How it Works
            </Link>
            <Link
              href="/#therapists"
              className="nav-link text-sm"
            >
              Therapists
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/auth?role=therapist"
              className="button-secondary rounded-full px-4 py-2 text-sm font-medium"
            >
              Therapist Portal
            </Link>
            <Link
              href="/auth"
              className="button-primary rounded-full px-4 py-2 text-sm font-medium"
            >
              Login / Join
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="hidden flex-1 md:block" />
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[var(--accent-primary-strong)]">
              0.05 ETH
            </span>
            <span className="glass-chip-muted px-3 py-1 font-mono text-xs text-[var(--text-muted)]">
              0x71C...9E3A
            </span>
            <Link
              href="/"
              className="nav-link text-sm"
            >
              Sign Out
            </Link>
          </div>
        </>
      )}
    </nav>
  );
}
