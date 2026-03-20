"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, useBalance, useDisconnect } from "wagmi";
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
  resolveFundingChoice,
  resolveFunding,
  SESSION_FEE_ETH,
  type FundingResolution,
} from "../../lib/booking";
import { formatSessionMode } from "../../lib/session-formatting";
import { usePageSessionGuard } from "../../lib/session-guard";
import {
  buildBookingFeedback,
  getTerminalSessionOutcome,
  isDeadlineOutcomeStatus,
  type DeadlineOutcomeStatus,
  getBookingStatusTone,
  type BookingFeedbackView,
} from "../../lib/session-outcome";
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
  getNoShowCatchUpSettlement,
  shouldCatchPaymentTimeout,
} from "../../lib/session-transition-guards";
import {
  getTherapistDisplayName,
  getTherapistDisplaySpecialty,
} from "../../lib/therapist-display";
import {
  buildSessionEndRequestChatHref,
  useSessionEndRequestNotifications,
} from "../../lib/session-end-request-notifications";
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
  patientWallet: string;
  therapistWallet: string;
  status: SessionWorkflowStatus;
  sessionMode: SessionMode;
  sessionFeeEth: number;
  fundingSource: "subsidy" | "mixed" | "wallet";
  subsidyAppliedEth: number;
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
};

type OutcomeModalContext = {
  sessionId: string;
  status: DeadlineOutcomeStatus;
  ackKey: string;
};

const DASHBOARD_SESSION_SELECT =
  "id, patient_wallet, therapist_wallet, status, created_at, updated_at, session_mode, session_fee_eth, escrow_amount, amount_eth, funding_source, subsidy_applied_eth, wallet_required_eth, wallet_funded_eth, patient_wallet_choice_eth, patient_subsidy_choice_eth, queue_entered_at, estimated_ready_at, queue_position, patient_cancelled_waiting_at, payment_due_at, no_show_deadline_at, patient_joined_at, therapist_joined_at, session_started_at, settlement_status";

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

  return {
    id: String(row.id ?? ""),
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
  };
}

function getActiveEscrowCountForSession(session: OpenSessionRecord | null) {
  if (!session || session.status === "queued_waiting_for_provider") {
    return 0;
  }

  return 1;
}

async function applyPaymentTimeoutCatchUp(session: OpenSessionRecord) {
  if (!supabase || !shouldCatchPaymentTimeout(session)) {
    return session;
  }

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
    .select(DASHBOARD_SESSION_SELECT)
    .maybeSingle();

  if (error) {
    console.error("Failed to expire payment window", error);
    return session;
  }

  return data ? normalizeOpenSession(data as Record<string, unknown>) : null;
}

async function applyFundedNoShowCatchUp(session: OpenSessionRecord) {
  if (!supabase) {
    return session;
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
    .select(DASHBOARD_SESSION_SELECT)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve funded no-show on dashboard", error);
    return session;
  }

  return data ? normalizeOpenSession(data as Record<string, unknown>) : null;
}

async function applyPatientOverdueFundedCatchUps(walletAddress: string) {
  if (!supabase) {
    return;
  }

  const { data, error } = await supabase
    .from("sessions")
    .select(DASHBOARD_SESSION_SELECT)
    .ilike("patient_wallet", walletAddress)
    .eq("status", "funded")
    .is("session_started_at", null)
    .not("no_show_deadline_at", "is", null)
    .lte("no_show_deadline_at", new Date().toISOString())
    .order("no_show_deadline_at", { ascending: true });

  if (error) {
    console.error("Failed to load overdue funded sessions on dashboard", error);
    return;
  }

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    await applyFundedNoShowCatchUp(normalizeOpenSession(row));
  }
}

async function applyOpenSessionCatchUp(row: Record<string, unknown>) {
  const session = normalizeOpenSession(row);
  if (session.status === "accepted_awaiting_payment") {
    return applyPaymentTimeoutCatchUp(session);
  }

  if (session.status === "funded") {
    return applyFundedNoShowCatchUp(session);
  }

  return session;
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

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected, status: accountStatus } = useAccount();
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
  const [activeEscrowCount, setActiveEscrowCount] = useState(0);
  const [availableTherapistCount, setAvailableTherapistCount] = useState(0);
  const [bookingTherapistId, setBookingTherapistId] = useState<string | null>(null);
  const [bookingFeedback, setBookingFeedback] =
    useState<BookingFeedbackView | null>(null);
  const [bookingFeedbackContext, setBookingFeedbackContext] =
    useState<BookingFeedbackContext | null>(null);
  const [openSession, setOpenSession] = useState<OpenSessionRecord | null>(null);
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
  const [waitTimeNow, setWaitTimeNow] = useState(() => Date.now());
  const sessionEndNotifications = useSessionEndRequestNotifications({
    walletAddress: patientProfile?.walletAddress,
    enabled: isAuthorized,
  });
  const shownDeadlineOutcomeKeyRef = useRef<string | null>(null);
  const hasLiveWaitEstimate =
    Boolean(openSession?.estimatedReadyAt) ||
    Object.values(therapistWaitStateMap).some((state) => Boolean(state.estimatedReadyAt));
  const isFocusedFundedState = isFundedOrLiveSessionStatus(openSession?.status);
  const deadlineOutcomeModalCopy = deadlineOutcomeModal
    ? getTerminalSessionOutcome(deadlineOutcomeModal.status, false)
    : null;
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
    session: Pick<OpenSessionRecord, "id" | "status" | "updatedAt"> | null,
  ) => {
    if (!session) {
      setBookingFeedback(null);
      setBookingFeedbackContext(null);
      return;
    }

    setBookingFeedback(buildBookingFeedback(session));
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

  const maybeOpenDeadlineOutcomeModal = useEffectEvent((
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

    router.replace("/auth");
  }, [router, sessionGuard.authResolutionState]);

  useEffect(() => {
    shownDeadlineOutcomeKeyRef.current = null;
    setDeadlineOutcomeModal(null);
    setSupportRequestContext(null);
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

        await applyPatientOverdueFundedCatchUps(walletAddress);

        const nextOpenSession = await refetchLatestPatientOpenSession(walletAddress);
        const terminalStatusSession = nextOpenSession
          ? null
          : await fetchLatestPatientTerminalSession(walletAddress);
        setOpenSession(nextOpenSession);
        setActiveEscrowCount(getActiveEscrowCountForSession(nextOpenSession));

        if (nextOpenSession) {
          setBookingFeedbackFromSession(nextOpenSession);
        } else if (terminalStatusSession) {
          maybeOpenDeadlineOutcomeModal(terminalStatusSession);
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
    if (!isAuthorized || !supabase || !patientProfile?.walletAddress) {
      return;
    }

    const normalizedPatientWallet = patientProfile.walletAddress.toLowerCase();
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
      setActiveEscrowCount(0);
      setIsPaymentModalOpen(false);
      setPaymentModalError("");
      maybeOpenDeadlineOutcomeModal(nextSession);
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
    if (
      !openSession ||
      !isAcceptedAwaitingPaymentStatus(openSession.status) ||
      !openSession.paymentDueAt ||
      !supabase
    ) {
      return;
    }

    const dueAt = new Date(openSession.paymentDueAt).getTime();
    if (Number.isNaN(dueAt)) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const nextSession = await applyPaymentTimeoutCatchUp(openSession);
      if (nextSession && isOpenBookingStatus(nextSession.status)) {
        setOpenSession(nextSession);
        return;
      }

      try {
        const refreshedSession = await refetchLatestPatientOpenSession(
          openSession.patientWallet.toLowerCase(),
        );
        if (refreshedSession) {
          setOpenSession(refreshedSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
        } else {
          const latestTerminalSession = await fetchLatestPatientTerminalSession(
            openSession.patientWallet.toLowerCase(),
          );
          setOpenSession(null);
          setActiveEscrowCount(0);
          setIsPaymentModalOpen(false);
          setPaymentModalError("");
          setStandaloneBookingFeedback(
            latestTerminalSession
              ? buildBookingFeedback(latestTerminalSession)
              : {
                  message: getSettlementPreview("payment_timeout"),
                  tone: "warning",
                },
          );
        }
      } catch (error) {
        console.error("Failed to refetch patient session after payment timeout", error);
      }
    }, Math.max(0, dueAt - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [openSession]);

  useEffect(() => {
    if (
      !openSession ||
      !isFundedSessionStatus(openSession.status) ||
      !openSession.noShowDeadlineAt ||
      !supabase
    ) {
      return;
    }

    const deadline = new Date(openSession.noShowDeadlineAt).getTime();
    if (Number.isNaN(deadline)) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const nextSession = await applyFundedNoShowCatchUp(openSession);
      if (nextSession && isOpenBookingStatus(nextSession.status)) {
        setOpenSession(nextSession);
        return;
      }

      try {
        const refreshedSession = await refetchLatestPatientOpenSession(
          openSession.patientWallet.toLowerCase(),
        );
        if (refreshedSession) {
          setOpenSession(refreshedSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
          return;
        }

        const latestTerminalSession = await fetchLatestPatientTerminalSession(
          openSession.patientWallet.toLowerCase(),
        );
        setOpenSession(null);
        setActiveEscrowCount(0);
        maybeOpenDeadlineOutcomeModal(
          latestTerminalSession ??
            (nextSession && !isOpenBookingStatus(nextSession.status)
              ? nextSession
              : null),
        );
        if (latestTerminalSession) {
          setBookingFeedbackFromSession(latestTerminalSession);
        } else if (nextSession && !isOpenBookingStatus(nextSession.status)) {
          setBookingFeedbackFromSession(nextSession);
        } else {
          setStandaloneBookingFeedback(
            {
              message: getSettlementPreview("therapist_no_show"),
              tone: "success",
            },
          );
        }
      } catch (error) {
        console.error("Failed to refetch patient session after no-show resolution", error);
      }
    }, Math.max(0, deadline - Date.now()));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [openSession]);

  useEffect(() => {
    if (!openSession) {
      setIsPaymentModalOpen(false);
      setPaymentModalError("");
      setDismissedPaymentSessionId(null);
      return;
    }

    if (
      openSession.status === "accepted_awaiting_payment" &&
      dismissedPaymentSessionId !== openSession.id
    ) {
      setIsPaymentModalOpen(true);
      return;
    }

    if (isFundedOrLiveSessionStatus(openSession.status)) {
      setIsPaymentModalOpen(false);
      setPaymentModalError("");
      setDismissedPaymentSessionId(null);
    }
  }, [dismissedPaymentSessionId, openSession]);

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

  const openBookingTitle = openSession
    ? openSession.status === "queued_waiting_for_provider"
      ? "You are waiting in the provider queue."
      : openSession.status === "requested"
      ? "You already have a pending booking request."
      : openSession.status === "accepted_awaiting_payment"
        ? "Provider accepted your request."
        : openSession.status === "funded"
          ? "Your session is funded."
          : "Your session is in progress."
    : "";

  const openBookingActionLabel = openSession
    ? openSession.status === "queued_waiting_for_provider"
      ? "Leave Queue"
      : openSession.status === "accepted_awaiting_payment"
      ? "Open Payment"
      : openSession.status === "funded"
        ? "Open Chat Prompt"
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

  const handleOpenBookingModal = (therapist: Therapist) => {
    if (openSession || bookingTherapistId) {
      return;
    }

    setBookingFeedback(null);
    setBookingModalError("");
    setSelectedTherapist(therapist);
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
      !patientProfile?.walletAddress ||
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

    try {
      const normalizedPatientWallet = patientProfile.walletAddress.toLowerCase();
      const safeFunding = resolveFundingChoice(
        patientProfile.subsidyBalance,
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

      const { data, error } = await supabase
        .from("sessions")
        .insert({
          patient_wallet: normalizedPatientWallet,
          therapist_wallet: selectedTherapist.walletAddress.toLowerCase(),
          status: "requested",
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
          ack_penalty_policy: true,
          ack_illegal_policy: true,
          ack_single_active_booking: true,
          settlement_status: "pending",
        })
        .select(DASHBOARD_SESSION_SELECT)
        .single();

      if (error) {
        console.error("Failed to create booking request", error);
        setBookingModalError("Unable to book this session right now. Please try again.");
        return;
      }

      console.log("Created booking request", data);
      const refreshedSession = await refetchLatestPatientOpenSession(
        normalizedPatientWallet,
      );
      const nextSession =
        refreshedSession ??
        normalizeOpenSession(data as Record<string, unknown>);
      setOpenSession(nextSession);
      setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
      setSelectedTherapist(null);
      setStandaloneBookingFeedback({
        message: nextSession
          ? getSettlementPreview(nextSession.status)
          : "You already have a pending booking request. Please wait for the provider to accept or reject it.",
        tone:
          nextSession ? buildBookingFeedback(nextSession.status).tone : "warning",
      });
    } catch (error) {
      console.error("Failed to create booking request", error);
      setBookingModalError("Unable to book this session right now. Please try again.");
    } finally {
      setBookingTherapistId(null);
    }
  };

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

    setIsPaymentSubmitting(true);
    setPaymentModalError("");

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("sessions")
        .update({
          wallet_funded_eth: openSession.patientWalletChoiceEth,
          status: "funded",
          patient_paid_at: now,
          funded_at: now,
          settlement_status: "held_in_escrow",
        })
        .eq("id", openSession.id)
        .eq("status", "accepted_awaiting_payment")
        .select(DASHBOARD_SESSION_SELECT)
        .maybeSingle();

      if (error) {
        console.error("Failed to confirm patient payment", error);
        setPaymentModalError("Unable to confirm payment right now. Please try again.");
        return;
      }

      if (!data) {
        try {
          const refreshedSession = await refetchLatestPatientOpenSession(
            openSession.patientWallet.toLowerCase(),
          );
          setOpenSession(refreshedSession);
          setActiveEscrowCount(getActiveEscrowCountForSession(refreshedSession));
          setPaymentModalError("This booking changed state. Please review the latest status.");
        } catch (refreshError) {
          console.error("Failed to refetch patient session after stale payment", refreshError);
          setPaymentModalError("This booking changed state. Please review the latest status.");
        }
        return;
      }

      const nextSession = normalizeOpenSession(data as Record<string, unknown>);
      setOpenSession(nextSession);
      setActiveEscrowCount(getActiveEscrowCountForSession(nextSession));
      setBookingFeedbackFromSession(nextSession);
      setIsPaymentModalOpen(false);
      setDismissedReadySessionId(null);
    } catch (error) {
      console.error("Failed to confirm patient payment", error);
      setPaymentModalError("Unable to confirm payment right now. Please try again.");
    } finally {
      setIsPaymentSubmitting(false);
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

        {shouldShowBookingFeedbackBanner ? (
          <div
            className={`liquid-glass-soft mb-6 rounded-[24px] px-4 py-4 ${
              bookingFeedback.tone === "success"
                ? "border border-emerald-400/20 bg-emerald-500/8"
                : "border border-amber-400/20 bg-amber-400/10"
            }`}
          >
            <p
              className={`text-sm ${
                bookingFeedback.tone === "success"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-700 dark:text-amber-200"
              }`}
            >
              {bookingFeedback.message}
            </p>
          </div>
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
            message={getSettlementPreview(openSession.status)}
            tone={getBookingStatusTone(openSession.status)}
            details={openBookingDetails}
            actionLabel={openBookingActionLabel}
            onAction={
              openSession.status === "queued_waiting_for_provider"
                ? () => {
                    void handleLeaveQueue();
                  }
                : openSession.status === "accepted_awaiting_payment"
                ? () => {
                    setDismissedPaymentSessionId(null);
                    setPaymentModalError("");
                    setIsPaymentModalOpen(true);
                  }
                : openSession.status === "funded"
                  ? () => {
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
