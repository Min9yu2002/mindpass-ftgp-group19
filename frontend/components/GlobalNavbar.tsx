"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { readSessionContext, type SessionContext } from "../lib/session";
import { supabase } from "../lib/supabase";

function formatShortAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

type NavbarSessionState = SessionContext & {
  subsidyBalance: number;
  isXmtpReady: boolean;
};

function readPatientSubsidyBalance() {
  if (typeof window === "undefined") {
    return 0;
  }

  const storedProfile = window.localStorage.getItem("mindpass-patient-profile");
  if (!storedProfile) {
    return 0;
  }

  try {
    const parsedProfile = JSON.parse(storedProfile) as {
      subsidyBalance?: number;
    };
    return Number(parsedProfile.subsidyBalance ?? 0);
  } catch {
    return 0;
  }
}

function readNavbarSessionState(address?: string | null): NavbarSessionState {
  const sessionContext = readSessionContext(address);
  return {
    ...sessionContext,
    subsidyBalance: readPatientSubsidyBalance(),
    isXmtpReady:
      typeof window !== "undefined" &&
      window.localStorage.getItem("mindpass-xmtp-connected") === "true",
  };
}

export default function GlobalNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balanceData } = useBalance({
    address,
    query: {
      enabled: Boolean(address && isConnected),
    },
  });
  const [sessionState, setSessionState] = useState<NavbarSessionState>(() =>
    readNavbarSessionState(address),
  );

  const handleSignOut = async () => {
    const therapistProfile = window.localStorage.getItem("mindpass-therapist-profile");
    if (therapistProfile && supabase) {
      try {
        const parsed = JSON.parse(therapistProfile) as {
          walletAddress?: string;
        };
        const walletAddress = parsed.walletAddress || address;

        if (walletAddress) {
          await supabase.from("therapist_auth_logs").insert({
            therapist_wallet: walletAddress.toLowerCase(),
            action: "logout",
            user_agent: navigator.userAgent,
          });
        }
      } catch (err) {
        console.error("Failed to log logout action", err);
      }
    }

    window.localStorage.removeItem("mindpass-patient-profile");
    window.localStorage.removeItem("mindpass-therapist-profile");
    window.localStorage.removeItem("mindpass-xmtp-connected");
    window.localStorage.removeItem("mindpass-active-session");
    window.dispatchEvent(new Event("mindpass-session-changed"));
    setSessionState(readNavbarSessionState(null));
    disconnect();
    router.replace("/");
  };

  useEffect(() => {
    const syncSessionState = () => {
      setSessionState(readNavbarSessionState(isConnected ? address : null));
    };

    syncSessionState();

    window.addEventListener("mindpass-session-changed", syncSessionState);

    return () => {
      window.removeEventListener("mindpass-session-changed", syncSessionState);
    };
  }, [address, isConnected]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === "mindpass-patient-profile" ||
        event.key === "mindpass-therapist-profile" ||
        event.key === "mindpass-xmtp-connected" ||
        event.key === "mindpass-active-session"
      ) {
        window.location.reload();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const activeWallet =
      sessionState.activeSession === "patient"
        ? sessionState.patientWallet
        : sessionState.activeSession === "therapist"
          ? sessionState.therapistWallet
          : "";

    if (
      !activeWallet ||
      (sessionState.activeSession !== "patient" &&
        sessionState.activeSession !== "therapist")
    ) {
      return;
    }

    const isNowDisconnected = !isConnected || !address;
    const isDifferentAccount =
      Boolean(address) &&
      address.toLowerCase() !== activeWallet.toLowerCase();

    if (isNowDisconnected || isDifferentAccount) {
      window.localStorage.removeItem("mindpass-patient-profile");
      window.localStorage.removeItem("mindpass-therapist-profile");
      window.localStorage.removeItem("mindpass-xmtp-connected");
      window.localStorage.removeItem("mindpass-active-session");
      window.dispatchEvent(new Event("mindpass-session-changed"));
      disconnect();
      router.replace("/");
    }
  }, [
    address,
    disconnect,
    isConnected,
    router,
    sessionState.activeSession,
    sessionState.patientWallet,
    sessionState.therapistWallet,
  ]);

  if (pathname.startsWith("/chat")) {
    return null;
  }

  const resolvedWalletAddress = isConnected && address ? address : "";
  const shortAddress = formatShortAddress(resolvedWalletAddress);
  const subsidyBalanceLabel = `${sessionState.subsidyBalance.toFixed(3)} ETH`;
  const walletBalanceLabel =
    isConnected && balanceData
      ? `${Number(formatEther(balanceData.value)).toFixed(3)} ETH`
      : "Wallet Offline";
  const userRole = sessionState.userRole;

  const shouldShowPrimaryNav = userRole === "therapist" || userRole === "patient";
  const primaryNavHref =
    userRole === "therapist" ? "/provider-lobby" : "/dashboard";
  const primaryNavLabel =
    userRole === "therapist" ? "Provider Lobby" : "Dashboard";

  return (
    <nav className="liquid-glass-floating glass-navbar-surface fixed top-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 items-center justify-between rounded-full overflow-visible px-8 py-3 transition-all duration-500">
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

      {userRole === "guest" ? (
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
              href="/therapists"
              className="nav-link text-sm"
            >
              Therapists
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/therapist-login"
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
            {shouldShowPrimaryNav ? (
              <Link
                href={primaryNavHref}
                className="button-secondary rounded-full px-4 py-2 text-sm font-medium"
              >
                {primaryNavLabel}
              </Link>
            ) : null}
            {userRole !== "unscoped" ? (
              <div className="flex items-center gap-2">
                <span
                  suppressHydrationWarning
                  className="text-sm font-medium text-[var(--accent-primary-strong)]"
                >
                  {walletBalanceLabel}
                </span>
                <span className="text-sm text-[var(--text-faint)]">/</span>
                <span
                  suppressHydrationWarning
                  className="text-sm font-medium text-amber-600 drop-shadow-[0_0_8px_rgba(251,191,36,0.14)] dark:text-yellow-300 dark:drop-shadow-[0_0_10px_rgba(253,224,71,0.35)]"
                >
                  {subsidyBalanceLabel}
                </span>
              </div>
            ) : null}
            <div className="group relative z-10">
              <button
                type="button"
                suppressHydrationWarning
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs backdrop-blur-md transition-all ${
                  sessionState.isXmtpReady
                    ? "border-green-500/30 bg-white/5 text-[var(--text-primary)]"
                    : "border-yellow-500/30 bg-white/5 text-[var(--text-primary)]"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    sessionState.isXmtpReady
                      ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"
                      : "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]"
                  }`}
                />
                <span>{shortAddress || "Wallet Pending"}</span>
              </button>
              <div className="invisible absolute top-full right-0 z-[80] mt-3 w-80 rounded-2xl border border-white/20 bg-white/10 p-4 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-300 group-hover:visible group-hover:opacity-100 dark:bg-black/40">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/5 px-3 py-3 dark:bg-white/5">
                    <span className="text-base">🟢</span>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Ethereum Sepolia
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Connected
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/5 px-3 py-3 dark:bg-white/5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      Escrow Smart Contract
                    </p>
                    <p className="mt-2 font-mono text-sm text-[var(--accent-primary-strong)]">
                      0x8a9C...3b1f
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/5 px-3 py-3 dark:bg-white/5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      XMTP Comm Protocol
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          sessionState.isXmtpReady
                            ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"
                            : "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]"
                        }`}
                      />
                      <p className="text-sm text-[var(--text-primary)]">
                        {sessionState.isXmtpReady ? "Initialized" : "Not initialized"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="nav-link text-sm"
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
