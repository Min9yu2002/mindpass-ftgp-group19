"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { formatEther } from "viem";
import { useAccount, useBalance, useChainId, useDisconnect } from "wagmi";
import GlobalProviderIncomingRequestCard from "./GlobalProviderIncomingRequestCard";
import {
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
} from "../lib/mindpassEscrow";
import { readSessionContext, type SessionContext } from "../lib/session";
import {
  readStoredSessionSnapshot,
  SESSION_RECONNECT_GRACE_MS,
} from "../lib/session-guard";
import { supabase } from "../lib/supabase";

function formatShortAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function chainNameFromId(chainId?: number) {
  if (!chainId) {
    return "Unknown network";
  }

  if (chainId === MINDPASS_ESCROW_CHAIN_ID) {
    return "Ethereum Sepolia";
  }

  if (chainId === 84532) {
    return "Base Sepolia";
  }

  if (chainId === 1) {
    return "Ethereum Mainnet";
  }

  return `Chain ${chainId}`;
}

type StatusOrbTone = "green" | "yellow" | "red" | "slate";

function StatusOrb({ tone }: { tone: StatusOrbTone }) {
  const toneClasses =
    tone === "green"
      ? {
          glow: "bg-emerald-400/45 shadow-[0_0_18px_rgba(74,222,128,0.52)]",
          inner:
            "bg-[radial-gradient(circle_at_35%_35%,rgba(240,253,244,0.96),rgba(134,239,172,0.98)_42%,rgba(16,185,129,0.96)_78%,rgba(5,150,105,0.92)_100%)] shadow-[0_0_12px_rgba(74,222,128,0.62)]",
        }
      : tone === "yellow"
        ? {
            glow: "bg-yellow-300/50 shadow-[0_0_18px_rgba(253,224,71,0.56)]",
            inner:
              "bg-[radial-gradient(circle_at_35%_35%,rgba(255,251,235,0.98),rgba(253,224,71,0.98)_42%,rgba(245,158,11,0.96)_78%,rgba(217,119,6,0.92)_100%)] shadow-[0_0_12px_rgba(250,204,21,0.62)]",
          }
        : tone === "red"
          ? {
              glow: "bg-rose-400/42 shadow-[0_0_18px_rgba(251,113,133,0.46)]",
              inner:
                "bg-[radial-gradient(circle_at_35%_35%,rgba(255,241,242,0.98),rgba(253,164,175,0.98)_42%,rgba(244,63,94,0.96)_78%,rgba(190,24,93,0.92)_100%)] shadow-[0_0_12px_rgba(244,63,94,0.55)]",
            }
          : {
              glow: "bg-slate-300/34 shadow-[0_0_16px_rgba(148,163,184,0.32)]",
              inner:
                "bg-[radial-gradient(circle_at_35%_35%,rgba(248,250,252,0.92),rgba(203,213,225,0.94)_42%,rgba(100,116,139,0.9)_78%,rgba(71,85,105,0.86)_100%)] shadow-[0_0_10px_rgba(148,163,184,0.32)]",
            };

  return (
    <span aria-hidden="true" className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
      <span
        className={`pointer-events-none absolute h-3.5 w-3.5 rounded-full opacity-90 blur-[3px] ${toneClasses.glow}`}
      />
      <span className={`h-2 w-2 rounded-full ${toneClasses.inner}`} />
      <span className="pointer-events-none absolute inset-[2px] rounded-full bg-white/18 opacity-70 blur-[1px]" />
    </span>
  );
}

type NavbarSessionState = SessionContext & {
  subsidyBalance: number;
  isXmtpReady: boolean;
};

type WalletPopoverAnchor = {
  left: number;
  top: number;
  bridgeLeft: number;
  bridgeTop: number;
  bridgeWidth: number;
  bridgeHeight: number;
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
  const { address, isConnected, status: accountStatus } = useAccount();
  const chainId = useChainId();
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
  const [expiredGraceKey, setExpiredGraceKey] = useState("");
  const [isWalletPopoverOpen, setIsWalletPopoverOpen] = useState(false);
  const [walletPopoverAnchor, setWalletPopoverAnchor] =
    useState<WalletPopoverAnchor | null>(null);
  const walletBadgeRef = useRef<HTMLButtonElement | null>(null);
  const walletPopoverCloseTimeoutRef = useRef<number | null>(null);

  const clearWalletPopoverCloseTimeout = useCallback(() => {
    if (walletPopoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(walletPopoverCloseTimeoutRef.current);
      walletPopoverCloseTimeoutRef.current = null;
    }
  }, []);

  const updateWalletPopoverAnchor = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const trigger = walletBadgeRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const panelWidth = 320;
    const gap = 16;
    const viewportPadding = 16;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - viewportPadding - panelWidth);
    const left = Math.min(
      Math.max(viewportPadding, rect.right - panelWidth),
      maxLeft,
    );

    setWalletPopoverAnchor({
      left,
      top: rect.bottom + gap,
      bridgeLeft: left,
      bridgeTop: rect.bottom,
      bridgeWidth: panelWidth,
      bridgeHeight: gap,
    });
  }, []);

  const openWalletPopover = useCallback(() => {
    clearWalletPopoverCloseTimeout();
    updateWalletPopoverAnchor();
    setIsWalletPopoverOpen(true);
  }, [clearWalletPopoverCloseTimeout, updateWalletPopoverAnchor]);

  const scheduleWalletPopoverClose = useCallback(() => {
    clearWalletPopoverCloseTimeout();
    walletPopoverCloseTimeoutRef.current = window.setTimeout(() => {
      setIsWalletPopoverOpen(false);
    }, 120);
  }, [clearWalletPopoverCloseTimeout]);

  const clearStoredSession = () => {
    window.localStorage.removeItem("mindpass-patient-profile");
    window.localStorage.removeItem("mindpass-therapist-profile");
    window.localStorage.removeItem("mindpass-xmtp-connected");
    window.localStorage.removeItem("mindpass-active-session");
    window.dispatchEvent(new Event("mindpass-session-changed"));
  };

  const activeStoredWallet =
    sessionState.activeSession === "patient"
      ? sessionState.patientWallet
      : sessionState.activeSession === "therapist"
        ? sessionState.therapistWallet
        : "";
  const reconnectGraceKey =
    activeStoredWallet &&
    !address &&
    (accountStatus === "connecting" ||
      accountStatus === "reconnecting" ||
      accountStatus === "disconnected")
      ? [
          sessionState.activeSession ?? "",
          sessionState.patientWallet,
          sessionState.therapistWallet,
        ].join(":")
      : "";
  const isReconnectPending =
    Boolean(reconnectGraceKey) && expiredGraceKey !== reconnectGraceKey;

  useEffect(() => {
    return () => {
      clearWalletPopoverCloseTimeout();
    };
  }, [clearWalletPopoverCloseTimeout]);

  useEffect(() => {
    if (!reconnectGraceKey) {
      return;
    }

    if (expiredGraceKey === reconnectGraceKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setExpiredGraceKey(reconnectGraceKey);
    }, SESSION_RECONNECT_GRACE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [expiredGraceKey, reconnectGraceKey]);

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

    clearStoredSession();
    setSessionState(readNavbarSessionState(null));
    disconnect();
    router.replace("/");
  };

  useEffect(() => {
    const syncSessionState = () => {
      const storedSession = readStoredSessionSnapshot();
      const storedWallet =
        storedSession.activeSession === "patient"
          ? storedSession.patientWallet
          : storedSession.activeSession === "therapist"
            ? storedSession.therapistWallet
            : "";
      const contextAddress =
        isConnected && address ? address : isReconnectPending ? storedWallet : null;

      setSessionState(readNavbarSessionState(contextAddress));
    };

    syncSessionState();

    window.addEventListener("mindpass-session-changed", syncSessionState);

    return () => {
      window.removeEventListener("mindpass-session-changed", syncSessionState);
    };
  }, [address, isConnected, isReconnectPending]);

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
    if (!isWalletPopoverOpen) {
      return;
    }

    updateWalletPopoverAnchor();

    const syncAnchor = () => {
      updateWalletPopoverAnchor();
    };

    window.addEventListener("resize", syncAnchor);
    window.addEventListener("scroll", syncAnchor, true);

    return () => {
      window.removeEventListener("resize", syncAnchor);
      window.removeEventListener("scroll", syncAnchor, true);
    };
  }, [isWalletPopoverOpen, updateWalletPopoverAnchor]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      clearWalletPopoverCloseTimeout();
      setIsWalletPopoverOpen(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [clearWalletPopoverCloseTimeout, pathname]);

  useEffect(() => {
    if (
      !activeStoredWallet ||
      (sessionState.activeSession !== "patient" &&
        sessionState.activeSession !== "therapist")
    ) {
      return;
    }

    if (
      accountStatus === "connecting" ||
      accountStatus === "reconnecting" ||
      isReconnectPending
    ) {
      return;
    }

    const isNowDisconnected = !isConnected || !address;
    const isDifferentAccount =
      Boolean(address) &&
      address.toLowerCase() !== activeStoredWallet.toLowerCase();

    if (isNowDisconnected || isDifferentAccount) {
      clearStoredSession();
      disconnect();
      router.replace("/");
    }
  }, [
    address,
    accountStatus,
    activeStoredWallet,
    disconnect,
    isConnected,
    isReconnectPending,
    router,
    sessionState.activeSession,
  ]);

  const userRole = sessionState.userRole;
  const shouldHideNavbar = pathname.startsWith("/chat");
  const resolvedWalletAddress = isConnected && address ? address : "";
  const shortAddress = formatShortAddress(resolvedWalletAddress);
  const subsidyBalanceLabel = `${sessionState.subsidyBalance.toFixed(3)} ETH`;
  const walletBalanceLabel =
    isConnected && balanceData
      ? `${Number(formatEther(balanceData.value)).toFixed(3)} ETH`
      : "Wallet Offline";
  const isWalletConnecting =
    accountStatus === "connecting" || accountStatus === "reconnecting";
  const isOnEscrowNetwork = isConnected && chainId === MINDPASS_ESCROW_CHAIN_ID;
  const networkTone: StatusOrbTone = isWalletConnecting
    ? "yellow"
    : !isConnected || !address
      ? "slate"
      : isOnEscrowNetwork
        ? "green"
        : "red";
  const networkName = isConnected && address ? chainNameFromId(chainId) : "Wallet offline";
  const networkStatusLabel = isWalletConnecting
    ? "Checking wallet connection"
    : !isConnected || !address
      ? "No connected wallet"
      : isOnEscrowNetwork
        ? "Connected to MindPass network"
        : `Wrong network for MindPass (chain ${chainId})`;
  const escrowContractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
  const escrowContractLabel =
    escrowContractAddress ?? "Not configured in current app deployment";
  const xmtpTone: StatusOrbTone = sessionState.isXmtpReady ? "green" : "yellow";
  const xmtpStatusLabel = sessionState.isXmtpReady
    ? "Initialized in this browser session"
    : "Not initialized in this browser session";

  const shouldShowPrimaryNav = userRole === "therapist" || userRole === "patient";
  const primaryNavHref =
    userRole === "therapist" ? "/provider-lobby" : "/dashboard";
  const primaryNavLabel =
    userRole === "therapist" ? "Provider Lobby" : "Dashboard";
  const shouldShowGlobalProviderRequestCard = userRole === "therapist";

  if (shouldHideNavbar) {
    return null;
  }

  const walletPopoverLayer =
    typeof document !== "undefined" &&
    isWalletPopoverOpen &&
    walletPopoverAnchor &&
    createPortal(
      <>
        <div
          aria-hidden="true"
          className="fixed z-[89] bg-transparent"
          style={{
            left: walletPopoverAnchor.bridgeLeft,
            top: walletPopoverAnchor.bridgeTop,
            width: walletPopoverAnchor.bridgeWidth,
            height: walletPopoverAnchor.bridgeHeight,
          }}
          onPointerEnter={clearWalletPopoverCloseTimeout}
          onPointerLeave={scheduleWalletPopoverClose}
        />
        <div
          className="fixed z-[95] w-80 rounded-2xl border border-white/20 bg-white/12 p-4 shadow-[0_24px_48px_rgba(15,23,42,0.24)] backdrop-blur-xl dark:bg-black/45"
          style={{
            left: walletPopoverAnchor.left,
            top: walletPopoverAnchor.top,
          }}
          onPointerEnter={clearWalletPopoverCloseTimeout}
          onPointerLeave={scheduleWalletPopoverClose}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/5 px-3 py-3 dark:bg-white/5">
              <StatusOrb tone={networkTone} />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {networkName}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{networkStatusLabel}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/5 px-3 py-3 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                Escrow Smart Contract
              </p>
              <p
                className={`mt-2 break-all font-mono text-sm ${
                  escrowContractAddress
                    ? "text-[var(--accent-primary-strong)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {escrowContractLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/5 px-3 py-3 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                XMTP Comm Protocol
              </p>
              <div className="mt-2 flex items-center gap-2">
                <StatusOrb tone={xmtpTone} />
                <p className="text-sm text-[var(--text-primary)]">
                  {xmtpStatusLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </>,
      document.body,
    );

  return (
    <Fragment>
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
              <div className="relative z-[90]">
                <button
                  ref={walletBadgeRef}
                  type="button"
                  suppressHydrationWarning
                  onPointerEnter={openWalletPopover}
                  onPointerLeave={scheduleWalletPopoverClose}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs backdrop-blur-md transition-all ${
                    sessionState.isXmtpReady
                      ? "border-green-500/30 bg-white/5 text-[var(--text-primary)]"
                      : "border-yellow-500/30 bg-white/5 text-[var(--text-primary)]"
                  }`}
                >
                  <StatusOrb tone={xmtpTone} />
                  <span>{shortAddress || "Wallet Pending"}</span>
                </button>
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
      <GlobalProviderIncomingRequestCard
        therapistWallet={sessionState.therapistWallet}
        visible={shouldShowGlobalProviderRequestCard}
      />
      {walletPopoverLayer}
    </Fragment>
  );
}
