"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, useConfig } from "wagmi";
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
  getPaymentWindowRemainingSeconds,
  NORMAL_THERAPIST_PAYOUT_ETH,
  PLATFORM_FEE_ETH,
  SESSION_FEE_ETH,
} from "../../lib/booking";
import {
  buildBookingAcceptedPatch,
  buildBookingRejectedPatch,
  buildSessionFundedPatch,
  compactSessionSyncPatch,
} from "../../lib/onchain-session-mapping";
import {
  formatProviderQueueStatusLabel,
  formatProviderQueueStatusTone,
  formatSessionMode,
} from "../../lib/session-formatting";
import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
  MINDPASS_ESCROW_STATUS,
  normalizeMindPassEscrowSession,
  prepareAcceptBooking,
  prepareRejectBooking,
  prepareResolveNoShow,
  prepareResolvePaymentTimeout,
} from "../../lib/mindpassEscrow";
import {
  logEscrowDebug,
  logMirrorSync,
  logMirrorSyncError,
  logReceiptDecode,
} from "../../lib/escrow-debug";
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
  buildResolutionPatchFromEvent,
  buildResolutionPatchFromChainSession,
  type EscrowResolutionEventInput,
  getEscrowResolutionKind,
  isTerminalEscrowResolutionStatus,
} from "../../lib/escrow-resolution";
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
  onchainSessionId: string | null;
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

const IS_DEV = process.env.NODE_ENV !== "production";

function logAcceptMirrorRecheck(
  label: string,
  payload: Record<string, unknown>,
) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[accept-mirror-recheck]", label, payload);
}

function logPaymentWindow180(label: string, payload: Record<string, unknown>) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[payment-window-180]", label, payload);
}

const PROVIDER_REQUEST_SELECT =
  "id, onchain_session_id, patient_wallet, therapist_wallet, status, created_at, updated_at, session_mode, session_fee_eth, escrow_amount, amount_eth, payment_due_at, no_show_deadline_at, patient_joined_at, therapist_joined_at";

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
    onchainSessionId:
      row.onchain_session_id === null || row.onchain_session_id === undefined
        ? null
        : String(row.onchain_session_id),
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
  return session;
}

export default function ProviderLobbyPage() {
  const router = useRouter();
  const { address, status: accountStatus } = useAccount();
  const chainId = useChainId();
  const wagmiConfig = useConfig();
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
  const [resolutionNow, setResolutionNow] = useState(() => Date.now());
  const [resolvingSessionId, setResolvingSessionId] = useState<string | null>(null);
  const sessionEndNotifications = useSessionEndRequestNotifications({
    walletAddress: therapistWallet,
    enabled: isAuthorized,
  });
  const shownDeadlineOutcomeKeyRef = useRef<string | null>(null);
  const deadlineOutcomeModalCopy = deadlineOutcomeModal
    ? getTerminalSessionOutcome(deadlineOutcomeModal.status, true)
    : null;

  const readProviderChainSession = async (onchainSessionId: string) => {
    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      return null;
    }

    return normalizeMindPassEscrowSession(
      (await readContract(wagmiConfig, {
        address: contractAddress,
        abi: MINDPASS_ESCROW_ABI,
        functionName: "sessions",
        args: [BigInt(onchainSessionId)],
        chainId: MINDPASS_ESCROW_CHAIN_ID,
      })) as readonly unknown[],
    );
  };

  const selfHealRequestedSession = async (
    session: RequestedSession,
    source: "provider-lobby",
    txHash?: string,
  ) => {
    if (!supabase || session.status !== "requested" || !session.onchainSessionId) {
      return session;
    }

    logAcceptMirrorRecheck("requested_card_chain_recheck_started", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: null,
      txHash: txHash ?? null,
      source,
      recoveryApplied: false,
    });

    const chainSession = await readProviderChainSession(session.onchainSessionId);
    logAcceptMirrorRecheck("requested_card_chain_recheck_result", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: chainSession?.status ?? null,
      txHash: txHash ?? null,
      source,
      recoveryApplied: false,
    });

    if (
      !chainSession ||
      chainSession.status !== MINDPASS_ESCROW_STATUS.AcceptedAwaitingPayment
    ) {
      return session;
    }

    logAcceptMirrorRecheck("route_session_status_mismatch", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: chainSession.status,
      txHash: txHash ?? null,
      source,
      recoveryApplied: false,
    });

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      return session;
    }

    logAcceptMirrorRecheck("accept_receipt_recovery_from_chain", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: chainSession.status,
      txHash: txHash ?? null,
      source,
      recoveryApplied: true,
    });

    const { data, error } = await supabase
      .from("sessions")
      .update(
        buildBookingAcceptedPatch({
          acceptedAt: chainSession.providerAcceptedAt,
          paymentDueAt: chainSession.paymentDueAt,
          contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
          txHash: txHash ?? null,
        }),
      )
      .eq("id", session.id)
      .eq("onchain_session_id", session.onchainSessionId)
      .select(PROVIDER_REQUEST_SELECT)
      .maybeSingle();

    if (error || !data) {
      return session;
    }

    logAcceptMirrorRecheck("accept_receipt_recovery_supabase_updated", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: chainSession.status,
      txHash: txHash ?? null,
      source,
      recoveryApplied: true,
    });
    logAcceptMirrorRecheck("requested_row_self_healed", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: chainSession.status,
      txHash: txHash ?? null,
      source,
      recoveryApplied: true,
    });

    return normalizeRequestedSession(data as Record<string, unknown>);
  };

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
          const caughtUpSession = await applyProviderSessionCatchUp(normalizedSession);
          return caughtUpSession && caughtUpSession.status === "requested"
            ? selfHealRequestedSession(caughtUpSession, "provider-lobby")
            : caughtUpSession;
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
          setResolutionNow(Date.now());
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

  setRequestActionId(session.id);
  setErrorMessage("");

  try {
    if (!address || accountStatus !== "connected") {
      setErrorMessage("Connect the therapist wallet before reviewing requests.");
      setRequestActionId(null);
      return;
    }

    if (address.toLowerCase() !== therapistWallet.toLowerCase()) {
      setErrorMessage("Connect the therapist wallet for this provider profile.");
      setRequestActionId(null);
      return;
    }

    if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
      setErrorMessage("Switch to Sepolia before reviewing requests.");
      setRequestActionId(null);
      return;
    }

    if (!session.onchainSessionId) {
      setErrorMessage("This booking is missing an on-chain session id.");
      setRequestActionId(null);
      return;
    }

    const chainSessionBeforeAction = await readProviderChainSession(
      session.onchainSessionId,
    );
    logAcceptMirrorRecheck(
      nextStatus === "accepted"
        ? "pre_accept_chain_recheck_result"
        : "pre_reject_chain_recheck_result",
      {
        sessionId: session.id,
        onchainSessionId: session.onchainSessionId,
        dbStatus: session.status,
        chainStatus: chainSessionBeforeAction?.status ?? null,
        txHash: null,
        source: "provider-lobby",
        recoveryApplied: false,
      },
    );

    if (
      chainSessionBeforeAction &&
      chainSessionBeforeAction.status !== MINDPASS_ESCROW_STATUS.Requested
    ) {
      const recoveredSession = await selfHealRequestedSession(
        session,
        "provider-lobby",
      );
      setRequestedSessions((current) =>
        current
          .map((currentSession) =>
            currentSession.id === session.id ? recoveredSession : currentSession,
          )
          .filter((currentSession) => currentSession.status === "requested"),
      );
      setErrorMessage(
        "This request has already moved forward on-chain. Refreshing session state.",
      );
      setRequestActionId(null);
      setSessionRefreshNonce((current) => current + 1);
      return;
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      setErrorMessage("The MindPass escrow contract is not configured in this app.");
      setRequestActionId(null);
      return;
    }

    const preparedRequest =
      nextStatus === "accepted"
        ? prepareAcceptBooking({
            address: contractAddress,
            sessionId: BigInt(session.onchainSessionId),
          })
        : prepareRejectBooking({
            address: contractAddress,
            sessionId: BigInt(session.onchainSessionId),
          });
    const onchainSessionIdValue = BigInt(session.onchainSessionId);

    logEscrowDebug("submitting provider lobby decision", {
      source: "provider-lobby",
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      functionName: preparedRequest.functionName,
    });

    const { request: simulatedRequest } = await simulateContract(wagmiConfig, {
      address: preparedRequest.address,
      abi: preparedRequest.abi,
      functionName: preparedRequest.functionName,
      args: preparedRequest.args,
      chainId: preparedRequest.chainId,
      account: address,
    });

    const hash = await writeContract(wagmiConfig, {
      ...simulatedRequest,
      address: preparedRequest.address,
      abi: preparedRequest.abi,
      functionName: preparedRequest.functionName,
      args: preparedRequest.args,
      chainId: preparedRequest.chainId,
    });
    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      hash,
    });
    logReceiptDecode({
      context: "provider lobby booking decision receipt decoded",
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs,
    });

    const recoverAcceptedPatchFromChain = async () => {
      logAcceptMirrorRecheck("accept_receipt_recovery_started", {
        sessionId: session.id,
        onchainSessionId: session.onchainSessionId,
        dbStatus: session.status,
        chainStatus: null,
        txHash: receipt.transactionHash,
        source: "provider-lobby",
        recoveryApplied: false,
      });
      const chainSession = normalizeMindPassEscrowSession(
        (await readContract(wagmiConfig, {
          address: contractAddress,
          abi: MINDPASS_ESCROW_ABI,
          functionName: "sessions",
          args: [onchainSessionIdValue],
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        })) as readonly unknown[],
      );

      if (chainSession.status !== MINDPASS_ESCROW_STATUS.AcceptedAwaitingPayment) {
        return null;
      }

      return buildBookingAcceptedPatch({
        acceptedAt: chainSession.providerAcceptedAt,
        paymentDueAt: chainSession.paymentDueAt,
        contractAddress,
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      });
    };

    const acceptedPatch =
      nextStatus === "accepted"
        ? await (async () => {
            const event = findMindPassEscrowEvent(receipt.logs, "BookingAccepted");

            if (event) {
              return buildBookingAcceptedPatch({
                acceptedAt: event.args.providerAcceptedAt,
                paymentDueAt: event.args.paymentDueAt,
                contractAddress,
                chainId: MINDPASS_ESCROW_CHAIN_ID,
                txHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
              });
            }

            return recoverAcceptedPatchFromChain();
          })()
        : null;

    const updatePayload =
      acceptedPatch ??
      buildBookingRejectedPatch({
        contractAddress,
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      });

    let data: Record<string, unknown> | null = null;

    if (nextStatus === "accepted") {
      const initialResult = await supabase
        .from("sessions")
        .update(updatePayload)
        .eq("id", session.id)
        .eq("onchain_session_id", session.onchainSessionId)
        .eq("status", "requested")
        .select(PROVIDER_REQUEST_SELECT)
        .maybeSingle();

      if (initialResult.error || !initialResult.data) {
        const recoveredPatch = acceptedPatch ?? (await recoverAcceptedPatchFromChain());
        const fallbackResult = await supabase
          .from("sessions")
          .update(recoveredPatch ?? updatePayload)
          .eq("id", session.id)
          .eq("onchain_session_id", session.onchainSessionId)
          .select(PROVIDER_REQUEST_SELECT)
          .maybeSingle();

        if (fallbackResult.error || !fallbackResult.data) {
          logMirrorSyncError("provider lobby mirror sync failed", {
            sessionId: session.id,
            onchainSessionId: session.onchainSessionId,
            txHash: receipt.transactionHash,
            message:
              initialResult.error?.message ??
              fallbackResult.error?.message ??
              "Accept mirror fallback matched no row.",
          });
          setErrorMessage(
            "The on-chain request decision succeeded, but the session record could not be synced. Please refresh.",
          );
          setRequestActionId(null);
          return;
        }

        data = fallbackResult.data as Record<string, unknown>;
      } else {
        data = initialResult.data as Record<string, unknown>;
      }
    } else {
      const { data: rejectData, error } = await supabase
        .from("sessions")
        .update(updatePayload)
        .eq("id", session.id)
        .eq("onchain_session_id", session.onchainSessionId)
        .eq("status", "requested")
        .select(PROVIDER_REQUEST_SELECT)
        .maybeSingle();

      if (error) {
        logMirrorSyncError("provider lobby mirror sync failed", {
          sessionId: session.id,
          onchainSessionId: session.onchainSessionId,
          txHash: receipt.transactionHash,
          message: error.message,
        });
        setErrorMessage(
          "The on-chain request decision succeeded, but the session record could not be synced. Please refresh.",
        );
        setRequestActionId(null);
        return;
      }

      if (!rejectData) {
        setErrorMessage("This request changed state. Refreshing the latest queue.");
        setActiveRequestSession((current) =>
          current?.id === session.id ? null : current,
        );
        setRequestActionId(null);
        setSessionRefreshNonce((current) => current + 1);
        return;
      }

      data = rejectData as Record<string, unknown>;
    }

    logMirrorSync("provider lobby mirror sync complete", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      txHash: receipt.transactionHash,
      status: nextStatus,
    });
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
  } catch (error) {
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Unable to update this request right now.",
    );
    setRequestActionId(null);
  }
};

const handleResolveSession = async (session: RequestedSession) => {
  if (!supabase || resolvingSessionId) {
    return;
  }

  const client = supabase;
  const resolutionKind = getEscrowResolutionKind(session, Date.now());
  if (!resolutionKind) {
    setErrorMessage("This session is not ready for on-chain resolution.");
    return;
  }

  setResolvingSessionId(session.id);
  setErrorMessage("");

  try {
    if (!address || accountStatus !== "connected") {
      setErrorMessage("Connect the therapist wallet before resolving session outcomes.");
      return;
    }

    if (address.toLowerCase() !== therapistWallet.toLowerCase()) {
      setErrorMessage("Connect the therapist wallet for this provider profile.");
      return;
    }

    if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
      setErrorMessage("Wrong chain. Switch to Sepolia before resolving this escrow outcome.");
      return;
    }

    if (!session.onchainSessionId) {
      setErrorMessage("This booking is missing an on-chain session id.");
      return;
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      setErrorMessage("The MindPass escrow contract is not configured in this app.");
      return;
    }

    const onchainSessionId = BigInt(session.onchainSessionId);

    const syncResolvedSession = async (options: {
      chainSession?: ReturnType<typeof normalizeMindPassEscrowSession>;
      resolutionEvent?: EscrowResolutionEventInput | null;
      resolutionTxHash?: string | null;
      blockNumber?: bigint | null;
      alreadyResolved?: boolean;
    }) => {
      const chainSession =
        options.chainSession ??
        normalizeMindPassEscrowSession(
          (await readContract(wagmiConfig, {
            address: contractAddress,
            abi: MINDPASS_ESCROW_ABI,
            functionName: "sessions",
            args: [onchainSessionId],
            chainId: MINDPASS_ESCROW_CHAIN_ID,
          })) as readonly unknown[],
        );

      const updatePatch = options.resolutionEvent
        ? buildResolutionPatchFromEvent({
            resolutionEvent: options.resolutionEvent,
            contractAddress,
            resolutionTxHash: options.resolutionTxHash,
            blockNumber: options.blockNumber,
          })
        : buildResolutionPatchFromChainSession({
            chainSession,
            contractAddress,
            resolutionTxHash: options.resolutionTxHash,
            blockNumber: options.blockNumber,
          });

      if (!updatePatch) {
        return;
      }

      const { error } = await client
        .from("sessions")
        .update(compactSessionSyncPatch(updatePatch))
        .eq("id", session.id)
        .eq("onchain_session_id", session.onchainSessionId);

      if (error) {
        logMirrorSyncError("provider lobby overdue resolution mirror sync failed", {
          sessionId: session.id,
          onchainSessionId: session.onchainSessionId,
          txHash: options.resolutionTxHash ?? null,
          message: error.message,
        });
        setErrorMessage(
          options.resolutionTxHash
            ? "Mirror sync failed after successful on-chain resolution. Please refresh."
            : "This session is already resolved on-chain, but the mirror sync failed. Please refresh.",
        );
        return;
      }

      logMirrorSync("provider lobby overdue resolution mirror sync complete", {
        sessionId: session.id,
        onchainSessionId: session.onchainSessionId,
        txHash: options.resolutionTxHash ?? null,
        status: chainSession.status,
        alreadyResolved: options.alreadyResolved ?? false,
      });

      setRequestedSessions((current) =>
        current.filter((currentSession) => currentSession.id !== session.id),
      );
      setActiveRequestSession((current) =>
        current?.id === session.id ? null : current,
      );
      setSessionRefreshNonce((current) => current + 1);
    };

    const syncFundedSession = async (options: {
      chainSession?: ReturnType<typeof normalizeMindPassEscrowSession>;
      txHash?: string | null;
      blockNumber?: bigint | null;
      alreadyFunded?: boolean;
    }) => {
      const chainSession =
        options.chainSession ??
        normalizeMindPassEscrowSession(
          (await readContract(wagmiConfig, {
            address: contractAddress,
            abi: MINDPASS_ESCROW_ABI,
            functionName: "sessions",
            args: [onchainSessionId],
            chainId: MINDPASS_ESCROW_CHAIN_ID,
          })) as readonly unknown[],
        );

      const updatePatch = buildSessionFundedPatch({
        walletFundedWei: chainSession.walletFundedWei,
        subsidyFundedWei: chainSession.subsidyFundedWei,
        fundedAt: chainSession.fundedAt,
        noShowDeadlineAt: chainSession.noShowDeadlineAt,
        contractAddress,
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        txHash: options.txHash,
        blockNumber: options.blockNumber,
      });

      const { data, error } = await client
        .from("sessions")
        .update(compactSessionSyncPatch(updatePatch))
        .eq("id", session.id)
        .eq("onchain_session_id", session.onchainSessionId)
        .select(PROVIDER_REQUEST_SELECT)
        .maybeSingle();

      if (error) {
        logMirrorSyncError("provider lobby funded timeout catch-up mirror sync failed", {
          sessionId: session.id,
          onchainSessionId: session.onchainSessionId,
          txHash: options.txHash ?? null,
          message: error.message,
        });
        setErrorMessage(
          options.txHash
            ? "Mirror sync failed after detecting that this session is already funded on-chain. Please refresh."
            : "This session is already funded on-chain, but the mirror sync failed. Please refresh.",
        );
        return;
      }

      if (data) {
        const nextSession = normalizeRequestedSession(data as Record<string, unknown>);
        logMirrorSync("provider lobby funded timeout catch-up mirror sync complete", {
          sessionId: nextSession.id,
          onchainSessionId: nextSession.onchainSessionId,
          txHash: options.txHash ?? null,
          status: nextSession.status,
          alreadyFunded: options.alreadyFunded ?? false,
        });
        setRequestedSessions((current) =>
          upsertRequestedSession(current, nextSession),
        );
      }

      setActiveRequestSession((current) =>
        current?.id === session.id ? null : current,
      );
      setSessionRefreshNonce((current) => current + 1);
    };

    const chainSessionBefore = normalizeMindPassEscrowSession(
      (await readContract(wagmiConfig, {
        address: contractAddress,
        abi: MINDPASS_ESCROW_ABI,
        functionName: "sessions",
        args: [onchainSessionId],
        chainId: MINDPASS_ESCROW_CHAIN_ID,
      })) as readonly unknown[],
    );

    logPaymentWindow180("payment_window_chain_recheck", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      status: session.status,
      paymentDueAt: session.paymentDueAt,
      now: new Date().toISOString(),
      remainingSeconds: getPaymentWindowRemainingSeconds(session.paymentDueAt),
      source: "provider-lobby",
      trigger: "resolve_preflight",
    });

    if (isTerminalEscrowResolutionStatus(chainSessionBefore.status)) {
      await syncResolvedSession({
        chainSession: chainSessionBefore,
        alreadyResolved: true,
      });
      return;
    }

    if (chainSessionBefore.status === MINDPASS_ESCROW_STATUS.Funded) {
      await syncFundedSession({
        chainSession: chainSessionBefore,
        alreadyFunded: true,
      });
      return;
    }

    const request =
      resolutionKind === "payment_timeout"
        ? prepareResolvePaymentTimeout({
            address: contractAddress,
            sessionId: onchainSessionId,
          })
        : prepareResolveNoShow({
            address: contractAddress,
            sessionId: onchainSessionId,
          });

    logEscrowDebug("submitting provider lobby overdue resolution", {
      source: "provider-lobby",
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      functionName: request.functionName,
    });

    let hash: `0x${string}`;
    try {
      const { request: simulatedRequest } = await simulateContract(wagmiConfig, {
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        chainId: request.chainId,
        account: address,
      });
      hash = await writeContract(wagmiConfig, {
        ...simulatedRequest,
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        chainId: request.chainId,
      });
    } catch (error) {
      const chainSessionAfterFailure = normalizeMindPassEscrowSession(
        (await readContract(wagmiConfig, {
          address: contractAddress,
          abi: MINDPASS_ESCROW_ABI,
          functionName: "sessions",
          args: [onchainSessionId],
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        })) as readonly unknown[],
      );

      if (isTerminalEscrowResolutionStatus(chainSessionAfterFailure.status)) {
        await syncResolvedSession({
          chainSession: chainSessionAfterFailure,
          alreadyResolved: true,
        });
        return;
      }

      if (chainSessionAfterFailure.status === MINDPASS_ESCROW_STATUS.Funded) {
        await syncFundedSession({
          chainSession: chainSessionAfterFailure,
          alreadyFunded: true,
        });
        return;
      }

      throw error;
    }

    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      hash,
    });
    logReceiptDecode({
      context: "provider lobby overdue resolution receipt decoded",
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs,
    });

    const resolutionEvent =
      resolutionKind === "payment_timeout"
        ? findMindPassEscrowEvent(receipt.logs, "PaymentTimedOut")
        : findMindPassEscrowEvent(receipt.logs, "PatientNoShowResolved") ??
          findMindPassEscrowEvent(receipt.logs, "TherapistNoShowResolved");

    if (!resolutionEvent) {
      throw new Error(
        resolutionKind === "payment_timeout"
          ? "Timeout resolution transaction succeeded, but the PaymentTimedOut event was missing."
          : "No-show resolution transaction succeeded, but the no-show event was missing.",
      );
    }

    await syncResolvedSession({
      resolutionEvent: resolutionEvent as EscrowResolutionEventInput | null,
      resolutionTxHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : "";
    if (
      resolutionKind === "payment_timeout" &&
      message.includes("paymentwindowstillopen")
    ) {
      logPaymentWindow180("payment_window_still_open_recovered", {
        sessionId: session.id,
        onchainSessionId: session.onchainSessionId,
        status: session.status,
        paymentDueAt: session.paymentDueAt,
        now: new Date().toISOString(),
        remainingSeconds: getPaymentWindowRemainingSeconds(session.paymentDueAt),
        source: "provider-lobby",
        trigger: "resolve_error_recovery",
      });
      setSessionRefreshNonce((current) => current + 1);
      setErrorMessage(
        "The payment window is still open on-chain. Continue waiting for patient funding confirmation or for the full payment window to pass.",
      );
      return;
    }
    if (
      message.includes("user rejected") ||
      message.includes("user denied") ||
      message.includes("rejected the request") ||
      message.includes("4001")
    ) {
      setErrorMessage(
        resolutionKind === "payment_timeout"
          ? "Wallet signing was cancelled. Payment timeout is still unresolved on-chain."
          : "Wallet signing was cancelled. No-show is still unresolved on-chain.",
      );
    } else {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to resolve this escrow outcome right now.",
      );
    }
  } finally {
    setResolvingSessionId(null);
  }
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
                    {(() => {
                      const resolutionKind = getEscrowResolutionKind(
                        session,
                        resolutionNow,
                      );
                      const isResolvingSession = resolvingSessionId === session.id;

                      return (
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
                            {resolutionKind === "payment_timeout"
                              ? "Payment window expired. Resolve the timeout on-chain."
                              : "Patient payment confirmation is still pending."}
                          </p>
                        ) : null}
                        {session.status === "funded" ? (
                          <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
                            {resolutionKind === "no_show"
                              ? "No-show deadline passed. Resolve the outcome on-chain."
                              : "Session funded. Waiting for both participants to enter."}
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
                              ? resolutionKind === "payment_timeout"
                                ? "Payment deadline passed. Resolve timeout on-chain."
                                : "Accepted. Waiting for patient payment."
                              : session.status === "funded"
                                ? resolutionKind === "no_show"
                                  ? "No-show deadline passed. Resolve the outcome on-chain."
                                  : "Funding confirmed. Ready for chat entry."
                                : "Session is currently in progress."}
                          </div>
                          {(resolutionKind === "payment_timeout" ||
                            resolutionKind === "no_show") ? (
                            <button
                              type="button"
                              disabled={isResolvingSession}
                              onClick={() => void handleResolveSession(session)}
                              className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isResolvingSession
                                ? "Resolving..."
                                : resolutionKind === "payment_timeout"
                                  ? "Resolve Timeout"
                                  : "Resolve No-Show"}
                            </button>
                          ) : isFundedOrLiveSessionStatus(session.status) && (
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
                      );
                    })()}
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
