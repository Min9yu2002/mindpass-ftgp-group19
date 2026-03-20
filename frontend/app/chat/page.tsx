"use client";

import { Suspense, useEffect, useEffectEvent, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import SessionOutcomeNoticeModal from "../../components/SessionOutcomeNoticeModal";
import SessionCompletionModal from "../../components/SessionCompletionModal";
import SupportRequestModal from "../../components/SupportRequestModal";
import VoiceCallControls from "../../components/VoiceCallControls";
import {
  NORMAL_THERAPIST_PAYOUT_ETH,
  PLATFORM_FEE_ETH,
} from "../../lib/booking";
import { usePageSessionGuard } from "../../lib/session-guard";
import {
  getTerminalSessionOutcome,
  getTerminalSessionOutcomeOrNull,
  isDeadlineOutcomeStatus,
  type DeadlineOutcomeStatus,
  type TerminalOutcomeCopy,
} from "../../lib/session-outcome";
import {
  acknowledgeDeadlineOutcome,
  buildDeadlineOutcomeAckKey,
  isDeadlineOutcomeAcknowledged,
} from "../../lib/session-outcome-ack";
import {
  canAutoStartSession,
  canRecordArrivalInteraction,
  canCompleteSession,
  getNoShowCatchUpSettlement,
  shouldCatchPaymentTimeout,
} from "../../lib/session-transition-guards";
import {
  isAcceptedAwaitingPaymentStatus,
  isChatAllowedStatus,
  isFundedOrLiveSessionStatus,
  normalizeSessionStatus,
  type SessionWorkflowStatus,
} from "../../lib/session-status";
import { supabase } from "../../lib/supabase";
import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../../lib/therapist-display";
import { markSessionEndRequestSeen } from "../../lib/session-end-request-notifications";

type Message = {
  id: string;
  role: "system" | "therapist" | "patient";
  content: string;
  time: string;
  createdAt: string | null;
};

type TherapistProfile = {
  name: string;
  specialty: string;
  walletAddress: string;
};

type VoiceCallStatus = "idle" | "connected";
type SessionParticipantRole = "patient" | "therapist";
type SessionEndRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";
type CompletionModalMode = "request" | "respond";
type OutcomeModalContext = {
  sessionId: string;
  status: DeadlineOutcomeStatus;
  ackKey: string;
};

type SessionRecord = {
  id: string;
  status: SessionWorkflowStatus;
  patientWallet: string;
  therapistWallet: string;
  updatedAt: string | null;
  patientJoinedAt: string | null;
  therapistJoinedAt: string | null;
  sessionStartedAt: string | null;
  paymentDueAt: string | null;
  noShowDeadlineAt: string | null;
  settlementStatus: string;
};

type SessionEndRequestRecord = {
  id: string;
  sessionId: string;
  requestedByWallet: string;
  requestedByRole: SessionParticipantRole;
  targetWallet: string;
  targetRole: SessionParticipantRole;
  status: SessionEndRequestStatus;
  receiverSeenAt: string | null;
  modalPresentedAt: string | null;
  notificationSentAt: string | null;
  targetRespondedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  targetResponseText: string | null;
  requesterNote: string | null;
  createdAt: string | null;
};

const formatTime = (value?: string) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const CHAT_SESSION_DURATION_SECONDS = 50 * 60;

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
};

function getSessionSecondsLeft(
  session: SessionRecord | null,
  now = Date.now(),
) {
  if (!session?.sessionStartedAt) {
    return CHAT_SESSION_DURATION_SECONDS;
  }

  const startedAt = new Date(session.sessionStartedAt).getTime();
  if (Number.isNaN(startedAt)) {
    return CHAT_SESSION_DURATION_SECONDS;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return Math.max(0, CHAT_SESSION_DURATION_SECONDS - elapsedSeconds);
}

const formatWalletLabel = (wallet: string) =>
  wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Unknown wallet";

function normalizeSessionRecord(
  row: Record<string, unknown>,
  fallbackId = "",
): SessionRecord {
  return {
    id: String(row.id ?? fallbackId),
    status: normalizeSessionStatus(row.status),
    patientWallet: String(row.patient_wallet ?? "").toLowerCase(),
    therapistWallet: String(row.therapist_wallet ?? "").toLowerCase(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    patientJoinedAt:
      typeof row.patient_joined_at === "string" ? row.patient_joined_at : null,
    therapistJoinedAt:
      typeof row.therapist_joined_at === "string" ? row.therapist_joined_at : null,
    sessionStartedAt:
      typeof row.session_started_at === "string" ? row.session_started_at : null,
    paymentDueAt:
      typeof row.payment_due_at === "string" ? row.payment_due_at : null,
    noShowDeadlineAt:
      typeof row.no_show_deadline_at === "string" ? row.no_show_deadline_at : null,
    settlementStatus: String(row.settlement_status ?? ""),
  };
}

function normalizeSessionParticipantRole(
  value: unknown,
  fallback: SessionParticipantRole = "patient",
): SessionParticipantRole {
  if (value === "patient" || value === "therapist") {
    return value;
  }

  return fallback;
}

function normalizeSessionEndRequestStatus(
  value: unknown,
): SessionEndRequestStatus {
  switch (value) {
    case "accepted":
    case "declined":
    case "cancelled":
    case "expired":
      return value;
    default:
      return "pending";
  }
}

function normalizeSessionEndRequestRow(
  row: Record<string, unknown>,
): SessionEndRequestRecord {
  return {
    id: String(row.id ?? ""),
    sessionId: String(row.session_id ?? ""),
    requestedByWallet: String(row.requested_by_wallet ?? "").toLowerCase(),
    requestedByRole: normalizeSessionParticipantRole(
      row.requested_by_role,
      "patient",
    ),
    targetWallet: String(row.target_wallet ?? "").toLowerCase(),
    targetRole: normalizeSessionParticipantRole(row.target_role, "therapist"),
    status: normalizeSessionEndRequestStatus(row.status),
    receiverSeenAt:
      typeof row.receiver_seen_at === "string" ? row.receiver_seen_at : null,
    modalPresentedAt:
      typeof row.modal_presented_at === "string" ? row.modal_presented_at : null,
    notificationSentAt:
      typeof row.notification_sent_at === "string" ? row.notification_sent_at : null,
    targetRespondedAt:
      typeof row.target_responded_at === "string" ? row.target_responded_at : null,
    acceptedAt: typeof row.accepted_at === "string" ? row.accepted_at : null,
    declinedAt: typeof row.declined_at === "string" ? row.declined_at : null,
    targetResponseText:
      typeof row.target_response_text === "string" ? row.target_response_text : null,
    requesterNote:
      typeof row.requester_note === "string" ? row.requester_note : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

function getParticipantWalletForRole(
  session: SessionRecord | null,
  role: SessionParticipantRole,
  fallbackWallet = "",
) {
  if (session) {
    return (role === "therapist" ? session.therapistWallet : session.patientWallet).toLowerCase();
  }

  return fallbackWallet.toLowerCase();
}

function isSessionEndRequestTargetingParticipant(
  request: SessionEndRequestRecord | null,
  role: SessionParticipantRole,
  wallet: string,
) {
  return Boolean(
    request &&
      wallet &&
      request.targetRole === role &&
      request.targetWallet === wallet,
  );
}

function isSessionEndRequestRequestedByParticipant(
  request: SessionEndRequestRecord | null,
  role: SessionParticipantRole,
  wallet: string,
) {
  return Boolean(
    request &&
      wallet &&
      request.requestedByRole === role &&
      request.requestedByWallet === wallet,
  );
}

function normalizeMessageRole(value: unknown): Message["role"] {
  if (value === "patient" || value === "therapist" || value === "system") {
    return value;
  }

  return "system";
}

function isRenderableChatMessageRow(row: Record<string, unknown>) {
  const messageType = String(row.message_type ?? "text");

  return (
    row.is_deleted !== true &&
    messageType !== "attachment" &&
    typeof row.content === "string"
  );
}

function mapChatMessageRow(row: Record<string, unknown>): Message {
  const createdAt =
    typeof row.created_at === "string" ? row.created_at : null;

  return {
    id: String(row.id ?? ""),
    role: normalizeMessageRole(row.sender_role),
    content: typeof row.content === "string" ? row.content : "",
    time: formatTime(createdAt ?? undefined),
    createdAt,
  };
}

function upsertMessageInList(current: Message[], nextMessage: Message) {
  const nextMessages = [...current];
  const existingIndex = nextMessages.findIndex(
    (message) => message.id === nextMessage.id,
  );

  if (existingIndex === -1) {
    nextMessages.push(nextMessage);
    return nextMessages;
  }

  nextMessages[existingIndex] = nextMessage;
  return nextMessages;
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const merged = new Map(incoming.map((message) => [message.id, message]));

  current.forEach((message) => {
    merged.set(message.id, message);
  });

  return Array.from(merged.values());
}

function getMessageCreatedAtValue(message: Message) {
  if (!message.createdAt) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = new Date(message.createdAt).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function sortMessagesChronologically(messages: Message[]) {
  return [...messages]
    .map((message, index) => ({
      message,
      index,
      createdAtValue: getMessageCreatedAtValue(message),
    }))
    .sort((left, right) => {
      if (left.createdAtValue === right.createdAtValue) {
        return left.index - right.index;
      }

      return left.createdAtValue - right.createdAtValue;
    })
    .map((entry) => entry.message);
}

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M8.5 12.5 14.86 6.14a3 3 0 1 1 4.24 4.24l-8.49 8.48a5 5 0 1 1-7.07-7.07l8.13-8.13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M4 11.5 20 4l-4.5 16-3.5-6-8-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTherapist = searchParams.get("role") === "therapist";
  const { address, status: accountStatus } = useAccount();
  const sessionGuard = usePageSessionGuard({
    requiredRole: isTherapist ? "therapist" : "patient",
    address,
    wagmiStatus: accountStatus,
  });
  const isAuthorized = sessionGuard.authResolutionState === "authorized";
  const currentWallet = sessionGuard.resolvedWalletAddress;
  const requiredRole = isTherapist ? "therapist" : "patient";
  const storedRoleWallet = requiredRole === "therapist"
    ? sessionGuard.storedSession.therapistWallet
    : sessionGuard.storedSession.patientWallet;
  const isRestoringChatSession =
    !currentWallet &&
    sessionGuard.authResolutionState !== "blocked" &&
    sessionGuard.storedSession.activeSession === requiredRole &&
    Boolean(storedRoleWallet);
  const effectiveWallet = currentWallet || (isRestoringChatSession ? storedRoleWallet : "");
  const canResolveChatSession = isAuthorized || isRestoringChatSession;
  const therapistAddress = searchParams.get("address")?.toLowerCase() ?? "";
  const sessionIdParam = searchParams.get("sessionId") ?? "";
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [completionModalMode, setCompletionModalMode] =
    useState<CompletionModalMode | null>(null);
  const [isCompletionSubmitting, setIsCompletionSubmitting] = useState(false);
  const [completionModalError, setCompletionModalError] = useState("");
  const [sessionEndRequest, setSessionEndRequest] =
    useState<SessionEndRequestRecord | null>(null);
  const [sessionEndRequestError, setSessionEndRequestError] = useState("");
  const [endRequestResponseText, setEndRequestResponseText] = useState("");
  const [therapistProfile, setTherapistProfile] = useState<TherapistProfile>({
    name: "Dr. Eliana Park",
    specialty: "Anxiety and burnout recovery",
    walletAddress: therapistAddress,
  });
  const [isLoadingTherapist, setIsLoadingTherapist] = useState(false);
  const [therapistError, setTherapistError] = useState("");
  const [voiceCallStatus, setVoiceCallStatus] =
    useState<VoiceCallStatus>("idle");
  const [activeSessionId, setActiveSessionId] = useState(sessionIdParam);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [callError, setCallError] = useState("");
  const [chatMessagesError, setChatMessagesError] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageRefreshNonce, setMessageRefreshNonce] = useState(0);
  const [sessionEndRequestRefreshNonce, setSessionEndRequestRefreshNonce] =
    useState(0);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState("");
  const [terminalSessionOutcome, setTerminalSessionOutcome] =
    useState<TerminalOutcomeCopy | null>(null);
  const [deadlineOutcomeModal, setDeadlineOutcomeModal] =
    useState<OutcomeModalContext | null>(null);
  const [supportRequestContext, setSupportRequestContext] =
    useState<OutcomeModalContext | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const hasShownWarningRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const promptedEndRequestIdRef = useRef<string | null>(null);
  const finalizedEndRequestIdsRef = useRef(new Set<string>());
  const shownDeadlineOutcomeKeyRef = useRef<string | null>(null);
  const normalizedCurrentWallet = effectiveWallet.toLowerCase();
  const currentParticipantRole: SessionParticipantRole = isTherapist
    ? "therapist"
    : "patient";
  const otherParticipantRole: SessionParticipantRole = isTherapist
    ? "patient"
    : "therapist";
  const currentParticipantWallet = getParticipantWalletForRole(
    sessionRecord,
    currentParticipantRole,
    normalizedCurrentWallet,
  );
  const pendingSessionEndRequest =
    sessionEndRequest?.status === "pending" ? sessionEndRequest : null;
  const isRequesterWaitingForSessionEnd = isSessionEndRequestRequestedByParticipant(
    pendingSessionEndRequest,
    currentParticipantRole,
    currentParticipantWallet,
  );
  const isTargetOfPendingSessionEndRequest = isSessionEndRequestTargetingParticipant(
    pendingSessionEndRequest,
    currentParticipantRole,
    currentParticipantWallet,
  );
  const isAcceptedSessionEndFinalizing = Boolean(
    sessionEndRequest?.status === "accepted" &&
      sessionRecord?.status === "in_session",
  );
  const showDeclinedSessionEndEvent = Boolean(
    sessionEndRequest?.status === "declined" &&
      sessionRecord?.status === "in_session",
  );
  const canRequestSessionEnd = Boolean(
    sessionRecord && canCompleteSession(sessionRecord),
  );
  const isEndSessionActionDisabled =
    !canRequestSessionEnd ||
    Boolean(pendingSessionEndRequest) ||
    isAcceptedSessionEndFinalizing;
  const declinedSessionEndSystemMessage: Message | null =
    showDeclinedSessionEndEvent && sessionEndRequest
      ? {
          id: `session-end-request-declined:${sessionEndRequest.id}`,
          role: "system",
          content:
            "The other participant declined the end-session request. The live session will remain open.",
          time: formatTime(
            sessionEndRequest.declinedAt ??
              sessionEndRequest.targetRespondedAt ??
              sessionEndRequest.createdAt ??
              undefined,
          ),
          createdAt:
            sessionEndRequest.declinedAt ??
            sessionEndRequest.targetRespondedAt ??
            sessionEndRequest.createdAt,
        }
      : null;
  const renderedMessages = sortMessagesChronologically(
    declinedSessionEndSystemMessage
      ? [...messages, declinedSessionEndSystemMessage]
      : messages,
  );
  const endSessionButtonClassName =
    "inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-[0_14px_32px_rgba(239,68,68,0.28)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-70";
  const secondsLeft = getSessionSecondsLeft(sessionRecord, countdownNow);
  const deadlineOutcomeModalCopy = deadlineOutcomeModal
    ? getTerminalSessionOutcome(deadlineOutcomeModal.status, isTherapist)
    : null;

  const presentDeadlineOutcomeModal = useEffectEvent((session: SessionRecord) => {
    if (!isDeadlineOutcomeStatus(session.status)) {
      return;
    }

    const ackKey = buildDeadlineOutcomeAckKey({
      viewerRole: isTherapist ? "therapist" : "patient",
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

  const presentPendingSessionEndRequest = useEffectEvent(
    (nextRequest: SessionEndRequestRecord) => {
      if (
        nextRequest.status !== "pending" ||
        !isSessionEndRequestTargetingParticipant(
          nextRequest,
          currentParticipantRole,
          currentParticipantWallet,
        )
      ) {
        return;
      }

      if (promptedEndRequestIdRef.current === nextRequest.id) {
        return;
      }

      promptedEndRequestIdRef.current = nextRequest.id;
      setCompletionModalError("");
      setEndRequestResponseText("");
      setCompletionModalMode("respond");
      void (async () => {
        try {
          const updatedRequest = await markSessionEndRequestSeen(
            nextRequest,
            {
              includeModalPresented: true,
              includeNotificationSent: true,
            },
          );

          setSessionEndRequest((current) =>
            current?.id === updatedRequest.id ? updatedRequest : current,
          );
        } catch (error) {
          console.error("Failed to mark session end request as seen in chat", error);
        }
      })();
    },
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (
      sessionGuard.authResolutionState === "pending" ||
      isRestoringChatSession
    ) {
      setAccessDeniedMessage("");
      return;
    }

    if (sessionGuard.authResolutionState === "authorized") {
      setAccessDeniedMessage("");
      return;
    }

    if (sessionGuard.authResolutionState === "blocked") {
      setAccessDeniedMessage(
        "This chat route is not available for the current active session.",
      );
      return;
    }

    if (!effectiveWallet) {
      setAccessDeniedMessage(
        "No active wallet session is available for this chat route.",
      );
    }
  }, [effectiveWallet, isRestoringChatSession, sessionGuard.authResolutionState]);

  useEffect(() => {
    let isCancelled = false;

    const fetchTherapistProfile = async () => {
      if (!canResolveChatSession || !therapistAddress || !supabase) {
        return;
      }

      setIsLoadingTherapist(true);
      setTherapistError("");

      const { data, error } = await supabase
        .from("therapists")
        .select("*")
        .ilike("wallet_address", therapistAddress)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setTherapistError(error.message);
        setIsLoadingTherapist(false);
        return;
      }

      if (data) {
        setTherapistProfile({
          name: getTherapistDisplayName(data),
          specialty: getTherapistDisplaySpecialty(data),
          walletAddress: data.wallet_address ?? therapistAddress,
        });
      }

      setIsLoadingTherapist(false);
    };

    fetchTherapistProfile();

    return () => {
      isCancelled = true;
    };
  }, [canResolveChatSession, therapistAddress]);

  useEffect(() => {
    setMessages([]);
    setChatMessagesError("");
    setIsLoadingMessages(false);
    setSessionEndRequest(null);
    setSessionEndRequestError("");
    setEndRequestResponseText("");
    setCompletionModalError("");
    setCompletionModalMode(null);
    setSessionEndRequestRefreshNonce(0);
    setDeadlineOutcomeModal(null);
    setSupportRequestContext(null);
    promptedEndRequestIdRef.current = null;
    finalizedEndRequestIdsRef.current.clear();
    shownDeadlineOutcomeKeyRef.current = null;
  }, [activeSessionId]);

  const clearRegisteredTimeouts = () => {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
  };

  const registerTimeout = (callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
    return timeoutId;
  };

  useEffect(() => {
    if (sessionRecord?.status !== "in_session" || !sessionRecord.sessionStartedAt) {
      setCountdownNow(Date.now());
      return () => {
        clearRegisteredTimeouts();
      };
    }

    setCountdownNow(Date.now());

    const intervalId = window.setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      clearRegisteredTimeouts();
    };
  }, [sessionRecord?.sessionStartedAt, sessionRecord?.status]);

  useEffect(() => {
    hasShownWarningRef.current = false;
  }, [activeSessionId, sessionRecord?.sessionStartedAt]);

  const stopLocalAudio = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  };

  const startLocalAudio = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      throw new Error("Audio devices are unavailable in this browser.");
    }

    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  };

  useEffect(() => {
    if (secondsLeft === 10 * 60 && !hasShownWarningRef.current) {
      hasShownWarningRef.current = true;
      registerTimeout(() => {
        setShowWarningModal(true);
      }, 0);
    }
  }, [secondsLeft]);

  useEffect(() => {
    return () => {
      stopLocalAudio();
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const resolveSession = async () => {
      if (!supabase || !effectiveWallet || !canResolveChatSession) {
        return;
      }

      const client = supabase;
      setCallError("");
      setAccessDeniedMessage("");

      const applyChatCatchUp = async (session: SessionRecord) => {
        if (shouldCatchPaymentTimeout(session)) {
          const { data, error } = await client
            .from("sessions")
            .update({
              status: "payment_timeout",
              payment_timeout_at: new Date().toISOString(),
              no_show_deadline_at: null,
              settlement_status: "cancelled",
            })
            .eq("id", session.id)
            .eq("status", "accepted_awaiting_payment")
            .select("*")
            .maybeSingle();

          if (error) {
            console.error("Failed to catch up payment timeout in chat", error);
            return session;
          }

          return data
            ? normalizeSessionRecord(data as Record<string, unknown>, session.id)
            : null;
        }

        const settlement = getNoShowCatchUpSettlement(session);
        if (settlement) {

          const { data, error } = await client
            .from("sessions")
            .update(settlement)
            .eq("id", session.id)
            .eq("status", "funded")
            .select("*")
            .maybeSingle();

          if (error) {
            console.error("Failed to catch up no-show settlement in chat", error);
            return session;
          }

          return data
            ? normalizeSessionRecord(data as Record<string, unknown>, session.id)
            : null;
        }

        return session;
      };

      const applyScopedOverdueFundedCatchUps = async () => {
        if (sessionIdParam) {
          return;
        }

        const overdueQuery = isTherapist
          ? client
              .from("sessions")
              .select("*")
              .ilike("therapist_wallet", effectiveWallet)
          : therapistAddress
            ? client
                .from("sessions")
                .select("*")
                .ilike("therapist_wallet", therapistAddress)
                .ilike("patient_wallet", effectiveWallet)
            : null;

        if (!overdueQuery) {
          return;
        }

        const { data, error } = await overdueQuery
          .eq("status", "funded")
          .is("session_started_at", null)
          .not("no_show_deadline_at", "is", null)
          .lte("no_show_deadline_at", new Date().toISOString())
          .order("no_show_deadline_at", { ascending: true });

        if (error) {
          console.error("Failed to load overdue funded sessions in chat", error);
          return;
        }

        for (const row of (data ?? []) as Record<string, unknown>[]) {
          await applyChatCatchUp(
            normalizeSessionRecord(
              row,
              String((row as Record<string, unknown>).id ?? ""),
            ),
          );
        }
      };

      const applyResolvedSession = async (row: Record<string, unknown> | null) => {
        if (!row) {
          setTerminalSessionOutcome(null);
          setAccessDeniedMessage("No active session was found for this wallet.");
          return;
        }

        const nextSession = await applyChatCatchUp(
          normalizeSessionRecord(row, sessionIdParam),
        );

        if (isCancelled) {
          return;
        }

        if (!nextSession) {
          setTerminalSessionOutcome(null);
          setAccessDeniedMessage("This session is no longer live.");
          return;
        }

        const normalizedCurrentWallet = effectiveWallet.toLowerCase();
        const isPatientParticipant =
          normalizedCurrentWallet === nextSession.patientWallet.toLowerCase();
        const isTherapistParticipant =
          normalizedCurrentWallet === nextSession.therapistWallet.toLowerCase();

        if ((isTherapist && !isTherapistParticipant) || (!isTherapist && !isPatientParticipant)) {
          setTerminalSessionOutcome(null);
          setAccessDeniedMessage(
            "Access denied. This wallet is not authorized for the current session.",
          );
          return;
        }

        const terminalOutcome = getTerminalSessionOutcomeOrNull(
          nextSession.status,
          isTherapist,
        );
        if (terminalOutcome) {
          stopLocalAudio();
          setVoiceCallStatus("idle");
          setSessionRecord(nextSession);
          presentDeadlineOutcomeModal(nextSession);
          setTerminalSessionOutcome(terminalOutcome);
          setAccessDeniedMessage("");
          return;
        }

        if (!isChatAllowedStatus(nextSession.status)) {
          setTerminalSessionOutcome(null);
          setAccessDeniedMessage(
            "This session is no longer available for live chat access.",
          );
          return;
        }

        setActiveSessionId(nextSession.id);
        setSessionRecord(nextSession);
        setTerminalSessionOutcome(null);
        setAccessDeniedMessage("");
        setVoiceCallStatus("idle");
      };

      if (sessionIdParam) {
        const { data, error } = await client
          .from("sessions")
          .select("*")
          .eq("id", sessionIdParam)
          .maybeSingle();

        if (isCancelled) {
          return;
        }

        if (error) {
          setCallError(error.message);
          return;
        }

        await applyResolvedSession(data as Record<string, unknown> | null);
        return;
      }

      await applyScopedOverdueFundedCatchUps();

      if (!therapistAddress) {
        return;
      }

      const query = isTherapist
        ? client
            .from("sessions")
            .select("*")
            .ilike("therapist_wallet", effectiveWallet)
            .in("status", ["accepted_awaiting_payment", "funded", "in_session"])
            .order("updated_at", { ascending: false })
            .limit(1)
        : client
            .from("sessions")
            .select("*")
            .ilike("therapist_wallet", therapistAddress)
            .ilike("patient_wallet", effectiveWallet)
            .in("status", ["accepted_awaiting_payment", "funded", "in_session"])
            .order("updated_at", { ascending: false })
            .limit(1);

      const { data, error } = await query.maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setCallError(error.message);
        return;
      }

      await applyResolvedSession(data as Record<string, unknown> | null);
    };

    resolveSession();

    return () => {
      isCancelled = true;
    };
  }, [
    canResolveChatSession,
    effectiveWallet,
    isTherapist,
    sessionIdParam,
    therapistAddress,
  ]);

  useEffect(() => {
    if (!supabase || !activeSessionId) {
      return;
    }

    const client = supabase;
    const channel = client.channel(`chat-session:${activeSessionId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${activeSessionId}`,
        },
        (payload) => {
          const next = normalizeSessionRecord(
            payload.new as Record<string, unknown>,
            activeSessionId,
          );
          setMessageRefreshNonce((current) => current + 1);
          setSessionRecord(next);
          const terminalOutcome = getTerminalSessionOutcomeOrNull(
            next.status,
            isTherapist,
          );
          if (terminalOutcome) {
            stopLocalAudio();
            setVoiceCallStatus("idle");
            resetCompletionModal();
            presentDeadlineOutcomeModal(next);
            setTerminalSessionOutcome(terminalOutcome);
            setAccessDeniedMessage("");
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [activeSessionId, isTherapist]);

  useEffect(() => {
    if (
      !supabase ||
      !activeSessionId ||
      !canResolveChatSession ||
      accessDeniedMessage ||
      terminalSessionOutcome
    ) {
      setSessionEndRequest(null);
      setSessionEndRequestError("");
      return;
    }

    let isCancelled = false;
    const client = supabase;

    const loadLatestSessionEndRequest = async () => {
      setSessionEndRequestError("");

      const { data, error } = await client
        .from("session_end_requests")
        .select("*")
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setSessionEndRequestError(error.message);
        return;
      }

      const nextRequest = data
        ? normalizeSessionEndRequestRow(data as Record<string, unknown>)
        : null;

      setSessionEndRequest(nextRequest);
    };

    void loadLatestSessionEndRequest();

    return () => {
      isCancelled = true;
    };
  }, [
    accessDeniedMessage,
    activeSessionId,
    canResolveChatSession,
    sessionEndRequestRefreshNonce,
    terminalSessionOutcome,
  ]);

  useEffect(() => {
    if (
      !supabase ||
      !activeSessionId ||
      !canResolveChatSession ||
      accessDeniedMessage ||
      terminalSessionOutcome
    ) {
      return;
    }

    const client = supabase;
    const channel = client.channel(`chat-session-end-requests:${activeSessionId}`);

    const refreshSessionEndRequests = () => {
      setSessionEndRequestRefreshNonce((current) => current + 1);
    };

    const syncRealtimeSessionEndRequest = (row: Record<string, unknown>) => {
      const nextRequest = normalizeSessionEndRequestRow(row);

      if (!nextRequest.id || nextRequest.sessionId !== activeSessionId) {
        return;
      }

      setSessionEndRequest(nextRequest);
      setSessionEndRequestError("");
      presentPendingSessionEndRequest(nextRequest);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_end_requests",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          syncRealtimeSessionEndRequest(payload.new as Record<string, unknown>);
          refreshSessionEndRequests();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_end_requests",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          syncRealtimeSessionEndRequest(payload.new as Record<string, unknown>);
          refreshSessionEndRequests();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "session_end_requests",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          const deletedId = String(
            (payload.old as Record<string, unknown> | null)?.id ?? "",
          );

          if (deletedId) {
            setSessionEndRequest((current) =>
              current?.id === deletedId ? null : current,
            );
          }

          refreshSessionEndRequests();
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [
    accessDeniedMessage,
    activeSessionId,
    canResolveChatSession,
    terminalSessionOutcome,
  ]);

  useEffect(() => {
    if (!pendingSessionEndRequest || !isTargetOfPendingSessionEndRequest) {
      promptedEndRequestIdRef.current = null;

      if (completionModalMode === "respond" && !isCompletionSubmitting) {
        setCompletionModalMode(null);
        setCompletionModalError("");
        setEndRequestResponseText("");
      }

      return;
    }

    presentPendingSessionEndRequest(pendingSessionEndRequest);
  }, [
    completionModalMode,
    isCompletionSubmitting,
    isTargetOfPendingSessionEndRequest,
    pendingSessionEndRequest,
  ]);

  useEffect(() => {
    if (
      !supabase ||
      !activeSessionId ||
      !canResolveChatSession ||
      accessDeniedMessage ||
      terminalSessionOutcome
    ) {
      setMessages([]);
      setChatMessagesError("");
      setIsLoadingMessages(false);
      return;
    }

    let isCancelled = false;
    const client = supabase;

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      setChatMessagesError("");

      const { data, error } = await client
        .from("chat_messages")
        .select("id, sender_role, message_type, content, is_deleted, created_at")
        .eq("session_id", activeSessionId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (isCancelled) {
        return;
      }

      if (error) {
        setChatMessagesError(error.message);
        setIsLoadingMessages(false);
        return;
      }

      setMessages((current) =>
        mergeMessages(
          current,
          (data ?? [])
            .filter((row) => isRenderableChatMessageRow(row as Record<string, unknown>))
            .map((row) => mapChatMessageRow(row as Record<string, unknown>)),
        ),
      );
      setIsLoadingMessages(false);
    };

    void loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [
    accessDeniedMessage,
    activeSessionId,
    canResolveChatSession,
    messageRefreshNonce,
    terminalSessionOutcome,
  ]);

  useEffect(() => {
    if (
      !supabase ||
      !activeSessionId ||
      !canResolveChatSession ||
      accessDeniedMessage ||
      terminalSessionOutcome
    ) {
      return;
    }

    const client = supabase;
    const syncRealtimeMessage = (row: Record<string, unknown>) => {
      if (!isRenderableChatMessageRow(row)) {
        const nextId = String(row.id ?? "");
        if (!nextId) {
          return;
        }

        setMessages((current) => current.filter((message) => message.id !== nextId));
        return;
      }

      const nextMessage = mapChatMessageRow(row);

      setMessages((current) => upsertMessageInList(current, nextMessage));
    };

    const channel = client.channel(`chat-messages:${activeSessionId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          syncRealtimeMessage(payload.new as Record<string, unknown>);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          syncRealtimeMessage(payload.new as Record<string, unknown>);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          const deletedId = String(
            (payload.old as Record<string, unknown> | null)?.id ?? "",
          );

          if (!deletedId) {
            return;
          }

          setMessages((current) =>
            current.filter((message) => message.id !== deletedId),
          );
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [
    accessDeniedMessage,
    activeSessionId,
    canResolveChatSession,
    terminalSessionOutcome,
  ]);

  useEffect(() => {
    if (!supabase || !activeSessionId || !sessionRecord) {
      return;
    }

    const client = supabase;
    if (!canAutoStartSession(sessionRecord)) {
      return;
    }

    const startSession = async () => {
      const startedAt = new Date().toISOString();
      const { data, error } = await client
        .from("sessions")
        .update({
          status: "in_session",
          session_started_at: startedAt,
        })
        .eq("id", activeSessionId)
        .eq("status", "funded")
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Failed to start funded session", error);
        return;
      }

      if (data) {
        setSessionRecord(
          normalizeSessionRecord(data as Record<string, unknown>, activeSessionId),
        );
      }
    };

    void startSession();
  }, [activeSessionId, sessionRecord]);

  useEffect(() => {
    if (
      !supabase ||
      !activeSessionId ||
      !sessionRecord ||
      sessionRecord.status !== "funded" ||
      !sessionRecord.noShowDeadlineAt
    ) {
      return;
    }

    const client = supabase;
    const deadline = new Date(sessionRecord.noShowDeadlineAt).getTime();
    if (Number.isNaN(deadline)) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const updatePayload = getNoShowCatchUpSettlement(sessionRecord);

      if (!updatePayload) {
        return;
      }

      const { data, error } = await client
        .from("sessions")
        .update(updatePayload)
        .eq("id", activeSessionId)
        .eq("status", "funded")
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Failed to settle session no-show", error);
        return;
      }

      if (data) {
        const nextSession = normalizeSessionRecord(
          data as Record<string, unknown>,
          activeSessionId,
        );
        stopLocalAudio();
        setVoiceCallStatus("idle");
        setSessionRecord(nextSession);
        presentDeadlineOutcomeModal(nextSession);
        setTerminalSessionOutcome(
          getTerminalSessionOutcomeOrNull(nextSession.status, isTherapist),
        );
        setAccessDeniedMessage("");
      }
    }, Math.max(0, deadline - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSessionId, isTherapist, sessionRecord]);

  useEffect(() => {
    if (
      !supabase ||
      !activeSessionId ||
      !sessionRecord ||
      !isAcceptedAwaitingPaymentStatus(sessionRecord.status) ||
      !sessionRecord.paymentDueAt
    ) {
      return;
    }

    const client = supabase;
    const deadline = new Date(sessionRecord.paymentDueAt).getTime();
    if (Number.isNaN(deadline)) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const { data, error } = await client
        .from("sessions")
        .update({
          status: "payment_timeout",
          payment_timeout_at: new Date().toISOString(),
          no_show_deadline_at: null,
          settlement_status: "cancelled",
        })
        .eq("id", activeSessionId)
        .eq("status", "accepted_awaiting_payment")
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Failed to catch up payment timeout in chat runtime", error);
        return;
      }

      if (data) {
        const nextSession = normalizeSessionRecord(
          data as Record<string, unknown>,
          activeSessionId,
        );
        setSessionRecord(nextSession);
        setTerminalSessionOutcome(
          getTerminalSessionOutcomeOrNull(nextSession.status, isTherapist),
        );
        setAccessDeniedMessage("");
      }
    }, Math.max(0, deadline - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSessionId, isTherapist, sessionRecord]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedDraft = draft.trim();
    if (!trimmedDraft || !supabase || !activeSessionId || !effectiveWallet) {
      return;
    }

    const client = supabase;
    const senderRole: Message["role"] = isTherapist ? "therapist" : "patient";
    setChatMessagesError("");

    const { data, error } = await client
      .from("chat_messages")
      .insert({
        session_id: activeSessionId,
        sender_wallet: effectiveWallet.toLowerCase(),
        sender_role: senderRole,
        message_type: "text",
        content: trimmedDraft,
        metadata: {},
      })
      .select("id, sender_role, message_type, content, is_deleted, created_at")
      .single();

    if (error) {
      setChatMessagesError(error.message);
      return;
    }

    if (data && isRenderableChatMessageRow(data as Record<string, unknown>)) {
      setMessages((current) =>
        upsertMessageInList(
          current,
          mapChatMessageRow(data as Record<string, unknown>),
        ),
      );
    }

    await recordCurrentParticipantArrival(client);

    setDraft("");
  };

  const handleStartVoiceCall = async () => {
    if (!supabase || !effectiveWallet || !sessionRecord || !activeSessionId) {
      setCallError("Session is not ready for voice controls.");
      return;
    }

    if (!isFundedOrLiveSessionStatus(sessionRecord.status)) {
      setCallError("Voice controls unlock once the session is funded.");
      return;
    }

    try {
      setCallError("");
      await startLocalAudio();
      setVoiceCallStatus("connected");
      await recordCurrentParticipantArrival(supabase);
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "Unable to start voice call.",
      );
    }
  };

  const handleHangUpVoiceCall = async () => {
    try {
      setCallError("");
      stopLocalAudio();
      setVoiceCallStatus("idle");
    } catch (error) {
      setCallError(
        error instanceof Error ? error.message : "Unable to end voice call.",
      );
    }
  };

  const handleOpenCompletionModal = () => {
    if (pendingSessionEndRequest) {
      if (isTargetOfPendingSessionEndRequest) {
        setCompletionModalError("");
        setEndRequestResponseText("");
        setCompletionModalMode("respond");
      }
      return;
    }

    if (isAcceptedSessionEndFinalizing) {
      return;
    }

    setSessionEndRequestError("");
    setCompletionModalError("");
    setCompletionModalMode("request");
  };

  const resetCompletionModal = () => {
    setCompletionModalError("");
    setEndRequestResponseText("");
    setCompletionModalMode(null);
  };

  const handleCloseCompletionModal = () => {
    if (isCompletionSubmitting) {
      return;
    }

    resetCompletionModal();
  };

  const redirectToSessionHome = () => {
    router.replace(isTherapist ? "/provider-lobby" : "/dashboard");
  };

  const syncLatestSessionState = (row: Record<string, unknown> | null) => {
    if (!row || !activeSessionId) {
      return null;
    }

    const latestSession = normalizeSessionRecord(row, activeSessionId);
    setSessionRecord(latestSession);
    return latestSession;
  };

  const recordCurrentParticipantArrival = async (
    client: NonNullable<typeof supabase>,
    sourceSession: SessionRecord | null = sessionRecord,
  ) => {
    if (!activeSessionId || !sourceSession || !currentParticipantWallet) {
      return sourceSession;
    }

    if (!canRecordArrivalInteraction(sourceSession)) {
      return sourceSession;
    }

    const joinKey =
      currentParticipantRole === "therapist"
        ? "therapist_joined_at"
        : "patient_joined_at";
    const alreadyJoined =
      currentParticipantRole === "therapist"
        ? sourceSession.therapistJoinedAt
        : sourceSession.patientJoinedAt;
    const expectedWallet =
      currentParticipantRole === "therapist"
        ? sourceSession.therapistWallet
        : sourceSession.patientWallet;

    if (!expectedWallet || alreadyJoined) {
      return sourceSession;
    }

    if (currentParticipantWallet.toLowerCase() !== expectedWallet.toLowerCase()) {
      return sourceSession;
    }

    const { data, error } = await client
      .from("sessions")
      .update({
        [joinKey]: new Date().toISOString(),
      })
      .eq("id", activeSessionId)
      .in("status", ["funded", "in_session"])
      .is(joinKey, null)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Failed to record first in-session arrival", error);
      return sourceSession;
    }

    if (!data) {
      return sourceSession;
    }

    const nextSession = normalizeSessionRecord(
      data as Record<string, unknown>,
      activeSessionId,
    );
    setSessionRecord(nextSession);
    return nextSession;
  };

  const handleStaleCompletionState = (
    latestSession: SessionRecord | null,
    setErrorMessage: (message: string) => void = setCompletionModalError,
  ) => {
    if (!latestSession) {
      setErrorMessage("This session is no longer live.");
      return;
    }

    const terminalOutcome = getTerminalSessionOutcomeOrNull(
      latestSession.status,
      isTherapist,
    );

    if (terminalOutcome) {
      stopLocalAudio();
      setVoiceCallStatus("idle");
      resetCompletionModal();
      setTerminalSessionOutcome(terminalOutcome);
      return;
    }

    if (latestSession.status !== "in_session") {
      setErrorMessage("This session changed state. Please review the latest status.");
      return;
    }

    if (!latestSession.sessionStartedAt) {
      setErrorMessage(
        "This session has not started yet. Both participants must enter before completion.",
      );
      return;
    }

    if (latestSession.settlementStatus !== "held_in_escrow") {
      setErrorMessage("This session is no longer live.");
      return;
    }

    setErrorMessage("This session changed state. Please review the latest status.");
  };

  const finalizeSessionCompletion = async (
    client: NonNullable<typeof supabase>,
    setErrorMessage: (message: string) => void,
  ) => {
    if (!activeSessionId) {
      return false;
    }

    const { data: latestRow, error: latestError } = await client
      .from("sessions")
      .select("*")
      .eq("id", activeSessionId)
      .maybeSingle();

    if (latestError) {
      console.error("Failed to verify latest session before completion", latestError);
      setErrorMessage("Unable to verify the latest session state. Please try again.");
      return false;
    }

    const latestSession = syncLatestSessionState(
      latestRow as Record<string, unknown> | null,
    );

    if (!latestSession) {
      setErrorMessage("This session is no longer live.");
      return false;
    }

    const terminalOutcome = getTerminalSessionOutcomeOrNull(
      latestSession.status,
      isTherapist,
    );
    if (terminalOutcome) {
      stopLocalAudio();
      setVoiceCallStatus("idle");
      resetCompletionModal();
      setTerminalSessionOutcome(terminalOutcome);
      return true;
    }

    if (!canCompleteSession(latestSession)) {
      handleStaleCompletionState(latestSession, setErrorMessage);
      return false;
    }

    const now = new Date().toISOString();
    const { data, error } = await client
      .from("sessions")
      .update({
        status: "completed",
        completed_at: now,
        protocol_fee_eth: PLATFORM_FEE_ETH,
        therapist_payout_eth: NORMAL_THERAPIST_PAYOUT_ETH,
        refund_amount_eth: 0,
        settlement_status: "released_to_therapist",
      })
      .eq("id", activeSessionId)
      .eq("status", "in_session")
      .eq("settlement_status", "held_in_escrow")
      .not("session_started_at", "is", null)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Failed to complete session", error);
      setErrorMessage("Unable to complete this session right now. Please try again.");
      return false;
    }

    if (!data) {
      const { data: refreshedRow, error: refreshError } = await client
        .from("sessions")
        .select("*")
        .eq("id", activeSessionId)
        .maybeSingle();

      if (refreshError) {
        console.error("Failed to refresh latest session after stale completion", refreshError);
        setErrorMessage("This session changed state. Please review the latest status.");
        return false;
      }

      handleStaleCompletionState(
        syncLatestSessionState(refreshedRow as Record<string, unknown> | null),
        setErrorMessage,
      );
      return false;
    }

    stopLocalAudio();
    setVoiceCallStatus("idle");
    setSessionRecord(
      normalizeSessionRecord(data as Record<string, unknown>, activeSessionId),
    );
    setSessionEndRequestError("");
    resetCompletionModal();
    redirectToSessionHome();
    return true;
  };

  const handleConfirmCompletion = async () => {
    if (
      !supabase ||
      !activeSessionId ||
      !effectiveWallet ||
      isCompletionSubmitting
    ) {
      return;
    }

    const client = supabase;
    setIsCompletionSubmitting(true);
    setCompletionModalError("");
    setSessionEndRequestError("");

    try {
      const { data: latestRow, error: latestError } = await client
        .from("sessions")
        .select("*")
        .eq("id", activeSessionId)
        .maybeSingle();

      if (latestError) {
        console.error("Failed to verify latest session before end request", latestError);
        setCompletionModalError(
          "Unable to verify the latest session state. Please try again.",
        );
        return;
      }

      const latestSession = syncLatestSessionState(
        latestRow as Record<string, unknown> | null,
      );

      if (!latestSession) {
        setCompletionModalError("This session is no longer live.");
        return;
      }

      const terminalOutcome = getTerminalSessionOutcomeOrNull(
        latestSession.status,
        isTherapist,
      );
      if (terminalOutcome) {
        stopLocalAudio();
        setVoiceCallStatus("idle");
        resetCompletionModal();
        setTerminalSessionOutcome(terminalOutcome);
        return;
      }

      if (!canCompleteSession(latestSession)) {
        handleStaleCompletionState(latestSession);
        return;
      }

      const { data: existingPendingRow, error: existingPendingError } = await client
        .from("session_end_requests")
        .select("*")
        .eq("session_id", activeSessionId)
        .eq("status", "pending")
        .maybeSingle();

      if (existingPendingError) {
        console.error(
          "Failed to verify pending session end request",
          existingPendingError,
        );
        setCompletionModalError(
          "Unable to verify the current end-session state. Please try again.",
        );
        return;
      }

      if (existingPendingRow) {
        const existingRequest = normalizeSessionEndRequestRow(
          existingPendingRow as Record<string, unknown>,
        );
        setSessionEndRequest(existingRequest);

        if (
          isSessionEndRequestTargetingParticipant(
            existingRequest,
            currentParticipantRole,
            currentParticipantWallet,
          )
        ) {
          setCompletionModalMode("respond");
          setEndRequestResponseText("");
          setCompletionModalError("");
        } else {
          resetCompletionModal();
        }

        return;
      }

      const targetWallet = isTherapist
        ? latestSession.patientWallet
        : latestSession.therapistWallet;

      if (!targetWallet || targetWallet === currentParticipantWallet) {
        setCompletionModalError(
          "Unable to resolve the other participant for this live session.",
        );
        return;
      }

      const { data, error } = await client
        .from("session_end_requests")
        .insert({
          session_id: activeSessionId,
          requested_by_wallet: currentParticipantWallet,
          requested_by_role: currentParticipantRole,
          target_wallet: targetWallet,
          target_role: otherParticipantRole,
          status: "pending",
        })
        .select("*")
        .single();

      if (error) {
        console.error("Failed to create session end request", error);

        if (error.code === "23505") {
          const { data: pendingRow, error: pendingRefreshError } = await client
            .from("session_end_requests")
            .select("*")
            .eq("session_id", activeSessionId)
            .eq("status", "pending")
            .maybeSingle();

          if (!pendingRefreshError && pendingRow) {
            const pendingRequest = normalizeSessionEndRequestRow(
              pendingRow as Record<string, unknown>,
            );
            setSessionEndRequest(pendingRequest);

            if (
              isSessionEndRequestTargetingParticipant(
                pendingRequest,
                currentParticipantRole,
                currentParticipantWallet,
              )
            ) {
              setCompletionModalMode("respond");
              setEndRequestResponseText("");
              setCompletionModalError("");
            } else {
              resetCompletionModal();
            }

            return;
          }
        }

        setCompletionModalError(
          "Unable to send the end-session request right now. Please try again.",
        );
        return;
      }

      if (data) {
        await recordCurrentParticipantArrival(client, latestSession);
        setSessionEndRequest(
          normalizeSessionEndRequestRow(data as Record<string, unknown>),
        );
      }

      resetCompletionModal();
    } catch (error) {
      console.error("Failed to create session end request", error);
      setCompletionModalError(
        "Unable to send the end-session request right now. Please try again.",
      );
    } finally {
      setIsCompletionSubmitting(false);
    }
  };

  const handleDeclineSessionEndRequest = async () => {
    if (
      !supabase ||
      !pendingSessionEndRequest ||
      !isTargetOfPendingSessionEndRequest ||
      isCompletionSubmitting
    ) {
      return;
    }

    const client = supabase;
    setIsCompletionSubmitting(true);
    setCompletionModalError("");

    try {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("session_end_requests")
        .update({
          status: "declined",
          target_responded_at: now,
          declined_at: now,
        })
        .eq("id", pendingSessionEndRequest.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Failed to decline session end request", error);
        setCompletionModalError(
          "Unable to keep the session live right now. Please try again.",
        );
        return;
      }

      if (!data) {
        setCompletionModalError("This end-session request is no longer pending.");
        setSessionEndRequestRefreshNonce((current) => current + 1);
        return;
      }

      await recordCurrentParticipantArrival(client);
      setSessionEndRequest(
        normalizeSessionEndRequestRow(data as Record<string, unknown>),
      );
      resetCompletionModal();
    } catch (error) {
      console.error("Failed to decline session end request", error);
      setCompletionModalError(
        "Unable to keep the session live right now. Please try again.",
      );
    } finally {
      setIsCompletionSubmitting(false);
    }
  };

  const handleAcceptSessionEndRequest = async () => {
    if (
      !supabase ||
      !pendingSessionEndRequest ||
      !isTargetOfPendingSessionEndRequest ||
      endRequestResponseText !== "ACCEPT" ||
      isCompletionSubmitting
    ) {
      return;
    }

    const client = supabase;
    setIsCompletionSubmitting(true);
    setCompletionModalError("");
    setSessionEndRequestError("");

    try {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("session_end_requests")
        .update({
          status: "accepted",
          target_responded_at: now,
          accepted_at: now,
          target_response_text: "ACCEPT",
        })
        .eq("id", pendingSessionEndRequest.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Failed to accept session end request", error);
        setCompletionModalError(
          "Unable to accept this end-session request right now. Please try again.",
        );
        return;
      }

      if (!data) {
        setCompletionModalError("This end-session request is no longer pending.");
        setSessionEndRequestRefreshNonce((current) => current + 1);
        return;
      }

      const acceptedRequest = normalizeSessionEndRequestRow(
        data as Record<string, unknown>,
      );
      await recordCurrentParticipantArrival(client);
      setSessionEndRequest(acceptedRequest);
      resetCompletionModal();
      finalizedEndRequestIdsRef.current.add(acceptedRequest.id);
      await finalizeSessionCompletion(client, setSessionEndRequestError);
    } catch (error) {
      console.error("Failed to accept session end request", error);
      setCompletionModalError(
        "Unable to accept this end-session request right now. Please try again.",
      );
    } finally {
      setIsCompletionSubmitting(false);
    }
  };

  const finalizeAcceptedSessionEndRequest = useEffectEvent(() => {
    if (!supabase) {
      return;
    }

    void finalizeSessionCompletion(supabase, setSessionEndRequestError);
  });

  useEffect(() => {
    if (
      !supabase ||
      !sessionEndRequest ||
      sessionEndRequest.status !== "accepted" ||
      !activeSessionId ||
      terminalSessionOutcome
    ) {
      return;
    }

    if (finalizedEndRequestIdsRef.current.has(sessionEndRequest.id)) {
      return;
    }

    finalizedEndRequestIdsRef.current.add(sessionEndRequest.id);
    finalizeAcceptedSessionEndRequest();
  }, [activeSessionId, sessionEndRequest, terminalSessionOutcome]);

  if (sessionGuard.authResolutionState === "pending" && !isRestoringChatSession) {
    return null;
  }

  if (terminalSessionOutcome) {
    return (
      <>
        <main className="app-shell-subtle page-canvas page-canvas-violet relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
          <div className="mx-auto w-full max-w-3xl px-6 py-10">
            <div className="glass-panel liquid-glass-strong rounded-[32px] p-8">
              <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Session Outcome
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
                {terminalSessionOutcome.title}
              </h1>
              <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
                {terminalSessionOutcome.message}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => router.replace(terminalSessionOutcome.href)}
                  className="button-primary rounded-full px-5 py-3 text-sm font-medium"
                >
                  {terminalSessionOutcome.actionLabel}
                </button>
              </div>
            </div>
          </div>
        </main>
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
        {supportRequestContext ? (
          <SupportRequestModal
            key={`support:${supportRequestContext.sessionId}:${supportRequestContext.status}`}
            sessionId={supportRequestContext.sessionId}
            reporterWallet={currentParticipantWallet || normalizedCurrentWallet}
            reporterRole={currentParticipantRole}
            initialIssueType={supportRequestContext.status}
            onClose={() => setSupportRequestContext(null)}
          />
        ) : null}
      </>
    );
  }

  if (accessDeniedMessage) {
    return (
      <main className="app-shell-subtle page-canvas page-canvas-violet relative min-h-screen overflow-hidden bg-background pt-32 text-foreground md:pt-36">
        <div className="mx-auto w-full max-w-3xl px-6 py-10">
          <div className="glass-panel liquid-glass-strong rounded-[32px] p-8">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Session Guard
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
              Session unavailable
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
              {accessDeniedMessage}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push(isTherapist ? "/provider-lobby" : "/dashboard")}
                className="button-primary rounded-full px-5 py-3 text-sm font-medium"
              >
                Return
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell-subtle page-canvas page-canvas-violet relative overflow-hidden bg-background text-foreground">
      <div className="fixed left-1/2 top-6 z-50 w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2">
        <header className="liquid-glass-floating flex items-center justify-between gap-4 rounded-full border border-black/[0.05] bg-white/70 px-5 py-3 backdrop-blur-[40px] backdrop-saturate-[1.8] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.85)]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                  {isTherapist
                    ? `Patient: ${formatWalletLabel(sessionRecord?.patientWallet ?? "")}`
                    : therapistProfile.name}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    {isTherapist
                      ? "Online"
                      : isLoadingTherapist
                        ? "Loading therapist..."
                        : therapistProfile.specialty}
                  </p>
                  {isTherapist ? (
                    <span className="glass-chip-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Anonymous
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-black/[0.05] bg-black/5 px-4 py-2 text-sm text-[var(--text-secondary)] dark:border-white/[0.08] dark:bg-white/10 md:flex">
            <Lock className="h-4 w-4" />
            <span>Wallet-Gated Session</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-full bg-black/5 px-3 py-1 font-mono text-sm text-[var(--text-secondary)] dark:bg-white/10">
              {formatCountdown(secondsLeft)}
            </div>
            <VoiceCallControls
              status={voiceCallStatus}
              onAccept={handleStartVoiceCall}
              onHangUp={handleHangUpVoiceCall}
              ringingLabel={isTherapist ? "Calling patient..." : "Calling therapist..."}
            />
            {isTherapist ? (
              <button
                type="button"
                onClick={handleOpenCompletionModal}
                disabled={isEndSessionActionDisabled}
                className={endSessionButtonClassName}
              >
                <span className="hidden sm:inline">
                  {isRequesterWaitingForSessionEnd
                    ? "Awaiting Patient Confirmation"
                    : isAcceptedSessionEndFinalizing
                      ? "Finalizing Session"
                      : "Request Completion"}
                </span>
                <span className="sm:hidden">
                  {isAcceptedSessionEndFinalizing ? "Ending" : "Request"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenCompletionModal}
                disabled={isEndSessionActionDisabled}
                className={endSessionButtonClassName}
              >
                <span className="hidden sm:inline">
                  {isRequesterWaitingForSessionEnd
                    ? "Awaiting Therapist Confirmation"
                    : isAcceptedSessionEndFinalizing
                      ? "Finalizing Session"
                      : "Request End Session"}
                </span>
                <span className="sm:hidden">
                  {isAcceptedSessionEndFinalizing ? "Ending" : "Request"}
                </span>
              </button>
            )}
          </div>
        </header>
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-36 pt-32 md:px-8 md:pb-40 md:pt-36">
        <div className="flex-1 overflow-y-auto pb-6">
        <div className="mx-auto flex w-full flex-col gap-4">
            {callError ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft max-w-2xl rounded-full px-5 py-3 text-center text-sm text-red-600 dark:text-red-300">
                  {callError}
                </div>
              </div>
            ) : null}
            {chatMessagesError ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft max-w-2xl rounded-full px-5 py-3 text-center text-sm text-red-600 dark:text-red-300">
                  {chatMessagesError}
                </div>
              </div>
            ) : null}
            {!isTherapist && therapistError ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft max-w-2xl rounded-full px-5 py-3 text-center text-sm text-red-600 dark:text-red-300">
                  {therapistError}
                </div>
              </div>
            ) : null}
            {sessionEndRequestError ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft max-w-2xl rounded-full px-5 py-3 text-center text-sm text-red-600 dark:text-red-300">
                  {sessionEndRequestError}
                </div>
              </div>
            ) : null}
            {isRequesterWaitingForSessionEnd ? (
              <div className="flex justify-center">
                <div className="glass-chip max-w-2xl rounded-full px-5 py-3 text-center text-sm text-[var(--text-secondary)]">
                  End-session request sent. Waiting for the other participant to
                  type ACCEPT.
                </div>
              </div>
            ) : null}
            {isTargetOfPendingSessionEndRequest ? (
              <div className="flex justify-center">
                <div className="glass-chip max-w-2xl rounded-full px-5 py-3 text-center text-sm text-[var(--text-secondary)]">
                  The other participant has requested to end this session. Review
                  the confirmation modal to respond.
                </div>
              </div>
            ) : null}
            {isAcceptedSessionEndFinalizing ? (
              <div className="flex justify-center">
                <div className="glass-chip max-w-2xl rounded-full px-5 py-3 text-center text-sm text-[var(--text-secondary)]">
                  End request accepted. Finalizing settlement now.
                </div>
              </div>
            ) : null}
            {isLoadingMessages && !renderedMessages.length ? (
              <div className="flex justify-center">
                <div className="glass-chip max-w-2xl rounded-full px-5 py-3 text-center text-sm text-[var(--text-secondary)]">
                  Loading chat...
                </div>
              </div>
            ) : null}
            {renderedMessages.map((message) => {
              if (message.role === "system") {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className="glass-chip max-w-2xl rounded-full px-5 py-3 text-center text-sm text-[var(--text-secondary)]">
                      {message.content}
                    </div>
                  </div>
                );
              }

              const isOwnMessage = isTherapist
                ? message.role === "therapist"
                : message.role === "patient";
              const authorLabel = message.role === "therapist" ? "Therapist" : "Patient";

              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[min(82%,38rem)] rounded-[28px] px-5 py-4 shadow-lg ${
                      isOwnMessage
                        ? "bg-[linear-gradient(135deg,var(--accent-primary-strong),var(--accent-primary))] text-[var(--bg-primary)] shadow-[0_18px_36px_color-mix(in_srgb,var(--accent-primary)_24%,transparent)] dark:bg-[linear-gradient(135deg,#8f7aff,#7b61ff)]"
                        : "liquid-glass-soft text-[var(--text-primary)]"
                    }`}
                  >
                    {!isOwnMessage ? (
                      <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        {authorLabel}
                      </p>
                    ) : null}
                    <p className="text-sm leading-7">{message.content}</p>
                    <p
                      className={`mt-3 text-[11px] uppercase tracking-[0.18em] ${
                        isOwnMessage
                          ? "text-white/72 dark:text-white/70"
                          : "text-[var(--text-faint)]"
                      }`}
                    >
                      {message.time}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2">
        <form
          onSubmit={handleSend}
          className="liquid-glass-floating flex items-center gap-3 rounded-full border border-black/[0.05] bg-white/70 px-4 py-3 backdrop-blur-[40px] backdrop-saturate-[1.8] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 sm:px-5"
        >
          <button
            type="button"
            className="glass-chip-muted inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            aria-label="Send anonymized record"
          >
            <AttachmentIcon />
          </button>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Send a protected message..."
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="button-primary inline-flex h-11 w-11 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </form>
      </div>

      {showWarningModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[32px] border border-black/[0.05] bg-white/70 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-[40px] dark:border-white/[0.08] dark:bg-[#1d1d1f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:p-7">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Session Notice
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
              Session Wrapping Up
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
              You have 10 minutes remaining in this session. Please begin
              summarizing your thoughts.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="button-primary rounded-full px-5 py-3 text-sm font-medium"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {completionModalMode === "request" ? (
        <SessionCompletionModal
          eyebrow="Session End Request"
          title="Request to end this session?"
          message="This will ask the other participant to confirm the session end. The live session will stay open until they type ACCEPT."
          confirmLabel="Send end request"
          submittingLabel="Sending request..."
          errorMessage={completionModalError}
          isSubmitting={isCompletionSubmitting}
          onCancel={handleCloseCompletionModal}
          onConfirm={handleConfirmCompletion}
        />
      ) : null}

      {completionModalMode === "respond" ? (
        <SessionCompletionModal
          eyebrow="Session End Confirmation"
          title="Confirm session end?"
          message={`The ${pendingSessionEndRequest?.requestedByRole === "therapist" ? "therapist" : "patient"} has requested to end the live session. Type ACCEPT exactly to agree and release settlement.`}
          confirmLabel="Accept and end session"
          showCancel={false}
          errorMessage={completionModalError}
          isSubmitting={isCompletionSubmitting}
          submittingLabel="Finalizing session..."
          isConfirmDisabled={endRequestResponseText !== "ACCEPT"}
          onCancel={handleCloseCompletionModal}
          onConfirm={handleAcceptSessionEndRequest}
        >
          <div className="rounded-[22px] border border-black/[0.05] bg-black/5 px-4 py-4 dark:border-white/[0.08] dark:bg-white/10">
            <label className="block text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Type ACCEPT to confirm
            </label>
            <input
              type="text"
              value={endRequestResponseText}
              onChange={(event) => setEndRequestResponseText(event.target.value)}
              placeholder="ACCEPT"
              autoComplete="off"
              className="mt-3 w-full rounded-full border border-black/[0.06] bg-white/80 px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] dark:border-white/[0.08] dark:bg-[#1d1d1f]/80"
            />
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-[22px] border border-amber-500/20 bg-amber-500/8 px-4 py-4">
            <p className="text-sm text-[var(--text-muted)]">
              If you want to reject this request and keep the live session open,
              use the explicit action below.
            </p>
            <div className="flex justify-start">
              <button
                type="button"
                onClick={handleDeclineSessionEndRequest}
                disabled={isCompletionSubmitting}
                className="button-secondary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep session live
              </button>
            </div>
          </div>
        </SessionCompletionModal>
      ) : null}
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatRoomPage />
    </Suspense>
  );
}
