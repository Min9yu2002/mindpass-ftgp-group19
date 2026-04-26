"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import { formatEther, hexToString, parseEther, type Hex } from "viem";
import { useAccount, useBalance, useChainId, useConfig, useDisconnect } from "wagmi";
import BookingFundingModal from "../../components/BookingFundingModal";
import GlassCard from "../../components/GlassCard";
import PatientPaymentModal from "../../components/PatientPaymentModal";
import PendingBookingStatusCard from "../../components/PendingBookingStatusCard";
import QuickActionCard from "../../components/QuickActionCard";
import SessionEndRequestNotificationsPanel from "../../components/SessionEndRequestNotificationsPanel";
import SessionOutcomeNoticeModal from "../../components/SessionOutcomeNoticeModal";
import SectionHeading from "../../components/SectionHeading";
import SessionReadyModal from "../../components/SessionReadyModal";
import StatusBadge from "../../components/StatusBadge";
import SupportRequestModal from "../../components/SupportRequestModal";
import SummaryCard from "../../components/SummaryCard";
import {
  type FundingSource,
  getSettlementPreview,
  getPaymentWindowRemainingSeconds,
  isPaymentWindowExpiredAt,
  NO_SHOW_WINDOW_LABEL,
  PAYMENT_WINDOW_LABEL,
  resolveFundingChoice,
  resolveFunding,
  SESSION_FEE_ETH,
  type FundingResolution,
} from "../../lib/booking";
import { formatSessionMode } from "../../lib/session-formatting";
import { usePageSessionGuard } from "../../lib/session-guard";
import { needsSubsidyFunding, needsWalletFunding } from "../../lib/subsidy-funding";
import {
  buildBookingFeedback,
  getTerminalSessionOutcome,
  isDeadlineOutcomeStatus,
  type DeadlineOutcomeStatus,
  getBookingStatusTone,
  type BookingFeedbackView,
} from "../../lib/session-outcome";
import {
  buildBookingAcceptedPatch,
  buildBookingRequestedPatch,
  buildPatientFundingPatch,
  buildSessionFundedPatch,
  buildWithdrawalPatch,
  compactSessionSyncPatch,
  normalizeOnchainSessionId,
} from "../../lib/onchain-session-mapping";
import {
  clearPendingBookingTxHash,
  getPendingBookingTxHash,
  isPendingReceiptLookupError,
  storePendingBookingTxHash,
  trySyncBookingByTxHash,
} from "../../lib/booking-receipt";
import {
  acknowledgeDeadlineOutcome,
  buildDeadlineOutcomeAckKey,
  isDeadlineOutcomeAcknowledged,
} from "../../lib/session-outcome-ack";
import {
  OPEN_SESSION_STATUSES,
  TERMINAL_SESSION_STATUSES,
  isAcceptedAwaitingPaymentStatus,
  isFundedSessionStatus,
  isFundedOrLiveSessionStatus,
  isOpenBookingStatus,
  normalizeSessionMode,
  normalizeSessionStatus,
  type SessionMode,
  type SessionWorkflowStatus,
} from "../../lib/session-status";
import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../../lib/therapist-display";
import {
  buildSessionEndRequestChatHref,
  useSessionEndRequestNotifications,
} from "../../lib/session-end-request-notifications";
import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
  MINDPASS_ESCROW_STATUS,
  normalizeMindPassEscrowSession,
  prepareCreateBookingRequest,
  prepareFundPatientPortion,
  prepareResolveNoShow,
  prepareResolvePaymentTimeout,
  prepareWithdraw,
  type HexAddress,
} from "../../lib/mindpassEscrow";
import {
  logEscrowDebug,
  logMirrorSync,
  logMirrorSyncError,
  logReceiptDecode,
} from "../../lib/escrow-debug";
import {
  buildResolutionPatchFromEvent,
  buildResolutionPatchFromChainSession,
  type EscrowResolutionEventInput,
  getEscrowResolutionKind,
  isTerminalEscrowResolutionStatus,
} from "../../lib/escrow-resolution";
import { supabase } from "../../lib/supabase";
import type { Therapist } from "../../lib/mock-therapists";

type SummaryTone = "neutral" | "success" | "warning" | "brand";

type DashboardSummaryCard = {
  label: string;
  value: string;
  detail: string;
  badge: string;
  tone: SummaryTone;
};

type PatientProfile = {
  walletAddress: string;
  totalDeposits: number;
  subsidyBalance: number;
};

type ActivityItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  timeLabel: string;
};

type TherapistWaitState = {
  isBusy: boolean;
  estimatedReadyAt: string | null;
};

type TherapistCardUiState = {
  availabilityLabel: string;
  detailMessage: string;
  actionLabel: string;
  actionKind: "book" | "join_wait_queue" | "leave_queue" | "locked";
  actionDisabled: boolean;
};

type BookingFeedbackContext = {
  sessionId: string;
  status: SessionWorkflowStatus;
  updatedAt: string | null;
};

type OpenSessionRecord = {
  id: string;
  onchainSessionId: string | null;
  patientWallet: string;
  therapistWallet: string;
  status: SessionWorkflowStatus;
  sessionMode: SessionMode;
  sessionFeeEth: number;
  fundingSource: "subsidy" | "mixed" | "wallet";
  subsidyAppliedEth: number;
  subsidyFundedEth: number;
  walletRequiredEth: number;
  walletFundedEth: number;
  patientWalletChoiceEth: number;
  patientSubsidyChoiceEth: number;
  createdAt: string;
  updatedAt: string | null;
  queueEnteredAt: string | null;
  estimatedReadyAt: string | null;
  queuePosition: number | null;
  patientCancelledWaitingAt: string | null;
  paymentDueAt: string | null;
  noShowDeadlineAt: string | null;
  patientJoinedAt: string | null;
  therapistJoinedAt: string | null;
  sessionStartedAt: string | null;
  settlementStatus: string;
  patientRefundEth: number;
  vaultRefundEth: number;
  subsidyRefundedEth: number;
  totalRefundEth: number;
  refundAmountEth: number;
  patientWithdrawalTxHash: string | null;
};

type OutcomeModalContext = {
  sessionId: string;
  status: DeadlineOutcomeStatus;
  ackKey: string;
};

type SubsidyFundingResponse = {
  code?: string;
  error?: string;
  message?: string;
  session?: Record<string, unknown> | null;
  sessionId?: string | null;
  onchainSessionId?: string | null;
  configuredTreasuryAddress?: string | null;
  contractVaultAddress?: string | null;
  derivedSignerAddress?: string | null;
  fundingSource?: string | null;
  subsidyAmount?: number | null;
  txHash?: string | null;
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

const DASHBOARD_SESSION_SELECT =
  "id, onchain_session_id, patient_wallet, therapist_wallet, status, created_at, updated_at, session_mode, session_fee_eth, escrow_amount, amount_eth, funding_source, subsidy_applied_eth, subsidy_funded_eth, wallet_required_eth, wallet_funded_eth, patient_wallet_choice_eth, patient_subsidy_choice_eth, queue_entered_at, estimated_ready_at, queue_position, patient_cancelled_waiting_at, payment_due_at, no_show_deadline_at, patient_joined_at, therapist_joined_at, session_started_at, settlement_status, patient_refund_eth, vault_refund_eth, subsidy_refunded_eth, total_refund_eth, refund_amount_eth, patient_withdrawal_tx_hash";

const THERAPIST_WAIT_QUEUE_SELECT =
  "therapist_wallet, status, created_at, session_started_at, funded_at, no_show_deadline_at, estimated_ready_at, queue_entered_at";

function deriveModeLabel(supportedModes: ("Voice" | "Text")[]) {
  if (supportedModes.includes("Voice") && supportedModes.includes("Text")) {
    return "Hybrid" as const;
  }

  if (supportedModes.includes("Voice")) {
    return "Voice" as const;
  }

  if (supportedModes.includes("Text")) {
    return "Text" as const;
  }

  return "Not Available" as const;
}

function formatEth(value: number) {
  return `${value.toFixed(3)} ETH`;
}

function formatPreciseEth(value: number) {
  const formatted = value.toFixed(6).replace(/\.?0+$/, "");
  return `${formatted || "0"} ETH`;
}

function normalizeEthField(value: unknown, fallback = 0) {
  const numericValue = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return numericValue;
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  return rtf.format(diffDays, "day");
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Updating estimate";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSubsidyFundingErrorMessage(
  code?: string,
  payload?: SubsidyFundingResponse | null,
) {
  switch (code) {
    case "RELAYER_SIGNER_MISMATCH":
      return "Subsidy funding is temporarily unavailable because of a server wallet configuration issue. No subsidy transaction was submitted.";
    case "mirror_sync_failed_after_tx":
      return "Mirror sync failed after successful subsidy leg. Please refresh.";
    case "mirror_sync_failed_after_already_funded":
      return "Subsidy leg was already funded on-chain, but mirror sync failed. Please refresh.";
    case "missing_env":
      return "Subsidy funding is temporarily unavailable because the server is missing required configuration.";
    case "wrong_chain":
      return "Subsidy funding is temporarily unavailable because the subsidy relayer is pointed at the wrong chain.";
    case "tx_reverted":
      return payload?.error ?? "Subsidy funding failed on-chain.";
    default:
      return "Subsidy funding failed. The wallet leg may already be confirmed, so retry only after reviewing the latest session state.";
  }
}

function formatEstimatedWait(value?: string | null, now = Date.now()) {
  if (!value) {
    return "Updating estimate";
  }

  const diffMs = new Date(value).getTime() - now;
  if (!Number.isFinite(diffMs)) {
    return "Updating estimate";
  }

  if (diffMs <= 0) {
    return "Provider should be ready soon";
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes < 60) {
    return `About ${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!minutes) {
    return `About ${hours} hr`;
  }

  return `About ${hours} hr ${minutes} min`;
}

function getProviderBusyAnchor(
  sessions: Array<Record<string, unknown>>,
  now = Date.now(),
) {
  const prioritizedBusySessions = sessions
    .filter((row) => {
      const status = normalizeSessionStatus(row.status);
      return status === "funded" || status === "in_session";
    })
    .sort((left, right) => {
      const leftStatus = normalizeSessionStatus(left.status);
      const rightStatus = normalizeSessionStatus(right.status);

      if (leftStatus !== rightStatus) {
        return leftStatus === "in_session" ? -1 : 1;
      }

      const leftTime = new Date(
        String(
          left.session_started_at ??
            left.funded_at ??
            left.no_show_deadline_at ??
            left.created_at ??
            "",
        ),
      ).getTime();
      const rightTime = new Date(
        String(
          right.session_started_at ??
            right.funded_at ??
            right.no_show_deadline_at ??
            right.created_at ??
            "",
        ),
      ).getTime();

      return leftTime - rightTime;
    });

  const activeBusySession = prioritizedBusySessions[0];
  if (!activeBusySession) {
    return null;
  }

  const status = normalizeSessionStatus(activeBusySession.status);
  const sessionStartedAt = new Date(
    String(activeBusySession.session_started_at ?? ""),
  ).getTime();
  const fundedAt = new Date(String(activeBusySession.funded_at ?? "")).getTime();
  const noShowDeadlineAt = new Date(
    String(activeBusySession.no_show_deadline_at ?? ""),
  ).getTime();

  if (status === "in_session" && Number.isFinite(sessionStartedAt)) {
    return sessionStartedAt + 50 * 60 * 1000 > now
      ? sessionStartedAt + 50 * 60 * 1000
      : now;
  }

  if (status === "funded" && Number.isFinite(noShowDeadlineAt)) {
    return noShowDeadlineAt > now ? noShowDeadlineAt : now;
  }

  if (status === "funded" && Number.isFinite(fundedAt)) {
    return fundedAt + 50 * 60 * 1000 > now ? fundedAt + 50 * 60 * 1000 : now;
  }

  return now + 50 * 60 * 1000;
}

function buildTherapistWaitStateMap(
  sessions: Array<Record<string, unknown>>,
) {
  const rowsByTherapist = new Map<string, Array<Record<string, unknown>>>();

  sessions.forEach((row) => {
    const therapistWallet = String(row.therapist_wallet ?? "").trim().toLowerCase();
    if (!therapistWallet) {
      return;
    }

    const existingRows = rowsByTherapist.get(therapistWallet) ?? [];
    existingRows.push(row);
    rowsByTherapist.set(therapistWallet, existingRows);
  });

  const nextWaitStateMap: Record<string, TherapistWaitState> = {};

  rowsByTherapist.forEach((rows, therapistWallet) => {
    const queuedCount = rows.filter(
      (row) => normalizeSessionStatus(row.status) === "queued_waiting_for_provider",
    ).length;
    const busyAnchor = getProviderBusyAnchor(rows);
    const estimatedReadyAt =
      busyAnchor === null
        ? null
        : new Date(busyAnchor + queuedCount * 50 * 60 * 1000).toISOString();

    nextWaitStateMap[therapistWallet] = {
      isBusy: busyAnchor !== null || queuedCount > 0,
      estimatedReadyAt,
    };
  });

  return nextWaitStateMap;
}

function mapActivityStatus(value: unknown) {
  const status = String(value ?? "Logged").trim();
  return status || "Logged";
}

function mapActivityTitle(row: Record<string, unknown>) {
  return (
    String(
      row.title ??
        row.action_title ??
        row.activity_type ??
        row.type ??
        "Wallet activity",
    ) || "Wallet activity"
  );
}

function mapActivityDescription(row: Record<string, unknown>) {
  return String(
    row.description ??
      row.detail ??
      row.notes ??
      row.metadata_summary ??
      "Session-related activity synced from Supabase.",
  );
}

function formatShortAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function normalizeLanguages(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSupportedModes(value: unknown): ("Voice" | "Text")[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return values
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item === "voice" || item === "video" ? "Voice" : "Text"))
    .filter((item, index, array) => array.indexOf(item) === index) as (
    | "Voice"
    | "Text"
  )[];
}

function summarizeTherapistBio(value: string) {
  const bio = value.trim();

  if (!bio) {
    return "A verified therapist profile is being prepared for this care directory.";
  }

  return bio.length > 140 ? `${bio.slice(0, 137).trimEnd()}...` : bio;
}

function normalizeFundingSource(value: unknown): FundingSource {
  const normalized = String(value ?? "wallet").trim().toLowerCase();

  if (normalized === "subsidy") {
    return "subsidy";
  }

  if (normalized === "mixed") {
    return "mixed";
  }

  return "wallet";
}

function normalizeOpenSession(row: Record<string, unknown>): OpenSessionRecord {
  const rawQueuePosition = row.queue_position;
  const rawOnchainSessionId = row.onchain_session_id;
  let onchainSessionId: string | null = null;

  if (
    typeof rawOnchainSessionId === "string" &&
    rawOnchainSessionId.trim()
  ) {
    try {
      onchainSessionId = normalizeOnchainSessionId(rawOnchainSessionId);
    } catch {
      onchainSessionId = null;
    }
  } else if (
    typeof rawOnchainSessionId === "number" ||
    typeof rawOnchainSessionId === "bigint"
  ) {
    try {
      onchainSessionId = normalizeOnchainSessionId(String(rawOnchainSessionId));
    } catch {
      onchainSessionId = null;
    }
  }

  return {
    id: String(row.id ?? ""),
    onchainSessionId,
    patientWallet: String(row.patient_wallet ?? ""),
    therapistWallet: String(row.therapist_wallet ?? ""),
    status: normalizeSessionStatus(row.status),
    sessionMode: normalizeSessionMode(row.session_mode),
    sessionFeeEth: normalizeEthField(
      row.session_fee_eth ?? row.escrow_amount ?? row.amount_eth,
      SESSION_FEE_ETH,
    ),
    fundingSource: normalizeFundingSource(row.funding_source),
    subsidyAppliedEth: normalizeEthField(
      row.subsidy_applied_eth ?? row.patient_subsidy_choice_eth ?? 0,
    ),
    subsidyFundedEth: normalizeEthField(row.subsidy_funded_eth ?? 0),
    walletRequiredEth: normalizeEthField(
      row.wallet_required_eth ?? row.patient_wallet_choice_eth ?? 0,
    ),
    walletFundedEth: normalizeEthField(row.wallet_funded_eth ?? 0),
    patientWalletChoiceEth: normalizeEthField(row.patient_wallet_choice_eth ?? 0),
    patientSubsidyChoiceEth: normalizeEthField(row.patient_subsidy_choice_eth ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    queueEnteredAt:
      typeof row.queue_entered_at === "string" ? row.queue_entered_at : null,
    estimatedReadyAt:
      typeof row.estimated_ready_at === "string" ? row.estimated_ready_at : null,
    queuePosition:
      typeof rawQueuePosition === "number"
        ? rawQueuePosition
        : rawQueuePosition == null
          ? null
          : Number.isFinite(Number(rawQueuePosition))
            ? Number(rawQueuePosition)
            : null,
    patientCancelledWaitingAt:
      typeof row.patient_cancelled_waiting_at === "string"
        ? row.patient_cancelled_waiting_at
        : null,
    paymentDueAt:
      typeof row.payment_due_at === "string" ? row.payment_due_at : null,
    noShowDeadlineAt:
      typeof row.no_show_deadline_at === "string" ? row.no_show_deadline_at : null,
    patientJoinedAt:
      typeof row.patient_joined_at === "string" ? row.patient_joined_at : null,
    therapistJoinedAt:
      typeof row.therapist_joined_at === "string" ? row.therapist_joined_at : null,
    sessionStartedAt:
      typeof row.session_started_at === "string" ? row.session_started_at : null,
    settlementStatus: String(row.settlement_status ?? "pending"),
    patientRefundEth: normalizeEthField(row.patient_refund_eth ?? 0),
    vaultRefundEth: normalizeEthField(row.vault_refund_eth ?? 0),
    subsidyRefundedEth: normalizeEthField(row.subsidy_refunded_eth ?? 0),
    totalRefundEth: normalizeEthField(row.total_refund_eth ?? 0),
    refundAmountEth: normalizeEthField(row.refund_amount_eth ?? 0),
    patientWithdrawalTxHash:
      typeof row.patient_withdrawal_tx_hash === "string"
        ? row.patient_withdrawal_tx_hash
        : null,
  };
}

function getPatientTerminalFeedbackOverride(
  session: Pick<
    OpenSessionRecord,
    "status" | "patientRefundEth" | "vaultRefundEth"
  >,
) {
  if (session.status !== "therapist_no_show") {
    return null;
  }

  if (session.patientRefundEth <= 0 && session.vaultRefundEth > 0) {
    return `The therapist did not arrive within ${NO_SHOW_WINDOW_LABEL}. The refund was allocated to the subsidy vault.`;
  }

  if (session.patientRefundEth > 0 && session.vaultRefundEth > 0) {
    return `The therapist did not arrive within ${NO_SHOW_WINDOW_LABEL}. Your wallet refund is available, and the subsidy share was returned to the subsidy vault.`;
  }

  return null;
}

function getActiveEscrowCountForSession(session: OpenSessionRecord | null) {
  if (!session || session.status === "queued_waiting_for_provider") {
    return 0;
  }

  return 1;
}

async function applyOpenSessionCatchUp(row: Record<string, unknown>) {
  return normalizeOpenSession(row);
}

async function refetchLatestPatientOpenSession(walletAddress: string) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("sessions")
    .select(DASHBOARD_SESSION_SELECT)
    .ilike("patient_wallet", walletAddress)
    .in("status", [...OPEN_SESSION_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const nextSession = await applyOpenSessionCatchUp(data as Record<string, unknown>);
  return nextSession && isOpenBookingStatus(nextSession.status) ? nextSession : null;
}

async function fetchLatestPatientTerminalSession(walletAddress: string) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("sessions")
    .select(DASHBOARD_SESSION_SELECT)
    .ilike("patient_wallet", walletAddress)
    .in("status", [...TERMINAL_SESSION_STATUSES])
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeOpenSession(data as Record<string, unknown>) : null;
}

function getFundingPreviewMessage(funding: FundingResolution) {
  if (funding.fundingSource === "subsidy") {
    return "Government subsidy reserved";
  }

  if (funding.fundingSource === "mixed") {
    return `Partial subsidy applied. ${formatEth(funding.walletRequired)} from wallet.`;
  }

  return "Waiting for wallet funding.";
}

function decodeSessionModeFromChain(value: Hex) {
  try {
    const decoded = hexToString(value, { size: 32 })
      .replace(/\u0000/g, "")
      .trim()
      .toLowerCase();
    return decoded === "voice" ? "voice" : "text";
  } catch {
    return "text";
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected, status: accountStatus } = useAccount();
  const chainId = useChainId();
  const wagmiConfig = useConfig();
  const { disconnect } = useDisconnect();
  const sessionGuard = usePageSessionGuard({
    requiredRole: "patient",
    address,
    wagmiStatus: accountStatus,
  });
  const isAuthorized = sessionGuard.authResolutionState === "authorized";
  const isProviderBlocked = sessionGuard.authResolutionState === "blocked";
  const { data: balanceData } = useBalance({
    address,
    query: {
      enabled: Boolean(address && isConnected && isAuthorized),
    },
  });
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(
    null,
  );
  const normalizedPatientWallet =
    patientProfile?.walletAddress?.toLowerCase() ?? null;
  const [activeEscrowCount, setActiveEscrowCount] = useState(0);
  const [availableTherapistCount, setAvailableTherapistCount] = useState(0);
  const [bookingTherapistId, setBookingTherapistId] = useState<string | null>(null);
  const [bookingFeedback, setBookingFeedback] =
    useState<BookingFeedbackView | null>(null);
  const [bookingFeedbackContext, setBookingFeedbackContext] =
    useState<BookingFeedbackContext | null>(null);
  const [openSession, setOpenSession] = useState<OpenSessionRecord | null>(null);
  const [latestTerminalSession, setLatestTerminalSession] =
    useState<OpenSessionRecord | null>(null);
  const [deadlineOutcomeModal, setDeadlineOutcomeModal] =
    useState<OutcomeModalContext | null>(null);
  const [supportRequestContext, setSupportRequestContext] =
    useState<OutcomeModalContext | null>(null);
  const [selectedTherapist, setSelectedTherapist] = useState<Therapist | null>(null);
  const [therapistWaitStateMap, setTherapistWaitStateMap] = useState<
    Record<string, TherapistWaitState>
  >({});
  const [bookingModalError, setBookingModalError] = useState("");
  const [paymentModalError, setPaymentModalError] = useState("");
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [dismissedPaymentSessionId, setDismissedPaymentSessionId] = useState<string | null>(null);
  const [isSessionReadyModalOpen, setIsSessionReadyModalOpen] = useState(false);
  const [dismissedReadySessionId, setDismissedReadySessionId] = useState<string | null>(null);
  const [isSessionReadyNavigating, setIsSessionReadyNavigating] = useState(false);
  const [isClaimingPatientRefund, setIsClaimingPatientRefund] = useState(false);
  const [waitTimeNow, setWaitTimeNow] = useState(() => Date.now());
  const [resolutionNow, setResolutionNow] = useState(() => Date.now());
  const [resolvingSessionId, setResolvingSessionId] = useState<string | null>(null);
  const sessionEndNotifications = useSessionEndRequestNotifications({
    walletAddress: patientProfile?.walletAddress,
    enabled: isAuthorized,
  });
  const shownDeadlineOutcomeKeyRef = useRef<string | null>(null);
  const paymentTimeoutCatchUpSessionIdRef = useRef<string | null>(null);
  const hasLiveWaitEstimate =
    Boolean(openSession?.estimatedReadyAt) ||
    Object.values(therapistWaitStateMap).some((state) => Boolean(state.estimatedReadyAt));
  const isFocusedFundedState = isFundedOrLiveSessionStatus(openSession?.status);
  const deadlineOutcomeModalCopy = useMemo(() => {
    if (!deadlineOutcomeModal) {
      return null;
    }

    const baseCopy = getTerminalSessionOutcome(deadlineOutcomeModal.status, false);
    const matchingSession =
      latestTerminalSession?.id === deadlineOutcomeModal.sessionId
        ? latestTerminalSession
        : null;
    const overrideMessage = matchingSession
      ? getPatientTerminalFeedbackOverride(matchingSession)
      : null;

    return overrideMessage
      ? { ...baseCopy, message: overrideMessage }
      : baseCopy;
  }, [deadlineOutcomeModal, latestTerminalSession]);
  const isAcknowledgedBookingFeedbackDeadlineOutcome = Boolean(
    bookingFeedbackContext &&
      isDeadlineOutcomeStatus(bookingFeedbackContext.status) &&
      isDeadlineOutcomeAcknowledged(
        buildDeadlineOutcomeAckKey({
          viewerRole: "patient",
          sessionId: bookingFeedbackContext.sessionId,
          status: bookingFeedbackContext.status,
          updatedAt: bookingFeedbackContext.updatedAt,
        }),
      ),
  );
  const shouldShowBookingFeedbackBanner = Boolean(
    bookingFeedback &&
      !isFocusedFundedState &&
      !isAcknowledgedBookingFeedbackDeadlineOutcome,
  );

  const setBookingFeedbackFromSession = (
    session:
      | Pick<
          OpenSessionRecord,
          "id" | "status" | "updatedAt" | "patientRefundEth" | "vaultRefundEth"
        >
      | null,
  ) => {
    if (!session) {
      setBookingFeedback(null);
      setBookingFeedbackContext(null);
      return;
    }

    const overrideMessage = getPatientTerminalFeedbackOverride(session);
    const feedback = buildBookingFeedback(session);
    setBookingFeedback(
      overrideMessage ? { ...feedback, message: overrideMessage } : feedback,
    );
    setBookingFeedbackContext({
      sessionId: session.id,
      status: session.status,
      updatedAt: session.updatedAt,
    });
  };

  const setStandaloneBookingFeedback = (feedback: BookingFeedbackView | null) => {
    setBookingFeedback(feedback);
    setBookingFeedbackContext(null);
  };

  const openDeadlineOutcomeModal = (
    session: Pick<OpenSessionRecord, "id" | "status" | "updatedAt"> | null,
  ) => {
    if (!session || !isDeadlineOutcomeStatus(session.status)) {
      return;
    }

    const ackKey = buildDeadlineOutcomeAckKey({
      viewerRole: "patient",
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

  useEffect(() => {
    if (sessionGuard.authResolutionState !== "redirect") {
      return;
    }

    router.replace("/auth");
  }, [router, sessionGuard.authResolutionState]);

  useEffect(() => {
    shownDeadlineOutcomeKeyRef.current = null;
    setDeadlineOutcomeModal(null);
    setSupportRequestContext(null);
    setLatestTerminalSession(null);
  }, [patientProfile?.walletAddress]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateDashboard = async () => {
      if (!isAuthorized) {
        return;
      }

      const storedProfile = window.localStorage.getItem("mindpass-patient-profile");
      if (!storedProfile) {
        if (!isCancelled) {
          setDashboardError("No patient profile found. Please verify access again.");
          setIsLoading(false);
        }
        return;
      }

      let parsedProfile: {
        walletAddress?: string;
        totalDeposits?: number;
        subsidyBalance?: number;
      };
      try {
        parsedProfile = JSON.parse(storedProfile);
      } catch {
        window.localStorage.removeItem("mindpass-patient-profile");
        if (!isCancelled) {
          setDashboardError("Stored patient profile is invalid. Please sign in again.");
          setIsLoading(false);
        }
        return;
      }

      const walletAddress = String(parsedProfile.walletAddress ?? "").trim();
      if (!walletAddress) {
        if (!isCancelled) {
          setDashboardError("Wallet address is missing from the patient profile.");
          setIsLoading(false);
        }
        return;
      }

      setPatientProfile({
        walletAddress,
        totalDeposits: normalizeEthField(parsedProfile.totalDeposits ?? 0),
        subsidyBalance: normalizeEthField(parsedProfile.subsidyBalance ?? 0),
      });

      if (!supabase) {
        if (!isCancelled) {
          setDashboardError("Supabase client is unavailable.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const patientQuery = supabase
          .from("patients")
          .select("wallet_address, total_deposits, subsidy_balance")
          .ilike("wallet_address", walletAddress)
          .maybeSingle();

        const openSessionQuery = supabase
          .from("sessions")
          .select(DASHBOARD_SESSION_SELECT)
          .ilike("patient_wallet", walletAddress)
          .in("status", [...OPEN_SESSION_STATUSES])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const latestStatusQuery = supabase
          .from("sessions")
          .select(DASHBOARD_SESSION_SELECT)
          .ilike("patient_wallet", walletAddress)
          .in("status", [...TERMINAL_SESSION_STATUSES])
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const activitiesQuery = supabase
          .from("activities")
          .select("*")
          .ilike("wallet_address", walletAddress)
          .order("created_at", { ascending: false })
          .limit(5);

        const therapistsQuery = supabase
          .from("therapists")
          .select(
            "id, wallet_address, full_name, legal_name, specialty, clinical_specialty, bio, languages, is_online, supported_modes, ekyc_status, sbt_minted",
          )
          .eq("ekyc_status", "verified")
          .eq("sbt_minted", true)
          .eq("is_online", true)
          .order("full_name", { ascending: true });

        const [
          patientResult,
          openSessionResult,
          latestStatusResult,
          activitiesResult,
          therapistsResult,
        ] = await Promise.all([
          patientQuery,
          openSessionQuery,
          latestStatusQuery,
          activitiesQuery,
          therapistsQuery,
        ]);

        if (isCancelled) {
          return;
        }

        if (patientResult.error) {
          throw patientResult.error;
        }

        if (openSessionResult.error) {
          throw openSessionResult.error;
        }

        if (latestStatusResult.error) {
          throw latestStatusResult.error;
        }

        const patientRow = patientResult.data;
        if (!patientRow) {
          console.warn(
            "Ghost profile detected. DB record missing. Clearing local storage.",
          );
          window.localStorage.removeItem("mindpass-patient-profile");
          window.localStorage.removeItem("mindpass-xmtp-connected");
          if (window.localStorage.getItem("mindpass-active-session") === "patient") {
            window.localStorage.removeItem("mindpass-active-session");
          }
          window.dispatchEvent(new Event("mindpass-session-changed"));
          router.replace("/auth");
          return;
        }

        setPatientProfile({
          walletAddress,
          totalDeposits: normalizeEthField(patientRow?.total_deposits ?? 0),
          subsidyBalance: normalizeEthField(patientRow?.subsidy_balance ?? 0),
        });
        window.localStorage.setItem(
          "mindpass-patient-profile",
          JSON.stringify({
            walletAddress,
            totalDeposits: normalizeEthField(patientRow?.total_deposits ?? 0),
            subsidyBalance: normalizeEthField(patientRow?.subsidy_balance ?? 0),
          }),
        );

        const nextOpenSession = await refetchLatestPatientOpenSession(walletAddress);
        const terminalStatusSession = nextOpenSession
          ? null
          : await fetchLatestPatientTerminalSession(walletAddress);
        setOpenSession(nextOpenSession);
        setLatestTerminalSession(terminalStatusSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(nextOpenSession));

        if (nextOpenSession) {
          setBookingFeedbackFromSession(nextOpenSession);
        } else if (terminalStatusSession) {
          openDeadlineOutcomeModal(terminalStatusSession);
          setBookingFeedbackFromSession(terminalStatusSession);
        } else {
          setStandaloneBookingFeedback(null);
        }

        let normalizedTherapists: Therapist[] = [];
        if (therapistsResult.error) {
          console.error("Therapist query failed on dashboard:", therapistsResult.error);
          setDashboardError("Unable to fetch therapists.");
          setTherapistWaitStateMap({});
        } else {
          normalizedTherapists = (therapistsResult.data ?? []).map((therapist) => {
            const supportedModes = normalizeSupportedModes(therapist.supported_modes);
            const displayName = getTherapistDisplayName(therapist);
            const displaySpecialty = getTherapistDisplaySpecialty(therapist);

            return {
              id: String(therapist.id ?? therapist.wallet_address ?? crypto.randomUUID()),
              name: displayName,
              specialty: displaySpecialty,
              languages: normalizeLanguages(therapist.languages),
              bio:
                String(
                  therapist.bio ??
                    "A verified therapist profile is being prepared for this care directory.",
                ) ||
                "A verified therapist profile is being prepared for this care directory.",
              isOnline: Boolean(therapist.is_online),
              availability: "Available now",
              rating: 0,
              mode: deriveModeLabel(supportedModes),
              walletAddress: String(therapist.wallet_address ?? ""),
              supportedModes,
            };
          });

          const therapistWallets = normalizedTherapists
            .map((therapist) => therapist.walletAddress?.trim().toLowerCase())
            .filter((wallet): wallet is string => Boolean(wallet));

          if (therapistWallets.length > 0) {
            const { data: waitQueueRows, error: waitQueueError } = await supabase
              .from("sessions")
              .select(THERAPIST_WAIT_QUEUE_SELECT)
              .in("therapist_wallet", therapistWallets)
              .in("status", [
                "funded",
                "in_session",
                "queued_waiting_for_provider",
              ]);

            if (isCancelled) {
              return;
            }

            if (waitQueueError) {
              console.error(
                "Therapist wait queue query failed on dashboard:",
                waitQueueError,
              );
              setTherapistWaitStateMap({});
            } else {
              setTherapistWaitStateMap(
                buildTherapistWaitStateMap(
                  (waitQueueRows ?? []) as Array<Record<string, unknown>>,
                ),
              );
            }
          } else {
            setTherapistWaitStateMap({});
          }

          setDashboardError("");
        }

        setTherapists(normalizedTherapists);
        setAvailableTherapistCount(normalizedTherapists.length);
        setActivities(
          (activitiesResult.error ? [] : activitiesResult.data ?? []).map((row) => ({
            id: String(row.id ?? crypto.randomUUID()),
            title: mapActivityTitle(row as Record<string, unknown>),
            description: mapActivityDescription(row as Record<string, unknown>),
            status: mapActivityStatus((row as Record<string, unknown>).status),
            timeLabel: formatRelativeTime(
              String(
                row.created_at ??
                  row.updated_at ??
                  row.timestamp ??
                  "",
              ),
            ),
          })),
        );
      } catch (error) {
        if (!isCancelled) {
          setDashboardError(
            error instanceof Error
              ? error.message
              : "Unable to load dashboard data.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    hydrateDashboard();

    return () => {
      isCancelled = true;
    };
  }, [isAuthorized, router]);

  useEffect(() => {
    if (!isAuthorized || !supabase || !normalizedPatientWallet) {
      return;
    }

    const channel = supabase.channel(`patient-bookings:${normalizedPatientWallet}`);

    const syncSessionState = (row: Record<string, unknown>) => {
      const nextWallet = String(row.patient_wallet ?? "").toLowerCase();
      if (nextWallet !== normalizedPatientWallet) {
        return;
      }

      const nextStatus = normalizeSessionStatus(row.status);
      const nextSession = normalizeOpenSession(row);

      if (isOpenBookingStatus(nextStatus)) {
        setOpenSession(nextSession);
        setLatestTerminalSession(null);
        setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
        setBookingFeedbackFromSession(nextSession);

        if (isAcceptedAwaitingPaymentStatus(nextStatus)) {
          if (dismissedPaymentSessionId !== nextSession.id) {
            setIsPaymentModalOpen(true);
            setPaymentModalError("");
          }
        }

        if (isFundedOrLiveSessionStatus(nextStatus)) {
          setIsPaymentModalOpen(false);
          setDismissedPaymentSessionId(null);
        }

        return;
      }

      setOpenSession((current) => (current?.id === nextSession.id ? null : current));
      setLatestTerminalSession(nextSession);
      setActiveEscrowCount(0);
      setIsPaymentModalOpen(false);
      setPaymentModalError("");
      openDeadlineOutcomeModal(nextSession);
      setBookingFeedbackFromSession(nextSession);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sessions",
          filter: `patient_wallet=eq.${normalizedPatientWallet}`,
        },
        (payload) => syncSessionState(payload.new as Record<string, unknown>),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `patient_wallet=eq.${normalizedPatientWallet}`,
        },
        (payload) => syncSessionState(payload.new as Record<string, unknown>),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [
    dismissedPaymentSessionId,
    isAuthorized,
    patientProfile?.walletAddress,
  ]);

  useEffect(() => {
    if (!openSession) {
      return;
    }

    const target =
      openSession.status === "accepted_awaiting_payment"
        ? openSession.paymentDueAt
        : openSession.status === "funded"
          ? openSession.noShowDeadlineAt
          : null;

    if (!target) {
      return;
    }

    const deadline = new Date(target).getTime();
    if (Number.isNaN(deadline)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResolutionNow(Date.now());
    }, Math.max(0, deadline - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [openSession]);

  useEffect(() => {
    if (!openSession || openSession.status !== "requested") {
      return;
    }

    let isCancelled = false;

    const recoverRequestedOpenSession = async () => {
      const recoveredSession = await selfHealRequestedPatientSession(
        openSession,
        "dashboard",
      );

      if (isCancelled || recoveredSession.id !== openSession.id) {
        return;
      }

      if (recoveredSession.status !== openSession.status) {
        setOpenSession(recoveredSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(recoveredSession));
        setBookingFeedbackFromSession(recoveredSession);
      }
    };

    void recoverRequestedOpenSession();

    return () => {
      isCancelled = true;
    };
  }, [openSession]);

  useEffect(() => {
    const hasPendingPaymentConfirmation =
      openSession?.status === "accepted_awaiting_payment" && isPaymentSubmitting;
    const paymentResolutionKind = hasPendingPaymentConfirmation
      ? null
      : getEscrowResolutionKind(openSession, resolutionNow);

    if (!openSession) {
      setIsPaymentModalOpen(false);
      setPaymentModalError("");
      setDismissedPaymentSessionId(null);
      return;
    }

    if (
      openSession.status === "accepted_awaiting_payment" &&
      paymentResolutionKind !== "payment_timeout" &&
      dismissedPaymentSessionId !== openSession.id
    ) {
      setIsPaymentModalOpen(true);
      return;
    }

    if (
      isFundedOrLiveSessionStatus(openSession.status) ||
      paymentResolutionKind === "payment_timeout"
    ) {
      setIsPaymentModalOpen(false);
      setPaymentModalError("");
      setDismissedPaymentSessionId(null);
    }
  }, [dismissedPaymentSessionId, isPaymentSubmitting, openSession, resolutionNow]);

  useEffect(() => {
    const hasPendingPaymentConfirmation =
      openSession?.status === "accepted_awaiting_payment" && isPaymentSubmitting;
    const paymentResolutionKind = hasPendingPaymentConfirmation
      ? null
      : getEscrowResolutionKind(openSession, resolutionNow);

    if (
      !openSession ||
      hasPendingPaymentConfirmation ||
      openSession.status !== "accepted_awaiting_payment" ||
      paymentResolutionKind !== "payment_timeout"
    ) {
      paymentTimeoutCatchUpSessionIdRef.current = null;
      return;
    }

    if (paymentTimeoutCatchUpSessionIdRef.current === openSession.id) {
      return;
    }

    paymentTimeoutCatchUpSessionIdRef.current = openSession.id;
    setIsPaymentModalOpen(false);
    setPaymentModalError("");

    let isCancelled = false;
    const syncExpiredPaymentState = async () => {
      try {
        const walletAddress = openSession.patientWallet.toLowerCase();
        const refreshedOpenSession = await refetchLatestPatientOpenSession(
          walletAddress,
        );

        if (isCancelled) {
          return;
        }

        if (refreshedOpenSession) {
          setOpenSession(refreshedOpenSession);
          setLatestTerminalSession(null);
          setActiveEscrowCount(getActiveEscrowCountForSession(refreshedOpenSession));
          setBookingFeedbackFromSession(refreshedOpenSession);
          return;
        }

        const terminalStatusSession = await fetchLatestPatientTerminalSession(
          walletAddress,
        );

        if (isCancelled) {
          return;
        }

        setOpenSession(null);
        setLatestTerminalSession(terminalStatusSession);
        setActiveEscrowCount(0);

        if (terminalStatusSession) {
          openDeadlineOutcomeModal(terminalStatusSession);
          setBookingFeedbackFromSession(terminalStatusSession);
          return;
        }

        setStandaloneBookingFeedback({
          message: getSettlementPreview("payment_timeout"),
          tone: "warning",
        });
      } catch (error) {
        if (!isCancelled) {
          setDashboardError(
            error instanceof Error
              ? error.message
              : "Unable to refresh the expired booking state.",
          );
        }
      }
    };

    void syncExpiredPaymentState();

    return () => {
      isCancelled = true;
    };
  }, [isPaymentSubmitting, openSession, resolutionNow]);

  useEffect(() => {
    if (!openSession || openSession.status !== "accepted_awaiting_payment") {
      return;
    }

    const now = resolutionNow;
    const hasPendingPaymentConfirmation =
      openSession.status === "accepted_awaiting_payment" && isPaymentSubmitting;
    const paymentWindowRemainingSeconds = getPaymentWindowRemainingSeconds(
      openSession.paymentDueAt,
      now,
    );
    const isPaymentWindowExpired = isPaymentWindowExpiredAt(
      openSession.paymentDueAt,
      now,
    );
    const openSessionResolutionKind = hasPendingPaymentConfirmation
      ? null
      : getEscrowResolutionKind(openSession, now);
    logPaymentWindow180("dashboard_payment_status_rendered", {
      sessionId: openSession.id,
      onchainSessionId: openSession.onchainSessionId,
      status: openSession.status,
      paymentDueAt: openSession.paymentDueAt,
      now: new Date(now).toISOString(),
      remainingSeconds: paymentWindowRemainingSeconds,
      source: "dashboard",
      trigger: "render",
    });

    if (hasPendingPaymentConfirmation) {
      logPaymentWindow180("pending_payment_detected", {
        sessionId: openSession.id,
        onchainSessionId: openSession.onchainSessionId,
        status: openSession.status,
        paymentDueAt: openSession.paymentDueAt,
        now: new Date(now).toISOString(),
        remainingSeconds: paymentWindowRemainingSeconds,
        source: "dashboard",
        trigger: "wallet_or_subsidy_confirmation",
      });

      if (
        needsSubsidyFunding({
          subsidyAppliedEth: openSession.subsidyAppliedEth,
          subsidyFundedEth: openSession.subsidyFundedEth,
        })
      ) {
        logPaymentWindow180("pending_subsidy_detected", {
          sessionId: openSession.id,
          onchainSessionId: openSession.onchainSessionId,
          status: openSession.status,
          paymentDueAt: openSession.paymentDueAt,
          now: new Date(now).toISOString(),
          remainingSeconds: paymentWindowRemainingSeconds,
          source: "dashboard",
          trigger: "wallet_leg_confirmed_subsidy_pending",
        });
      }
    }

    logPaymentWindow180(
      openSessionResolutionKind === "payment_timeout"
        ? "timeout_cta_allowed"
        : "timeout_cta_gated",
      {
        sessionId: openSession.id,
        onchainSessionId: openSession.onchainSessionId,
        status: openSession.status,
        paymentDueAt: openSession.paymentDueAt,
        now: new Date(now).toISOString(),
        remainingSeconds: paymentWindowRemainingSeconds,
        source: "dashboard",
        trigger: hasPendingPaymentConfirmation
          ? "pending_confirmation"
          : isPaymentWindowExpired
            ? "payment_due_at_elapsed"
            : "render",
      },
    );
  }, [
    isPaymentSubmitting,
    openSession,
    resolutionNow,
  ]);

  useEffect(() => {
    if (!isFundedSessionStatus(openSession?.status)) {
      setIsSessionReadyModalOpen(false);
      setDismissedReadySessionId(null);
      setIsSessionReadyNavigating(false);
      return;
    }

    if (dismissedReadySessionId === openSession.id) {
      return;
    }

    setIsSessionReadyModalOpen(true);
  }, [dismissedReadySessionId, openSession]);

  useEffect(() => {
    if (!hasLiveWaitEstimate) {
      return;
    }

    setWaitTimeNow(Date.now());

    const intervalId = window.setInterval(() => {
      setWaitTimeNow(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasLiveWaitEstimate]);

  const handleSignOut = () => {
    window.localStorage.removeItem("mindpass-patient-profile");
    window.localStorage.removeItem("mindpass-therapist-profile");
    window.localStorage.removeItem("mindpass-xmtp-connected");
    window.localStorage.removeItem("mindpass-active-session");
    window.dispatchEvent(new Event("mindpass-session-changed"));
    disconnect();
    router.replace("/");
  };

  const handleClaimPatientRefund = async () => {
    const terminalSession = latestTerminalSession;
    if (!terminalSession) {
      setDashboardError("No terminal refund session is available to withdraw.");
      return;
    }

    const patientWallet = terminalSession.patientWallet.toLowerCase();
    if (!address) {
      setDashboardError("Connect the patient wallet before withdrawing refunds.");
      return;
    }

    if (address.toLowerCase() !== patientWallet) {
      setDashboardError("Connect the patient wallet for this session before withdrawing.");
      return;
    }

    if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
      setDashboardError("Switch to Sepolia before withdrawing refunds.");
      return;
    }

    if (
      terminalSession.patientRefundEth <= 0 ||
      terminalSession.patientWithdrawalTxHash
    ) {
      setDashboardError("No patient refund is available to withdraw for this session.");
      return;
    }

    if (!supabase) {
      setDashboardError("Supabase client is unavailable.");
      return;
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      setDashboardError("The MindPass escrow contract is not configured in this app.");
      return;
    }

    setIsClaimingPatientRefund(true);
    setDashboardError("");

    try {
      const request = prepareWithdraw({ address: contractAddress });
      logEscrowDebug("submitting patient withdrawal", {
        source: "dashboard",
        functionName: request.functionName,
        walletAddress: patientWallet,
        sessionId: terminalSession.id,
      });
      const hash = await writeContract(wagmiConfig, {
        address: request.address,
        abi: request.abi,
        functionName: "withdraw",
        args: request.args,
        chainId: request.chainId,
      });

      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        hash,
      });
      logReceiptDecode({
        context: "patient withdrawal receipt decoded",
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      });

      const withdrawalEvent = findMindPassEscrowEvent(receipt.logs, "Withdrawal");
      if (
        withdrawalEvent &&
        withdrawalEvent.args.account.toLowerCase() !== patientWallet
      ) {
        logMirrorSyncError("patient withdrawal receipt beneficiary mismatch", {
          txHash: receipt.transactionHash,
          expectedWallet: patientWallet,
          eventAccount: withdrawalEvent.args.account.toLowerCase(),
          sessionId: terminalSession.id,
        });
        setDashboardError(
          "The on-chain withdrawal succeeded, but the refund beneficiary could not be verified. Please refresh.",
        );
        return;
      }

      if (!withdrawalEvent) {
        logEscrowDebug("Withdrawal event missing from patient withdrawal receipt", {
          txHash: receipt.transactionHash,
          walletAddress: patientWallet,
          sessionId: terminalSession.id,
        });
      }

        const { data: syncedRow, error: syncError } = await supabase
        .from("sessions")
        .update(
          compactSessionSyncPatch(buildWithdrawalPatch({
            beneficiary: "patient",
            txHash: receipt.transactionHash,
          })),
        )
        .eq("id", terminalSession.id)
        .ilike("patient_wallet", patientWallet)
        .is("patient_withdrawal_tx_hash", null)
        .select(DASHBOARD_SESSION_SELECT)
        .maybeSingle();

      if (syncError) {
        logMirrorSyncError("patient withdrawal mirror sync failed", {
          txHash: receipt.transactionHash,
          walletAddress: patientWallet,
          sessionId: terminalSession.id,
          message: syncError.message,
        });
        setDashboardError(
          "The on-chain withdrawal succeeded, but the session record could not be synced. Please refresh.",
        );
        return;
      }

      if (syncedRow) {
        const nextSession = normalizeOpenSession(syncedRow as Record<string, unknown>);
        setLatestTerminalSession(nextSession);
        setBookingFeedbackFromSession(nextSession);
      } else {
        setLatestTerminalSession((current) =>
          current?.id === terminalSession.id
            ? {
                ...current,
                patientWithdrawalTxHash: receipt.transactionHash,
              }
            : current,
        );
      }

      logMirrorSync("patient withdrawal mirror sync complete", {
        txHash: receipt.transactionHash,
        walletAddress: patientWallet,
        sessionId: terminalSession.id,
        usedFallback: !withdrawalEvent,
      });
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : "Unable to withdraw the patient refund right now.",
      );
    } finally {
      setIsClaimingPatientRefund(false);
    }
  };

  const summaryCards: DashboardSummaryCard[] = useMemo(
    () => [
      {
        label: "Subsidy Balance",
        value: patientProfile ? formatEth(patientProfile.subsidyBalance) : "0.000 ETH",
        detail: "Government funded session voucher for your care.",
        badge: "Voucher",
        tone: "brand",
      },
      {
        label: "Wallet Balance",
        value: balanceData
          ? formatEth(Number(formatEther(balanceData.value)))
          : patientProfile
            ? formatEth(patientProfile.totalDeposits)
            : "0.000 ETH",
        detail: "Live on-chain balance from your connected wallet.",
        badge: "Live",
        tone: "success",
      },
      {
        label: "Available Therapists",
        value: String(availableTherapistCount),
        detail: "Therapists online and ready to accept secure requests.",
        badge: "Online",
        tone: "success",
      },
      {
        label: "Active Escrows",
        value: String(activeEscrowCount),
        detail: "Open booking requests or funded sessions for your wallet.",
        badge: activeEscrowCount > 0 ? "Locked" : "Idle",
        tone: activeEscrowCount > 0 ? "warning" : "neutral",
      },
    ],
    [
      activeEscrowCount,
      availableTherapistCount,
      balanceData,
      patientProfile,
    ],
  );

  const quickChatHref =
    openSession &&
    isFundedOrLiveSessionStatus(openSession.status)
      ? `/chat?role=patient&address=${encodeURIComponent(
          openSession.therapistWallet,
        )}&sessionId=${encodeURIComponent(openSession.id)}`
      : "/dashboard";
  const shortAddress = formatShortAddress(patientProfile?.walletAddress);
  const therapistSectionError = dashboardError === "Unable to fetch therapists.";
  const bookingFundingPreview = useMemo(
    () => resolveFunding(patientProfile?.subsidyBalance ?? 0, SESSION_FEE_ETH),
    [patientProfile?.subsidyBalance],
  );
  const bookingPreviewMessage = getFundingPreviewMessage(bookingFundingPreview);
  const openSessionTherapist = useMemo(
    () =>
      therapists.find(
        (therapist) =>
          therapist.walletAddress?.toLowerCase() ===
          openSession?.therapistWallet?.toLowerCase(),
      ) ?? null,
    [openSession?.therapistWallet, therapists],
  );
  const openSessionProviderName =
    openSessionTherapist?.name ||
    formatShortAddress(openSession?.therapistWallet) ||
    "Assigned Provider";
  const patientRefundSession =
    latestTerminalSession &&
    (latestTerminalSession.patientRefundEth > 0 ||
      latestTerminalSession.vaultRefundEth > 0)
      ? latestTerminalSession
      : null;
  const patientWalletMatchesRefundSession = Boolean(
    address &&
      patientRefundSession &&
      address.toLowerCase() === patientRefundSession.patientWallet.toLowerCase(),
  );
  const patientRefundWithdrawalRequired = Boolean(
    patientRefundSession &&
      patientRefundSession.patientRefundEth > 0 &&
      !patientRefundSession.patientWithdrawalTxHash,
  );
  const canClaimPatientRefund = Boolean(
    patientWalletMatchesRefundSession && patientRefundWithdrawalRequired,
  );
  const patientRefundStatusMessage = patientRefundSession
    ? patientRefundSession.patientRefundEth <= 0 &&
      patientRefundSession.vaultRefundEth > 0
      ? "Refund allocated to subsidy vault. Vault withdrawal required."
      : patientRefundSession.patientRefundEth > 0 &&
          patientRefundSession.vaultRefundEth > 0
        ? patientRefundSession.patientWithdrawalTxHash
          ? "Your wallet refund has been withdrawn. The subsidy share was returned to the subsidy vault."
          : "Your wallet refund is ready to withdraw. The subsidy share was returned to the subsidy vault."
        : patientRefundSession.patientWithdrawalTxHash
          ? "Your refund has already been withdrawn."
          : "Your refund is ready to withdraw from escrow."
    : null;
  const selectedTherapistWaitState = selectedTherapist?.walletAddress
    ? therapistWaitStateMap[selectedTherapist.walletAddress.toLowerCase()] ?? null
    : null;
  const selectedTherapistRequestKind =
    selectedTherapistWaitState?.isBusy && !openSession ? "wait_queue" : "booking";

  const openBookingDetails = openSession
    ? openSession.status === "queued_waiting_for_provider"
      ? [
          { label: "Provider", value: openSessionProviderName },
          {
            label: "Queue Position",
            value:
              openSession.queuePosition && openSession.queuePosition > 0
                ? `#${openSession.queuePosition}`
                : "Assigning",
          },
          {
            label: "Estimated Wait",
            value: formatEstimatedWait(openSession.estimatedReadyAt, waitTimeNow),
          },
          {
            label: "Latest Ready",
            value: formatDateTime(openSession.estimatedReadyAt),
          },
          { label: "Mode", value: formatSessionMode(openSession.sessionMode) },
          { label: "Fee", value: formatEth(openSession.sessionFeeEth) },
        ]
      : [
          { label: "Provider", value: openSessionProviderName },
          { label: "Mode", value: formatSessionMode(openSession.sessionMode) },
          { label: "Fee", value: formatEth(openSession.sessionFeeEth) },
          ...(openSession.status === "accepted_awaiting_payment" &&
          openSession.paymentDueAt
            ? [
                {
                  label: "Payment Window",
                  value: PAYMENT_WINDOW_LABEL,
                },
              ]
            : []),
          {
            label: "Funding",
            value:
              openSession.fundingSource === "subsidy"
                ? "Government subsidy"
                : openSession.fundingSource === "mixed"
                  ? "Mixed funding"
                  : "Wallet funding",
          },
        ]
    : [];
  const paymentWindowRemainingSeconds =
    openSession?.status === "accepted_awaiting_payment"
      ? getPaymentWindowRemainingSeconds(openSession.paymentDueAt, resolutionNow)
      : null;
  const isPaymentWindowExpired =
    openSession?.status === "accepted_awaiting_payment"
      ? isPaymentWindowExpiredAt(openSession.paymentDueAt, resolutionNow)
      : false;
  const hasPendingPaymentConfirmation = Boolean(
    openSession?.status === "accepted_awaiting_payment" && isPaymentSubmitting,
  );
  const openSessionResolutionKind = hasPendingPaymentConfirmation
    ? null
    : getEscrowResolutionKind(openSession, resolutionNow);
  const isResolvingOpenSession = Boolean(
    openSession && resolvingSessionId === openSession.id,
  );

  const openBookingTitle = openSession
    ? openSession.status === "queued_waiting_for_provider"
      ? "You are waiting in the provider queue."
      : openSession.status === "requested"
        ? "You already have a pending booking request."
      : openSession.status === "accepted_awaiting_payment"
        ? hasPendingPaymentConfirmation
          ? "Funding confirmation pending."
          : openSessionResolutionKind === "payment_timeout"
            ? "Payment window expired."
            : "Provider accepted your request."
        : openSession.status === "funded"
          ? openSessionResolutionKind === "no_show"
            ? "Session deadline passed."
            : "Your session is funded."
          : "Your session is in progress."
    : "";

  const openBookingActionLabel = openSession
    ? openSession.status === "queued_waiting_for_provider"
      ? "Leave Queue"
      : openSession.status === "accepted_awaiting_payment"
        ? hasPendingPaymentConfirmation
          ? "Awaiting Confirmation"
          : openSessionResolutionKind === "payment_timeout"
            ? isResolvingOpenSession
              ? "Resolving..."
              : "Resolve Timeout"
            : "Open Payment"
        : openSession.status === "funded"
        ? openSessionResolutionKind === "no_show"
          ? isResolvingOpenSession
            ? "Resolving..."
            : "Resolve No-Show"
          : "Open Chat Prompt"
        : openSession.status === "in_session"
        ? "Enter Chat"
        : undefined
    : undefined;
  const focusedSessionLabel = openSession
    ? openSession.status === "in_session"
      ? "Live"
      : "Funded"
    : "";
  const focusedSessionTitle = openSession
    ? openSession.status === "in_session"
      ? "Your session is live"
      : "Your session is funded"
    : "";
  const focusedSessionMessage = openSession
    ? openSession.status === "in_session"
      ? "Both participants are connected. Enter chat to continue your session."
      : "Waiting for both participants to enter."
    : "";
  const focusedSummaryCards = summaryCards.slice(0, 2);
  const openSessionChatHref =
    openSession &&
    isFundedOrLiveSessionStatus(openSession.status)
      ? `/chat?role=patient&address=${encodeURIComponent(
          openSession.therapistWallet,
        )}&sessionId=${encodeURIComponent(openSession.id)}`
      : "";

  const getBlockedBookingMessage = (status?: SessionWorkflowStatus | null) => {
    switch (status) {
      case "queued_waiting_for_provider":
        return "You already have an active wait-queue request. Leave it before starting a new booking.";
      case "requested":
        return "You already have a booking request waiting for provider action.";
      case "accepted_awaiting_payment":
        return "You already have a booking awaiting payment. Confirm or resolve it before starting a new booking.";
      case "funded":
      case "in_session":
        return "You already have an active funded or live session. Finish it before starting a new booking.";
      default:
        return "You already have an active booking or session on-chain. Refresh and review your current booking before trying again.";
    }
  };

  const readActivePatientOnchainSession = async (patientWallet: string) => {
    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      return null;
    }

    const activeSessionId = (await readContract(wagmiConfig, {
      address: contractAddress,
      abi: MINDPASS_ESCROW_ABI,
      functionName: "activeSessionOfPatient",
      args: [patientWallet as HexAddress],
      chainId: MINDPASS_ESCROW_CHAIN_ID,
    })) as bigint;

    if (activeSessionId === 0n) {
      return null;
    }

    const activeSession = normalizeMindPassEscrowSession(
      (await readContract(wagmiConfig, {
        address: contractAddress,
        abi: MINDPASS_ESCROW_ABI,
        functionName: "sessions",
        args: [activeSessionId],
        chainId: MINDPASS_ESCROW_CHAIN_ID,
      })) as readonly unknown[],
    );

    return { activeSessionId, activeSession };
  };

  const selfHealRequestedPatientSession = async (
    session: OpenSessionRecord,
    source: "dashboard",
  ) => {
    if (!supabase || session.status !== "requested" || !session.onchainSessionId) {
      return session;
    }

    logAcceptMirrorRecheck("patient_dashboard_requested_recheck", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: null,
      txHash: null,
      source,
      recoveryApplied: false,
    });

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      return session;
    }

    const chainSession = normalizeMindPassEscrowSession(
      (await readContract(wagmiConfig, {
        address: contractAddress,
        abi: MINDPASS_ESCROW_ABI,
        functionName: "sessions",
        args: [BigInt(session.onchainSessionId)],
        chainId: MINDPASS_ESCROW_CHAIN_ID,
      })) as readonly unknown[],
    );

    if (chainSession.status !== MINDPASS_ESCROW_STATUS.AcceptedAwaitingPayment) {
      return session;
    }

    logAcceptMirrorRecheck("route_session_status_mismatch", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: chainSession.status,
      txHash: null,
      source,
      recoveryApplied: false,
    });

    const { data, error } = await supabase
      .from("sessions")
      .update(
        buildBookingAcceptedPatch({
          acceptedAt: chainSession.providerAcceptedAt,
          paymentDueAt: chainSession.paymentDueAt,
          contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        }),
      )
      .eq("id", session.id)
      .eq("onchain_session_id", session.onchainSessionId)
      .select(DASHBOARD_SESSION_SELECT)
      .maybeSingle();

    if (error || !data) {
      return session;
    }

    logAcceptMirrorRecheck("patient_dashboard_requested_recovered", {
      sessionId: session.id,
      onchainSessionId: session.onchainSessionId,
      dbStatus: session.status,
      chainStatus: chainSession.status,
      txHash: null,
      source,
      recoveryApplied: true,
    });

    return normalizeOpenSession(data as Record<string, unknown>);
  };

  const syncBlockedBookingState = async (patientWallet: string) => {
    const existingOpenSession = await refetchLatestPatientOpenSession(patientWallet);
    if (existingOpenSession) {
      setOpenSession(existingOpenSession);
      setActiveEscrowCount(getActiveEscrowCountForSession(existingOpenSession));
      setBookingFeedbackFromSession(existingOpenSession);
      return {
        blocked: true,
        message: getBlockedBookingMessage(existingOpenSession.status),
      };
    }

    const activeOnchainSession = await readActivePatientOnchainSession(patientWallet);
    if (activeOnchainSession) {
      return {
        blocked: true,
        message: getBlockedBookingMessage(),
      };
    }

    return {
      blocked: false,
      message: null,
    };
  };

  const syncActiveRequestedSessionFromChain = async (patientWallet: string) => {
    if (!supabase) {
      return null;
    }

    const activeOnchainSession = await readActivePatientOnchainSession(patientWallet);
    if (
      !activeOnchainSession ||
      activeOnchainSession.activeSession.status !== MINDPASS_ESCROW_STATUS.Requested
    ) {
      return null;
    }

    const onchainSessionId = activeOnchainSession.activeSessionId.toString();
    const { data: existingRow, error: existingRowError } = await supabase
      .from("sessions")
      .select(DASHBOARD_SESSION_SELECT)
      .eq("onchain_session_id", onchainSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRowError) {
      throw existingRowError;
    }

    if (existingRow) {
      const nextSession = normalizeOpenSession(existingRow as Record<string, unknown>);
      return isOpenBookingStatus(nextSession.status) ? nextSession : null;
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      return null;
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from("sessions")
      .insert({
        ...buildBookingRequestedPatch({
          onchainSessionId,
          patient: activeOnchainSession.activeSession.patient,
          therapist: activeOnchainSession.activeSession.therapist,
          walletRequiredWei: activeOnchainSession.activeSession.walletRequiredWei,
          subsidyRequiredWei: activeOnchainSession.activeSession.subsidyRequiredWei,
          sessionMode: decodeSessionModeFromChain(
            activeOnchainSession.activeSession.sessionMode,
          ),
          contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        }),
        ack_penalty_policy: true,
        ack_illegal_policy: true,
        ack_single_active_booking: true,
        settlement_status: "pending",
      })
      .select(DASHBOARD_SESSION_SELECT)
      .single();

    if (insertError) {
      throw insertError;
    }

    const nextSession = normalizeOpenSession(insertedRow as Record<string, unknown>);
    logMirrorSync("dashboard active requested session chain catch-up complete", {
      sessionId: nextSession.id,
      onchainSessionId: nextSession.onchainSessionId,
      status: nextSession.status,
    });
    return nextSession;
  };

  const handleOpenBookingModal = async (therapist: Therapist) => {
    console.log("book button clicked", {
      bookingTherapistId,
      openSession,
      patientProfile,
      normalizedPatientWallet,
      isAuthorized,
    });

    if (bookingTherapistId) {
      setStandaloneBookingFeedback({
        message: "A booking request is already being submitted. Please wait.",
        tone: "warning",
      });
      return;
    }

    if (openSession) {
      setStandaloneBookingFeedback({
        message: getBlockedBookingMessage(openSession.status),
        tone: "warning",
      });
      return;
    }

    if (!normalizedPatientWallet || !isAuthorized || !patientProfile) {
      setStandaloneBookingFeedback({
        message:
          "Your patient session is not ready for booking yet. Refresh and reconnect your patient wallet before trying again.",
        tone: "warning",
      });
      return;
    }

    try {
      const bookingBlock = await syncBlockedBookingState(normalizedPatientWallet);
      if (bookingBlock.blocked) {
        const message = bookingBlock.message ?? "Booking is currently blocked.";
        setBookingModalError(message);
        setStandaloneBookingFeedback({
          message,
          tone: "warning",
        });
        return;
      }
    } catch (error) {
      setStandaloneBookingFeedback({
        message:
          error instanceof Error
            ? error.message
            : "Unable to verify the latest booking state right now.",
        tone: "warning",
      });
      return;
    }

    setBookingFeedback(null);
    setBookingModalError("");
    setSelectedTherapist(therapist);
  };

  const getEscrowContractAddress = () => {
    if (!address || !isConnected || accountStatus !== "connected") {
      throw new Error("Connect your wallet before sending a booking transaction.");
    }

    if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
      throw new Error("Switch to Sepolia before using the booking contract.");
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      throw new Error(
        "The MindPass escrow contract address is not configured in this app.",
      );
    }

    return contractAddress;
  };

  const getTherapistCardUiState = (therapist: Therapist): TherapistCardUiState => {
    const therapistWallet = therapist.walletAddress?.toLowerCase() ?? "";
    const waitState = therapistWaitStateMap[therapistWallet];
    const matchesOpenSession =
      Boolean(therapistWallet) &&
      therapistWallet === openSession?.therapistWallet.toLowerCase();

    if (matchesOpenSession && openSession?.status === "queued_waiting_for_provider") {
      const queueDetails = [
        openSession.queuePosition && openSession.queuePosition > 0
          ? `Queue position: #${openSession.queuePosition}`
          : "",
        openSession.estimatedReadyAt
          ? `Estimated wait: ${formatEstimatedWait(openSession.estimatedReadyAt, waitTimeNow)}`
          : "",
        openSession.estimatedReadyAt
          ? `Estimated ready around ${formatDateTime(openSession.estimatedReadyAt)}`
          : "",
      ].filter(Boolean);

      return {
        availabilityLabel: "In Wait Queue",
        detailMessage:
          queueDetails.join(" • ") ||
          "You are in the wait queue and can leave anytime without charge.",
        actionLabel: "Leave Queue",
        actionKind: "leave_queue",
        actionDisabled: Boolean(bookingTherapistId),
      };
    }

    if (matchesOpenSession) {
      switch (openSession?.status) {
        case "requested":
          return {
            availabilityLabel: "Pending Request",
            detailMessage: "Waiting for provider decision.",
            actionLabel: "Waiting for provider decision",
            actionKind: "locked",
            actionDisabled: true,
          };
        case "accepted_awaiting_payment":
          return {
            availabilityLabel: "Awaiting Payment",
            detailMessage: "Provider accepted your request. Confirm payment to continue.",
            actionLabel: "Awaiting payment",
            actionKind: "locked",
            actionDisabled: true,
          };
        case "funded":
          return {
            availabilityLabel: "Session funded",
            detailMessage: "Waiting for both participants to enter chat.",
            actionLabel: "Session funded",
            actionKind: "locked",
            actionDisabled: true,
          };
        case "in_session":
          return {
            availabilityLabel: "Session in progress",
            detailMessage: "This therapist is already in your live session.",
            actionLabel: "Session in progress",
            actionKind: "locked",
            actionDisabled: true,
          };
      }
    }

    if (openSession) {
      const hasQueuedSessionElsewhere =
        openSession.status === "queued_waiting_for_provider";

      return {
        availabilityLabel: "Booking locked",
        detailMessage: hasQueuedSessionElsewhere
          ? "You already have an active wait-queue request with another provider. Leave your current queue before booking another provider."
          : "You already have an active session or booking request with another provider. Finish or cancel it before booking another provider.",
        actionLabel: "Booking locked",
        actionKind: "locked",
        actionDisabled: true,
      };
    }

    if (waitState?.isBusy) {
      return {
        availabilityLabel: "Provider is currently busy",
        detailMessage: waitState.estimatedReadyAt
          ? `Join the wait queue and leave anytime without charge. Estimated wait ${formatEstimatedWait(
              waitState.estimatedReadyAt,
              waitTimeNow,
            )}. Estimated ready around ${formatDateTime(waitState.estimatedReadyAt)}.`
          : "Join the wait queue and leave anytime without charge.",
        actionLabel: "Join Wait Queue",
        actionKind: "join_wait_queue",
        actionDisabled: Boolean(bookingTherapistId),
      };
    }

    return {
      availabilityLabel: therapist.availability,
      detailMessage: bookingPreviewMessage,
      actionLabel: "Book Session",
      actionKind: "book",
      actionDisabled: Boolean(bookingTherapistId),
    };
  };

  const handleConfirmBookingRequest = async (payload: {
    selfPay: number;
    subsidyAmount: number;
    fundingSource: "subsidy" | "mixed" | "wallet";
  }) => {
    if (
      !supabase ||
      !normalizedPatientWallet ||
      !selectedTherapist?.walletAddress ||
      bookingTherapistId ||
      openSession
    ) {
      alert("Unable to book this session right now. Please try again.");
      return;
    }

    setBookingTherapistId(selectedTherapist.id);
    setBookingModalError("");
    setStandaloneBookingFeedback(null);

    const currentPatientProfile = patientProfile;
    if (!currentPatientProfile) {
      setBookingTherapistId(null);
      return;
    }

    try {
      const safeFunding = resolveFundingChoice(
        currentPatientProfile.subsidyBalance,
        payload.selfPay,
        SESSION_FEE_ETH,
      );
      const existingOpenSession = await refetchLatestPatientOpenSession(
        normalizedPatientWallet,
      );

      if (existingOpenSession) {
        setOpenSession(existingOpenSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(existingOpenSession));
        setSelectedTherapist(null);
        setBookingFeedbackFromSession(existingOpenSession);
        return;
      }

      const activeOnchainSession = await readActivePatientOnchainSession(
        normalizedPatientWallet,
      );
      if (activeOnchainSession) {
        setBookingModalError(getBlockedBookingMessage());
        const refreshedOpenSession = await refetchLatestPatientOpenSession(
          normalizedPatientWallet,
        );
        if (refreshedOpenSession) {
          setOpenSession(refreshedOpenSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(refreshedOpenSession));
          setBookingFeedbackFromSession(refreshedOpenSession);
        }
        return;
      }

      if (selectedTherapistRequestKind === "wait_queue") {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("sessions")
          .insert({
            patient_wallet: normalizedPatientWallet,
            therapist_wallet: selectedTherapist.walletAddress.toLowerCase(),
            status: "queued_waiting_for_provider",
            session_mode: "text",
            amount_eth: SESSION_FEE_ETH,
            session_fee_eth: SESSION_FEE_ETH,
            escrow_amount: SESSION_FEE_ETH,
            funding_source: safeFunding.fundingSource,
            patient_subsidy_choice_eth: safeFunding.patientSubsidyChoiceEth,
            patient_wallet_choice_eth: safeFunding.patientWalletChoiceEth,
            subsidy_applied_eth: safeFunding.patientSubsidyChoiceEth,
            wallet_required_eth: safeFunding.patientWalletChoiceEth,
            wallet_funded_eth: 0,
            queue_entered_at: now,
            estimated_ready_at: selectedTherapistWaitState?.estimatedReadyAt ?? null,
            ack_penalty_policy: true,
            ack_illegal_policy: true,
            ack_single_active_booking: true,
            settlement_status: "pending",
          })
          .select(DASHBOARD_SESSION_SELECT)
          .single();

        if (error) {
          console.error("Failed to join provider wait queue", error);
          setBookingModalError("Unable to join the queue right now. Please try again.");
          return;
        }

        const nextSession = normalizeOpenSession(data as Record<string, unknown>);
        setOpenSession(nextSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
        setSelectedTherapist(null);
        setStandaloneBookingFeedback({
          message: getSettlementPreview(nextSession.status),
          tone: buildBookingFeedback(nextSession.status).tone,
        });
        return;
      }

      if (!address || address.toLowerCase() !== normalizedPatientWallet) {
        setBookingModalError(
          "Connect the patient wallet before sending a booking transaction.",
        );
        return;
      }

      const contractAddress = getEscrowContractAddress();
      const bookingRequest = prepareCreateBookingRequest({
        address: contractAddress,
        therapist: selectedTherapist.walletAddress.toLowerCase() as HexAddress,
        walletRequiredWei: parseEther(
          safeFunding.patientWalletChoiceEth.toFixed(6),
        ),
        subsidyRequiredWei: parseEther(
          safeFunding.patientSubsidyChoiceEth.toFixed(6),
        ),
        sessionMode: "text",
      });
      logEscrowDebug("submitting booking request", {
        source: "dashboard",
        therapistWallet: selectedTherapist.walletAddress.toLowerCase(),
        patientWallet: normalizedPatientWallet,
        walletRequiredWei: bookingRequest.args[1].toString(),
        subsidyRequiredWei: bookingRequest.args[2].toString(),
      });

      const { request: simulatedBookingRequest } = await simulateContract(
        wagmiConfig,
        {
          address: bookingRequest.address,
          abi: bookingRequest.abi,
          functionName: "createBookingRequest",
          args: bookingRequest.args,
          chainId: bookingRequest.chainId,
          account: address,
        },
      );

      const hash = await writeContract(wagmiConfig, {
        ...simulatedBookingRequest,
        address: bookingRequest.address,
        abi: bookingRequest.abi,
        functionName: "createBookingRequest",
        args: bookingRequest.args,
        chainId: bookingRequest.chainId,
      });
      let receipt;
      try {
        receipt = await waitForTransactionReceipt(wagmiConfig, {
          chainId: MINDPASS_ESCROW_CHAIN_ID,
          hash,
        });
      } catch (receiptError) {
        if (!isPendingReceiptLookupError(receiptError)) {
          throw receiptError;
        }

        storePendingBookingTxHash(hash);
        const recovery = await trySyncBookingByTxHash(hash);
        if (recovery.ok) {
          clearPendingBookingTxHash();
          const recoveredSession = await refetchLatestPatientOpenSession(
            normalizedPatientWallet,
          );
          if (recoveredSession) {
            logMirrorSync("dashboard pending booking recovered after receipt lookup miss", {
              txHash: hash,
              sessionId: recoveredSession.id,
              onchainSessionId: recoveredSession.onchainSessionId,
            });
            setOpenSession(recoveredSession);
            setActiveEscrowCount(getActiveEscrowCountForSession(recoveredSession));
            setSelectedTherapist(null);
            setStandaloneBookingFeedback({
              message: getSettlementPreview(recoveredSession.status),
              tone: buildBookingFeedback(recoveredSession.status).tone,
            });
            return;
          }
        }

        setSelectedTherapist(null);
        setStandaloneBookingFeedback({
          message:
            "Booking submitted. The network has not returned the receipt yet, so confirmation is still pending.",
          tone: "warning",
        });
        setBookingModalError(
          "Booking submitted, but the confirmation receipt is still pending. Wait a moment before retrying.",
        );
        return;
      }
      logReceiptDecode({
        context: "dashboard booking receipt decoded",
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      });
      const bookingRequestedEvent = findMindPassEscrowEvent(
        receipt.logs,
        "BookingRequested",
      );

      if (!bookingRequestedEvent) {
        throw new Error("Booking transaction succeeded, but the booking event was missing.");
      }

      const { data, error } = await supabase
        .from("sessions")
        .insert({
          ...buildBookingRequestedPatch({
            onchainSessionId: bookingRequestedEvent.args.sessionId,
            patient: String(bookingRequestedEvent.args.patient),
            therapist: String(bookingRequestedEvent.args.therapist),
            walletRequiredWei: bookingRequestedEvent.args.walletRequiredWei,
            subsidyRequiredWei: bookingRequestedEvent.args.subsidyRequiredWei,
            sessionMode: "text",
            contractAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          }),
          ack_penalty_policy: true,
          ack_illegal_policy: true,
          ack_single_active_booking: true,
          settlement_status: "pending",
        })
        .select(DASHBOARD_SESSION_SELECT)
        .single();

      if (error || !data) {
        try {
          const recoveryResponse = await fetch("/api/escrow/sync-booking", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ txHash: receipt.transactionHash }),
          });
          const recoveryPayload = (await recoveryResponse.json()) as {
            ok?: boolean;
            error?: string;
          };

          if (!recoveryResponse.ok || !recoveryPayload.ok) {
            throw new Error(
              recoveryPayload.error ??
                "The booking transaction succeeded, but the session record could not be resynced.",
            );
          }

          const recoveredSession = await refetchLatestPatientOpenSession(
            normalizedPatientWallet,
          );
          if (!recoveredSession) {
            throw new Error(
              "The booking transaction succeeded, but the session record is still unavailable after recovery.",
            );
          }

          logMirrorSync("dashboard booking fallback mirror sync complete", {
            txHash: receipt.transactionHash,
            sessionId: recoveredSession.id,
            onchainSessionId: recoveredSession.onchainSessionId,
          });
          setOpenSession(recoveredSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(recoveredSession));
          setSelectedTherapist(null);
          setStandaloneBookingFeedback({
            message: getSettlementPreview(recoveredSession.status),
            tone: buildBookingFeedback(recoveredSession.status).tone,
          });
          return;
        } catch (recoveryError) {
          logMirrorSyncError("dashboard booking mirror sync failed", {
            txHash: receipt.transactionHash,
            message:
              error?.message ??
              (recoveryError instanceof Error
                ? recoveryError.message
                : "Booking recovery failed."),
          });
          setBookingModalError(
            "The booking transaction succeeded, but the session record could not be synced. Please refresh.",
          );
          return;
        }
      }

      logMirrorSync("dashboard booking mirror sync complete", {
        txHash: receipt.transactionHash,
        sessionId: data?.id ?? null,
        onchainSessionId: data?.onchain_session_id ?? null,
      });
      const nextSession = normalizeOpenSession(data as Record<string, unknown>);
      setOpenSession(nextSession);
      setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
      setSelectedTherapist(null);
      setStandaloneBookingFeedback({
        message: getSettlementPreview(nextSession.status),
        tone: buildBookingFeedback(nextSession.status).tone,
      });
      clearPendingBookingTxHash();
    } catch (error) {
      console.error("Failed to create booking request", error);
      const bookingMessage =
        error instanceof Error &&
        (error.message.includes("SessionAlreadyExists") ||
          error.message.includes("0x61becbbc"))
          ? getBlockedBookingMessage()
          : null;
      setBookingModalError(
        bookingMessage ??
          (error instanceof Error
            ? error.message
            : "Unable to book this session right now. Please try again."),
      );
    } finally {
      setBookingTherapistId(null);
    }
  };

  useEffect(() => {
    if (!normalizedPatientWallet || openSession) {
      return;
    }

    const pendingBookingTxHash = getPendingBookingTxHash();
    if (!pendingBookingTxHash) {
      return;
    }

    let isCancelled = false;

    const recoverPendingBooking = async () => {
      const recovery = await trySyncBookingByTxHash(pendingBookingTxHash);
      if (isCancelled) {
        return;
      }

      if (!recovery.ok) {
        if (!bookingFeedback) {
          setStandaloneBookingFeedback({
            message:
              "A booking transaction is still awaiting confirmation. Please wait before retrying.",
            tone: "warning",
          });
        }
        return;
      }

      const recoveredSession = await refetchLatestPatientOpenSession(
        normalizedPatientWallet,
      );
      if (isCancelled || !recoveredSession) {
        return;
      }

      clearPendingBookingTxHash();
      logMirrorSync("dashboard pending booking recovery sync complete", {
        txHash: pendingBookingTxHash,
        sessionId: recoveredSession.id,
        onchainSessionId: recoveredSession.onchainSessionId,
      });
      setOpenSession(recoveredSession);
      setActiveEscrowCount(getActiveEscrowCountForSession(recoveredSession));
      setStandaloneBookingFeedback({
        message: getSettlementPreview(recoveredSession.status),
        tone: buildBookingFeedback(recoveredSession.status).tone,
      });
    };

    void recoverPendingBooking();

    return () => {
      isCancelled = true;
    };
  }, [bookingFeedback, normalizedPatientWallet, openSession]);

  useEffect(() => {
    if (!normalizedPatientWallet || openSession) {
      return;
    }

    let isCancelled = false;

    const recoverMissingRequestedSession = async () => {
      try {
        const recoveredSession = await syncActiveRequestedSessionFromChain(
          normalizedPatientWallet,
        );
        if (isCancelled || !recoveredSession) {
          return;
        }

        setOpenSession(recoveredSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(recoveredSession));
        setBookingFeedbackFromSession(recoveredSession);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        logMirrorSyncError("dashboard active requested session chain catch-up failed", {
          patientWallet: normalizedPatientWallet,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };

    void recoverMissingRequestedSession();

    return () => {
      isCancelled = true;
    };
  }, [normalizedPatientWallet, openSession]);

  const handleLeaveQueue = async () => {
    if (!supabase || !openSession || openSession.status !== "queued_waiting_for_provider") {
      return;
    }

    setBookingModalError("");
    setStandaloneBookingFeedback(null);

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("sessions")
        .update({
          status: "patient_cancelled_waiting",
          patient_cancelled_waiting_at: now,
          patient_cancelled_at: now,
          settlement_status: "cancelled",
        })
        .eq("id", openSession.id)
        .eq("status", "queued_waiting_for_provider")
        .select(DASHBOARD_SESSION_SELECT)
        .maybeSingle();

      if (error) {
        console.error("Failed to leave provider queue", error);
        setBookingModalError("Unable to leave the queue right now. Please try again.");
        setStandaloneBookingFeedback({
          message: "Unable to leave the queue right now. Please try again.",
          tone: "warning",
        });
        return;
      }

      if (!data) {
        const refreshedSession = await refetchLatestPatientOpenSession(
          openSession.patientWallet.toLowerCase(),
        );

        setOpenSession(refreshedSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
        if (refreshedSession) {
          setBookingFeedbackFromSession(refreshedSession);
        } else {
          setStandaloneBookingFeedback(
            {
              message: getSettlementPreview("patient_cancelled_waiting"),
              tone: "success",
            },
          );
        }
        return;
      }

      const cancelledSession = normalizeOpenSession(data as Record<string, unknown>);
      setOpenSession(null);
      setActiveEscrowCount(0);
      setBookingFeedbackFromSession(cancelledSession);
    } catch (error) {
      console.error("Failed to leave provider queue", error);
      setBookingModalError("Unable to leave the queue right now. Please try again.");
      setStandaloneBookingFeedback({
        message: "Unable to leave the queue right now. Please try again.",
        tone: "warning",
      });
    }
  };

  const handleConfirmPayment = async () => {
    if (!supabase || !openSession || isPaymentSubmitting) {
      return;
    }

    const client = supabase;
    setIsPaymentSubmitting(true);
    setPaymentModalError("");

    try {
      if (!openSession.onchainSessionId) {
        setPaymentModalError("This booking is missing an on-chain session id.");
        return;
      }

      let onchainSessionId: string;
      try {
        onchainSessionId = normalizeOnchainSessionId(openSession.onchainSessionId);
      } catch {
        setPaymentModalError(
          "This booking is missing a valid on-chain session id. Please refresh and review the latest session status before trying again.",
        );
        return;
      }

      if (!address || address.toLowerCase() !== openSession.patientWallet.toLowerCase()) {
        setPaymentModalError(
          "Connect the patient wallet before confirming payment.",
        );
        return;
      }

      const contractAddress = getEscrowContractAddress();
      let latestSession = openSession;
      const syncFundedSession = async (
        chainSession: ReturnType<typeof normalizeMindPassEscrowSession>,
      ) => {
        const fundedPatch = buildSessionFundedPatch({
          walletFundedWei: chainSession.walletFundedWei,
          subsidyFundedWei: chainSession.subsidyFundedWei,
          fundedAt: chainSession.fundedAt,
          noShowDeadlineAt: chainSession.noShowDeadlineAt,
          contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        });
        const { data, error } = await client
          .from("sessions")
          .update(fundedPatch)
          .eq("id", latestSession.id)
          .eq("onchain_session_id", latestSession.onchainSessionId)
          .select(DASHBOARD_SESSION_SELECT)
          .maybeSingle();

        if (error) {
          logMirrorSyncError("dashboard funded preflight mirror sync failed", {
            sessionId: latestSession.id,
            onchainSessionId: latestSession.onchainSessionId,
            message: error.message,
          });
          return null;
        }

        if (!data) {
          return null;
        }

        const nextSession = normalizeOpenSession(data as Record<string, unknown>);
        logMirrorSync("dashboard funded preflight mirror sync complete", {
          sessionId: nextSession.id,
          onchainSessionId: nextSession.onchainSessionId,
          status: nextSession.status,
        });
        setOpenSession(nextSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
        setBookingFeedbackFromSession(nextSession);
        setDismissedReadySessionId(null);
        return nextSession;
      };
      const latestChainSession = normalizeMindPassEscrowSession(
        (await readContract(wagmiConfig, {
          address: contractAddress,
          abi: MINDPASS_ESCROW_ABI,
          functionName: "sessions",
          args: [BigInt(onchainSessionId)],
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        })) as readonly unknown[],
      );

      if (
        latestChainSession.status !==
        MINDPASS_ESCROW_STATUS.AcceptedAwaitingPayment
      ) {
        setIsPaymentModalOpen(false);
        if (latestChainSession.status === MINDPASS_ESCROW_STATUS.Funded) {
          const syncedFundedSession = await syncFundedSession(latestChainSession);
          if (syncedFundedSession?.status === "funded") {
            return;
          }
        }
        const refreshedSession = await refetchLatestPatientOpenSession(
          openSession.patientWallet.toLowerCase(),
        );
        setOpenSession(refreshedSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
        if (refreshedSession) {
          setBookingFeedbackFromSession(refreshedSession);
        }
        setPaymentModalError(
          "This booking is no longer awaiting payment. Please refresh and review the latest session status before trying again.",
        );
        return;
      }

      const shouldRunWalletFunding = needsWalletFunding({
        walletRequiredEth: latestSession.walletRequiredEth,
        walletFundedEth: latestSession.walletFundedEth,
      });

      if (shouldRunWalletFunding) {
        const fundRequest = prepareFundPatientPortion({
          address: contractAddress,
          sessionId: BigInt(onchainSessionId),
          valueWei: parseEther(latestSession.patientWalletChoiceEth.toFixed(6)),
        });
        logEscrowDebug("submitting patient wallet funding", {
          source: "dashboard",
          sessionId: latestSession.id,
          onchainSessionId: latestSession.onchainSessionId,
          functionName: fundRequest.functionName,
          valueWei: fundRequest.value?.toString() ?? null,
        });
        const { request: simulatedFundRequest } = await simulateContract(
          wagmiConfig,
          {
            address: fundRequest.address,
            abi: fundRequest.abi,
            functionName: "fundPatientPortion",
            args: fundRequest.args,
            value: fundRequest.value,
            chainId: fundRequest.chainId,
            account: address,
          },
        );
        const hash = await writeContract(wagmiConfig, {
          ...simulatedFundRequest,
          address: fundRequest.address,
          abi: fundRequest.abi,
          functionName: "fundPatientPortion",
          args: fundRequest.args,
          value: fundRequest.value,
          chainId: fundRequest.chainId,
        });
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          chainId: MINDPASS_ESCROW_CHAIN_ID,
          hash,
        });
        logReceiptDecode({
          context: "dashboard patient funding receipt decoded",
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          logs: receipt.logs,
        });
        const patientFundingEvent = findMindPassEscrowEvent(
          receipt.logs,
          "PatientPortionFunded",
        );
        const sessionFundedEvent = findMindPassEscrowEvent(receipt.logs, "SessionFunded");

        if (!patientFundingEvent) {
          throw new Error("Payment transaction succeeded, but the funding event was missing.");
        }

        const updatePatch = {
          ...buildPatientFundingPatch({
            amountWei: patientFundingEvent.args.amountWei,
            contractAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          }),
          ...(sessionFundedEvent
            ? buildSessionFundedPatch({
                walletFundedWei: sessionFundedEvent.args.walletFundedWei,
                subsidyFundedWei: sessionFundedEvent.args.subsidyFundedWei,
                fundedAt: sessionFundedEvent.args.fundedAt,
                noShowDeadlineAt: sessionFundedEvent.args.noShowDeadlineAt,
                contractAddress,
                chainId: MINDPASS_ESCROW_CHAIN_ID,
                txHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
              })
            : {}),
          patient_paid_at: new Date().toISOString(),
        };

        const recoverFundingMirror = async (message: string) => {
          try {
            const response = await fetch("/api/escrow/sync-funding", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                txHash: receipt.transactionHash,
                sessionId: latestSession.id,
              }),
            });

            const payload = (await response.json().catch(() => null)) as
              | {
                  error?: string;
                  session?: Record<string, unknown> | null;
                }
              | null;

            if (!response.ok || !payload?.session) {
              logMirrorSyncError("dashboard patient funding service-role mirror sync failed", {
                sessionId: latestSession.id,
                onchainSessionId: latestSession.onchainSessionId,
                txHash: receipt.transactionHash,
                message: payload?.error ?? message,
              });
              return null;
            }

            const recoveredSession = normalizeOpenSession(payload.session);
            logMirrorSync("dashboard patient funding service-role mirror sync complete", {
              sessionId: recoveredSession.id,
              onchainSessionId: recoveredSession.onchainSessionId,
              txHash: receipt.transactionHash,
              status: recoveredSession.status,
            });
            return recoveredSession;
          } catch (recoveryError) {
            logMirrorSyncError("dashboard patient funding service-role mirror sync request failed", {
              sessionId: latestSession.id,
              onchainSessionId: latestSession.onchainSessionId,
              txHash: receipt.transactionHash,
              message:
                recoveryError instanceof Error
                  ? recoveryError.message
                  : message,
            });
            return null;
          }
        };

        const { data, error } = await client
          .from("sessions")
          .update(updatePatch)
          .eq("id", latestSession.id)
          .eq("onchain_session_id", latestSession.onchainSessionId)
          .eq("status", "accepted_awaiting_payment")
          .select(DASHBOARD_SESSION_SELECT)
          .maybeSingle();

        if (error) {
          logMirrorSyncError("dashboard patient funding mirror sync failed", {
            sessionId: latestSession.id,
            onchainSessionId: latestSession.onchainSessionId,
            txHash: receipt.transactionHash,
            message: error.message,
          });
          const recoveredSession = await recoverFundingMirror(error.message);
          if (!recoveredSession) {
            setPaymentModalError(
              "Mirror sync failed after successful wallet leg. Please refresh before retrying the subsidy leg.",
            );
            return;
          }

          latestSession = recoveredSession;
          setOpenSession(latestSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(latestSession));
          setBookingFeedbackFromSession(latestSession);
        }

        if (!data) {
          const recoveredSession = await recoverFundingMirror(
            "The wallet payment succeeded, but the session record could not be resynced.",
          );

          if (!recoveredSession) {
            const refreshedSession = await refetchLatestPatientOpenSession(
              latestSession.patientWallet.toLowerCase(),
            );
            setOpenSession(refreshedSession);
            setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
            setPaymentModalError(
              "The wallet payment succeeded, but the latest session state could not be refreshed cleanly. Please review the booking.",
            );
            return;
          }

          latestSession = recoveredSession;
          setOpenSession(latestSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(latestSession));
          setBookingFeedbackFromSession(latestSession);
        } else {
          latestSession = normalizeOpenSession(data as Record<string, unknown>);
          logMirrorSync("dashboard patient funding mirror sync complete", {
            sessionId: latestSession.id,
            onchainSessionId: latestSession.onchainSessionId,
            txHash: receipt.transactionHash,
            status: latestSession.status,
          });
          setOpenSession(latestSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(latestSession));
          setBookingFeedbackFromSession(latestSession);
        }
      }

      const shouldRunSubsidyFunding = needsSubsidyFunding({
        subsidyAppliedEth: latestSession.subsidyAppliedEth,
        subsidyFundedEth: latestSession.subsidyFundedEth,
      });

      if (shouldRunSubsidyFunding) {
        logEscrowDebug("requesting subsidy relayer funding", {
          source: "dashboard",
          sessionId: latestSession.id,
          onchainSessionId: latestSession.onchainSessionId,
        });
        const response = await fetch("/api/escrow/fund-subsidy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: latestSession.id,
          }),
        });

        const payload = (await response.json().catch(() => null)) as SubsidyFundingResponse | null;

        if (!response.ok) {
          logEscrowDebug("subsidy relayer request failed", {
            source: "dashboard",
            sessionId: latestSession.id,
            onchainSessionId: latestSession.onchainSessionId,
            responseStatus: response.status,
            responseCode: payload?.code ?? null,
            responsePayload: payload,
          });
          const refreshedSession = await refetchLatestPatientOpenSession(
            latestSession.patientWallet.toLowerCase(),
          );
          setOpenSession(refreshedSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
          setBookingFeedbackFromSession(refreshedSession);
          setPaymentModalError(getSubsidyFundingErrorMessage(payload?.code, payload));
          return;
        }

        if (payload?.session) {
          latestSession = normalizeOpenSession(payload.session);
          logMirrorSync("dashboard subsidy relayer sync complete", {
            sessionId: latestSession.id,
            onchainSessionId: latestSession.onchainSessionId,
            code: payload?.code ?? null,
          });
        }
      }

      const refreshedSession = await refetchLatestPatientOpenSession(
        latestSession.patientWallet.toLowerCase(),
      );
      const nextSession = refreshedSession ?? latestSession;
      setOpenSession(nextSession);
      setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
      setBookingFeedbackFromSession(nextSession);

      if (nextSession?.status === "funded") {
        setIsPaymentModalOpen(false);
        setDismissedReadySessionId(null);
        return;
      }

      setPaymentModalError(
        "Funding is still syncing. Please review the latest booking state before trying again.",
      );
    } catch (error) {
      console.error("Failed to confirm patient payment", error);
      setPaymentModalError(
        error instanceof Error
          ? error.message
          : "Unable to confirm payment right now. Please try again.",
      );
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const getResolutionErrorMessage = (
    resolutionKind: "payment_timeout" | "no_show",
    error: unknown,
  ) => {
    const fallback =
      resolutionKind === "payment_timeout"
        ? "Unable to resolve the expired payment window on-chain."
        : "Unable to resolve the no-show outcome on-chain.";

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
      return resolutionKind === "payment_timeout"
        ? "Wallet signing was cancelled. Payment timeout is still unresolved on-chain."
        : "Wallet signing was cancelled. No-show is still unresolved on-chain.";
    }

    if (message.includes("switch to sepolia")) {
      return "Wrong chain. Switch to Sepolia before resolving this escrow outcome.";
    }

    if (
      resolutionKind === "payment_timeout" &&
      message.includes("paymentwindowstillopen")
    ) {
      return "The payment window is still open on-chain. Continue waiting for funding confirmation or for the full payment window to pass.";
    }

    return error.message || fallback;
  };

  const handleResolveOpenSession = async () => {
    if (!supabase || !openSession || isResolvingOpenSession) {
      return;
    }

    const client = supabase;
    const resolutionKind = getEscrowResolutionKind(openSession, Date.now());
    if (!resolutionKind) {
      setDashboardError("This session is not ready for on-chain resolution.");
      return;
    }

    setResolvingSessionId(openSession.id);
    setDashboardError("");

    try {
      const contractAddress = getEscrowContractAddress();
      if (!openSession.onchainSessionId) {
        setDashboardError("This booking is missing an on-chain session id.");
        return;
      }

      const onchainSessionId = BigInt(openSession.onchainSessionId);

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
          return null;
        }

        const { data, error } = await client
          .from("sessions")
          .update(compactSessionSyncPatch(updatePatch))
          .eq("id", openSession.id)
          .eq("onchain_session_id", openSession.onchainSessionId)
          .select(DASHBOARD_SESSION_SELECT)
          .maybeSingle();

        if (error) {
          logMirrorSyncError("dashboard overdue resolution mirror sync failed", {
            sessionId: openSession.id,
            onchainSessionId: openSession.onchainSessionId,
            txHash: options.resolutionTxHash ?? null,
            message: error.message,
          });
          setDashboardError(
            options.resolutionTxHash
              ? "Mirror sync failed after successful on-chain resolution. Please refresh."
              : "This session is already resolved on-chain, but the mirror sync failed. Please refresh.",
          );
          return null;
        }

        if (!data) {
          setDashboardError(
            options.resolutionTxHash
              ? "On-chain resolution succeeded, but the updated session row could not be loaded."
              : "This session is already resolved on-chain, but the updated session row could not be loaded.",
          );
          return null;
        }

        const nextSession = normalizeOpenSession(data as Record<string, unknown>);
        logMirrorSync("dashboard overdue resolution mirror sync complete", {
          sessionId: nextSession.id,
          onchainSessionId: nextSession.onchainSessionId,
          txHash: options.resolutionTxHash ?? null,
          status: nextSession.status,
          alreadyResolved: options.alreadyResolved ?? false,
        });

        setOpenSession(null);
        setLatestTerminalSession(nextSession);
        setActiveEscrowCount(0);
        setIsPaymentModalOpen(false);
        openDeadlineOutcomeModal(nextSession);
        setBookingFeedbackFromSession(nextSession);
        return nextSession;
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
          .eq("id", openSession.id)
          .eq("onchain_session_id", openSession.onchainSessionId)
          .select(DASHBOARD_SESSION_SELECT)
          .maybeSingle();

        if (error) {
          logMirrorSyncError("dashboard funded timeout catch-up mirror sync failed", {
            sessionId: openSession.id,
            onchainSessionId: openSession.onchainSessionId,
            txHash: options.txHash ?? null,
            message: error.message,
          });
          setDashboardError(
            options.txHash
              ? "Mirror sync failed after detecting that this session is already funded on-chain. Please refresh."
              : "This session is already funded on-chain, but the mirror sync failed. Please refresh.",
          );
          return null;
        }

        if (!data) {
          setDashboardError(
            options.txHash
              ? "This session is already funded on-chain, but the updated session row could not be loaded."
              : "This session is already funded on-chain, but the updated session row could not be loaded.",
          );
          return null;
        }

        const nextSession = normalizeOpenSession(data as Record<string, unknown>);
        logMirrorSync("dashboard funded timeout catch-up mirror sync complete", {
          sessionId: nextSession.id,
          onchainSessionId: nextSession.onchainSessionId,
          txHash: options.txHash ?? null,
          status: nextSession.status,
          alreadyFunded: options.alreadyFunded ?? false,
        });

        setOpenSession(nextSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
        setIsPaymentModalOpen(false);
        setDismissedReadySessionId(null);
        setBookingFeedbackFromSession(nextSession);
        return nextSession;
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
        sessionId: openSession.id,
        onchainSessionId: openSession.onchainSessionId,
        status: openSession.status,
        paymentDueAt: openSession.paymentDueAt,
        now: new Date().toISOString(),
        remainingSeconds: getPaymentWindowRemainingSeconds(openSession.paymentDueAt),
        source: "dashboard",
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

      logEscrowDebug("submitting overdue session resolution", {
        source: "dashboard",
        sessionId: openSession.id,
        onchainSessionId: openSession.onchainSessionId,
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
        context: "dashboard overdue resolution receipt decoded",
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
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        resolutionKind === "payment_timeout" &&
        message.includes("paymentwindowstillopen")
      ) {
        const refreshedSession = await refetchLatestPatientOpenSession(
          openSession.patientWallet.toLowerCase(),
        );
        setOpenSession(refreshedSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
        if (refreshedSession) {
          setBookingFeedbackFromSession(refreshedSession);
          logPaymentWindow180("payment_window_still_open_recovered", {
            sessionId: refreshedSession.id,
            onchainSessionId: refreshedSession.onchainSessionId,
            status: refreshedSession.status,
            paymentDueAt: refreshedSession.paymentDueAt,
            now: new Date().toISOString(),
            remainingSeconds: getPaymentWindowRemainingSeconds(
              refreshedSession.paymentDueAt,
            ),
            source: "dashboard",
            trigger: "resolve_error_recovery",
          });
        }
      }
      console.error("[escrow-debug] Failed to resolve overdue session", error);
      setDashboardError(getResolutionErrorMessage(resolutionKind, error));
    } finally {
      setResolvingSessionId(null);
    }
  };

  if (sessionGuard.authResolutionState === "pending") {
    return null;
  }

  if (isProviderBlocked) {
    return (
      <main className="app-shell page-canvas page-canvas-soft relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
        <div className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-10">
          <GlassCard className="glass-panel p-6 sm:p-8">
            <div className="space-y-4">
              <div className="glass-chip-muted w-fit px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Role Isolation
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
                  Access Denied: You are currently logged in as a Provider.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
                  You cannot access the Patient Vault. Please use the navigation
                  bar to return to the Provider Lobby, or Sign Out.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    );
  }

  const handleEnterOpenSessionChat = () => {
    if (!openSessionChatHref || isSessionReadyNavigating) {
      return;
    }

    setIsSessionReadyNavigating(true);
    router.push(openSessionChatHref);
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

    router.push(buildSessionEndRequestChatHref(updatedNotification, "patient"));
  };

  return (
    <main className="app-shell-subtle page-canvas page-canvas-violet relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        <header className="liquid-glass-strong glass-panel mb-10 flex flex-col gap-5 rounded-[30px] px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-sm uppercase tracking-[0.26em] text-[var(--accent-primary-strong)]">
              Patient Vault
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
              {shortAddress ? `${shortAddress}'s Vault` : "Anonymous Vault"}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              Manage your Sepolia ETH balance, browse verified therapists, and enter your wallet-gated session channel without exposing your identity.
            </p>
            {shortAddress ? (
              <p className="mt-3 text-sm text-[var(--text-faint)]">
                Connected Wallet: {shortAddress}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="button-secondary rounded-full px-5 py-3 text-sm font-medium"
            >
              Sign Out
            </button>
            <button className="button-primary rounded-full px-5 py-3 text-sm font-medium">
              {shortAddress || "Wallet Unavailable"}
            </button>
          </div>
        </header>

        {dashboardError ? (
          <div className="liquid-glass-soft mb-6 rounded-[24px] border border-red-400/20 bg-red-500/8 px-4 py-4">
            <p className="text-sm text-red-600 dark:text-red-300">
              {dashboardError}
            </p>
          </div>
        ) : null}

        {shouldShowBookingFeedbackBanner
          ? (() => {
              const feedback = bookingFeedback;

              if (!feedback) {
                return null;
              }

              return (
                <div
                  className={`liquid-glass-soft mb-6 rounded-[24px] px-4 py-4 ${
                    feedback.tone === "success"
                      ? "border border-emerald-400/20 bg-emerald-500/8"
                      : "border border-amber-400/20 bg-amber-400/10"
                  }`}
                >
                  <p
                    className={`text-sm ${
                      feedback.tone === "success"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-200"
                    }`}
                  >
                    {feedback.message}
                  </p>
                </div>
              );
            })()
          : null}

        {patientRefundSession ? (
          <GlassCard className="glass-panel liquid-glass-strong mb-6 rounded-[30px] p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Refund Settlement
                  </span>
                  <StatusBadge
                    label={
                      patientRefundWithdrawalRequired
                        ? "Withdrawal Required"
                        : patientRefundSession.patientWithdrawalTxHash
                          ? "Withdrawn"
                          : patientRefundSession.vaultRefundEth > 0 &&
                              patientRefundSession.patientRefundEth <= 0
                            ? "Vault Refund"
                            : "Settled"
                    }
                    tone={
                      patientRefundWithdrawalRequired ||
                      patientRefundSession.vaultRefundEth > 0
                        ? "warning"
                        : "success"
                    }
                  />
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">
                  Refund allocation details
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  {patientRefundStatusMessage}
                </p>
              </div>

              {canClaimPatientRefund ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleClaimPatientRefund();
                  }}
                  disabled={isClaimingPatientRefund}
                  className="button-primary min-w-[190px] rounded-full px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isClaimingPatientRefund ? "Withdrawing..." : "Withdraw Refund"}
                </button>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Patient Refund
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                  {formatPreciseEth(patientRefundSession.patientRefundEth)}
                </p>
              </div>
              <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Subsidy/Vault Refund
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                  {formatPreciseEth(patientRefundSession.vaultRefundEth)}
                </p>
              </div>
              <div className="liquid-glass-soft rounded-[22px] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Withdrawal Required
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                  {patientRefundWithdrawalRequired ? "Yes" : "No"}
                </p>
              </div>
            </div>
          </GlassCard>
        ) : null}

        <div className="mb-8">
          <SessionEndRequestNotificationsPanel
            eyebrow="Session Alerts"
            title="Pending End-Session Requests"
            roleLabel="patient"
            notifications={sessionEndNotifications.notifications}
            unreadCount={sessionEndNotifications.unreadCount}
            isLoading={sessionEndNotifications.isLoading}
            errorMessage={sessionEndNotifications.errorMessage}
            emptyMessage="No pending end-session requests are waiting for your review."
            onOpenChat={handleOpenSessionEndNotification}
          />
        </div>

        {openSession && isFocusedFundedState ? (
          <GlassCard className="glass-panel liquid-glass-strong mb-8 rounded-[30px] p-6 sm:p-7">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    Session Status
                  </span>
                  <StatusBadge label={focusedSessionLabel} tone="success" />
                </div>
                <h2 className="mt-4 text-3xl font-semibold text-[var(--text-primary)]">
                  {focusedSessionTitle}
                </h2>
                <p className="mt-3 text-base leading-7 text-[var(--text-muted)]">
                  {focusedSessionMessage}
                </p>
              </div>

              <button
                type="button"
                onClick={handleEnterOpenSessionChat}
                className="button-primary min-w-[180px] rounded-full px-6 py-3 text-base font-semibold"
              >
                Enter Chat
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {openBookingDetails.map((detail) => (
                <div
                  key={`${detail.label}:${detail.value}`}
                  className="liquid-glass-soft rounded-[22px] px-4 py-4"
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">
                    {detail.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {detail.value}
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        ) : null}

        {openSession && !isFocusedFundedState ? (
          <PendingBookingStatusCard
            label={
              openSession.status === "queued_waiting_for_provider"
                ? "Queued"
                : openSession.status === "requested"
                ? "Requested"
                : openSession.status === "accepted_awaiting_payment"
                  ? "Awaiting Payment"
                  : openSession.status === "funded"
                    ? "Funded"
                    : "In Session"
            }
            title={openBookingTitle}
            message={
              hasPendingPaymentConfirmation
                ? "Your funding transaction is awaiting confirmation. Keep this booking open while the network and subsidy relayer finish syncing."
                : openSessionResolutionKind === "payment_timeout"
                ? "The payment deadline has passed. Resolve the timeout on-chain to release any refundable balance and sync the session outcome."
                : openSessionResolutionKind === "no_show"
                  ? "The no-show deadline has passed. Resolve the no-show outcome on-chain to sync the final settlement."
                  : getSettlementPreview(openSession.status)
            }
            tone={getBookingStatusTone(openSession.status)}
            details={openBookingDetails}
            actionLabel={openBookingActionLabel}
            onAction={
              openSession.status === "queued_waiting_for_provider"
                ? () => {
                    void handleLeaveQueue();
                  }
                : openSession.status === "accepted_awaiting_payment"
                ? hasPendingPaymentConfirmation
                  ? undefined
                  : openSessionResolutionKind === "payment_timeout"
                  ? () => {
                      void handleResolveOpenSession();
                    }
                  : () => {
                      setDismissedPaymentSessionId(null);
                      setPaymentModalError("");
                      setIsPaymentModalOpen(true);
                    }
                : openSession.status === "funded"
                  ? openSessionResolutionKind === "no_show"
                    ? () => {
                        void handleResolveOpenSession();
                      }
                    : () => {
                        setDismissedReadySessionId(null);
                        setIsSessionReadyNavigating(false);
                        setIsSessionReadyModalOpen(true);
                      }
                  : openSession.status === "in_session"
                  ? () => {
                      handleEnterOpenSessionChat();
                    }
                  : undefined
            }
            actionDisabled={isResolvingOpenSession || hasPendingPaymentConfirmation}
          />
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(isFocusedFundedState ? focusedSummaryCards : summaryCards).map((card) => (
            <SummaryCard
              key={card.label}
              label={card.label}
              value={card.value}
              detail={card.detail}
              badge={card.badge}
              tone={card.tone}
            />
          ))}
        </section>

        {!isFocusedFundedState ? (
          <section className="mt-8 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="Therapist Directory"
                  title="Available Verified Therapists"
                />
                <StatusBadge label="SBT Checked" tone="success" />
              </div>

              <div className="space-y-3">
                {isLoading ? (
                  <div className="liquid-glass-soft rounded-[24px] px-4 py-6">
                    <p className="text-sm text-[var(--text-muted)]">
                      Loading verified therapists...
                    </p>
                  </div>
                ) : null}

                {therapists.length === 0 && !isLoading ? (
                  <div className="liquid-glass-soft rounded-[24px] px-4 py-6">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {therapistSectionError
                        ? "Unable to fetch therapists."
                        : "No therapists are currently available."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                      {therapistSectionError
                        ? "Please refresh in a moment while the therapist directory reconnects."
                        : "Verified providers will appear here once they are online and ready to accept sessions."}
                    </p>
                  </div>
                ) : null}

                {therapists.map((therapist) => {
                  const cardState = getTherapistCardUiState(therapist);
                  const isActionLocked = cardState.actionKind === "locked";
                  const buttonClassName = isActionLocked
                    ? "rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-[var(--text-faint)] shadow-none opacity-100 cursor-not-allowed dark:border-white/8 dark:bg-white/[0.04]"
                    : "button-primary rounded-full px-4 py-2 text-sm font-medium";

                  return (
                    <div
                      key={therapist.id}
                      className="liquid-glass-soft rounded-[24px] border border-white/5 px-4 py-4"
                    >
                    <div className="flex min-h-[72px] items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-[var(--text-primary)]">
                          {therapist.name}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                          {therapist.specialty}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {therapist.mode !== "Not Available" ? (
                          <div className="glass-highlight rounded-full px-3 py-1 text-xs text-[var(--accent-primary-strong)]">
                            {therapist.mode}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-4 min-h-[48px] text-sm leading-6 text-[var(--text-secondary)]">
                      {summarizeTherapistBio(therapist.bio)}
                    </p>

                    <div className="mt-4 flex min-h-[32px] flex-wrap gap-2">
                      {therapist.languages.length > 0 ? (
                        therapist.languages.map((language) => (
                          <span
                            key={language}
                            className="glass-chip-muted px-3 py-1 text-xs text-[var(--chip-text-muted)]"
                          >
                            {language}
                          </span>
                        ))
                      ) : (
                        <span className="glass-chip-muted px-3 py-1 text-xs text-[var(--chip-text-muted)]">
                          Language syncing
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/5 pt-4">
                      <div>
                        <span className="text-sm font-medium text-[var(--text-secondary)]">
                          {cardState.availabilityLabel}
                        </span>
                        <p
                          className={`mt-1 text-xs ${
                            cardState.actionKind === "book" &&
                            bookingFundingPreview.fundingSource === "subsidy"
                              ? "text-emerald-600 dark:text-emerald-300"
                              : cardState.actionKind === "book"
                                ? "text-amber-700 dark:text-amber-200"
                                : cardState.actionKind === "leave_queue"
                                  ? "text-sky-700 dark:text-sky-200"
                                  : "text-amber-700 dark:text-amber-200"
                          }`}
                        >
                          {cardState.detailMessage}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (isActionLocked || cardState.actionDisabled) {
                            return;
                          }

                          if (cardState.actionKind === "leave_queue") {
                            void handleLeaveQueue();
                            return;
                          }

                          if (
                            cardState.actionKind === "book" ||
                            cardState.actionKind === "join_wait_queue"
                          ) {
                            handleOpenBookingModal(therapist);
                          }
                        }}
                        disabled={cardState.actionDisabled || isActionLocked}
                        className={buttonClassName}
                      >
                        {bookingTherapistId === therapist.id
                          ? "Submitting..."
                          : cardState.actionLabel}
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </GlassCard>

            <GlassCard className="glass-panel p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <SectionHeading
                  eyebrow="On-Chain Activity"
                  title="Your Recent Transactions"
                />
                <StatusBadge label="Private Ledger" tone="neutral" />
              </div>

              <div className="space-y-3">
                {activities.length === 0 && !isLoading ? (
                  <div className="liquid-glass-soft rounded-[24px] border border-white/5 px-4 py-4">
                    <p className="text-sm text-[var(--text-muted)]">
                      No recent activity has been recorded for this wallet.
                    </p>
                  </div>
                ) : null}

                {activities.map((item) => (
                  <div
                    key={item.id}
                    className="liquid-glass-soft rounded-[24px] border border-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                          {item.description}
                        </p>
                      </div>
                      <StatusBadge
                        label={item.status}
                        tone={item.status === "Completed" ? "success" : "neutral"}
                      />
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      {item.timeLabel}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <SectionHeading eyebrow="Quick Actions" title="Manage Session" />
              <div className="mt-5 space-y-4">
                <QuickActionCard
                  href={quickChatHref}
                  title="Enter Session Channel"
                  description={
                    openSession &&
                    isFundedOrLiveSessionStatus(openSession.status)
                      ? "Join your funded session channel once both participants are ready."
                      : "Session entry unlocks after provider acceptance and payment confirmation."
                  }
                  tag={
                    openSession?.status === "in_session"
                      ? "Live"
                      : openSession?.status === "funded"
                        ? "Ready"
                        : "Locked"
                  }
                />
                <QuickActionCard
                  href="#"
                  title="Claim More Subsidy"
                  description="Submit a new government code to request additional Sepolia ETH."
                  tag="Fund"
                />
                <QuickActionCard
                  href="#"
                  title="Download Decrypted Records"
                  description="Export your chat history locally using your wallet signature."
                  tag="Data"
                />
              </div>
            </GlassCard>
          </div>
          </section>
        ) : null}
      </div>

      {selectedTherapist ? (
        <BookingFundingModal
          key={`${selectedTherapist.id}:${patientProfile?.subsidyBalance ?? 0}`}
          therapistName={selectedTherapist.name}
          subsidyBalance={patientProfile?.subsidyBalance ?? 0}
          isSubmitting={bookingTherapistId === selectedTherapist.id}
          errorMessage={bookingModalError}
          requestKind={selectedTherapistRequestKind}
          onClose={() => {
            if (!bookingTherapistId) {
              setSelectedTherapist(null);
              setBookingModalError("");
            }
          }}
          onConfirm={handleConfirmBookingRequest}
        />
      ) : null}

      {openSession && isPaymentModalOpen ? (
        <PatientPaymentModal
          key={`${openSession.id}:${openSession.paymentDueAt ?? "payment"}`}
          providerName={openSessionProviderName}
          totalFee={openSession.sessionFeeEth}
          subsidyApplied={openSession.subsidyAppliedEth}
          walletRequired={openSession.patientWalletChoiceEth}
          paymentDueAt={openSession.paymentDueAt}
          isSubmitting={isPaymentSubmitting}
          errorMessage={paymentModalError}
          onCancel={() => {
            setDismissedPaymentSessionId(openSession.id);
            setIsPaymentModalOpen(false);
          }}
          onConfirm={handleConfirmPayment}
        />
      ) : null}

      {openSession?.status === "funded" && isSessionReadyModalOpen ? (
        <SessionReadyModal
          key={`patient-ready:${openSession.id}`}
          label="Session Ready"
          title="Your session is funded"
          message="Both participants can now enter the chat room."
          details={openBookingDetails}
          isSubmitting={isSessionReadyNavigating}
          onPrimary={handleEnterOpenSessionChat}
          onSecondary={() => {
            setDismissedReadySessionId(openSession.id);
            setIsSessionReadyModalOpen(false);
          }}
        />
      ) : null}

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

      {supportRequestContext && patientProfile?.walletAddress ? (
        <SupportRequestModal
          key={`support:${supportRequestContext.sessionId}:${supportRequestContext.status}`}
          sessionId={supportRequestContext.sessionId}
          reporterWallet={patientProfile.walletAddress}
          reporterRole="patient"
          initialIssueType={supportRequestContext.status}
          onClose={() => setSupportRequestContext(null)}
        />
      ) : null}
    </main>
  );
}
