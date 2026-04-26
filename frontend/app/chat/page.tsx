"use client";

import { Suspense, useEffect, useEffectEvent, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import { useAccount, useChainId, useConfig } from "wagmi";
import SessionOutcomeNoticeModal from "../../components/SessionOutcomeNoticeModal";
import SessionCompletionModal from "../../components/SessionCompletionModal";
import SupportRequestModal from "../../components/SupportRequestModal";
import VoiceCallControls from "../../components/VoiceCallControls";
import { usePageSessionGuard } from "../../lib/session-guard";
import {
  getTerminalSessionOutcome,
  getTerminalSessionOutcomeOrNull,
  isDeadlineOutcomeStatus,
  type DeadlineOutcomeStatus,
  type TerminalOutcomeCopy,
} from "../../lib/session-outcome";
import {
  buildPatientCheckedInPatch,
  buildSessionStartedPatch,
  buildTherapistCheckedInPatch,
  buildSessionCompletedPatch,
  compactSessionSyncPatch,
  normalizeOnchainSessionId,
  unixSecondsToIsoString,
} from "../../lib/onchain-session-mapping";
import {
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_DEPLOYMENT,
  NORMAL_PROTOCOL_FEE_WEI,
  NORMAL_THERAPIST_PAYOUT_WEI,
  findMindPassEscrowEvent,
  normalizeMindPassEscrowSession,
  prepareCheckInAsPatient,
  prepareCheckInAsTherapist,
  prepareConfirmSessionEnd,
  prepareResolveNoShow,
  prepareResolvePaymentTimeout,
  prepareRequestSessionEnd,
  type HexAddress,
} from "../../lib/mindpassEscrow";
import {
  logEscrowDebug,
  logMirrorSync,
  logMirrorSyncError,
  logReceiptDecode,
} from "../../lib/escrow-debug";
import {
  acknowledgeDeadlineOutcome,
  buildDeadlineOutcomeAckKey,
  isDeadlineOutcomeAcknowledged,
} from "../../lib/session-outcome-ack";
import {
  canRecordArrivalInteraction,
  canCompleteSession,
} from "../../lib/session-transition-guards";
import {
  buildResolutionPatchFromEvent,
  buildResolutionPatchFromChainSession,
  type EscrowResolutionEventInput,
  getEscrowResolutionKind,
  isTerminalEscrowResolutionStatus,
} from "../../lib/escrow-resolution";
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
  onchainSessionId: string | null;
  patientWallet: string;
  therapistWallet: string;
  updatedAt: string | null;
  fundedAt: string | null;
  patientJoinedAt: string | null;
  therapistJoinedAt: string | null;
  sessionStartedAt: string | null;
  paymentDueAt: string | null;
  noShowDeadlineAt: string | null;
  completedAt: string | null;
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

type CompletedSessionSyncValues = {
  therapistPayoutWei: bigint;
  protocolFeeWei: bigint;
  completedAt: bigint;
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
const IS_DEV = process.env.NODE_ENV !== "production";

function logChatLifecycle(label: string, payload: Record<string, unknown>) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[chat-lifecycle]", label, payload);
}

function logChatLifecycleRecheck(
  label: string,
  payload: Record<string, unknown>,
) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[chat-lifecycle-recheck]", label, payload);
}

function logChatSendGate(label: string, payload: Record<string, unknown>) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[chat-send-gate]", label, payload);
}

function logArrivalAudit(label: string, payload: Record<string, unknown>) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[arrival-audit]", label, payload);
}

function logArrivalIntent(label: string, payload: Record<string, unknown>) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[arrival-intent]", label, payload);
}

function logCheckinMirrorFix(label: string, payload: Record<string, unknown>) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[checkin-mirror-fix]", label, payload);
}

function logSessionEndArrivalAudit(
  label: string,
  payload: Record<string, unknown>,
) {
  if (!IS_DEV) {
    return;
  }

  console.debug("[session-end-arrival-audit]", label, payload);
}

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
    return null;
  }

  const startedAt = new Date(session.sessionStartedAt).getTime();
  if (Number.isNaN(startedAt)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return Math.max(0, CHAT_SESSION_DURATION_SECONDS - elapsedSeconds);
}

function getNoShowSecondsLeft(
  session: SessionRecord | null,
  now = Date.now(),
) {
  if (
    !session ||
    session.status !== "funded" ||
    session.sessionStartedAt ||
    !session.noShowDeadlineAt
  ) {
    return null;
  }

  const deadlineAt = new Date(session.noShowDeadlineAt).getTime();
  if (Number.isNaN(deadlineAt)) {
    return null;
  }

  return Math.max(0, Math.floor((deadlineAt - now) / 1000));
}

function isSessionStarted(session: SessionRecord | null) {
  return Boolean(
    session?.status === "in_session" &&
      session.patientJoinedAt &&
      session.therapistJoinedAt &&
      session.sessionStartedAt,
  );
}

function getParticipantJoinedAt(
  session: SessionRecord | null,
  role: SessionParticipantRole,
) {
  if (!session) {
    return null;
  }

  return role === "therapist"
    ? session.therapistJoinedAt
    : session.patientJoinedAt;
}

function hasCurrentParticipantCheckedIn(
  session: SessionRecord | null,
  role: SessionParticipantRole,
) {
  return Boolean(getParticipantJoinedAt(session, role));
}

function isWaitingForOtherParticipant(
  session: SessionRecord | null,
  role: SessionParticipantRole,
) {
  if (!session || isSessionStarted(session) || session.status !== "funded") {
    return false;
  }

  const currentParticipantJoinedAt = getParticipantJoinedAt(session, role);
  const otherParticipantJoinedAt = getParticipantJoinedAt(
    session,
    role === "therapist" ? "patient" : "therapist",
  );

  return Boolean(
    currentParticipantJoinedAt &&
      !otherParticipantJoinedAt &&
      !session.sessionStartedAt,
  );
}

function getPreStartSessionMessage(
  session: SessionRecord | null,
  role: SessionParticipantRole,
) {
  if (!session) {
    return "This session is no longer available.";
  }

  if (session.status === "accepted_awaiting_payment") {
    return "Chat unlocks after payment is confirmed on-chain.";
  }

  if (session.status !== "funded" || session.sessionStartedAt) {
    return "Chat will unlock once the live session has started.";
  }

  const currentParticipantJoinedAt = getParticipantJoinedAt(session, role);
  const otherParticipantJoinedAt = getParticipantJoinedAt(
    session,
    role === "therapist" ? "patient" : "therapist",
  );

  if (currentParticipantJoinedAt && otherParticipantJoinedAt) {
    return "Both participants have checked in. Live session start is still syncing.";
  }

  if (currentParticipantJoinedAt) {
    return "You're checked in. Waiting for the other participant to arrive before chat unlocks.";
  }

  return "Check in first. Chat unlocks once both participants have arrived.";
}

function getChatBlockedReason(
  session: SessionRecord | null,
  role: SessionParticipantRole,
) {
  if (!session) {
    return "missing_session_record";
  }

  if (!isChatAllowedStatus(session.status)) {
    return "session_terminal";
  }

  if (isSessionStarted(session)) {
    return null;
  }

  if (session.status !== "funded") {
    return "session_not_started";
  }

  const currentParticipantJoinedAt = getParticipantJoinedAt(session, role);
  const otherParticipantJoinedAt = getParticipantJoinedAt(
    session,
    role === "therapist" ? "patient" : "therapist",
  );

  if (!currentParticipantJoinedAt) {
    return "arrival_not_persisted";
  }

  if (!otherParticipantJoinedAt) {
    return "waiting_for_other_participant";
  }

  return "session_start_not_mirrored";
}

const formatWalletLabel = (wallet: string) =>
  wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Unknown wallet";

function normalizeSessionRecord(
  row: Record<string, unknown>,
  fallbackId = "",
): SessionRecord {
  let onchainSessionId: string | null = null;
  const rawOnchainSessionId = row.onchain_session_id;

  if (
    (typeof rawOnchainSessionId === "string" &&
      rawOnchainSessionId.trim()) ||
    typeof rawOnchainSessionId === "number" ||
    typeof rawOnchainSessionId === "bigint"
  ) {
    try {
      onchainSessionId = normalizeOnchainSessionId(
        String(rawOnchainSessionId),
      );
    } catch {
      onchainSessionId = null;
    }
  }

  return {
    id: String(row.id ?? fallbackId),
    status: normalizeSessionStatus(row.status),
    onchainSessionId,
    patientWallet: String(row.patient_wallet ?? "").toLowerCase(),
    therapistWallet: String(row.therapist_wallet ?? "").toLowerCase(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    fundedAt: typeof row.funded_at === "string" ? row.funded_at : null,
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
    completedAt:
      typeof row.completed_at === "string" ? row.completed_at : null,
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
  const chainId = useChainId();
  const wagmiConfig = useConfig();
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
  const [resolutionNow, setResolutionNow] = useState(() => Date.now());
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [completionModalMode, setCompletionModalMode] =
    useState<CompletionModalMode | null>(null);
  const [isCompletionSubmitting, setIsCompletionSubmitting] = useState(false);
  const [completionModalError, setCompletionModalError] = useState("");
  const [sessionEndRequest, setSessionEndRequest] =
    useState<SessionEndRequestRecord | null>(null);
  const [sessionEndRequestError, setSessionEndRequestError] = useState("");
  const [overdueResolutionError, setOverdueResolutionError] = useState("");
  const [isResolvingOverdueSession, setIsResolvingOverdueSession] = useState(false);
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
  const [pendingArrivalTrigger, setPendingArrivalTrigger] = useState<
    "send" | "voice" | null
  >(null);
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
  const shownDeadlineOutcomeKeyRef = useRef<string | null>(null);
  const arrivalIntentInFlightRef = useRef(false);
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
  const overdueResolutionKind = getEscrowResolutionKind(
    sessionRecord,
    resolutionNow,
  );
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
  const activeSessionSecondsLeft = getSessionSecondsLeft(
    sessionRecord,
    countdownNow,
  );
  const noShowSecondsLeft = getNoShowSecondsLeft(sessionRecord, countdownNow);
  const chatSessionStarted = isSessionStarted(sessionRecord);
  const currentParticipantJoinedAt = getParticipantJoinedAt(
    sessionRecord,
    currentParticipantRole,
  );
  const otherParticipantJoinedAt = getParticipantJoinedAt(
    sessionRecord,
    otherParticipantRole,
  );
  const preStartSessionMessage = getPreStartSessionMessage(
    sessionRecord,
    currentParticipantRole,
  );
  const isComposerBlockedWaitingForOtherParticipant = isWaitingForOtherParticipant(
    sessionRecord,
    currentParticipantRole,
  );
  const isPendingArrival = pendingArrivalTrigger !== null;
  const visibleMessages = chatSessionStarted
    ? renderedMessages
    : renderedMessages.filter((message) => message.role === "system");
  const routeMatchesLoadedSession = !sessionRecord || sessionRecord.id === activeSessionId;
  const countdownLabel = chatSessionStarted
    ? "Session Time Left"
    : sessionRecord?.status === "funded" && noShowSecondsLeft !== null
      ? "Check-In Window"
      : "Session Timer";
  const countdownValue =
    chatSessionStarted && activeSessionSecondsLeft !== null
      ? formatCountdown(activeSessionSecondsLeft)
      : noShowSecondsLeft !== null
        ? formatCountdown(noShowSecondsLeft)
        : "--:--";
  const shouldShowPreStartCountdown =
    routeMatchesLoadedSession &&
    sessionRecord?.status === "funded" &&
    noShowSecondsLeft !== null;
  const shouldShowStartedTimer =
    routeMatchesLoadedSession &&
    chatSessionStarted &&
    activeSessionSecondsLeft !== null;
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

  const openDeadlineOutcomeModal = (session: SessionRecord) => {
    if (!isDeadlineOutcomeStatus(session.status)) {
      return;
    }

    const ackKey = buildDeadlineOutcomeAckKey({
      viewerRole: isTherapist ? "therapist" : "patient",
      sessionId: session.id,
      status: session.status,
      updatedAt: session.updatedAt,
    });

    if (
      shownDeadlineOutcomeKeyRef.current === ackKey ||
      isDeadlineOutcomeAcknowledged(ackKey)
    ) {
      return;
    }

    shownDeadlineOutcomeKeyRef.current = ackKey;
    setDeadlineOutcomeModal({
      sessionId: session.id,
      status: session.status,
      ackKey,
    });
  };

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
    if (!sessionRecord) {
      return;
    }

    logChatLifecycleRecheck("loaded_session_snapshot", {
      routeSessionId: activeSessionId,
      loadedSessionId: sessionRecord.id,
      onchainSessionId: sessionRecord.onchainSessionId,
      status: sessionRecord.status,
      fundedAt: sessionRecord.fundedAt,
      patientJoinedAt: sessionRecord.patientJoinedAt,
      therapistJoinedAt: sessionRecord.therapistJoinedAt,
      sessionStartedAt: sessionRecord.sessionStartedAt,
      noShowDeadlineAt: sessionRecord.noShowDeadlineAt,
      currentRole: currentParticipantRole,
      currentWallet: currentParticipantWallet,
      isStarted: chatSessionStarted,
      isFundedPreStart: sessionRecord.status === "funded" && !chatSessionStarted,
    });
    logChatLifecycle("session_row_loaded", {
      sessionId: sessionRecord.id,
      onchainSessionId: sessionRecord.onchainSessionId,
      status: sessionRecord.status,
      fundedAt: sessionRecord.fundedAt,
      patientJoinedAt: sessionRecord.patientJoinedAt,
      therapistJoinedAt: sessionRecord.therapistJoinedAt,
      sessionStartedAt: sessionRecord.sessionStartedAt,
      noShowDeadlineAt: sessionRecord.noShowDeadlineAt,
      completedAt: sessionRecord.completedAt,
      currentRole: currentParticipantRole,
      currentWallet: currentParticipantWallet,
      isStarted: chatSessionStarted,
      isFundedPreStart: sessionRecord.status === "funded" && !chatSessionStarted,
      shouldShowPreStartCountdown,
      shouldShowStartedTimer,
    });
  }, [
    chatSessionStarted,
    currentParticipantRole,
    currentParticipantWallet,
    sessionRecord,
    shouldShowPreStartCountdown,
    shouldShowStartedTimer,
  ]);

  useEffect(() => {
    if (!sessionRecord || routeMatchesLoadedSession) {
      return;
    }

    logChatLifecycleRecheck("route_session_mismatch", {
      routeSessionId: activeSessionId,
      loadedSessionId: sessionRecord.id,
      status: sessionRecord.status,
      onchainSessionId: sessionRecord.onchainSessionId,
    });
  }, [
    activeSessionId,
    routeMatchesLoadedSession,
    sessionRecord,
  ]);

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
    const shouldTickCountdown =
      (sessionRecord?.status === "in_session" &&
        Boolean(sessionRecord.sessionStartedAt)) ||
      (sessionRecord?.status === "funded" &&
        !sessionRecord.sessionStartedAt &&
        Boolean(sessionRecord.noShowDeadlineAt));

    if (!shouldTickCountdown) {
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
    logChatLifecycleRecheck("timer_branch_chosen", {
      routeSessionId: activeSessionId,
      loadedSessionId: sessionRecord?.id ?? null,
      status: sessionRecord?.status ?? null,
      sessionStartedAt: sessionRecord?.sessionStartedAt ?? null,
      noShowDeadlineAt: sessionRecord?.noShowDeadlineAt ?? null,
      computedSecondsLeft:
        shouldShowStartedTimer
          ? activeSessionSecondsLeft
          : shouldShowPreStartCountdown
            ? noShowSecondsLeft
            : null,
      timerMode: shouldShowStartedTimer
        ? "active_session_timer"
        : shouldShowPreStartCountdown
          ? "pre_start_countdown"
          : "terminal_or_none",
    });
    logChatLifecycle("header_timer_computed", {
      sessionId: sessionRecord?.id ?? null,
      status: sessionRecord?.status ?? null,
      sessionStartedAt: sessionRecord?.sessionStartedAt ?? null,
      noShowDeadlineAt: sessionRecord?.noShowDeadlineAt ?? null,
      computedSecondsLeft:
        shouldShowStartedTimer
          ? activeSessionSecondsLeft
          : shouldShowPreStartCountdown
            ? noShowSecondsLeft
            : null,
      timerMode: shouldShowStartedTimer
        ? "active_session_timer"
        : shouldShowPreStartCountdown
          ? "pre_start_countdown"
          : "terminal_or_none",
    });
  }, [
    activeSessionSecondsLeft,
    noShowSecondsLeft,
    sessionRecord?.id,
    sessionRecord?.noShowDeadlineAt,
    sessionRecord?.sessionStartedAt,
    sessionRecord?.status,
    shouldShowPreStartCountdown,
    shouldShowStartedTimer,
  ]);

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
    if (activeSessionSecondsLeft === 10 * 60 && !hasShownWarningRef.current) {
      hasShownWarningRef.current = true;
      registerTimeout(() => {
        setShowWarningModal(true);
      }, 0);
    }
  }, [activeSessionSecondsLeft]);

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

      const applyChatCatchUp = async (session: SessionRecord) => session;

      const updateChatRouteSession = (nextSessionId: string) => {
        if (!nextSessionId || nextSessionId === sessionIdParam) {
          return;
        }

        const nextSearchParams = new URLSearchParams(searchParams.toString());
        nextSearchParams.set("sessionId", nextSessionId);
        router.replace(`/chat?${nextSearchParams.toString()}`);
      };

      const loadLatestActiveSessionRow = async () => {
        if (!therapistAddress && !isTherapist) {
          return null;
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
          return null;
        }

        if (error) {
          setCallError(error.message);
          return null;
        }

        return data as Record<string, unknown> | null;
      };

      const applyScopedOverdueFundedCatchUps = async () => {
        return;
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
          applySessionRecord(nextSession, "resolve_session_terminal_guard");
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

        updateChatRouteSession(nextSession.id);
        setActiveSessionId(nextSession.id);
        applySessionRecord(nextSession, "resolve_session_active");
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

        const normalizedRequestedSession = data
          ? normalizeSessionRecord(data as Record<string, unknown>, sessionIdParam)
          : null;
        const shouldPreferLatestActiveSession =
          !normalizedRequestedSession ||
          Boolean(
            getTerminalSessionOutcomeOrNull(
              normalizedRequestedSession.status,
              isTherapist,
            ),
          ) ||
          !isChatAllowedStatus(normalizedRequestedSession.status);

        if (shouldPreferLatestActiveSession) {
          const latestActiveRow = await loadLatestActiveSessionRow();
          if (latestActiveRow) {
            await applyResolvedSession(latestActiveRow);
            return;
          }
        }

        await applyResolvedSession(data as Record<string, unknown> | null);
        return;
      }

      await applyScopedOverdueFundedCatchUps();
      const latestActiveRow = await loadLatestActiveSessionRow();
      await applyResolvedSession(latestActiveRow);
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
          applySessionRecord(next, "realtime_session_update");
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
    if (
      !activeSessionId ||
      !sessionRecord ||
      !(
        (sessionRecord.status === "funded" && sessionRecord.noShowDeadlineAt) ||
        (isAcceptedAwaitingPaymentStatus(sessionRecord.status) &&
          sessionRecord.paymentDueAt)
      )
    ) {
      return;
    }

    const targetDeadline =
      sessionRecord.status === "funded"
        ? sessionRecord.noShowDeadlineAt
        : sessionRecord.paymentDueAt;
    if (!targetDeadline) {
      return;
    }
    const deadline = new Date(targetDeadline).getTime();
    if (Number.isNaN(deadline)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResolutionNow(Date.now());
    }, Math.max(0, deadline - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSessionId, sessionRecord]);

  const handleResolveOverdueSession = async () => {
    if (
      !supabase ||
      !sessionRecord ||
      !activeSessionId ||
      isResolvingOverdueSession
    ) {
      return;
    }

    const client = supabase;
    const resolutionKind = getEscrowResolutionKind(sessionRecord, Date.now());
    if (!resolutionKind) {
      setOverdueResolutionError("This session is not ready for on-chain resolution.");
      return;
    }

    setIsResolvingOverdueSession(true);
    setOverdueResolutionError("");

    try {
      const escrowSessionContext = getEscrowSessionContext(sessionRecord);
      const onchainSessionId = escrowSessionContext.onchainSessionId;
      const contractAddress = escrowSessionContext.contractAddress;

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
          return false;
        }

        const { data, error } = await client
          .from("sessions")
          .update(compactSessionSyncPatch(updatePatch))
          .eq("id", activeSessionId)
          .eq("onchain_session_id", sessionRecord.onchainSessionId)
          .select("*")
          .maybeSingle();

        if (error) {
          logMirrorSyncError("chat overdue resolution mirror sync failed", {
            sessionId: activeSessionId,
            onchainSessionId: sessionRecord.onchainSessionId,
            txHash: options.resolutionTxHash ?? null,
            message: error.message,
          });
          setOverdueResolutionError(
            options.resolutionTxHash
              ? "Mirror sync failed after successful on-chain resolution. Please refresh."
              : "This session is already resolved on-chain, but the mirror sync failed. Please refresh.",
          );
          return false;
        }

        if (!data) {
          setOverdueResolutionError(
            options.resolutionTxHash
              ? "On-chain resolution succeeded, but the updated session row could not be loaded."
              : "This session is already resolved on-chain, but the updated session row could not be loaded.",
          );
          return false;
        }

        const nextSession = normalizeSessionRecord(
          data as Record<string, unknown>,
          activeSessionId,
        );
        logMirrorSync("chat overdue resolution mirror sync complete", {
          sessionId: activeSessionId,
          onchainSessionId: sessionRecord.onchainSessionId,
          txHash: options.resolutionTxHash ?? null,
          status: nextSession.status,
          alreadyResolved: options.alreadyResolved ?? false,
        });
        stopLocalAudio();
        setVoiceCallStatus("idle");
        applySessionRecord(nextSession, "overdue_resolution_sync");
        openDeadlineOutcomeModal(nextSession);
        setTerminalSessionOutcome(
          getTerminalSessionOutcomeOrNull(nextSession.status, isTherapist),
        );
        setAccessDeniedMessage("");
        return true;
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

      if (isTerminalEscrowResolutionStatus(chainSessionBefore.status)) {
        await syncResolvedSession({
          chainSession: chainSessionBefore,
          alreadyResolved: true,
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

      logEscrowDebug("submitting chat overdue resolution", {
        source: "chat",
        sessionId: activeSessionId,
        onchainSessionId: sessionRecord.onchainSessionId,
        functionName: request.functionName,
      });

      let hash: `0x${string}`;
      try {
        const { request: simulatedRequest } = await simulateContract(
          wagmiConfig,
          {
            address: request.address,
            abi: request.abi,
            functionName: request.functionName,
            args: request.args,
            chainId: request.chainId,
            account: address,
          },
        );
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

        throw error;
      }

      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        hash,
      });
      logReceiptDecode({
        context: "chat overdue resolution receipt decoded",
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
        message.includes("user rejected") ||
        message.includes("user denied") ||
        message.includes("rejected the request") ||
        message.includes("4001")
      ) {
        setOverdueResolutionError(
          resolutionKind === "payment_timeout"
            ? "Wallet signing was cancelled. Payment timeout is still unresolved on-chain."
            : "Wallet signing was cancelled. No-show is still unresolved on-chain.",
        );
      } else if (message.includes("switch to sepolia")) {
        setOverdueResolutionError(
          "Wrong chain. Switch to Sepolia before resolving this escrow outcome.",
        );
      } else {
        setOverdueResolutionError(
          error instanceof Error
            ? error.message
            : "Unable to resolve this escrow outcome right now.",
        );
      }
    } finally {
      setIsResolvingOverdueSession(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }

    if (!supabase || !activeSessionId || !effectiveWallet || !sessionRecord) {
      logChatLifecycle("handle_send_blocked", {
        insertAllowed: false,
        blockedReason: !sessionRecord
          ? "missing_session_record"
          : !effectiveWallet
            ? "missing_wallet"
            : !activeSessionId
              ? "missing_session_id"
              : "missing_supabase_client",
      });
      return;
    }

    const client = supabase;
    const senderRole: Message["role"] = isTherapist ? "therapist" : "patient";
    setChatMessagesError("");
    const route = "/chat";
    logChatSendGate("send_entered", {
      sessionId: activeSessionId,
      role: currentParticipantRole,
      wallet: effectiveWallet.toLowerCase(),
      statusBeforeSend: sessionRecord.status,
      patientJoinedAtBeforeSend: sessionRecord.patientJoinedAt,
      therapistJoinedAtBeforeSend: sessionRecord.therapistJoinedAt,
      sessionStartedAtBeforeSend: sessionRecord.sessionStartedAt,
      messageLength: trimmedDraft.length,
    });
    logArrivalAudit("send_path_entered", {
      sessionId: sessionRecord.id,
      activeSessionId,
      status: sessionRecord.status,
      patientJoinedAt: sessionRecord.patientJoinedAt,
      therapistJoinedAt: sessionRecord.therapistJoinedAt,
      sessionStartedAt: sessionRecord.sessionStartedAt,
      route,
      triggerSource: "send",
    });
    logArrivalIntent(
      "send_path_entered",
      buildArrivalIntentLogPayload(sessionRecord, "send", false),
    );
    logChatLifecycleRecheck("send_path_entered", {
      routeSessionId: activeSessionId,
      loadedSessionId: sessionRecord.id,
      role: currentParticipantRole,
      wallet: effectiveWallet.toLowerCase(),
      statusBeforeSend: sessionRecord.status,
      patientJoinedAtBeforeSend: sessionRecord.patientJoinedAt,
      therapistJoinedAtBeforeSend: sessionRecord.therapistJoinedAt,
      sessionStartedAtBeforeSend: sessionRecord.sessionStartedAt,
      messageLength: trimmedDraft.length,
    });
    logChatLifecycle("handle_send_entered", {
      sessionId: activeSessionId,
      role: currentParticipantRole,
      wallet: effectiveWallet.toLowerCase(),
      statusBeforeSend: sessionRecord.status,
      patientJoinedAtBeforeSend: sessionRecord.patientJoinedAt,
      therapistJoinedAtBeforeSend: sessionRecord.therapistJoinedAt,
      sessionStartedAtBeforeSend: sessionRecord.sessionStartedAt,
      messageLength: trimmedDraft.length,
    });

    let latestSession: SessionRecord | null =
      await refreshLatestSessionRowForRecheck(client, "handle_send_initial_refresh");
    if (!latestSession) {
      latestSession = sessionRecord;
    }

    const shouldAttemptArrival =
      !isSessionStarted(latestSession) &&
      !hasCurrentParticipantCheckedIn(latestSession, currentParticipantRole);

    if (shouldAttemptArrival) {
      const arrivalResult = await attemptArrivalFromIntent(
        client,
        latestSession,
        "send",
      );
      latestSession = arrivalResult.latestSession;

      if (arrivalResult.blockedByPending) {
        setChatMessagesError(
          arrivalResult.errorMessage ??
            "Check-in is already pending in your wallet. Confirm or reject it before trying again.",
        );
        return;
      }

      if (!arrivalResult.arrivalConfirmed) {
        setChatMessagesError(
          arrivalResult.errorMessage ??
            "Unable to confirm your check-in right now. Please try again.",
        );
        return;
      }

      if (!isSessionStarted(latestSession)) {
        logArrivalIntent(
          "send_waiting_for_other_participant",
          buildArrivalIntentLogPayload(latestSession, "send", false),
        );
        setChatMessagesError(
          "You are checked in. Your message will be ready to send once the other participant arrives.",
        );
        return;
      }
    }

    const sendBlockedReason = getChatBlockedReason(
      latestSession,
      currentParticipantRole,
    );
    logChatLifecycle("handle_send_after_arrival", {
      didAttemptArrival: false,
      refreshedSessionStatus: latestSession?.status ?? null,
      refreshedPatientJoinedAt: latestSession?.patientJoinedAt ?? null,
      refreshedTherapistJoinedAt: latestSession?.therapistJoinedAt ?? null,
      refreshedSessionStartedAt: latestSession?.sessionStartedAt ?? null,
      canInsertMessage: !sendBlockedReason,
      blockedReason: sendBlockedReason,
    });
    logChatLifecycleRecheck("send_path_after_arrival", {
      routeSessionId: activeSessionId,
      loadedSessionId: latestSession?.id ?? null,
      didAttemptArrival: false,
      refreshedSessionStatus: latestSession?.status ?? null,
      refreshedPatientJoinedAt: latestSession?.patientJoinedAt ?? null,
      refreshedTherapistJoinedAt: latestSession?.therapistJoinedAt ?? null,
      refreshedSessionStartedAt: latestSession?.sessionStartedAt ?? null,
      canInsertMessage: !sendBlockedReason,
      blockedReason: sendBlockedReason,
    });

    if (sendBlockedReason) {
      logChatSendGate("insert_blocked_prestart", {
        sessionId: activeSessionId,
        role: currentParticipantRole,
        blockedReason: sendBlockedReason,
      });
      logArrivalAudit("send_blocked_not_started", {
        sessionId: latestSession?.id ?? sessionRecord.id,
        activeSessionId,
        status: latestSession?.status ?? sessionRecord.status,
        patientJoinedAt: latestSession?.patientJoinedAt ?? sessionRecord.patientJoinedAt,
        therapistJoinedAt:
          latestSession?.therapistJoinedAt ?? sessionRecord.therapistJoinedAt,
        sessionStartedAt:
          latestSession?.sessionStartedAt ?? sessionRecord.sessionStartedAt,
        route,
        triggerSource: "send",
      });
      logChatLifecycle("handle_send_blocked", {
        insertAllowed: false,
        blockedReason: sendBlockedReason,
      });
      logChatLifecycleRecheck("insert_blocked", {
        routeSessionId: activeSessionId,
        loadedSessionId: latestSession?.id ?? null,
        insertAllowed: false,
        blockedReason: sendBlockedReason,
      });
      setChatMessagesError(
        getPreStartSessionMessage(latestSession, currentParticipantRole),
      );
      return;
    }

    logArrivalIntent(
      "send_insert_allowed",
      buildArrivalIntentLogPayload(latestSession, "send", false),
    );
    logArrivalAudit("send_allowed_started", {
      sessionId: latestSession?.id ?? sessionRecord.id,
      activeSessionId,
      status: latestSession?.status ?? sessionRecord.status,
      patientJoinedAt: latestSession?.patientJoinedAt ?? sessionRecord.patientJoinedAt,
      therapistJoinedAt:
        latestSession?.therapistJoinedAt ?? sessionRecord.therapistJoinedAt,
      sessionStartedAt:
        latestSession?.sessionStartedAt ?? sessionRecord.sessionStartedAt,
      route,
      triggerSource: "send",
    });
    logChatSendGate("insert_allowed_started", {
      sessionId: activeSessionId,
      role: currentParticipantRole,
      loadedSessionId: latestSession?.id ?? null,
    });
    logChatLifecycle("handle_send_insert_allowed", {
      sessionId: activeSessionId,
      senderRole,
      senderWallet: effectiveWallet.toLowerCase(),
      insertAllowed: true,
    });
    logChatLifecycleRecheck("insert_allowed", {
      routeSessionId: activeSessionId,
      loadedSessionId: latestSession?.id ?? null,
      insertAllowed: true,
    });
    logChatLifecycleRecheck("insert_payload_session_id", {
      routeSessionId: activeSessionId,
      loadedSessionId: latestSession?.id ?? null,
      payloadSessionId: activeSessionId,
      senderRole,
      senderWallet: effectiveWallet.toLowerCase(),
    });

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

    setDraft("");
  };

  const handleStartVoiceCall = async () => {
    if (!supabase || !effectiveWallet || !sessionRecord || !activeSessionId) {
      setCallError("Session is not ready for voice controls.");
      return;
    }

    const route = "/chat";
    logArrivalAudit("voice_path_entered", {
      sessionId: sessionRecord.id,
      activeSessionId,
      status: sessionRecord.status,
      patientJoinedAt: sessionRecord.patientJoinedAt,
      therapistJoinedAt: sessionRecord.therapistJoinedAt,
      sessionStartedAt: sessionRecord.sessionStartedAt,
      route,
      triggerSource: "voice",
    });
    logArrivalIntent(
      "voice_path_entered",
      buildArrivalIntentLogPayload(sessionRecord, "voice", false),
    );
    logChatLifecycle("handle_start_voice_call_entered", {
      sessionId: activeSessionId,
      status: sessionRecord.status,
      patientJoinedAt: sessionRecord.patientJoinedAt,
      therapistJoinedAt: sessionRecord.therapistJoinedAt,
      sessionStartedAt: sessionRecord.sessionStartedAt,
    });
    logChatLifecycleRecheck("send_path_voice_entered", {
      routeSessionId: activeSessionId,
      loadedSessionId: sessionRecord.id,
      status: sessionRecord.status,
      patientJoinedAt: sessionRecord.patientJoinedAt,
      therapistJoinedAt: sessionRecord.therapistJoinedAt,
      sessionStartedAt: sessionRecord.sessionStartedAt,
    });

    if (!isFundedOrLiveSessionStatus(sessionRecord.status)) {
      logChatLifecycle("handle_start_voice_call_gate_evaluated", {
        voiceConnectAllowed: false,
        blockedReason: "session_not_funded_or_live",
      });
      setCallError("Voice controls unlock once the session is funded.");
      return;
    }

    try {
      setCallError("");
      let latestSession: SessionRecord | null =
        await refreshLatestSessionRowForRecheck(
          supabase,
          "handle_start_voice_call_initial_refresh",
      );
      if (!latestSession) {
        latestSession = sessionRecord;
      }

      const shouldAttemptArrival =
        !isSessionStarted(latestSession) &&
        !hasCurrentParticipantCheckedIn(latestSession, currentParticipantRole);

      if (shouldAttemptArrival) {
        const arrivalResult = await attemptArrivalFromIntent(
          supabase,
          latestSession,
          "voice",
        );
        latestSession = arrivalResult.latestSession;

        if (arrivalResult.blockedByPending) {
          setCallError(
            arrivalResult.errorMessage ??
              "Check-in is already pending in your wallet. Confirm or reject it before trying again.",
          );
          return;
        }

        if (!arrivalResult.arrivalConfirmed) {
          setCallError(
            arrivalResult.errorMessage ??
              "Unable to confirm your check-in right now. Please try again.",
          );
          return;
        }

        if (!isSessionStarted(latestSession)) {
          logArrivalIntent(
            "voice_waiting_for_other_participant",
            buildArrivalIntentLogPayload(latestSession, "voice", false),
          );
          setVoiceCallStatus("idle");
          setCallError(
            "You are checked in. Voice will unlock once the other participant arrives.",
          );
          return;
        }
      }

      const voiceBlockedReason = getChatBlockedReason(
        latestSession,
        currentParticipantRole,
      );
      if (voiceBlockedReason) {
        logArrivalAudit("voice_blocked_not_started", {
          sessionId: latestSession?.id ?? sessionRecord.id,
          activeSessionId,
          status: latestSession?.status ?? sessionRecord.status,
          patientJoinedAt: latestSession?.patientJoinedAt ?? sessionRecord.patientJoinedAt,
          therapistJoinedAt:
            latestSession?.therapistJoinedAt ?? sessionRecord.therapistJoinedAt,
          sessionStartedAt:
            latestSession?.sessionStartedAt ?? sessionRecord.sessionStartedAt,
          route,
          triggerSource: "voice",
        });
        logChatLifecycleRecheck("voice_connect_blocked", {
          routeSessionId: activeSessionId,
          loadedSessionId: latestSession?.id ?? null,
          voiceConnectAllowed: false,
          blockedReason: voiceBlockedReason,
        });
        logChatLifecycle("handle_start_voice_call_gate_evaluated", {
          voiceConnectAllowed: false,
          blockedReason: voiceBlockedReason,
        });
        setVoiceCallStatus("idle");
        setCallError(
          getPreStartSessionMessage(latestSession, currentParticipantRole),
        );
        return;
      }

      logArrivalIntent(
        "voice_connect_allowed",
        buildArrivalIntentLogPayload(latestSession, "voice", false),
      );
      logArrivalAudit("voice_allowed_started", {
        sessionId: latestSession?.id ?? sessionRecord.id,
        activeSessionId,
        status: latestSession?.status ?? sessionRecord.status,
        patientJoinedAt: latestSession?.patientJoinedAt ?? sessionRecord.patientJoinedAt,
        therapistJoinedAt:
          latestSession?.therapistJoinedAt ?? sessionRecord.therapistJoinedAt,
        sessionStartedAt:
          latestSession?.sessionStartedAt ?? sessionRecord.sessionStartedAt,
        route,
        triggerSource: "voice",
      });
      logChatLifecycleRecheck("voice_connect_allowed", {
        routeSessionId: activeSessionId,
        loadedSessionId: latestSession?.id ?? null,
        voiceConnectAllowed: true,
        allowedReason: "session_started_verified",
      });
      logChatLifecycle("handle_start_voice_call_gate_evaluated", {
        voiceConnectAllowed: true,
        allowedReason: "session_started_verified",
      });
      await startLocalAudio();
      setVoiceCallStatus("connected");
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

  const refreshLatestSessionRow = async (client: NonNullable<typeof supabase>) => {
    if (!activeSessionId) {
      return null;
    }

    const { data, error } = await client
      .from("sessions")
      .select("*")
      .eq("id", activeSessionId)
      .maybeSingle();

    if (error) {
      console.error("Failed to refresh latest chat session", error);
      return null;
    }

    return syncLatestSessionState(
      data as Record<string, unknown> | null,
      "refresh_latest_session_row",
    );
  };

  const refreshLatestSessionRowForRecheck = async (
    client: NonNullable<typeof supabase>,
    source: string,
  ) => {
    const latestSession = await refreshLatestSessionRow(client);
    logChatLifecycleRecheck("refreshed_session_snapshot", {
      source,
      routeSessionId: activeSessionId,
      loadedSessionId: latestSession?.id ?? null,
      status: latestSession?.status ?? null,
      patientJoinedAt: latestSession?.patientJoinedAt ?? null,
      therapistJoinedAt: latestSession?.therapistJoinedAt ?? null,
      sessionStartedAt: latestSession?.sessionStartedAt ?? null,
      noShowDeadlineAt: latestSession?.noShowDeadlineAt ?? null,
    });
    return latestSession;
  };

  const buildArrivalIntentLogPayload = (
    session: SessionRecord | null,
    triggerSource: "send" | "voice",
    willAttemptArrival: boolean,
  ) => ({
    sessionId: session?.id ?? activeSessionId,
    activeSessionId,
    status: session?.status ?? null,
    patientJoinedAt: session?.patientJoinedAt ?? null,
    therapistJoinedAt: session?.therapistJoinedAt ?? null,
    sessionStartedAt: session?.sessionStartedAt ?? null,
    triggerSource,
    currentParticipantRole,
    willAttemptArrival,
  });

  const buildSessionEndArrivalAuditPayload = (
    session: SessionRecord | null,
    handlerName:
      | "handleRequestSessionEnd"
      | "handleDeclineSessionEndRequest"
      | "handleAcceptSessionEndRequest",
  ) => ({
    sessionId: session?.id ?? activeSessionId,
    activeSessionId,
    status: session?.status ?? null,
    patientJoinedAt: session?.patientJoinedAt ?? null,
    therapistJoinedAt: session?.therapistJoinedAt ?? null,
    sessionStartedAt: session?.sessionStartedAt ?? null,
    route: "/chat",
    handlerName,
  });

  const applySessionRecord = (
    nextSession: SessionRecord,
    triggerSource: string,
  ) => {
    setSessionRecord((current) => {
      if (
        current &&
        current.status !== nextSession.status &&
        nextSession.status === "in_session"
      ) {
        logChatLifecycleRecheck("session_transition_detected", {
          previousStatus: current.status,
          nextStatus: nextSession.status,
          patientJoinedAt: nextSession.patientJoinedAt,
          therapistJoinedAt: nextSession.therapistJoinedAt,
          sessionStartedAt: nextSession.sessionStartedAt,
          triggerSource,
        });
        logChatLifecycle("session_transition_detected", {
          previousStatus: current.status,
          nextStatus: nextSession.status,
          patientJoinedAt: nextSession.patientJoinedAt,
          therapistJoinedAt: nextSession.therapistJoinedAt,
          sessionStartedAt: nextSession.sessionStartedAt,
          triggerSource,
        });
      }

      return nextSession;
    });
    return nextSession;
  };

  const syncLatestSessionState = (
    row: Record<string, unknown> | null,
    triggerSource = "session_sync",
  ) => {
    if (!row || !activeSessionId) {
      return null;
    }

    const latestSession = normalizeSessionRecord(row, activeSessionId);
    return applySessionRecord(latestSession, triggerSource);
  };

  const attemptArrivalFromIntent = async (
    client: NonNullable<typeof supabase>,
    latestSession: SessionRecord,
    triggerSource: "send" | "voice",
  ) => {
    if (arrivalIntentInFlightRef.current) {
      return {
        latestSession,
        arrivalAttempted: false,
        arrivalConfirmed: false,
        blockedByPending: true,
        errorMessage:
          "Check-in is already pending in your wallet. Confirm or reject it before trying again.",
      };
    }

    arrivalIntentInFlightRef.current = true;
    setPendingArrivalTrigger(triggerSource);
    logArrivalIntent(
      triggerSource === "send" ? "send_arrival_started" : "voice_arrival_started",
      buildArrivalIntentLogPayload(latestSession, triggerSource, true),
    );

    try {
      await recordCurrentParticipantArrival(client, latestSession, {
        throwOnFailure: true,
      });

      const refreshedSession =
        (await refreshLatestSessionRowForRecheck(
          client,
          `${triggerSource}_arrival_intent_refresh`,
        )) ?? latestSession;
      const currentParticipantJoined = hasCurrentParticipantCheckedIn(
        refreshedSession,
        currentParticipantRole,
      );

      if (currentParticipantJoined) {
        logArrivalIntent(
          triggerSource === "send"
            ? "send_arrival_succeeded"
            : "voice_arrival_succeeded",
          buildArrivalIntentLogPayload(refreshedSession, triggerSource, false),
        );
        return {
          latestSession: refreshedSession,
          arrivalAttempted: true,
          arrivalConfirmed: true,
          blockedByPending: false,
          errorMessage: null,
        };
      }

      logArrivalIntent(
        triggerSource === "send" ? "send_arrival_failed" : "voice_arrival_failed",
        {
          ...buildArrivalIntentLogPayload(refreshedSession, triggerSource, false),
          reason: "arrival_not_persisted",
        },
      );
      return {
        latestSession: refreshedSession,
        arrivalAttempted: true,
        arrivalConfirmed: false,
        blockedByPending: false,
        errorMessage:
          "Check-in was not confirmed. Your draft is still saved. Please try again.",
      };
    } catch (error) {
      logArrivalIntent(
        triggerSource === "send" ? "send_arrival_failed" : "voice_arrival_failed",
        {
          ...buildArrivalIntentLogPayload(latestSession, triggerSource, false),
          reason:
            error instanceof Error ? error.message : "arrival_check_in_failed",
        },
      );
      return {
        latestSession,
        arrivalAttempted: true,
        arrivalConfirmed: false,
        blockedByPending: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unable to confirm your check-in right now. Please try again.",
      };
    } finally {
      arrivalIntentInFlightRef.current = false;
      setPendingArrivalTrigger(null);
    }
  };

  const getEscrowSessionContext = (session: SessionRecord) => {
    if (!effectiveWallet || accountStatus !== "connected" || !address) {
      throw new Error("Connect your wallet before ending the session.");
    }

    if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
      throw new Error("Switch to Sepolia before ending the session.");
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      throw new Error(
        "The MindPass escrow contract is not configured in this app.",
      );
    }

    if (!session.onchainSessionId) {
      throw new Error("This session is missing an on-chain session id.");
    }

    let onchainSessionId: bigint;
    try {
      onchainSessionId = BigInt(session.onchainSessionId);
    } catch {
      throw new Error("This session has an invalid on-chain session id.");
    }

    return {
      contractAddress,
      onchainSessionId,
    };
  };

  const runEscrowWrite = async (
    request:
      | ReturnType<typeof prepareRequestSessionEnd>
      | ReturnType<typeof prepareConfirmSessionEnd>,
  ) => {
    let hash: `0x${string}`;
    logEscrowDebug("submitting session-end escrow write", {
      source: "chat",
      sessionId: activeSessionId,
      onchainSessionId: request.args[0]?.toString?.() ?? null,
      functionName: request.functionName,
    });

    if (request.functionName === "requestSessionEnd") {
      hash = await writeContract(wagmiConfig, {
        address: request.address,
        abi: request.abi,
        functionName: "requestSessionEnd",
        args: request.args,
        chainId: request.chainId,
      });
    } else if (request.functionName === "confirmSessionEnd") {
      hash = await writeContract(wagmiConfig, {
        address: request.address,
        abi: request.abi,
        functionName: "confirmSessionEnd",
        args: request.args,
        chainId: request.chainId,
      });
    } else {
      throw new Error("Unsupported session end contract call.");
    }

    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      hash,
    });
    logReceiptDecode({
      context: "chat session-end receipt decoded",
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs,
    });
    return receipt;
  };

  const getEscrowWriteErrorMessage = (
    action: "request" | "confirm",
    error: unknown,
  ) => {
    const fallback =
      action === "request"
        ? "Unable to send the end-session request on-chain. Please try again."
        : "Unable to confirm the end-session request on-chain. Please try again.";

    if (!(error instanceof Error)) {
      return fallback;
    }

    const message = error.message.toLowerCase();
    if (
      message.includes("user rejected") ||
      message.includes("user denied") ||
      message.includes("rejected the request") ||
      message.includes("4001")
    ) {
      return action === "request"
        ? "Wallet signing was cancelled. The session is still live."
        : "Wallet signing was cancelled. The session is still live.";
    }

    return error.message || fallback;
  };

  const recordCurrentParticipantArrival = async (
    client: NonNullable<typeof supabase>,
    sourceSession: SessionRecord | null = sessionRecord,
    options?: {
      throwOnFailure?: boolean;
    },
  ) => {
    if (!activeSessionId || !sourceSession || !currentParticipantWallet) {
      return sourceSession;
    }

    if (!canRecordArrivalInteraction(sourceSession)) {
      return sourceSession;
    }

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

    if (!address || accountStatus !== "connected" || !effectiveWallet) {
      return sourceSession;
    }

    if (address.toLowerCase() !== currentParticipantWallet.toLowerCase()) {
      return sourceSession;
    }

    if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
      return sourceSession;
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress || !sourceSession.onchainSessionId) {
      return sourceSession;
    }

    let onchainSessionId: bigint;
    try {
      onchainSessionId = BigInt(sourceSession.onchainSessionId);
    } catch {
      return sourceSession;
    }

    const request =
      currentParticipantRole === "therapist"
        ? prepareCheckInAsTherapist({
            address: contractAddress,
            sessionId: onchainSessionId,
          })
        : prepareCheckInAsPatient({
            address: contractAddress,
            sessionId: onchainSessionId,
          });

    let hash: `0x${string}`;
    try {
      logEscrowDebug("submitting session check-in", {
        source: "chat",
        sessionId: activeSessionId,
        onchainSessionId: sourceSession.onchainSessionId,
        functionName: request.functionName,
      });
      if (request.functionName === "checkInAsTherapist") {
        hash = await writeContract(wagmiConfig, {
          address: request.address,
          abi: request.abi,
          functionName: "checkInAsTherapist",
          args: request.args,
          chainId: request.chainId,
        });
      } else {
        hash = await writeContract(wagmiConfig, {
          address: request.address,
          abi: request.abi,
          functionName: "checkInAsPatient",
          args: request.args,
          chainId: request.chainId,
        });
      }
    } catch (error) {
      console.error("Failed to submit session check-in", error);
      if (options?.throwOnFailure) {
        throw error instanceof Error
          ? error
          : new Error("Unable to submit session check-in.");
      }
      return sourceSession;
    }

    let receipt;
    try {
      receipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        hash,
      });
      logReceiptDecode({
        context: "chat check-in receipt decoded",
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      });
    } catch (error) {
      console.error("Failed to confirm session check-in", error);
      if (options?.throwOnFailure) {
        throw error instanceof Error
          ? error
          : new Error("Unable to confirm session check-in.");
      }
      return sourceSession;
    }

    const checkedInEvent = findMindPassEscrowEvent(
      receipt.logs,
      currentParticipantRole === "therapist"
        ? "TherapistCheckedIn"
        : "PatientCheckedIn",
    );
    const sessionStartedEvent = findMindPassEscrowEvent(
      receipt.logs,
      "SessionStarted",
    );
    logCheckinMirrorFix("receipt_decoded_events", {
      sessionId: activeSessionId,
      onchainSessionId: sourceSession.onchainSessionId,
      statusBefore: sourceSession.status,
      currentParticipantRole,
      checkedInEventFound: Boolean(checkedInEvent),
      sessionStartedEventFound: Boolean(sessionStartedEvent),
      txHash: receipt.transactionHash,
    });

    if (!checkedInEvent) {
      console.error("Check-in transaction succeeded without a check-in event");
      if (options?.throwOnFailure) {
        throw new Error(
          "Check-in transaction succeeded, but the check-in event was missing.",
        );
      }
      return sourceSession;
    }

    const updatePatch = {
      ...(currentParticipantRole === "therapist"
        ? buildTherapistCheckedInPatch({
            checkedInAt: checkedInEvent.args.checkedInAt,
            contractAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          })
        : buildPatientCheckedInPatch({
            checkedInAt: checkedInEvent.args.checkedInAt,
            contractAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          })),
      ...(sessionStartedEvent
        ? buildSessionStartedPatch({
            sessionStartedAt: sessionStartedEvent.args.sessionStartedAt,
            contractAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          })
        : {}),
    };

    const applyCheckInMirrorPatch = async (
      patch: Record<string, unknown>,
      source: "receipt_patch" | "chain_fallback_patch",
      useStatusFilter: boolean,
    ) => {
      let query = client
        .from("sessions")
        .update(patch)
        .eq("id", activeSessionId)
        .eq("onchain_session_id", sourceSession.onchainSessionId);

      if (useStatusFilter) {
        query = query.in("status", ["funded", "in_session"]);
      }

      logCheckinMirrorFix("final_patch_applied", {
        sessionId: activeSessionId,
        onchainSessionId: sourceSession.onchainSessionId,
        statusBefore: sourceSession.status,
        source,
        useStatusFilter,
        patchKeys: Object.keys(patch),
        txHash: receipt.transactionHash,
      });

      const { data, error } = await query.select("*").maybeSingle();
      if (error) {
        logCheckinMirrorFix("supabase_update_failure", {
          sessionId: activeSessionId,
          onchainSessionId: sourceSession.onchainSessionId,
          statusBefore: sourceSession.status,
          source,
          txHash: receipt.transactionHash,
          message: error.message,
        });
      } else {
        logCheckinMirrorFix("supabase_update_success", {
          sessionId: activeSessionId,
          onchainSessionId: sourceSession.onchainSessionId,
          statusBefore: sourceSession.status,
          statusAfter:
            data && typeof data === "object" && "status" in data
              ? String(data.status ?? "")
              : null,
          source,
          txHash: receipt.transactionHash,
          matchedRow: Boolean(data),
        });
      }

      return { data, error };
    };

    const buildFallbackPatchFromChainSession = (
      chainSession: ReturnType<typeof normalizeMindPassEscrowSession>,
    ) => {
      const fallbackPatch: Record<string, unknown> = {
        ...(chainSession.patientJoinedAt > 0n
          ? {
              patient_joined_at:
                unixSecondsToIsoString(chainSession.patientJoinedAt) ?? undefined,
            }
          : {}),
        ...(chainSession.therapistJoinedAt > 0n
          ? {
              therapist_joined_at:
                unixSecondsToIsoString(chainSession.therapistJoinedAt) ?? undefined,
            }
          : {}),
        ...(currentParticipantRole === "therapist"
          ? buildTherapistCheckedInPatch({
              checkedInAt: chainSession.therapistJoinedAt,
              contractAddress,
              chainId: MINDPASS_ESCROW_CHAIN_ID,
              txHash: receipt.transactionHash,
              blockNumber: receipt.blockNumber,
            })
          : buildPatientCheckedInPatch({
              checkedInAt: chainSession.patientJoinedAt,
              contractAddress,
              chainId: MINDPASS_ESCROW_CHAIN_ID,
              txHash: receipt.transactionHash,
              blockNumber: receipt.blockNumber,
            })),
        ...(chainSession.sessionStartedAt > 0n
          ? buildSessionStartedPatch({
              sessionStartedAt: chainSession.sessionStartedAt,
              contractAddress,
              chainId: MINDPASS_ESCROW_CHAIN_ID,
              txHash: receipt.transactionHash,
              blockNumber: receipt.blockNumber,
            })
          : {}),
      };

      return fallbackPatch;
    };

    const recoverCheckInMirrorFromChain = async (reason: string) => {
      const chainSession = normalizeMindPassEscrowSession(
        (await readContract(wagmiConfig, {
          address: contractAddress,
          abi: MINDPASS_ESCROW_ABI,
          functionName: "sessions",
          args: [onchainSessionId],
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        })) as readonly unknown[],
      );

      logCheckinMirrorFix("fallback_chain_session_read", {
        sessionId: activeSessionId,
        onchainSessionId: sourceSession.onchainSessionId,
        statusBefore: sourceSession.status,
        chainStatus: chainSession.status,
        patientJoinedAt: chainSession.patientJoinedAt.toString(),
        therapistJoinedAt: chainSession.therapistJoinedAt.toString(),
        sessionStartedAt: chainSession.sessionStartedAt.toString(),
        txHash: receipt.transactionHash,
        reason,
      });

      const fallbackPatch = buildFallbackPatchFromChainSession(chainSession);
      return applyCheckInMirrorPatch(
        fallbackPatch,
        "chain_fallback_patch",
        false,
      );
    };

    let { data, error } = await applyCheckInMirrorPatch(
      updatePatch,
      "receipt_patch",
      true,
    );

    if (error) {
      logMirrorSyncError("chat check-in mirror sync failed", {
        sessionId: activeSessionId,
        onchainSessionId: sourceSession.onchainSessionId,
        txHash: receipt.transactionHash,
        message: error.message,
      });
      const fallbackResult = await recoverCheckInMirrorFromChain(
        "initial_supabase_update_failed",
      );
      data = fallbackResult.data;
      error = fallbackResult.error;
      if (error) {
        return sourceSession;
      }
    }

    if (!data) {
      const fallbackResult = await recoverCheckInMirrorFromChain(
        "initial_supabase_update_matched_no_row",
      );
      data = fallbackResult.data;
      if (!data) {
        return sourceSession;
      }
    }

    let nextSession = normalizeSessionRecord(
      data as Record<string, unknown>,
      activeSessionId,
    );

    if (
      nextSession.status === "funded" &&
      !sessionStartedEvent
    ) {
      const fallbackResult = await recoverCheckInMirrorFromChain(
        "receipt_missing_session_started_event_or_db_still_funded",
      );

      if (fallbackResult.data) {
        nextSession = normalizeSessionRecord(
          fallbackResult.data as Record<string, unknown>,
          activeSessionId,
        );
      }
    }

    logMirrorSync("chat check-in mirror sync complete", {
      sessionId: activeSessionId,
      onchainSessionId: sourceSession.onchainSessionId,
      txHash: receipt.transactionHash,
      status: nextSession.status,
    });
    return applySessionRecord(nextSession, "record_current_participant_arrival");
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

  const syncCompletedSessionFromChain = async (
    client: NonNullable<typeof supabase>,
    contractAddress: HexAddress,
    txHash: `0x${string}`,
    blockNumber: bigint,
    completionValues: CompletedSessionSyncValues | null,
    setErrorMessage: (message: string) => void,
  ) => {
    if (!activeSessionId) {
      return false;
    }

    if (!completionValues) {
      logEscrowDebug("SessionCompleted event missing from confirmSessionEnd receipt", {
        sessionId: activeSessionId,
        txHash,
      });
    }

    const completionPatch = buildSessionCompletedPatch({
      therapistPayoutWei:
        completionValues?.therapistPayoutWei ?? NORMAL_THERAPIST_PAYOUT_WEI,
      protocolFeeWei:
        completionValues?.protocolFeeWei ?? NORMAL_PROTOCOL_FEE_WEI,
      completedAt:
        completionValues?.completedAt ?? BigInt(Math.floor(Date.now() / 1000)),
      contractAddress,
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      txHash,
      blockNumber,
    });

    const { data, error } = await client
      .from("sessions")
      .update(completionPatch)
      .eq("id", activeSessionId)
      .eq("status", "in_session")
      .eq("settlement_status", "held_in_escrow")
      .not("session_started_at", "is", null)
      .select("*")
      .maybeSingle();

    if (error) {
      logMirrorSyncError("chat completion mirror sync failed", {
        sessionId: activeSessionId,
        txHash,
        message: error.message,
      });
      setErrorMessage(
        "The on-chain session end succeeded, but the session record could not be synced. Please refresh.",
      );
      await refreshLatestSessionRow(client);
      return false;
    }

    if (!data) {
      setErrorMessage(
        "The on-chain session end succeeded, but the session record could not be synced. Please refresh.",
      );
      await refreshLatestSessionRow(client);
      return false;
    }

    stopLocalAudio();
    setVoiceCallStatus("idle");
    logMirrorSync("chat completion mirror sync complete", {
      sessionId: activeSessionId,
      txHash,
      status: "completed",
    });
    applySessionRecord(
      normalizeSessionRecord(data as Record<string, unknown>, activeSessionId),
      "completion_sync",
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
        "verify_latest_session_before_end_request",
      );
      logSessionEndArrivalAudit(
        "session_end_request_entered",
        buildSessionEndArrivalAuditPayload(
          latestSession,
          "handleRequestSessionEnd",
        ),
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

      let escrowSessionContext;
      try {
        escrowSessionContext = getEscrowSessionContext(latestSession);
      } catch (error) {
        setCompletionModalError(
          error instanceof Error
            ? error.message
            : "Unable to prepare the on-chain end request.",
        );
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

      await runEscrowWrite(
        prepareRequestSessionEnd({
          address: escrowSessionContext.contractAddress,
          sessionId: escrowSessionContext.onchainSessionId,
        }),
      );

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
        console.error(
          "Failed to sync session end request after on-chain request",
          error,
        );

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
          "The on-chain end request succeeded, but the request record could not be synced. Please refresh.",
        );
        await refreshLatestSessionRow(client);
        return;
      }

      if (data) {
        logSessionEndArrivalAudit(
          "session_end_request_arrival_removed",
          buildSessionEndArrivalAuditPayload(
            latestSession,
            "handleRequestSessionEnd",
          ),
        );
        await refreshLatestSessionRow(client);
        setSessionEndRequest(
          normalizeSessionEndRequestRow(data as Record<string, unknown>),
        );
      }

      resetCompletionModal();
    } catch (error) {
      console.error("Failed to request session end on-chain", error);
      setCompletionModalError(getEscrowWriteErrorMessage("request", error));
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
      logSessionEndArrivalAudit(
        "session_end_decline_entered",
        buildSessionEndArrivalAuditPayload(
          sessionRecord,
          "handleDeclineSessionEndRequest",
        ),
      );
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

      logSessionEndArrivalAudit(
        "session_end_decline_arrival_removed",
        buildSessionEndArrivalAuditPayload(
          sessionRecord,
          "handleDeclineSessionEndRequest",
        ),
      );
      await refreshLatestSessionRow(client);
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
      const { data: latestRow, error: latestError } = await client
        .from("sessions")
        .select("*")
        .eq("id", activeSessionId)
        .maybeSingle();

      if (latestError) {
        console.error("Failed to verify latest session before accept", latestError);
        setCompletionModalError(
          "Unable to verify the latest session state. Please try again.",
        );
        return;
      }

      const latestSession = syncLatestSessionState(
        latestRow as Record<string, unknown> | null,
        "verify_latest_session_before_accept",
      );
      logSessionEndArrivalAudit(
        "session_end_accept_entered",
        buildSessionEndArrivalAuditPayload(
          latestSession,
          "handleAcceptSessionEndRequest",
        ),
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

      const { data: pendingRow, error: pendingError } = await client
        .from("session_end_requests")
        .select("*")
        .eq("id", pendingSessionEndRequest.id)
        .eq("status", "pending")
        .maybeSingle();

      if (pendingError) {
        console.error("Failed to verify pending session end request", pendingError);
        setCompletionModalError(
          "Unable to verify the current end-session state. Please try again.",
        );
        return;
      }

      if (!pendingRow) {
        setCompletionModalError("This end-session request is no longer pending.");
        setSessionEndRequestRefreshNonce((current) => current + 1);
        return;
      }

      let escrowSessionContext;
      try {
        escrowSessionContext = getEscrowSessionContext(latestSession);
      } catch (error) {
        setCompletionModalError(
          error instanceof Error
            ? error.message
            : "Unable to prepare the on-chain confirmation.",
        );
        return;
      }

      const receipt = await runEscrowWrite(
        prepareConfirmSessionEnd({
          address: escrowSessionContext.contractAddress,
          sessionId: escrowSessionContext.onchainSessionId,
        }),
      );

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
        console.error(
          "Failed to sync accepted session end request after on-chain confirm",
          error,
        );
        setCompletionModalError(
          "The on-chain session end succeeded, but the end request record could not be synced. Please refresh.",
        );
        await refreshLatestSessionRow(client);
        return;
      }

      if (!data) {
        setCompletionModalError(
          "The on-chain session end succeeded, but the end request record could not be synced. Please refresh.",
        );
        await refreshLatestSessionRow(client);
        setSessionEndRequestRefreshNonce((current) => current + 1);
        return;
      }

      const acceptedRequest = normalizeSessionEndRequestRow(
        data as Record<string, unknown>,
      );
      const completionEvent = findMindPassEscrowEvent(
        receipt.logs,
        "SessionCompleted",
      );
      const completionValues = completionEvent
        ? {
            therapistPayoutWei: completionEvent.args.therapistPayoutWei,
            protocolFeeWei: completionEvent.args.protocolFeeWei,
            completedAt: completionEvent.args.completedAt,
          }
        : null;
      logSessionEndArrivalAudit(
        "session_end_accept_arrival_removed",
        buildSessionEndArrivalAuditPayload(
          latestSession,
          "handleAcceptSessionEndRequest",
        ),
      );
      await refreshLatestSessionRow(client);
      setSessionEndRequest(acceptedRequest);
      const didSyncSession = await syncCompletedSessionFromChain(
        client,
        escrowSessionContext.contractAddress,
        receipt.transactionHash,
        receipt.blockNumber,
        completionValues,
        setSessionEndRequestError,
      );

      if (!didSyncSession) {
        return;
      }
    } catch (error) {
      console.error("Failed to confirm session end on-chain", error);
      setCompletionModalError(getEscrowWriteErrorMessage("confirm", error));
    } finally {
      setIsCompletionSubmitting(false);
    }
  };

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
    <main className="app-shell-subtle page-canvas page-canvas-violet relative h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-6 py-6 md:px-8">
        <div className="pointer-events-none absolute inset-x-6 top-6 z-10 md:inset-x-8">
          <header className="pointer-events-auto liquid-glass-floating chat-composer-surface flex flex-none items-center justify-between gap-4 rounded-full px-5 py-3 sm:px-6">
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
              <div className="rounded-full bg-black/5 px-3 py-1 text-right dark:bg-white/10">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {countdownLabel}
                </p>
                <p className="font-mono text-sm text-[var(--text-secondary)]">
                  {countdownValue}
                </p>
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

        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto min-h-0 pb-28 pt-[5.5rem] md:pb-32">
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
            {overdueResolutionError ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft max-w-2xl rounded-full px-5 py-3 text-center text-sm text-red-600 dark:text-red-300">
                  {overdueResolutionError}
                </div>
              </div>
            ) : null}
            {!chatSessionStarted && sessionRecord?.status === "funded" ? (
              <div className="flex justify-center">
                <div className="glass-chip max-w-3xl rounded-[28px] px-5 py-4 text-center text-sm text-[var(--text-secondary)]">
                  {preStartSessionMessage}
                  {!currentParticipantJoinedAt ? (
                    <span className="block pt-2 text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Your first message or first call attempt counts as check-in.
                    </span>
                  ) : null}
                  {currentParticipantJoinedAt && !otherParticipantJoinedAt ? (
                    <span className="block pt-2 text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Waiting for the other participant before the live session starts.
                    </span>
                  ) : null}
                  {isPendingArrival ? (
                    <span className="block pt-2 text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      Confirm the wallet request to finish check-in.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {overdueResolutionKind ? (
              <div className="flex justify-center">
                <div className="liquid-glass-soft flex max-w-3xl flex-col items-center gap-3 rounded-[28px] px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {overdueResolutionKind === "payment_timeout"
                      ? "The payment deadline has passed. Resolve the timeout on-chain to sync the final escrow outcome."
                      : "The no-show deadline has passed. Resolve the no-show outcome on-chain to sync the final settlement."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleResolveOverdueSession()}
                    disabled={isResolvingOverdueSession}
                    className="button-primary rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResolvingOverdueSession
                      ? "Resolving..."
                      : overdueResolutionKind === "payment_timeout"
                        ? "Resolve Timeout"
                        : "Resolve No-Show"}
                  </button>
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
            {visibleMessages.map((message) => {
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
            <div className="mx-auto w-full">
              <form
                onSubmit={handleSend}
                className="pointer-events-auto liquid-glass-floating chat-composer-surface flex items-center gap-3 rounded-full px-4 py-3 sm:px-5"
              >
                <button
                  type="button"
                  className="control-secondary inline-flex h-11 w-11 items-center justify-center rounded-full"
                  aria-label="Send anonymized record"
                >
                  <AttachmentIcon />
                </button>
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={isComposerBlockedWaitingForOtherParticipant}
                  placeholder={
                    chatSessionStarted
                      ? "Send a protected message..."
                      : isPendingArrival
                        ? "Confirm the wallet request to finish check-in..."
                      : isComposerBlockedWaitingForOtherParticipant
                        ? "You are already checked in. Wait for the other participant before chat unlocks."
                        : "Your first message attempt counts as check-in."
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={
                    !draft.trim() ||
                    isComposerBlockedWaitingForOtherParticipant ||
                    isPendingArrival
                  }
                  className="button-primary inline-flex h-11 w-11 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-55"
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              </form>
            </div>
          </div>
        </div>
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
