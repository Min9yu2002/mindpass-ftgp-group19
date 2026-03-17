"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import GlassCard from "../../components/GlassCard";
import LiquidToggle from "../../components/LiquidToggle";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";
import { readSessionContext } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { getTherapistDisplayName } from "../../lib/therapist-display";

type TherapistRecord = {
  walletAddress: string;
  displayName: string;
  totalEarnedEth: number;
  isOnline: boolean;
  supportedModes: ("Voice" | "Text")[];
};

type RequestedSession = {
  id: string;
  patientWallet: string;
  patientAlias: string;
  amountEth: number;
  createdAt: string;
};

type CompletedSession = {
  id: string;
  patientAlias: string;
  completedAt: string;
  amountEth: number;
};

const SESSION_BASE_FEE = 0.005;
const PLATFORM_FEE_PCT = 0.05;
const PLATFORM_FEE = SESSION_BASE_FEE * PLATFORM_FEE_PCT;
const THERAPIST_CUT = SESSION_BASE_FEE - PLATFORM_FEE;

function truncateWallet(value: string) {
  if (!value) {
    return "Unknown wallet";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  const diffHours = Math.round((date.getTime() - Date.now()) / 3600000);
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  return rtf.format(diffDays, "day");
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently completed";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEth(value: number, decimals = 5) {
  return `${value.toFixed(decimals)} ETH`;
}

function normalizeSupportedModes(value: unknown): ("Voice" | "Text")[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item === "video" || item === "voice" ? "Voice" : "Text"))
    .filter((item, index, array) => array.indexOf(item) === index) as (
    | "Voice"
    | "Text"
  )[];
}

function deriveSupportedModes(record: Record<string, unknown> | null | undefined) {
  return normalizeSupportedModes(record?.supported_modes ?? record?.supportedModes);
}

export default function ProviderLobbyPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const therapistWallet = useMemo(() => address ?? "", [address]);
  const [therapist, setTherapist] = useState<TherapistRecord>({
    walletAddress: "",
    displayName: "",
    totalEarnedEth: 0,
    isOnline: true,
    supportedModes: [],
  });
  const [requestedSessions, setRequestedSessions] = useState<RequestedSession[]>([]);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingModes, setIsSavingModes] = useState(false);
  const [isOpeningChatId, setIsOpeningChatId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [isPatientBlocked, setIsPatientBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const activeSession = window.localStorage.getItem("mindpass-active-session");
    const storedPatientProfile = window.localStorage.getItem("mindpass-patient-profile");

    if (activeSession === "patient" && storedPatientProfile) {
      setIsPatientBlocked(true);
      setSessionHydrated(true);
      return;
    }

    setIsPatientBlocked(false);
    const sessionContext = readSessionContext(isConnected ? address : null);
    if (sessionContext.userRole !== "therapist") {
      router.replace("/therapist-login");
      return;
    }

    setSessionHydrated(true);
  }, [address, isConnected, router]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateTherapist = async () => {
      if (!sessionHydrated || isPatientBlocked || !therapistWallet) {
        return;
      }

      if (!supabase) {
        if (!isCancelled) {
          setErrorMessage("Supabase client is unavailable.");
          setIsHydrating(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("therapists")
          .select(
            "wallet_address, full_name, legal_name, specialty, clinical_specialty, bio, languages, supported_modes, is_online, total_earned_eth, total_earnings_eth, earnings_eth",
          )
          .ilike("wallet_address", therapistWallet)
          .maybeSingle();

        if (isCancelled) {
          return;
        }

        if (error) {
          throw error;
        }

        const therapistData = data as
          | Record<string, unknown>
          | null;

        if (!therapistData) {
          throw new Error("Unable to load provider lobby.");
        }

        const supportedModes = deriveSupportedModes(therapistData);
        setTherapist({
          walletAddress: String(therapistData.wallet_address ?? therapistWallet),
          displayName: getTherapistDisplayName({
            full_name:
              typeof therapistData.full_name === "string"
                ? therapistData.full_name
                : null,
            legal_name:
              typeof therapistData.legal_name === "string"
                ? therapistData.legal_name
                : null,
          }),
          totalEarnedEth: Number(
            therapistData.total_earned_eth ??
              therapistData.total_earnings_eth ??
              therapistData.earnings_eth ??
              0,
          ),
          isOnline: Boolean(therapistData.is_online ?? false),
          supportedModes,
        });
        setErrorMessage("");
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load provider lobby.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsHydrating(false);
        }
      }
    };

    hydrateTherapist();

    return () => {
      isCancelled = true;
    };
  }, [isPatientBlocked, sessionHydrated, therapistWallet]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateSessionData = async () => {
      if (!sessionHydrated || isPatientBlocked || !supabase || !therapistWallet) {
        return;
      }

      setIsHydrating(true);

      const requestedQuery = supabase
        .from("sessions")
        .select("*")
        .ilike("therapist_wallet", therapistWallet)
        .eq("status", "requested")
        .order("created_at", { ascending: false });

      const completedQuery = supabase
        .from("sessions")
        .select("*")
        .ilike("therapist_wallet", therapistWallet)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(3);

      const [requestedResult, completedResult] = await Promise.all([
        requestedQuery,
        completedQuery,
      ]);

      if (isCancelled) {
        return;
      }

      setRequestedSessions(
        ((requestedResult.error ? [] : requestedResult.data) ?? []).map((session) => {
          const patientWallet = String(session.patient_wallet ?? "");
          return {
            id: String(session.id),
            patientWallet,
            patientAlias: truncateWallet(patientWallet),
            amountEth: Number(session.amount_eth ?? 0.005),
            createdAt: String(session.created_at ?? ""),
          };
        }),
      );

      setCompletedSessions(
        ((completedResult.error ? [] : completedResult.data) ?? []).map((session) => {
          const patientWallet = String(session.patient_wallet ?? "");
          return {
            id: String(session.id),
            patientAlias: truncateWallet(patientWallet),
            completedAt: String(
              session.completed_at ??
                session.ended_at ??
                session.updated_at ??
                session.created_at ??
                "",
            ),
            amountEth: Number(session.amount_eth ?? 0.005),
          };
        }),
      );

      setIsHydrating(false);
    };

    hydrateSessionData();

    return () => {
      isCancelled = true;
    };
  }, [isPatientBlocked, sessionHydrated, therapistWallet]);

  if (!sessionHydrated) {
    return null;
  }

  if (isPatientBlocked) {
    return (
      <main className="app-shell page-canvas page-canvas-provider relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
        <div className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-10">
          <GlassCard className="glass-panel p-6 sm:p-8">
            <div className="space-y-4">
              <div className="glass-chip-muted w-fit px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Session Context
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
                  Access Denied: You are currently logged in as a Patient.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
                  You cannot access the Provider Lobby while the active session
                  is patient. Please sign out first or return to the Patient
                  portal.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    );
  }

  const handleStatusToggle = async (nextStatus: boolean) => {
    if (!supabase || isSavingStatus || therapist.isOnline === nextStatus) {
      return;
    }

    const previousStatus = therapist.isOnline;
    setIsSavingStatus(true);
    setErrorMessage("");
    setTherapist((current) => ({ ...current, isOnline: nextStatus }));

    const { error } = await supabase
      .from("therapists")
      .update({ is_online: nextStatus })
      .ilike("wallet_address", therapist.walletAddress);

    if (error) {
      setTherapist((current) => ({ ...current, isOnline: previousStatus }));
      setErrorMessage(error.message);
    }

    setIsSavingStatus(false);
  };

  const handleModeToggle = async (mode: "Voice" | "Text") => {
    if (!supabase || isSavingModes) {
      return;
    }

    const nextModes = therapist.supportedModes.includes(mode)
      ? therapist.supportedModes.filter((item) => item !== mode)
      : [...therapist.supportedModes, mode];

    setIsSavingModes(true);
    setErrorMessage("");
    setSettingsMessage("");
    setTherapist((current) => ({ ...current, supportedModes: nextModes }));

    const payload = nextModes.map((item) => (item === "Voice" ? "voice" : "text"));
    const { error } = await supabase
      .from("therapists")
      .update({
        supported_modes: payload,
      })
      .ilike("wallet_address", therapist.walletAddress);

    if (error) {
      setErrorMessage(error.message);
      setTherapist((current) => ({
        ...current,
        supportedModes: therapist.supportedModes,
      }));
    } else {
      setSettingsMessage("Session modes updated.");
      window.setTimeout(() => setSettingsMessage(""), 2200);
    }

    setIsSavingModes(false);
  };

  const handleAccept = async (sessionId: string) => {
    if (!supabase || isOpeningChatId) {
      return;
    }

    setIsOpeningChatId(sessionId);
    setErrorMessage("");

    const { error } = await supabase
      .from("sessions")
      .update({ status: "active" })
      .eq("id", sessionId);

    if (error) {
      setErrorMessage(error.message);
      setIsOpeningChatId(null);
      return;
    }

    router.push(
      `/chat?role=therapist&sessionId=${encodeURIComponent(sessionId)}&address=${encodeURIComponent(
        therapist.walletAddress,
      )}`,
    );
  };

  const displayName = therapist.displayName || truncateWallet(therapist.walletAddress);

  return (
    <main className="app-shell-subtle page-canvas page-canvas-provider relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <header className="liquid-glass-strong glass-panel mb-10 flex flex-col gap-5 rounded-[30px] border border-black/10 px-5 py-5 shadow-[0_14px_36px_rgba(15,23,42,0.14)] lg:flex-row lg:items-end lg:justify-between dark:border-white/[0.08] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div>
            <span className="text-sm uppercase tracking-[0.26em] text-emerald-600 dark:text-emerald-300/70">
              Provider Dashboard
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Welcome back, {displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700 dark:text-[var(--text-muted)]">
              Manage your live status, review escrow-backed requests, and move
              accepted patients into secure chat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/therapist-portal"
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
            >
              Open Full Portal
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-100">
                SBT Verified ({truncateWallet(therapist.walletAddress)})
              </span>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="liquid-glass-soft mb-6 rounded-[24px] border border-red-400/20 bg-red-500/8 px-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-300">
              {errorMessage}
            </p>
          </div>
        ) : null}

        <GlassCard className="glass-panel mb-8 border border-black/10 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.14)] dark:border-white/[0.08] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <SectionHeading
                eyebrow="Status Toggle"
                title="Control request availability"
              />
              <p className="mt-3 text-sm text-slate-700 dark:text-[var(--text-muted)]">
                Toggle your provider status to accept or pause incoming session
                requests.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`glass-chip flex items-center gap-2 px-4 py-2 text-sm ${
                  therapist.isOnline
                    ? "text-emerald-700 dark:text-emerald-100"
                    : "text-slate-600 dark:text-white/60"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    therapist.isOnline
                      ? "animate-pulse bg-emerald-400"
                      : "bg-white/30"
                  }`}
                />
                {therapist.isOnline
                  ? "Online (Accepting Requests)"
                  : "Offline (Busy/Unavailable)"}
              </div>
              <LiquidToggle
                checked={therapist.isOnline}
                onChange={handleStatusToggle}
                label="Provider availability"
                disabled={isSavingStatus}
              />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="glass-panel mb-8 border border-black/10 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.14)] dark:border-white/[0.08] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div className="mb-6 flex items-center justify-between gap-4">
            <SectionHeading
              eyebrow="Settings"
              title="Supported Session Modes"
            />
            <StatusBadge
              label={isSavingModes ? "Saving" : "Synced"}
              tone={isSavingModes ? "warning" : "success"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(["Voice", "Text"] as const).map((mode) => {
              const enabled = therapist.supportedModes.includes(mode);

              return (
                <div
                  key={mode}
                  className={`liquid-glass-soft flex items-center justify-between rounded-[24px] border border-black/10 px-5 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition dark:border-white/[0.08] dark:shadow-none ${
                    enabled ? "border-[var(--accent-primary)]/30" : ""
                  } ${isSavingModes ? "opacity-60" : ""}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-[var(--text-primary)]">
                      {mode}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-[var(--text-muted)]">
                      {mode === "Voice"
                        ? "Offer encrypted voice sessions."
                        : "Offer encrypted text-based sessions."}
                    </p>
                  </div>
                  <LiquidToggle
                    checked={enabled}
                    onChange={() => handleModeToggle(mode)}
                    label={`${mode} session mode`}
                    disabled={isSavingModes}
                  />
                </div>
              );
            })}
          </div>

          {settingsMessage ? (
            <div className="liquid-glass-soft mt-4 rounded-[22px] border border-emerald-400/20 bg-emerald-500/8 px-4 py-4">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                {settingsMessage}
              </p>
            </div>
          ) : null}
        </GlassCard>

        <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <GlassCard className="glass-panel border border-black/10 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.14)] dark:border-white/[0.08] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="Incoming Requests"
                  title="Incoming Session Queue"
                />
                <StatusBadge
                  label={therapist.isOnline ? "Accepting Requests" : "Paused"}
                  tone={therapist.isOnline ? "success" : "neutral"}
                />
              </div>

              {isHydrating ? (
                <div className="liquid-glass-soft rounded-[24px] px-5 py-6">
                  <p className="text-sm text-slate-700 dark:text-[var(--text-muted)]">
                    Loading session requests...
                  </p>
                </div>
              ) : null}

              {!isHydrating && requestedSessions.length === 0 ? (
                <div className="liquid-glass-soft rounded-[24px] px-5 py-6">
                  <p className="text-sm text-slate-700 dark:text-[var(--text-muted)]">
                    No pending session requests.
                  </p>
                </div>
              ) : null}

              <div className="space-y-3">
                {requestedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="liquid-glass-soft rounded-[24px] px-5 py-5"
                  >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                          Patient
                        </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                          {session.patientAlias}
                        </p>
                        <p className="mt-4 text-sm text-slate-700 dark:text-[var(--text-muted)]">
                          Requested {formatRelativeTime(session.createdAt)}
                        </p>
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-300/12 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
                          <span className="h-2 w-2 rounded-full bg-amber-300" />
                          {session.amountEth.toFixed(3)} ETH Escrow Locked
                        </div>
                      </div>

                      <div className="flex min-w-[220px] flex-col gap-3">
                        <button
                          type="button"
                          disabled={!therapist.isOnline}
                          className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-5 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-400/16 dark:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={!therapist.isOnline || isOpeningChatId === session.id}
                          onClick={() => handleAccept(session.id)}
                          className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isOpeningChatId === session.id
                            ? "Opening P2P Node..."
                            : "Accept & Enter Chat"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            <GlassCard className="glass-panel border border-black/10 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.14)] dark:border-white/[0.08] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              <SectionHeading
                eyebrow="Financials & History"
                title="Earnings and completed sessions"
              />

              <div className="liquid-glass-soft mt-5 rounded-[24px] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-700 dark:text-[var(--text-muted)]">
                      Total Earnings
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
                      {therapist.totalEarnedEth.toFixed(3)} Sepolia ETH
                    </p>
                  </div>
                  <StatusBadge label="Per session" tone="neutral" />
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700 dark:text-[var(--text-muted)]">
                      Session Escrow
                    </span>
                    <span className="font-mono text-slate-950 dark:text-white">
                      {formatEth(SESSION_BASE_FEE)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700 dark:text-[var(--text-muted)]">
                      MindPass Protocol Fee (5%)
                    </span>
                    <span className="font-mono text-rose-600 dark:text-rose-300">
                      -{formatEth(PLATFORM_FEE)}
                    </span>
                  </div>
                  <div className="h-px bg-black/10 dark:bg-white/10" />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      Net Earnings per session
                    </span>
                    <span className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-300">
                      {formatEth(THERAPIST_CUT)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {completedSessions.length === 0 && !isHydrating ? (
                  <div className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4">
                    <p className="text-sm text-slate-700 dark:text-[var(--text-muted)]">
                      No completed sessions yet.
                    </p>
                  </div>
                ) : null}

                {completedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {session.patientAlias}
                        </p>
                        <p className="mt-1 text-sm text-slate-700 dark:text-[var(--text-muted)]">
                          {formatSessionDate(session.completedAt)}
                        </p>
                      </div>
                      <StatusBadge label="Settled" tone="success" />
                    </div>
                    <p className="mt-4 text-sm text-slate-700 dark:text-[var(--text-muted)]">
                      {formatEth(Math.min(session.amountEth, SESSION_BASE_FEE) - PLATFORM_FEE)} settled
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </main>
  );
}
