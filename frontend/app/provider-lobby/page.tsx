"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import GlassCard from "../../components/GlassCard";
import { PROVIDER_REQUEST_UPDATED_EVENT } from "../../components/GlobalProviderIncomingRequestCard";
import LiquidToggle from "../../components/LiquidToggle";
import SectionHeading from "../../components/SectionHeading";
import SessionEndRequestNotificationsPanel from "../../components/SessionEndRequestNotificationsPanel";
import SessionOutcomeNoticeModal from "../../components/SessionOutcomeNoticeModal";
import SessionReadyModal from "../../components/SessionReadyModal";
import StatusBadge from "../../components/StatusBadge";
import SupportRequestModal from "../../components/SupportRequestModal";
import {
  NORMAL_THERAPIST_PAYOUT_ETH,
  PAYMENT_WINDOW_MS,
  PLATFORM_FEE_ETH,
  SESSION_FEE_ETH,
} from "../../lib/booking";
import {
  formatProviderQueueStatusLabel,
  formatProviderQueueStatusTone,
  formatSessionMode,
} from "../../lib/session-formatting";
import { usePageSessionGuard } from "../../lib/session-guard";
import {
  isAcceptedAwaitingPaymentStatus,
  isFundedOrLiveSessionStatus,
  isProviderQueueSessionStatus,
  normalizeSessionMode,
  normalizeSessionStatus,
  type ProviderQueueSessionStatus,
  type SessionMode,
} from "../../lib/session-status";
import {
  getNoShowCatchUpSettlement,
  shouldCatchPaymentTimeout,
} from "../../lib/session-transition-guards";
import {
  getTerminalSessionOutcome,
  isDeadlineOutcomeStatus,
  type DeadlineOutcomeStatus,
} from "../../lib/session-outcome";
import {
  acknowledgeDeadlineOutcome,
  buildDeadlineOutcomeAckKey,
  isDeadlineOutcomeAcknowledged,
} from "../../lib/session-outcome-ack";
import {
  buildSessionEndRequestChatHref,
  useSessionEndRequestNotifications,
} from "../../lib/session-end-request-notifications";
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
  updatedAt: string | null;
  status: ProviderQueueSessionStatus;
  sessionMode: SessionMode;
  paymentDueAt: string | null;
  noShowDeadlineAt: string | null;
  patientJoinedAt: string | null;
  therapistJoinedAt: string | null;
};

type CompletedSession = {
  id: string;
  patientAlias: string;
  completedAt: string;
  amountEth: number;
};

type OutcomeModalContext = {
  sessionId: string;
  status: DeadlineOutcomeStatus;
  ackKey: string;
};

const PROVIDER_REQUEST_SELECT =
  "id, patient_wallet, therapist_wallet, status, created_at, updated_at, session_mode, session_fee_eth, escrow_amount, amount_eth, payment_due_at, no_show_deadline_at, patient_joined_at, therapist_joined_at";

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

function normalizeRequestedSession(row: Record<string, unknown>): RequestedSession {
  const patientWallet = String(row.patient_wallet ?? "");
  const status = normalizeSessionStatus(row.status);

  return {
    id: String(row.id ?? ""),
    patientWallet,
    patientAlias: truncateWallet(patientWallet),
    amountEth: Number(
      row.session_fee_eth ?? row.escrow_amount ?? row.amount_eth ?? SESSION_FEE_ETH,
    ),
    createdAt: String(row.created_at ?? ""),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    status: isProviderQueueSessionStatus(status) ? status : "requested",
    sessionMode: normalizeSessionMode(row.session_mode),
    paymentDueAt:
      typeof row.payment_due_at === "string" ? row.payment_due_at : null,
    noShowDeadlineAt:
      typeof row.no_show_deadline_at === "string" ? row.no_show_deadline_at : null,
    patientJoinedAt:
      typeof row.patient_joined_at === "string" ? row.patient_joined_at : null,
    therapistJoinedAt:
      typeof row.therapist_joined_at === "string" ? row.therapist_joined_at : null,
  };
}

function upsertRequestedSession(
  currentSessions: RequestedSession[],
  nextSession: RequestedSession,
) {
  const nextSessions = currentSessions.filter(
    (session) => session.id !== nextSession.id,
  );
  nextSessions.unshift(nextSession);
  return nextSessions.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
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

async function applyProviderSessionCatchUp(session: RequestedSession) {
  if (!supabase) {
    return session;
  }

  if (shouldCatchPaymentTimeout(session)) {
    const { data, error } = await supabase
      .from("sessions")
      .update({
        status: "payment_timeout",
        payment_timeout_at: new Date().toISOString(),
        no_show_deadline_at: null,
        settlement_status: "cancelled",
      })
      .eq("id", session.id)
      .eq("status", "accepted_awaiting_payment")
      .select(PROVIDER_REQUEST_SELECT)
      .maybeSingle();

    if (error) {
      console.error("Failed to catch up payment timeout in provider lobby", error);
      return session;
    }

    if (!data) {
      return null;
    }

    return null;
  }

  const settlement = getNoShowCatchUpSettlement(session);

  if (!settlement) {
    return session;
  }

  const { data, error } = await supabase
    .from("sessions")
    .update(settlement)
    .eq("id", session.id)
    .eq("status", "funded")
    .select(PROVIDER_REQUEST_SELECT)
    .maybeSingle();

  if (error) {
    console.error("Failed to catch up funded no-show in provider lobby", error);
    return session;
  }

  if (!data) {
    return null;
  }

  return null;
}

async function applyTherapistOverdueFundedCatchUps(therapistWallet: string) {
  if (!supabase) {
    return;
  }

  const { data, error } = await supabase
    .from("sessions")
    .select(PROVIDER_REQUEST_SELECT)
    .ilike("therapist_wallet", therapistWallet)
    .eq("status", "funded")
    .is("session_started_at", null)
    .not("no_show_deadline_at", "is", null)
    .lte("no_show_deadline_at", new Date().toISOString())
    .order("no_show_deadline_at", { ascending: true });

  if (error) {
    console.error(
      "Failed to load overdue funded sessions in provider lobby",
      error,
    );
    return;
  }

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    await applyProviderSessionCatchUp(normalizeRequestedSession(row));
  }
}

export default function ProviderLobbyPage() {
  const router = useRouter();
  const { address, status: accountStatus } = useAccount();
  const sessionGuard = usePageSessionGuard({
    requiredRole: "therapist",
    address,
    wagmiStatus: accountStatus,
  });
  const therapistWallet = useMemo(
    () => sessionGuard.resolvedWalletAddress,
    [sessionGuard.resolvedWalletAddress],
  );
  const isAuthorized = sessionGuard.authResolutionState === "authorized";
  const isPatientBlocked = sessionGuard.authResolutionState === "blocked";
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
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [activeRequestSession, setActiveRequestSession] =
    useState<RequestedSession | null>(null);
  const [lastPopupSessionId, setLastPopupSessionId] = useState<string | null>(null);
  const [activeReadySession, setActiveReadySession] =
    useState<RequestedSession | null>(null);
  const [lastReadyPopupSessionId, setLastReadyPopupSessionId] =
    useState<string | null>(null);
  const [deadlineOutcomeModal, setDeadlineOutcomeModal] =
    useState<OutcomeModalContext | null>(null);
  const [supportRequestContext, setSupportRequestContext] =
    useState<OutcomeModalContext | null>(null);
  const [isReadyNavigating, setIsReadyNavigating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [sessionRefreshNonce, setSessionRefreshNonce] = useState(0);
  const sessionEndNotifications = useSessionEndRequestNotifications({
    walletAddress: therapistWallet,
    enabled: isAuthorized,
  });
  const shownDeadlineOutcomeKeyRef = useRef<string | null>(null);
  const deadlineOutcomeModalCopy = deadlineOutcomeModal
    ? getTerminalSessionOutcome(deadlineOutcomeModal.status, true)
    : null;

  const maybeOpenDeadlineOutcomeModal = useEffectEvent((
    session: { id: string; status: string; updatedAt?: string | null } | null,
  ) => {
    if (!session || !isDeadlineOutcomeStatus(session.status)) {
      return;
    }

    const ackKey = buildDeadlineOutcomeAckKey({
      viewerRole: "therapist",
      sessionId: session.id,
      status: session.status,
      updatedAt: session.updatedAt,
    });

    if (shownDeadlineOutcomeKeyRef.current === ackKey) {
      return;
    }

    if (isDeadlineOutcomeAcknowledged(ackKey)) {
      return;
    }

    shownDeadlineOutcomeKeyRef.current = ackKey;
    setDeadlineOutcomeModal({
      sessionId: session.id,
      status: session.status,
      ackKey,
    });
  });

  useEffect(() => {
    if (sessionGuard.authResolutionState !== "redirect") {
      return;
    }

    router.replace("/therapist-login");
  }, [router, sessionGuard.authResolutionState]);

  useEffect(() => {
    shownDeadlineOutcomeKeyRef.current = null;
    setDeadlineOutcomeModal(null);
    setSupportRequestContext(null);
  }, [therapistWallet]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateTherapist = async () => {
      if (!isAuthorized || !therapistWallet) {
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
    "wallet_address, full_name, legal_name, specialty, clinical_specialty, bio, languages, supported_modes, is_online, total_earned_eth",
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
     totalEarnedEth: Number(therapistData.total_earned_eth ?? 0),
          isOnline: Boolean(therapistData.is_online ?? false),
          supportedModes,
        });
        setErrorMessage("");
      } catch (error) {
  console.error("Failed to hydrate therapist profile", error);
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
  }, [isAuthorized, therapistWallet]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateSessionData = async () => {
      if (!isAuthorized || !supabase || !therapistWallet) {
        return;
      }

      setIsHydrating(true);
      await applyTherapistOverdueFundedCatchUps(therapistWallet);

      const requestedQuery = supabase
        .from("sessions")
        .select(PROVIDER_REQUEST_SELECT)
        .ilike("therapist_wallet", therapistWallet)
        .in("status", [
          "requested",
          "accepted_awaiting_payment",
          "funded",
          "in_session",
        ])
        .order("created_at", { ascending: false });

      const completedQuery = supabase
        .from("sessions")
        .select(
          "id, patient_wallet, therapist_wallet, status, created_at, updated_at, completed_at, session_mode, session_fee_eth, escrow_amount, amount_eth",
        )
        .ilike("therapist_wallet", therapistWallet)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(3);

      const latestTerminalQuery = supabase
        .from("sessions")
        .select("id, status, updated_at")
        .ilike("therapist_wallet", therapistWallet)
        .in("status", ["patient_no_show", "therapist_no_show", "mutual_unstarted"])
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const [requestedResult, completedResult, latestTerminalResult] = await Promise.all([
        requestedQuery,
        completedQuery,
        latestTerminalQuery,
      ]);

      if (isCancelled) {
        return;
      }

      const normalizedRequestedSessions = await Promise.all(
        ((requestedResult.error ? [] : requestedResult.data) ?? []).map(async (session) => {
          const normalizedSession = normalizeRequestedSession(
            session as Record<string, unknown>,
          );
          return applyProviderSessionCatchUp(normalizedSession);
        }),
      );

      setRequestedSessions(
        normalizedRequestedSessions.filter(
          (session): session is RequestedSession =>
            Boolean(session && isProviderQueueSessionStatus(session.status)),
        ),
      );

      setCompletedSessions(
        ((completedResult.error ? [] : completedResult.data) ?? []).map((session) => {
          const patientWallet = String(session.patient_wallet ?? "");
          return {
            id: String(session.id),
            patientAlias: truncateWallet(patientWallet),
            completedAt: String(
              session.completed_at ??
                session.updated_at ??
                session.created_at ??
                "",
            ),
            amountEth: Number(
              session.session_fee_eth ??
                session.escrow_amount ??
                session.amount_eth ??
                0.005,
            ),
          };
        }),
      );

      if (!latestTerminalResult.error && latestTerminalResult.data) {
        maybeOpenDeadlineOutcomeModal({
          id: String(latestTerminalResult.data.id ?? ""),
          status: String(latestTerminalResult.data.status ?? ""),
          updatedAt:
            typeof latestTerminalResult.data.updated_at === "string"
              ? latestTerminalResult.data.updated_at
              : null,
        });
      }

      setIsHydrating(false);
    };

    hydrateSessionData();

    return () => {
      isCancelled = true;
    };
  }, [isAuthorized, sessionRefreshNonce, therapistWallet]);

  useEffect(() => {
    const handleProviderRequestUpdated = () => {
      setSessionRefreshNonce((current) => current + 1);
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
    if (!activeReadySession) {
      return;
    }

    const latestSession = requestedSessions.find(
      (session) => session.id === activeReadySession.id,
    );

    if (!latestSession || latestSession.status !== "funded") {
      setActiveReadySession(null);
      setIsReadyNavigating(false);
      return;
    }

    if (
      latestSession.patientWallet !== activeReadySession.patientWallet ||
      latestSession.amountEth !== activeReadySession.amountEth ||
      latestSession.sessionMode !== activeReadySession.sessionMode
    ) {
      setActiveReadySession(latestSession);
    }
  }, [activeReadySession, requestedSessions]);

  useEffect(() => {
    const latestFundedSession = requestedSessions.find(
      (session) => session.status === "funded",
    );

    if (!latestFundedSession) {
      return;
    }

    if (
      activeReadySession?.id === latestFundedSession.id ||
      lastReadyPopupSessionId === latestFundedSession.id
    ) {
      return;
    }

    setActiveReadySession(latestFundedSession);
    setLastReadyPopupSessionId(latestFundedSession.id);
    setIsReadyNavigating(false);
  }, [activeReadySession?.id, lastReadyPopupSessionId, requestedSessions]);

  useEffect(() => {
    if (!isAuthorized || !supabase || !therapistWallet) {
      return;
    }

    const normalizedTherapistWallet = therapistWallet.toLowerCase();
    const channel = supabase.channel(
      `provider-session-requests:${normalizedTherapistWallet}`,
    );

    const syncRequestedSession = (payload: { new: Record<string, unknown> }) => {
      const nextSession = payload.new;
      const nextWallet = String(nextSession.therapist_wallet ?? "").toLowerCase();
      if (nextWallet !== normalizedTherapistWallet) {
        return;
      }

      const nextStatus = normalizeSessionStatus(nextSession.status);
      const sessionId = String(nextSession.id ?? "");

      if (isProviderQueueSessionStatus(nextStatus)) {
        const normalizedSession = normalizeRequestedSession(nextSession);
        setRequestedSessions((current) =>
          upsertRequestedSession(current, normalizedSession),
        );

        if (
          nextStatus === "requested" &&
          therapist.isOnline &&
          activeRequestSession?.id !== normalizedSession.id &&
          lastPopupSessionId !== normalizedSession.id
        ) {
          setActiveRequestSession(normalizedSession);
          setLastPopupSessionId(normalizedSession.id);
        }

        if (
          isAcceptedAwaitingPaymentStatus(nextStatus) ||
          isFundedOrLiveSessionStatus(nextStatus)
        ) {
          setActiveRequestSession((current) =>
            current?.id === sessionId ? null : current,
          );
        }

        if (
          nextStatus === "funded" &&
          activeReadySession?.id !== normalizedSession.id &&
          lastReadyPopupSessionId !== normalizedSession.id
        ) {
          setActiveReadySession(normalizedSession);
          setLastReadyPopupSessionId(normalizedSession.id);
          setIsReadyNavigating(false);
        }

        return;
      }

      if (sessionId) {
        maybeOpenDeadlineOutcomeModal({
          id: sessionId,
          status: nextStatus,
          updatedAt:
            typeof nextSession.updated_at === "string"
              ? nextSession.updated_at
              : null,
        });
        setRequestedSessions((current) =>
          current.filter((session) => session.id !== sessionId),
        );
        setActiveRequestSession((current) =>
          current?.id === sessionId ? null : current,
        );
      }
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sessions",
          filter: `therapist_wallet=eq.${normalizedTherapistWallet}`,
        },
        (payload) => syncRequestedSession(payload as { new: Record<string, unknown> }),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `therapist_wallet=eq.${normalizedTherapistWallet}`,
        },
        (payload) => syncRequestedSession(payload as { new: Record<string, unknown> }),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [
    activeRequestSession?.id,
    activeReadySession?.id,
    isAuthorized,
    lastPopupSessionId,
    lastReadyPopupSessionId,
    therapist.isOnline,
    therapistWallet,
  ]);

  useEffect(() => {
    if (!requestedSessions.length) {
      return;
    }

    const timeoutIds = requestedSessions
      .map((session) => {
        const target =
          isAcceptedAwaitingPaymentStatus(session.status)
            ? session.paymentDueAt
            : session.status === "funded"
              ? session.noShowDeadlineAt
              : null;

        if (!target) {
          return null;
        }

        const deadline = new Date(target).getTime();
        if (Number.isNaN(deadline)) {
          return null;
        }

        return window.setTimeout(() => {
          void (async () => {
            const nextSession = await applyProviderSessionCatchUp(session);
            if (
              nextSession &&
              isProviderQueueSessionStatus(nextSession.status)
            ) {
              setRequestedSessions((current) =>
                upsertRequestedSession(current, nextSession),
              );
              return;
            }

            setRequestedSessions((current) =>
              current.filter((currentSession) => currentSession.id !== session.id),
            );
            setActiveRequestSession((current) =>
              current?.id === session.id ? null : current,
            );
            setSessionRefreshNonce((current) => current + 1);
          })();
        }, Math.max(0, deadline - Date.now()));
      })
      .filter((timeoutId): timeoutId is number => timeoutId !== null);

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [requestedSessions]);

  if (sessionGuard.authResolutionState === "pending") {
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

const handleSessionDecision = async (
  session: RequestedSession,
  nextStatus: "accepted" | "rejected",
) => {
  if (!supabase || requestActionId) {
    return;
  }

  const now = new Date();
  const updatePayload =
    nextStatus === "accepted"
      ? {
          status: "accepted_awaiting_payment",
          provider_accepted_at: now.toISOString(),
          payment_due_at: new Date(
            now.getTime() + PAYMENT_WINDOW_MS,
          ).toISOString(),
          settlement_status: "awaiting_patient_payment",
        }
      : {
          status: "rejected",
          rejected_at: now.toISOString(),
          settlement_status: "cancelled",
        };

  setRequestActionId(session.id);
  setErrorMessage("");

  const { data, error } = await supabase
    .from("sessions")
    .update(updatePayload)
    .eq("id", session.id)
    .eq("status", "requested")
    .select(PROVIDER_REQUEST_SELECT)
    .maybeSingle();

  if (error) {
    setErrorMessage(error.message);
    setRequestActionId(null);
    return;
  }

  if (!data) {
    setErrorMessage("This request changed state. Refreshing the latest queue.");
    setActiveRequestSession((current) =>
      current?.id === session.id ? null : current,
    );
    setRequestActionId(null);
    setSessionRefreshNonce((current) => current + 1);
    return;
  }

  const normalizedSession = normalizeRequestedSession(data as Record<string, unknown>);
  if (nextStatus === "accepted") {
    setRequestedSessions((current) =>
      upsertRequestedSession(current, normalizedSession),
    );
  } else {
    setRequestedSessions((current) =>
      current.filter((currentSession) => currentSession.id !== session.id),
    );
  }

  setActiveRequestSession((current) =>
    current?.id === session.id ? null : current,
  );
  setRequestActionId(null);
};

  const displayName = therapist.displayName || truncateWallet(therapist.walletAddress);
  const activeReadyChatHref = activeReadySession
    ? `/chat?role=therapist&sessionId=${encodeURIComponent(activeReadySession.id)}`
    : "";

  const handleEnterReadySessionChat = () => {
    if (!activeReadyChatHref || isReadyNavigating) {
      return;
    }

    setIsReadyNavigating(true);
    router.push(activeReadyChatHref);
  };

  const handleOpenSessionEndNotification = async (
    notification: (typeof sessionEndNotifications.notifications)[number],
  ) => {
    const updatedNotification = await sessionEndNotifications.markNotificationSeen(
      notification,
      {
        includeNotificationSent: true,
      },
    );

    router.push(buildSessionEndRequestChatHref(updatedNotification, "therapist"));
  };

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

        <div className="mb-8">
          <SessionEndRequestNotificationsPanel
            eyebrow="Session Alerts"
            title="Pending End-Session Requests"
            roleLabel="provider"
            notifications={sessionEndNotifications.notifications}
            unreadCount={sessionEndNotifications.unreadCount}
            isLoading={sessionEndNotifications.isLoading}
            errorMessage={sessionEndNotifications.errorMessage}
            emptyMessage="No pending end-session requests are waiting for your review."
            onOpenChat={handleOpenSessionEndNotification}
          />
        </div>

        {activeReadySession ? (
          <SessionReadyModal
            key={`provider-ready:${activeReadySession.id}`}
            label="Session Ready"
            title="Funding confirmed"
            message="The patient has funded the session. Both participants can now enter chat."
            details={[
              { label: "Patient", value: activeReadySession.patientAlias },
              { label: "Mode", value: formatSessionMode(activeReadySession.sessionMode) },
              { label: "Fee", value: formatEth(activeReadySession.amountEth) },
            ]}
            isSubmitting={isReadyNavigating}
            onPrimary={handleEnterReadySessionChat}
            onSecondary={() => {
              setActiveReadySession(null);
              setIsReadyNavigating(false);
            }}
          />
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
                        ? "Offer wallet-gated voice sessions."
                        : "Offer wallet-gated text sessions."}
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
                    No incoming session requests yet.
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
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-300/12 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
                            <span className="h-2 w-2 rounded-full bg-amber-300" />
                            {session.amountEth.toFixed(3)} ETH Session Fee
                          </div>
                          <div className="glass-chip-muted px-3 py-1 text-xs">
                            {formatSessionMode(session.sessionMode)}
                          </div>
                          <StatusBadge
                            label={formatProviderQueueStatusLabel(session.status)}
                            tone={formatProviderQueueStatusTone(session.status)}
                          />
                        </div>
                        {isAcceptedAwaitingPaymentStatus(session.status) ? (
                          <p className="mt-3 text-xs text-amber-700 dark:text-amber-200">
                            Patient payment confirmation is still pending.
                          </p>
                        ) : null}
                        {session.status === "funded" ? (
                          <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
                            Session funded. Waiting for both participants to enter.
                          </p>
                        ) : null}
                        {session.status === "in_session" ? (
                          <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
                            Session is live. Enter chat to continue.
                          </p>
                        ) : null}
                      </div>

                      {session.status === "requested" ? (
                        <div className="flex min-w-[220px] flex-col gap-3">
                          <button
                            type="button"
                            disabled={!therapist.isOnline || requestActionId === session.id}
                            onClick={() =>
                              void handleSessionDecision(session, "rejected")
                            }
                            className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-5 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-400/16 dark:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {requestActionId === session.id ? "Updating..." : "Reject"}
                          </button>
                          <button
                            type="button"
                            disabled={!therapist.isOnline || requestActionId === session.id}
                            onClick={() =>
                              void handleSessionDecision(session, "accepted")
                            }
                            className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {requestActionId === session.id
                              ? "Updating..."
                              : "Accept"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex min-w-[220px] flex-col gap-3">
                          <div
                            className={`liquid-glass-soft rounded-[20px] px-4 py-4 text-sm font-medium ${
                              isFundedOrLiveSessionStatus(session.status)
                                ? "border border-emerald-400/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-200"
                                : "border border-amber-400/20 bg-amber-400/10 text-amber-700 dark:text-amber-200"
                            }`}
                          >
                            {isAcceptedAwaitingPaymentStatus(session.status)
                              ? "Accepted. Waiting for patient payment."
                              : session.status === "funded"
                                ? "Funding confirmed. Ready for chat entry."
                                : "Session is currently in progress."}
                          </div>
                          {isFundedOrLiveSessionStatus(session.status) && (
                            <Link
                              href={`/chat?role=therapist&sessionId=${encodeURIComponent(
                                session.id,
                              )}`}
                              className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
                            >
                              Enter Chat
                            </Link>
                          )}
                        </div>
                      )}
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
                      {formatEth(SESSION_FEE_ETH)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700 dark:text-[var(--text-muted)]">
                      MindPass Protocol Fee (5%)
                    </span>
                    <span className="font-mono text-rose-600 dark:text-rose-300">
                      -{formatEth(PLATFORM_FEE_ETH)}
                    </span>
                  </div>
                  <div className="h-px bg-black/10 dark:bg-white/10" />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      Net Earnings per session
                    </span>
                    <span className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-300">
                      {formatEth(NORMAL_THERAPIST_PAYOUT_ETH)}
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
                    {formatEth(Math.max(0, Math.min(session.amountEth, SESSION_FEE_ETH) - PLATFORM_FEE_ETH))} settled
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </section>
      </div>

      {deadlineOutcomeModalCopy ? (
        <SessionOutcomeNoticeModal
          title={deadlineOutcomeModalCopy.title}
          message={deadlineOutcomeModalCopy.message}
          onClose={() => {
            if (deadlineOutcomeModal) {
              acknowledgeDeadlineOutcome(deadlineOutcomeModal.ackKey);
            }
            setDeadlineOutcomeModal(null);
          }}
          onContactUs={() => {
            if (!deadlineOutcomeModal) {
              return;
            }

            setSupportRequestContext(deadlineOutcomeModal);
          }}
        />
      ) : null}

      {supportRequestContext && therapist.walletAddress ? (
        <SupportRequestModal
          key={`support:${supportRequestContext.sessionId}:${supportRequestContext.status}`}
          sessionId={supportRequestContext.sessionId}
          reporterWallet={therapist.walletAddress}
          reporterRole="therapist"
          initialIssueType={supportRequestContext.status}
          onClose={() => setSupportRequestContext(null)}
        />
      ) : null}
    </main>
  );
}
