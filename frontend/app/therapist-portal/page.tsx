"use client";

import { useEffect, useMemo, useState } from "react";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { useAccount, useChainId, useConfig } from "wagmi";
import GlassCard from "../../components/GlassCard";
import { PROVIDER_REQUEST_UPDATED_EVENT } from "../../components/GlobalProviderIncomingRequestCard";
import LiquidToggle from "../../components/LiquidToggle";
import SectionHeading from "../../components/SectionHeading";
import StatusBadge from "../../components/StatusBadge";
import { SESSION_FEE_ETH } from "../../lib/booking";
import {
  buildBookingAcceptedPatch,
  buildBookingRejectedPatch,
  buildWithdrawalPatch,
  compactSessionSyncPatch,
} from "../../lib/onchain-session-mapping";
import {
  formatProviderQueueStatusLabel,
  formatProviderQueueStatusTone,
  formatSessionMode,
} from "../../lib/session-formatting";
import {
  findMindPassEscrowEvent,
  type HexAddress,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
  MINDPASS_ESCROW_STATUS,
  normalizeMindPassEscrowSession,
  prepareAcceptBooking,
  prepareRejectBooking,
  prepareWithdraw,
} from "../../lib/mindpassEscrow";
import {
  logEscrowDebug,
  logMirrorSync,
  logMirrorSyncError,
  logReceiptDecode,
} from "../../lib/escrow-debug";
import {
  isProviderQueueSessionStatus,
  normalizeSessionMode,
  normalizeSessionStatus,
  PROVIDER_QUEUE_SESSION_STATUSES,
  type ProviderQueueSessionStatus,
  type SessionMode,
} from "../../lib/session-status";
import { supabase } from "../../lib/supabase";
import {
  getOutstandingTherapistPayoutEstimateEth,
  isRecordedTherapistPayoutRow,
  type TherapistPayoutSessionStatus,
} from "../../lib/therapist-earnings";

type SupportedMode = "Voice" | "Text";

type TherapistProfile = {
  walletAddress: string;
  totalEarnedEth: number;
  supportedModes: SupportedMode[];
};

type IncomingRequest = {
  id: string;
  onchainSessionId: string | null;
  patientWallet: string;
  patientAlias: string;
  amountEth: number;
  status: ProviderQueueSessionStatus;
  sessionMode: SessionMode;
  intakeSummary: string;
};

type RecordedPayoutSession = {
  id: string;
  patientAlias: string;
  therapistPayoutEth: number;
  txHash: string;
  completedAt: string;
  status: TherapistPayoutSessionStatus;
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

const LEAD_THERAPIST_WALLET =
  "0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD".toLowerCase();
const PORTAL_QUEUE_SELECT =
  "id, onchain_session_id, patient_wallet, therapist_wallet, status, created_at, updated_at, session_mode, session_fee_eth, escrow_amount, amount_eth";
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
  const { address, isConnected, status: accountStatus } = useAccount();
  const chainId = useChainId();
  const wagmiConfig = useConfig();
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
  const [recordedPayoutSessions, setRecordedPayoutSessions] = useState<
    RecordedPayoutSession[]
  >([]);
  const [pendingEscrowEth, setPendingEscrowEth] = useState(0);
  const [recordedOutstandingPayoutEth, setRecordedOutstandingPayoutEth] = useState(0);
  const [claimableBalanceWei, setClaimableBalanceWei] = useState<bigint | null>(null);
  const [isLoadingClaimableBalance, setIsLoadingClaimableBalance] = useState(true);
  const [claimableBalanceError, setClaimableBalanceError] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isClaimingFunds, setIsClaimingFunds] = useState(false);
  const [isLoadingModes, setIsLoadingModes] = useState(true);
  const [isSavingModes, setIsSavingModes] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");

  const readPortalChainSession = async (onchainSessionId: string) => {
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

  const selfHealRequestedPortalRow = async (
    row: Record<string, unknown>,
    source: "therapist-portal",
  ) => {
    const dbStatus = normalizeSessionStatus(row.status);
    const onchainSessionId =
      row.onchain_session_id === null || row.onchain_session_id === undefined
        ? null
        : String(row.onchain_session_id);

    if (dbStatus !== "requested" || !onchainSessionId || !supabase) {
      return row;
    }

    logAcceptMirrorRecheck("requested_card_chain_recheck_started", {
      sessionId: String(row.id ?? ""),
      onchainSessionId,
      dbStatus,
      chainStatus: null,
      txHash: null,
      source,
      recoveryApplied: false,
    });

    const chainSession = await readPortalChainSession(onchainSessionId);
    logAcceptMirrorRecheck("requested_card_chain_recheck_result", {
      sessionId: String(row.id ?? ""),
      onchainSessionId,
      dbStatus,
      chainStatus: chainSession?.status ?? null,
      txHash: null,
      source,
      recoveryApplied: false,
    });

    if (
      !chainSession ||
      chainSession.status !== MINDPASS_ESCROW_STATUS.AcceptedAwaitingPayment
    ) {
      return row;
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      return row;
    }

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
      .eq("id", String(row.id ?? ""))
      .eq("onchain_session_id", onchainSessionId)
      .select(PORTAL_QUEUE_SELECT)
      .maybeSingle();

    if (error || !data) {
      return row;
    }

    logAcceptMirrorRecheck("requested_row_self_healed", {
      sessionId: String(row.id ?? ""),
      onchainSessionId,
      dbStatus,
      chainStatus: chainSession.status,
      txHash: null,
      source,
      recoveryApplied: true,
    });

    return data as Record<string, unknown>;
  };
  const [dataError, setDataError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const claimableBalanceEth =
    claimableBalanceWei === null ? 0 : Number(formatEther(claimableBalanceWei));
  const hasClaimableBalance =
    claimableBalanceWei !== null && claimableBalanceWei > 0n;
  const claimFundsButtonLabel = isClaimingFunds
    ? "Claiming..."
    : isLoadingClaimableBalance
      ? "Loading balance..."
      : claimableBalanceError
        ? "Balance unavailable"
        : hasClaimableBalance
          ? "Claim Funds"
          : "No claimable funds";

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

      const recordedPayoutQuery = supabase
        .from("sessions")
        .select(
          "id, patient_wallet, status, therapist_payout_eth, therapist_withdrawal_tx_hash, complete_session_tx_hash, resolve_no_show_tx_hash, last_synced_tx_hash, updated_at, completed_at, created_at",
        )
        .ilike("therapist_wallet", therapistWallet)
        .in("status", ["completed", "patient_no_show"])
        .order("updated_at", { ascending: false })
        .limit(6);

      const [therapistResult, requestedResult, pendingResult, recordedPayoutResult] =
        await Promise.all([
          therapistQuery,
          requestedQuery,
          pendingQuery,
          recordedPayoutQuery,
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
        const requestedRows = await Promise.all(
          ((requestedResult.data ?? []) as Record<string, unknown>[])
            .filter((session) =>
              isProviderQueueSessionStatus(normalizeSessionStatus(session.status)),
            )
            .map((session) => selfHealRequestedPortalRow(session, "therapist-portal")),
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
              if (status !== "requested") {
                setIncomingRequest(null);
                return;
              }
              setIncomingRequest({
                id: String(session.id),
                onchainSessionId:
                session.onchain_session_id === null ||
                session.onchain_session_id === undefined
                  ? null
                  : String(session.onchain_session_id),
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

      if (recordedPayoutResult.error) {
        setDataError(recordedPayoutResult.error.message);
      } else {
        const rows = (recordedPayoutResult.data ?? []).filter(
          isRecordedTherapistPayoutRow,
        );
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
          setRecordedOutstandingPayoutEth(
            getOutstandingTherapistPayoutEstimateEth(rows),
          );
          setRecordedPayoutSessions(
            rows.map((row) => {
              const patientWallet = String(row.patient_wallet ?? "");
              const status = row.status;
              return {
                id: String(row.id),
                patientAlias:
                  aliasMap.get(patientWallet) ?? truncateWallet(patientWallet),
                therapistPayoutEth: Number(row.therapist_payout_eth ?? 0),
                txHash: String(
                  (status === "patient_no_show"
                    ? row.resolve_no_show_tx_hash
                    : row.complete_session_tx_hash) ??
                    row.last_synced_tx_hash ??
                    "Pending sync",
                ),
                completedAt: String(
                  row.completed_at ??
                    row.updated_at ??
                    row.created_at ??
                    "",
                ),
                status,
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
    let isCancelled = false;

    const hydrateClaimableBalance = async () => {
      const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;

      if (!contractAddress) {
        if (!isCancelled) {
          setClaimableBalanceWei(null);
          setClaimableBalanceError(
            "The MindPass escrow contract is not configured in this app.",
          );
          setIsLoadingClaimableBalance(false);
        }
        return;
      }

      setIsLoadingClaimableBalance(true);
      setClaimableBalanceError("");

      try {
        const balanceResult = await readContract(wagmiConfig, {
          address: contractAddress,
          abi: MINDPASS_ESCROW_ABI,
          functionName: "claimableBalance",
          args: [therapistWallet as HexAddress],
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        });
        const balance = BigInt(balanceResult as string | number | bigint);

        if (!isCancelled) {
          setClaimableBalanceWei(balance);
        }
      } catch (error) {
        if (!isCancelled) {
          setClaimableBalanceWei(null);
          setClaimableBalanceError(
            error instanceof Error
              ? error.message
              : "Unable to read the therapist claimable balance on-chain.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingClaimableBalance(false);
        }
      }
    };

    void hydrateClaimableBalance();

    return () => {
      isCancelled = true;
    };
  }, [refreshNonce, therapistWallet, wagmiConfig]);

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

    try {
      if (!address || !isConnected || accountStatus !== "connected") {
        setDataError("Connect the therapist wallet before reviewing requests.");
        return;
      }

      if (address.toLowerCase() !== therapistWallet) {
        setDataError("Connect the therapist wallet for this provider profile.");
        return;
      }

      if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
        setDataError("Switch to Sepolia before reviewing requests.");
        return;
      }

      if (!incomingRequest.onchainSessionId) {
        setDataError("This booking is missing an on-chain session id.");
        return;
      }

      const chainSessionBeforeReject = await readPortalChainSession(
        incomingRequest.onchainSessionId,
      );
      logAcceptMirrorRecheck("pre_reject_chain_recheck_result", {
        sessionId: incomingRequest.id,
        onchainSessionId: incomingRequest.onchainSessionId,
        dbStatus: incomingRequest.status,
        chainStatus: chainSessionBeforeReject?.status ?? null,
        txHash: null,
        source: "therapist-portal",
        recoveryApplied: false,
      });

      if (
        chainSessionBeforeReject &&
        chainSessionBeforeReject.status !== MINDPASS_ESCROW_STATUS.Requested
      ) {
        await selfHealRequestedPortalRow(
          {
            id: incomingRequest.id,
            onchain_session_id: incomingRequest.onchainSessionId,
            status: incomingRequest.status,
          },
          "therapist-portal",
        );
        setDataError(
          "This request has already moved forward on-chain. Refreshing session state.",
        );
        setIncomingRequest(null);
        return;
      }

      const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
      if (!contractAddress) {
        setDataError("The MindPass escrow contract is not configured in this app.");
        return;
      }

      const request = prepareRejectBooking({
        address: contractAddress,
        sessionId: BigInt(incomingRequest.onchainSessionId),
      });
      logEscrowDebug("submitting therapist portal rejection", {
        source: "therapist-portal",
        sessionId: incomingRequest.id,
        onchainSessionId: incomingRequest.onchainSessionId,
        functionName: request.functionName,
      });
      const { request: simulatedRequest } = await simulateContract(wagmiConfig, {
        address: request.address,
        abi: request.abi,
        functionName: "rejectBooking",
        args: request.args,
        chainId: request.chainId,
        account: address,
      });
      const hash = await writeContract(wagmiConfig, {
        ...simulatedRequest,
        address: request.address,
        abi: request.abi,
        functionName: "rejectBooking",
        args: request.args,
        chainId: request.chainId,
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        hash,
      });
      logReceiptDecode({
        context: "therapist portal rejection receipt decoded",
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      });

      const { error } = await supabase
        .from("sessions")
        .update(
          buildBookingRejectedPatch({
            contractAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          }),
        )
        .eq("id", incomingRequest.id)
        .eq("onchain_session_id", incomingRequest.onchainSessionId);

      if (error) {
        logMirrorSyncError("therapist portal rejection mirror sync failed", {
          sessionId: incomingRequest.id,
          onchainSessionId: incomingRequest.onchainSessionId,
          txHash: receipt.transactionHash,
          message: error.message,
        });
        setDataError(
          "The on-chain decline succeeded, but the session record could not be synced. Please refresh.",
        );
        return;
      }

      logMirrorSync("therapist portal rejection mirror sync complete", {
        sessionId: incomingRequest.id,
        onchainSessionId: incomingRequest.onchainSessionId,
        txHash: receipt.transactionHash,
      });
      setIncomingRequest(null);
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "Unable to decline this request right now.",
      );
    }
  };

  const handleAccept = async () => {
    if (!incomingRequest || isConnecting || !supabase) {
      return;
    }

    setIsConnecting(true);
    setDataError("");
    try {
      if (!address || !isConnected || accountStatus !== "connected") {
        setDataError("Connect the therapist wallet before reviewing requests.");
        setIsConnecting(false);
        return;
      }

      if (address.toLowerCase() !== therapistWallet) {
        setDataError("Connect the therapist wallet for this provider profile.");
        setIsConnecting(false);
        return;
      }

      if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
        setDataError("Switch to Sepolia before reviewing requests.");
        setIsConnecting(false);
        return;
      }

      if (!incomingRequest.onchainSessionId) {
        setDataError("This booking is missing an on-chain session id.");
        setIsConnecting(false);
        return;
      }

      const chainSessionBeforeAccept = await readPortalChainSession(
        incomingRequest.onchainSessionId,
      );
      logAcceptMirrorRecheck("pre_accept_chain_recheck_result", {
        sessionId: incomingRequest.id,
        onchainSessionId: incomingRequest.onchainSessionId,
        dbStatus: incomingRequest.status,
        chainStatus: chainSessionBeforeAccept?.status ?? null,
        txHash: null,
        source: "therapist-portal",
        recoveryApplied: false,
      });

      if (
        chainSessionBeforeAccept &&
        chainSessionBeforeAccept.status !== MINDPASS_ESCROW_STATUS.Requested
      ) {
        await selfHealRequestedPortalRow(
          {
            id: incomingRequest.id,
            onchain_session_id: incomingRequest.onchainSessionId,
            status: incomingRequest.status,
          },
          "therapist-portal",
        );
        setDataError(
          "This request has already moved forward on-chain. Refreshing session state.",
        );
        setIncomingRequest(null);
        setIsConnecting(false);
        return;
      }

      const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
      if (!contractAddress) {
        setDataError("The MindPass escrow contract is not configured in this app.");
        setIsConnecting(false);
        return;
      }

      const request = prepareAcceptBooking({
        address: contractAddress,
        sessionId: BigInt(incomingRequest.onchainSessionId),
      });
      const onchainSessionIdValue = BigInt(incomingRequest.onchainSessionId);
      logEscrowDebug("submitting therapist portal acceptance", {
        source: "therapist-portal",
        sessionId: incomingRequest.id,
        onchainSessionId: incomingRequest.onchainSessionId,
        functionName: request.functionName,
      });
      const { request: simulatedRequest } = await simulateContract(wagmiConfig, {
        address: request.address,
        abi: request.abi,
        functionName: "acceptBooking",
        args: request.args,
        chainId: request.chainId,
        account: address,
      });
      const hash = await writeContract(wagmiConfig, {
        ...simulatedRequest,
        address: request.address,
        abi: request.abi,
        functionName: "acceptBooking",
        args: request.args,
        chainId: request.chainId,
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: MINDPASS_ESCROW_CHAIN_ID,
        hash,
      });
      logReceiptDecode({
        context: "therapist portal acceptance receipt decoded",
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      });
      const event = findMindPassEscrowEvent(receipt.logs, "BookingAccepted");
      const recoverAcceptedPatchFromChain = async () => {
        logAcceptMirrorRecheck("accept_receipt_recovery_started", {
          sessionId: incomingRequest.id,
          onchainSessionId: incomingRequest.onchainSessionId,
          dbStatus: incomingRequest.status,
          chainStatus: null,
          txHash: receipt.transactionHash,
          source: "therapist-portal",
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
        event
          ? buildBookingAcceptedPatch({
              acceptedAt: event.args.providerAcceptedAt,
              paymentDueAt: event.args.paymentDueAt,
              contractAddress,
              chainId: MINDPASS_ESCROW_CHAIN_ID,
              txHash: receipt.transactionHash,
              blockNumber: receipt.blockNumber,
            })
          : await recoverAcceptedPatchFromChain();

      if (!acceptedPatch) {
        throw new Error(
          "Accept transaction succeeded, but the accepted session state could not be recovered for mirror sync.",
        );
      }

      const { error } = await supabase
        .from("sessions")
        .update(acceptedPatch)
        .eq("id", incomingRequest.id)
        .eq("onchain_session_id", incomingRequest.onchainSessionId);

      if (error) {
        const recoveredPatch = await recoverAcceptedPatchFromChain();
        const { error: recoveredError } = recoveredPatch
          ? await supabase
              .from("sessions")
              .update(recoveredPatch)
              .eq("id", incomingRequest.id)
              .eq("onchain_session_id", incomingRequest.onchainSessionId)
          : { error: error };

        if (!recoveredError) {
          logMirrorSync("therapist portal acceptance mirror sync complete", {
            sessionId: incomingRequest.id,
            onchainSessionId: incomingRequest.onchainSessionId,
            txHash: receipt.transactionHash,
          });
          router.push(
            `/chat?role=therapist&address=${encodeURIComponent(profile.walletAddress)}`,
          );
          return;
        }

        logMirrorSyncError("therapist portal acceptance mirror sync failed", {
          sessionId: incomingRequest.id,
          onchainSessionId: incomingRequest.onchainSessionId,
          txHash: receipt.transactionHash,
          message: recoveredError.message,
        });
        setDataError(
          "The on-chain accept succeeded, but the session record could not be synced. Please refresh.",
        );
        setIsConnecting(false);
        return;
      }

      logMirrorSync("therapist portal acceptance mirror sync complete", {
        sessionId: incomingRequest.id,
        onchainSessionId: incomingRequest.onchainSessionId,
        txHash: receipt.transactionHash,
      });
      router.push(
        `/chat?role=therapist&address=${encodeURIComponent(profile.walletAddress)}`,
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "Unable to accept this request right now.",
      );
      setIsConnecting(false);
      return;
    }
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

  const handleClaimFunds = async () => {
    if (isClaimingFunds) {
      return;
    }

    setIsClaimingFunds(true);
    setDataError("");
    setSettingsMessage("");

    try {
      if (!address || !isConnected || accountStatus !== "connected") {
        setDataError("Connect the therapist wallet before claiming funds.");
        return;
      }

      if (address.toLowerCase() !== therapistWallet) {
        setDataError("Connect the therapist wallet for this provider profile.");
        return;
      }

      if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
        setDataError("Switch to Sepolia before claiming funds.");
        return;
      }

      if (isLoadingClaimableBalance) {
        setDataError("Wait for the on-chain claimable balance to finish loading.");
        return;
      }

      if (claimableBalanceError) {
        setDataError("Unable to verify the on-chain claimable balance. Refresh and try again.");
        return;
      }

      if (!hasClaimableBalance) {
        setDataError("No claimable funds are currently available on-chain.");
        return;
      }

      const client = supabase;
      if (!client) {
        setDataError("Supabase client is unavailable.");
        return;
      }

      const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
      if (!contractAddress) {
        setDataError("The MindPass escrow contract is not configured in this app.");
        return;
      }

      const request = prepareWithdraw({ address: contractAddress });
      logEscrowDebug("submitting withdrawal", {
        source: "therapist-portal",
        functionName: request.functionName,
        walletAddress: therapistWallet,
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
        context: "withdrawal receipt decoded",
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      });
      const withdrawalEvent = findMindPassEscrowEvent(receipt.logs, "Withdrawal");

      if (
        withdrawalEvent &&
        withdrawalEvent.args.account.toLowerCase() !== therapistWallet
      ) {
        logMirrorSyncError("therapist withdrawal receipt beneficiary mismatch", {
          txHash: receipt.transactionHash,
          expectedWallet: therapistWallet,
          eventAccount: withdrawalEvent.args.account.toLowerCase(),
        });
        setDataError(
          "The on-chain withdrawal succeeded, but the payout beneficiary could not be verified. Please refresh.",
        );
        return;
      }

      if (!withdrawalEvent) {
        logEscrowDebug("Withdrawal event missing from therapist withdrawal receipt", {
          txHash: receipt.transactionHash,
          walletAddress: therapistWallet,
        });
      }

      const { data: syncedRows, error: syncError } = await client
        .from("sessions")
        .update(
          compactSessionSyncPatch(buildWithdrawalPatch({
            beneficiary: "therapist",
            txHash: receipt.transactionHash,
          })),
        )
        .ilike("therapist_wallet", therapistWallet)
        .in("settlement_status", [
          "released_to_therapist",
          "penalty_paid_to_therapist",
        ])
        .is("therapist_withdrawal_tx_hash", null)
        .select("id");

      if (syncError) {
        logMirrorSyncError("therapist withdrawal mirror sync failed", {
          txHash: receipt.transactionHash,
          walletAddress: therapistWallet,
          message: syncError.message,
        });
        setDataError(
          "The on-chain withdrawal succeeded, but the session records could not be synced. Please refresh.",
        );
        return;
      }

      logMirrorSync("therapist withdrawal mirror sync complete", {
        txHash: receipt.transactionHash,
        walletAddress: therapistWallet,
        syncedSessionCount: syncedRows?.length ?? 0,
        usedFallback: !withdrawalEvent,
      });
      setRefreshNonce((current) => current + 1);

      setSettingsMessage(
        `Withdrawal confirmed on-chain. Tx: ${receipt.transactionHash}`,
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "Unable to claim funds right now.",
      );
    } finally {
      setIsClaimingFunds(false);
    }
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
                  {claimableBalanceError
                    ? "Unavailable"
                    : isLoadingClaimableBalance
                      ? "Loading..."
                      : formatEth(claimableBalanceEth)}
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {claimableBalanceError
                    ? "Unable to read the escrow contract claimable balance right now."
                    : "On-chain claimable balance for this therapist wallet."}
                </p>
              </div>
            </div>

            <div className="liquid-glass-soft mt-4 rounded-[22px] border border-white/5 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">
                Recorded Unclaimed Estimate
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Supabase mirror only: {formatEth(recordedOutstandingPayoutEth)} still
                marked as unwithdrawn. Historical payouts are listed below.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleClaimFunds()}
              disabled={
                isClaimingFunds ||
                isLoadingClaimableBalance ||
                Boolean(claimableBalanceError) ||
                !hasClaimableBalance
              }
              className="button-primary mt-5 w-full rounded-full px-5 py-3 text-sm font-medium"
            >
              {claimFundsButtonLabel}
            </button>

            <div className="mt-8">
              <p className="text-sm uppercase tracking-[0.22em] text-[var(--text-faint)]">
                Recent Recorded Payouts
              </p>
              <div className="mt-4 space-y-3">
                {recordedPayoutSessions.length === 0 ? (
                  <div className="liquid-glass-soft rounded-[22px] border border-white/5 px-4 py-4">
                    <p className="text-sm text-[var(--text-muted)]">
                      No recorded payout sessions yet.
                    </p>
                  </div>
                ) : null}

                {recordedPayoutSessions.map((session) => (
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
                      <StatusBadge
                        label={
                          session.status === "patient_no_show"
                            ? "Patient No-Show"
                            : "Completed"
                        }
                        tone={
                          session.status === "patient_no_show"
                            ? "warning"
                            : "success"
                        }
                      />
                    </div>
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                      {session.status === "patient_no_show"
                        ? `${formatEth(session.therapistPayoutEth)} no-show compensation`
                        : `${formatEth(session.therapistPayoutEth)} therapist payout`}
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
