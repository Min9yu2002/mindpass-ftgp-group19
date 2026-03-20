"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import GlassCard from "../../components/GlassCard";
import { PROVIDER_REQUEST_UPDATED_EVENT } from "../../components/GlobalProviderIncomingRequestCard";
import LiquidToggle from "../../components/LiquidToggle";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";
import {
  PAYMENT_WINDOW_MS,
  SESSION_FEE_ETH,
} from "../../lib/booking";
import {
  formatProviderQueueStatusLabel,
  formatProviderQueueStatusTone,
  formatSessionMode,
} from "../../lib/session-formatting";
import {
  isProviderQueueSessionStatus,
  normalizeSessionMode,
  normalizeSessionStatus,
  PROVIDER_QUEUE_SESSION_STATUSES,
  type ProviderQueueSessionStatus,
  type SessionMode,
} from "../../lib/session-status";
import { supabase } from "../../lib/supabase";

type SupportedMode = "Voice" | "Text";

type TherapistProfile = {
  walletAddress: string;
  totalEarnedEth: number;
  supportedModes: SupportedMode[];
};

type IncomingRequest = {
  id: string;
  patientWallet: string;
  patientAlias: string;
  amountEth: number;
  status: ProviderQueueSessionStatus;
  sessionMode: SessionMode;
  intakeSummary: string;
};

type CompletedSession = {
  id: string;
  patientAlias: string;
  amountEth: number;
  txHash: string;
  completedAt: string;
};

const LEAD_THERAPIST_WALLET =
  "0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD".toLowerCase();
const PORTAL_QUEUE_SELECT =
  "id, patient_wallet, therapist_wallet, status, created_at, updated_at, session_mode, session_fee_eth, escrow_amount, amount_eth";
const INCOMING_QUEUE_PRIORITY: ProviderQueueSessionStatus[] = [
  "requested",
  "accepted_awaiting_payment",
  "funded",
  "in_session",
];

function normalizeSupportedModes(value: unknown): SupportedMode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item === "video" || item === "voice" ? "Voice" : "Text"))
    .filter((item, index, array) => array.indexOf(item) === index) as SupportedMode[];
}

function resolveTherapistWallet(): string {
  if (typeof window === "undefined") {
    return LEAD_THERAPIST_WALLET;
  }

  const storedProfile = window.localStorage.getItem("mindpass-therapist-profile");
  const storedWalletAddress = storedProfile
    ? (() => {
        try {
          return JSON.parse(storedProfile).walletAddress as string | undefined;
        } catch {
          return undefined;
        }
      })()
    : undefined;

  return (storedWalletAddress ?? LEAD_THERAPIST_WALLET).toLowerCase();
}

function formatEth(value: number) {
  return `${value.toFixed(3)} ETH`;
}

function truncateWallet(value: string) {
  if (!value) {
    return "Unknown wallet";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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

function resolveIncomingQueueSession(
  sessions: Record<string, unknown>[],
): Record<string, unknown> | null {
  for (const status of INCOMING_QUEUE_PRIORITY) {
    const matchingSessions = sessions.filter(
      (session) => normalizeSessionStatus(session.status) === status,
    );

    if (matchingSessions.length > 0) {
      return matchingSessions[0] ?? null;
    }
  }

  return sessions[0] ?? null;
}

export default function TherapistPortalPage() {
  const router = useRouter();
  const therapistWallet = useMemo(() => resolveTherapistWallet(), []);
  const [profile, setProfile] = useState<TherapistProfile>({
    walletAddress: therapistWallet,
    totalEarnedEth: 0,
    supportedModes: [],
  });
  const [isOnline, setIsOnline] = useState(true);
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(
    null,
  );
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [pendingEscrowEth, setPendingEscrowEth] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingModes, setIsLoadingModes] = useState(true);
  const [isSavingModes, setIsSavingModes] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [dataError, setDataError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    const hydratePortal = async () => {
      if (!supabase) {
        if (!isCancelled) {
          setSettingsError("Supabase client is unavailable.");
          setDataError("Supabase client is unavailable.");
          setIsInitialLoading(false);
          setIsLoadingModes(false);
        }
        return;
      }

      setDataError("");

      const therapistQuery = supabase
        .from("therapists")
        .select("wallet_address, supported_modes, total_earned_eth, is_online")
        .ilike("wallet_address", therapistWallet)
        .maybeSingle();

      const requestedQuery = supabase
        .from("sessions")
        .select(PORTAL_QUEUE_SELECT)
        .ilike("therapist_wallet", therapistWallet)
        .in("status", [...PROVIDER_QUEUE_SESSION_STATUSES])
        .order("created_at", { ascending: false })
        .limit(10);

      const pendingQuery = supabase
        .from("sessions")
        .select("session_fee_eth, escrow_amount, amount_eth")
        .ilike("therapist_wallet", therapistWallet)
        .in("status", ["funded", "in_session"]);

      const completedQuery = supabase
        .from("sessions")
        .select(
          "id, patient_wallet, session_fee_eth, escrow_amount, amount_eth, complete_session_tx_hash, last_synced_tx_hash, updated_at, completed_at, created_at",
        )
        .ilike("therapist_wallet", therapistWallet)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(3);

      const [therapistResult, requestedResult, pendingResult, completedResult] =
        await Promise.all([
          therapistQuery,
          requestedQuery,
          pendingQuery,
          completedQuery,
        ]);

      if (isCancelled) {
        return;
      }

      if (therapistResult.error) {
        setSettingsError(therapistResult.error.message);
        setDataError(therapistResult.error.message);
      } else if (therapistResult.data) {
        setProfile({
          walletAddress:
            therapistResult.data.wallet_address ?? therapistWallet,
          totalEarnedEth: Number(therapistResult.data.total_earned_eth ?? 0),
          supportedModes: normalizeSupportedModes(
            therapistResult.data.supported_modes,
          ),
        });
        setIsOnline(Boolean(therapistResult.data.is_online ?? true));
      }

      if (requestedResult.error) {
        setDataError(requestedResult.error.message);
      } else {
        const requestedRows = ((requestedResult.data ?? []) as Record<string, unknown>[])
          .filter((session) =>
            isProviderQueueSessionStatus(normalizeSessionStatus(session.status)),
          );
        const session = resolveIncomingQueueSession(requestedRows);

        if (!session) {
          setIncomingRequest(null);
        } else {
          const patientWallet = String(session.patient_wallet ?? "");
          let patientAlias = truncateWallet(patientWallet);

          if (patientWallet) {
            const patientLookup = await supabase
              .from("patients")
              .select("username")
              .ilike("wallet_address", patientWallet)
              .maybeSingle();

            if (
              !isCancelled &&
              !patientLookup.error &&
              patientLookup.data?.username
            ) {
              patientAlias = patientLookup.data.username;
            }
          }

          if (!isCancelled) {
            const status = normalizeSessionStatus(session.status);
            setIncomingRequest({
              id: String(session.id),
              patientWallet,
              patientAlias,
              amountEth: Number(
                session.session_fee_eth ??
                  session.escrow_amount ??
                  session.amount_eth ??
                  SESSION_FEE_ETH,
              ),
              status: isProviderQueueSessionStatus(status) ? status : "requested",
              sessionMode: normalizeSessionMode(session.session_mode),
              intakeSummary: `Patient requested a secure ${formatSessionMode(
                normalizeSessionMode(session.session_mode),
              ).toLowerCase()} session. Open the live session flow to review further context.`,
            });
          }
        }
      }

      if (pendingResult.error) {
        setDataError(pendingResult.error.message);
      } else {
        const total = (pendingResult.data ?? []).reduce((sum, session) => {
          return (
            sum +
            Number(
              session.session_fee_eth ??
                session.escrow_amount ??
                session.amount_eth ??
                0,
            )
          );
        }, 0);
        setPendingEscrowEth(total);
      }

      if (completedResult.error) {
        setDataError(completedResult.error.message);
      } else {
        const rows = completedResult.data ?? [];
        const patientWallets = rows
          .map((row) => row.patient_wallet as string | null)
          .filter(Boolean) as string[];

        const aliasMap = new Map<string, string>();
        if (patientWallets.length > 0) {
          const patientRows = await supabase
            .from("patients")
            .select("wallet_address, username")
            .in("wallet_address", patientWallets);

          if (!isCancelled && !patientRows.error) {
            (patientRows.data ?? []).forEach((row) => {
              aliasMap.set(String(row.wallet_address), String(row.username));
            });
          }
        }

        if (!isCancelled) {
          setCompletedSessions(
            rows.map((row) => {
              const patientWallet = String(row.patient_wallet ?? "");
              return {
                id: String(row.id),
                patientAlias:
                  aliasMap.get(patientWallet) ?? truncateWallet(patientWallet),
                amountEth: Number(
                  row.session_fee_eth ?? row.escrow_amount ?? row.amount_eth ?? 0,
                ),
                txHash: String(
                  row.complete_session_tx_hash ??
                    row.last_synced_tx_hash ??
                    "Pending settlement",
                ),
                completedAt: String(
                  row.completed_at ??
                    row.updated_at ??
                    row.created_at ??
                    "",
                ),
              };
            }),
          );
        }
      }

      setIsInitialLoading(false);
      setIsLoadingModes(false);
    };

    hydratePortal();

    return () => {
      isCancelled = true;
    };
  }, [refreshNonce, therapistWallet]);

  useEffect(() => {
    const handleProviderRequestUpdated = () => {
      setRefreshNonce((current) => current + 1);
    };

    window.addEventListener(
      PROVIDER_REQUEST_UPDATED_EVENT,
      handleProviderRequestUpdated,
    );

    return () => {
      window.removeEventListener(
        PROVIDER_REQUEST_UPDATED_EVENT,
        handleProviderRequestUpdated,
      );
    };
  }, []);

  useEffect(() => {
    if (!settingsMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSettingsMessage("");
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [settingsMessage]);

  const updateOnlineStatus = async (nextStatus: boolean) => {
    const previousStatus = isOnline;
    setIsOnline(nextStatus);

    if (!supabase) {
      return;
    }

    const { error } = await supabase
      .from("therapists")
      .update({ is_online: nextStatus })
      .eq("wallet_address", therapistWallet);

    if (error) {
      setDataError(error.message);
      setIsOnline(previousStatus);
    }
  };

  const handleDecline = async () => {
    if (!incomingRequest || !supabase) {
      return;
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("sessions")
      .update({
        status: "rejected",
        rejected_at: now,
        settlement_status: "cancelled",
      })
      .eq("id", incomingRequest.id);

    if (error) {
      setDataError(error.message);
      return;
    }

    setIncomingRequest(null);
  };

  const handleAccept = async () => {
    if (!incomingRequest || isConnecting || !supabase) {
      return;
    }

    setIsConnecting(true);
    setDataError("");
    const now = new Date();

    const { error } = await supabase
      .from("sessions")
      .update({
        status: "accepted_awaiting_payment",
        provider_accepted_at: now.toISOString(),
        payment_due_at: new Date(
          now.getTime() + PAYMENT_WINDOW_MS,
        ).toISOString(),
        settlement_status: "awaiting_patient_payment",
      })
      .eq("id", incomingRequest.id);

    if (error) {
      setDataError(error.message);
      setIsConnecting(false);
      return;
    }

    router.push(
      `/chat?role=therapist&address=${encodeURIComponent(profile.walletAddress)}`,
    );
  };

  const handleModeToggle = async (mode: SupportedMode) => {
    if (!supabase || isSavingModes) {
      return;
    }

    const nextModes = profile.supportedModes.includes(mode)
      ? profile.supportedModes.filter((item) => item !== mode)
      : [...profile.supportedModes, mode];

    setIsSavingModes(true);
    setSettingsError("");
    setSettingsMessage("");

    const payload = nextModes.map((item) =>
      item === "Voice" ? "voice" : "text",
    );

    const { error } = await supabase
      .from("therapists")
      .update({ supported_modes: payload })
      .eq("wallet_address", therapistWallet);

    if (error) {
      setSettingsError(error.message);
      setIsSavingModes(false);
      return;
    }

    setProfile((current) => ({
      ...current,
      supportedModes: nextModes,
    }));
    setSettingsMessage("Session modes updated.");
    setIsSavingModes(false);
  };

  return (
    <main className="app-shell-subtle page-canvas page-canvas-provider relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <section className="glass-panel liquid-glass-strong mb-8 rounded-[32px] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.26em] text-[var(--text-faint)]">
                Provider Access
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
                Provider Command Center
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-muted)]">
                SBT Verified • {truncateWallet(profile.walletAddress)}
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:min-w-[24rem]">
              <button
                type="button"
                onClick={() => router.push("/provider-lobby")}
                className="button-secondary self-start rounded-full px-5 py-3 text-sm font-medium"
              >
                Back to Provider Lobby
              </button>

              <div className="liquid-glass-soft flex flex-col gap-4 rounded-[28px] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isOnline
                          ? "bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.85)]"
                          : "bg-black/20 dark:bg-white/20"
                      } ${isOnline ? "animate-pulse" : ""}`}
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Status: {isOnline ? "Accepting Requests" : "Offline"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {isOnline
                          ? "Secure queue is open for anonymous patients."
                          : "New requests are paused while you are unavailable."}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    label={isOnline ? "Live Queue" : "Paused"}
                    tone={isOnline ? "success" : "neutral"}
                  />
                </div>

                <LiquidToggle
                  checked={isOnline}
                  onChange={updateOnlineStatus}
                  label="Provider online status"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <GlassCard className="glass-panel p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <SectionHeading eyebrow="Settings" title="Supported Session Modes" />
              <StatusBadge
                label={isSavingModes ? "Saving" : "Synced"}
                tone={isSavingModes ? "warning" : "success"}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(["Voice", "Text"] as const).map((mode) => {
                const enabled = profile.supportedModes.includes(mode);

                return (
                  <div
                    key={mode}
                    className={`liquid-glass-soft flex items-center justify-between rounded-[24px] px-5 py-4 text-left transition ${
                      enabled ? "border-[var(--accent-primary)]/30" : ""
                    } ${isLoadingModes || isSavingModes ? "opacity-60" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {mode}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {mode === "Voice"
                          ? "Offer encrypted voice sessions."
                          : "Offer encrypted text-based sessions."}
                      </p>
                    </div>
                    <LiquidToggle
                      checked={enabled}
                      onChange={() => handleModeToggle(mode)}
                      label={`${mode} session mode`}
                      disabled={isLoadingModes || isSavingModes}
                    />
                  </div>
                );
              })}
            </div>

            {settingsError ? (
              <div className="liquid-glass-soft mt-4 rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
                <p className="text-sm text-red-600 dark:text-red-300">
                  {settingsError}
                </p>
              </div>
            ) : null}

            {settingsMessage ? (
              <div className="liquid-glass-soft mt-4 rounded-[22px] border border-emerald-400/20 bg-emerald-500/8 px-4 py-4">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  {settingsMessage}
                </p>
              </div>
            ) : null}
          </GlassCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <GlassCard className="glass-panel p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <SectionHeading
                eyebrow="Incoming Queue"
                title="Incoming Session Requests"
              />
              <StatusBadge
                label={isOnline ? "Listening" : "Offline"}
                tone={isOnline ? "success" : "neutral"}
              />
            </div>

            {dataError ? (
              <div className="liquid-glass-soft mb-4 rounded-[22px] border border-red-400/20 bg-red-500/8 px-4 py-4">
                <p className="text-sm text-red-600 dark:text-red-300">
                  {dataError}
                </p>
              </div>
            ) : null}

            {!isOnline ? (
              <div className="liquid-glass-soft rounded-[28px] p-6 text-center">
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  Queue paused
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  Switch back online when you are ready to accept new anonymous
                  requests.
                </p>
              </div>
            ) : null}

            {isOnline && isInitialLoading ? (
              <div className="liquid-glass-soft rounded-[28px] p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
                </div>
                <p className="mt-5 text-lg font-semibold text-[var(--text-primary)]">
                  Loading provider queue...
                </p>
              </div>
            ) : null}

            {isOnline && !isInitialLoading && !incomingRequest ? (
              <div className="liquid-glass-soft rounded-[28px] p-6 text-center">
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  No pending requests
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  New escrow-backed bookings will appear here when a patient
                  requests a session.
                </p>
              </div>
            ) : null}

            {incomingRequest ? (
              <div className="liquid-glass-soft rounded-[28px] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-faint)]">
                      Patient Alias
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                      {incomingRequest.patientAlias}
                    </h2>
                    <p className="mt-3 text-sm text-[var(--text-muted)]">
                      {truncateWallet(incomingRequest.patientWallet)}
                    </p>
                  </div>
                  <StatusBadge
                    label={formatProviderQueueStatusLabel(incomingRequest.status)}
                    tone={formatProviderQueueStatusTone(incomingRequest.status)}
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Escrow Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-emerald-600 dark:text-emerald-300">
                    {formatEth(incomingRequest.amountEth)} Locked in Contract
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      Session Mode
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                      {formatSessionMode(incomingRequest.sessionMode)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      Queue Status
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                      {formatProviderQueueStatusLabel(incomingRequest.status)}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Intake Summary
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                    {incomingRequest.intakeSummary}
                  </p>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleDecline}
                    className="button-secondary rounded-full px-5 py-3 text-sm font-medium text-red-500 dark:text-red-300"
                  >
                    Decline &amp; Refund
                  </button>
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isConnecting}
                    className="button-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-wait disabled:opacity-80"
                  >
                    {isConnecting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Establishing secure P2P node...
                      </>
                    ) : (
                      "Accept & Enter Chat"
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </GlassCard>

          <GlassCard className="glass-panel p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <SectionHeading eyebrow="Financials" title="Earnings & Escrow" />
              <StatusBadge label="Wallet Synced" tone="success" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="liquid-glass-soft rounded-[24px] p-5">
                <p className="text-sm text-[var(--text-muted)]">Pending Escrow</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  {formatEth(pendingEscrowEth)}
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Sum of all active sessions currently held in escrow.
                </p>
              </div>
              <div className="liquid-glass-soft rounded-[24px] p-5">
                <p className="text-sm text-[var(--text-muted)]">
                  Available to Claim
                </p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                  {formatEth(profile.totalEarnedEth)}
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Synced from therapist earnings recorded in Supabase.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="button-primary mt-5 w-full rounded-full px-5 py-3 text-sm font-medium"
            >
              Claim Funds
            </button>

            <div className="mt-8">
              <p className="text-sm uppercase tracking-[0.22em] text-[var(--text-faint)]">
                Recent Completed Sessions
              </p>
              <div className="mt-4 space-y-3">
                {completedSessions.length === 0 ? (
                  <div className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4">
                    <p className="text-sm text-[var(--text-muted)]">
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
                        <p className="font-medium text-[var(--text-primary)]">
                          {session.patientAlias}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {formatSessionDate(session.completedAt)}
                        </p>
                      </div>
                      <StatusBadge label="Completed" tone="success" />
                    </div>
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                      {formatEth(session.amountEth)} settled
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      Tx: {session.txHash}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </section>
      </div>
    </main>
  );
}
