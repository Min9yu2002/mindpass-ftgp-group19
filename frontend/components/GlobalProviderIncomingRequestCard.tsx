"use client";

import { useEffect, useMemo, useState } from "react";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import GlassCard from "./GlassCard";
import StatusBadge from "./StatusBadge";
import { SESSION_FEE_ETH } from "../lib/booking";
import { buildBookingAcceptedPatch, buildBookingRejectedPatch } from "../lib/onchain-session-mapping";
import { formatSessionMode } from "../lib/session-formatting";
import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
  MINDPASS_ESCROW_STATUS,
  normalizeMindPassEscrowSession,
  prepareAcceptBooking,
  prepareRejectBooking,
} from "../lib/mindpassEscrow";
import {
  logEscrowDebug,
  logMirrorSync,
  logMirrorSyncError,
  logReceiptDecode,
} from "../lib/escrow-debug";
import {
  normalizeSessionMode,
  normalizeSessionStatus,
  type SessionMode,
} from "../lib/session-status";
import { supabase } from "../lib/supabase";
import { useAccount, useChainId, useConfig } from "wagmi";

export const PROVIDER_REQUEST_UPDATED_EVENT =
  "mindpass-provider-request-updated";

type ProviderIncomingRequest = {
  id: string;
  onchainSessionId: string | null;
  patientWallet: string;
  createdAt: string;
  sessionMode: SessionMode;
  amountEth: number;
};

type GlobalProviderIncomingRequestCardProps = {
  therapistWallet?: string | null;
  visible: boolean;
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

const GLOBAL_PROVIDER_REQUEST_SELECT =
  "id, onchain_session_id, therapist_wallet, patient_wallet, status, created_at, session_mode, session_fee_eth, escrow_amount, amount_eth";

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

function formatEth(value: number) {
  return `${value.toFixed(3)} ETH`;
}

function normalizeIncomingRequest(
  row: Record<string, unknown> | null,
): ProviderIncomingRequest | null {
  if (!row || normalizeSessionStatus(row.status) !== "requested") {
    return null;
  }

  return {
    id: String(row.id ?? ""),
    onchainSessionId:
      row.onchain_session_id === null || row.onchain_session_id === undefined
        ? null
        : String(row.onchain_session_id),
    patientWallet: String(row.patient_wallet ?? "").toLowerCase(),
    createdAt: String(row.created_at ?? ""),
    sessionMode: normalizeSessionMode(row.session_mode),
    amountEth: Number(
      row.session_fee_eth ?? row.escrow_amount ?? row.amount_eth ?? SESSION_FEE_ETH,
    ),
  };
}

export default function GlobalProviderIncomingRequestCard({
  therapistWallet,
  visible,
}: GlobalProviderIncomingRequestCardProps) {
  const { address, isConnected, status: accountStatus } = useAccount();
  const chainId = useChainId();
  const wagmiConfig = useConfig();
  const normalizedTherapistWallet = useMemo(
    () => String(therapistWallet ?? "").trim().toLowerCase(),
    [therapistWallet],
  );
  const shouldShow = visible && Boolean(normalizedTherapistWallet && supabase);
  const [request, setRequest] = useState<ProviderIncomingRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionState, setActionState] = useState<"accept" | "decline" | "">("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const readIncomingCardChainSession = async (onchainSessionId: string) => {
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

  const selfHealIncomingRequestedCard = async (
    currentRequest: ProviderIncomingRequest | null,
    source: "incoming-card",
  ) => {
    if (!currentRequest || !currentRequest.onchainSessionId || !supabase) {
      return currentRequest;
    }

    logAcceptMirrorRecheck("requested_card_chain_recheck_started", {
      sessionId: currentRequest.id,
      onchainSessionId: currentRequest.onchainSessionId,
      dbStatus: "requested",
      chainStatus: null,
      txHash: null,
      source,
      recoveryApplied: false,
    });

    const chainSession = await readIncomingCardChainSession(
      currentRequest.onchainSessionId,
    );
    logAcceptMirrorRecheck("requested_card_chain_recheck_result", {
      sessionId: currentRequest.id,
      onchainSessionId: currentRequest.onchainSessionId,
      dbStatus: "requested",
      chainStatus: chainSession?.status ?? null,
      txHash: null,
      source,
      recoveryApplied: false,
    });

    if (
      !chainSession ||
      chainSession.status !== MINDPASS_ESCROW_STATUS.AcceptedAwaitingPayment
    ) {
      return currentRequest;
    }

    const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
    if (!contractAddress) {
      return currentRequest;
    }

    const { error } = await supabase
      .from("sessions")
      .update(
        buildBookingAcceptedPatch({
          acceptedAt: chainSession.providerAcceptedAt,
          paymentDueAt: chainSession.paymentDueAt,
          contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        }),
      )
      .eq("id", currentRequest.id)
      .eq("onchain_session_id", currentRequest.onchainSessionId);

    if (error) {
      return currentRequest;
    }

    logAcceptMirrorRecheck("requested_row_self_healed", {
      sessionId: currentRequest.id,
      onchainSessionId: currentRequest.onchainSessionId,
      dbStatus: "requested",
      chainStatus: chainSession.status,
      txHash: null,
      source,
      recoveryApplied: true,
    });

    return null;
  };

  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    let isCancelled = false;

    const loadLatestRequest = async () => {
      setErrorMessage("");

      const { data, error } = await supabase!
        .from("sessions")
        .select(GLOBAL_PROVIDER_REQUEST_SELECT)
        .ilike("therapist_wallet", normalizedTherapistWallet)
        .eq("status", "requested")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setRequest(null);
        return;
      }

      const normalizedRequest = normalizeIncomingRequest(
        data as Record<string, unknown> | null,
      );
      setRequest(
        await selfHealIncomingRequestedCard(normalizedRequest, "incoming-card"),
      );
    };

    void loadLatestRequest();

    return () => {
      isCancelled = true;
    };
  }, [normalizedTherapistWallet, refreshNonce, shouldShow]);

  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    const channel = supabase!.channel(
      `global-provider-request-card:${normalizedTherapistWallet}`,
    );
    const refresh = (payload?: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const nextWallet = String(
        payload?.new?.therapist_wallet ?? payload?.old?.therapist_wallet ?? "",
      ).toLowerCase();

      if (nextWallet && nextWallet !== normalizedTherapistWallet) {
        return;
      }

      setRefreshNonce((current) => current + 1);
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
        (payload) => refresh(payload as { new?: Record<string, unknown> }),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `therapist_wallet=eq.${normalizedTherapistWallet}`,
        },
        (payload) =>
          refresh(payload as { new?: Record<string, unknown>; old?: Record<string, unknown> }),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "sessions",
          filter: `therapist_wallet=eq.${normalizedTherapistWallet}`,
        },
        (payload) => refresh(payload as { old?: Record<string, unknown> }),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [normalizedTherapistWallet, shouldShow]);

  const handleDecision = async (nextStatus: "accepted" | "rejected") => {
    if (!supabase || !request || actionState) {
      return;
    }

    setActionState(nextStatus === "accepted" ? "accept" : "decline");
    setErrorMessage("");

    try {
      if (!address || !isConnected || accountStatus !== "connected") {
        setErrorMessage("Connect the therapist wallet before reviewing requests.");
        setActionState("");
        return;
      }

      if (address.toLowerCase() !== normalizedTherapistWallet) {
        setErrorMessage("Connect the therapist wallet for this provider profile.");
        setActionState("");
        return;
      }

      if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
        setErrorMessage("Switch to Sepolia before reviewing requests.");
        setActionState("");
        return;
      }

      if (!request.onchainSessionId) {
        setErrorMessage("This booking is missing an on-chain session id.");
        setActionState("");
        return;
      }

      const chainSessionBeforeDecision = await readIncomingCardChainSession(
        request.onchainSessionId,
      );
      logAcceptMirrorRecheck(
        nextStatus === "accepted"
          ? "pre_accept_chain_recheck_result"
          : "pre_reject_chain_recheck_result",
        {
          sessionId: request.id,
          onchainSessionId: request.onchainSessionId,
          dbStatus: "requested",
          chainStatus: chainSessionBeforeDecision?.status ?? null,
          txHash: null,
          source: "incoming-card",
          recoveryApplied: false,
        },
      );

      if (
        chainSessionBeforeDecision &&
        chainSessionBeforeDecision.status !== MINDPASS_ESCROW_STATUS.Requested
      ) {
        await selfHealIncomingRequestedCard(request, "incoming-card");
        setErrorMessage(
          "This request has already moved forward on-chain. Refreshing session state.",
        );
        setRequest(null);
        setActionState("");
        setRefreshNonce((current) => current + 1);
        return;
      }

      const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
      if (!contractAddress) {
        setErrorMessage("The MindPass escrow contract is not configured in this app.");
        setActionState("");
        return;
      }

      const sessionId = BigInt(request.onchainSessionId);
      const preparedRequest =
        nextStatus === "accepted"
          ? prepareAcceptBooking({
              address: contractAddress,
              sessionId,
            })
          : prepareRejectBooking({
              address: contractAddress,
              sessionId,
            });

      logEscrowDebug("submitting provider booking decision", {
        source: "GlobalProviderIncomingRequestCard",
        sessionId: request.id,
        onchainSessionId: request.onchainSessionId,
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
        context: "provider booking decision receipt decoded",
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      });

      const recoverAcceptedPatchFromChain = async () => {
        logAcceptMirrorRecheck("accept_receipt_recovery_started", {
          sessionId: request.id,
          onchainSessionId: request.onchainSessionId,
          dbStatus: "requested",
          chainStatus: null,
          txHash: receipt.transactionHash,
          source: "incoming-card",
          recoveryApplied: false,
        });
        const chainSession = normalizeMindPassEscrowSession(
          (await readContract(wagmiConfig, {
            address: contractAddress,
            abi: MINDPASS_ESCROW_ABI,
            functionName: "sessions",
            args: [sessionId],
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

      if (nextStatus === "accepted") {
        const { data, error } = await supabase
          .from("sessions")
          .update(updatePayload)
          .eq("id", request.id)
          .eq("onchain_session_id", request.onchainSessionId)
          .eq("status", "requested")
          .select(GLOBAL_PROVIDER_REQUEST_SELECT)
          .maybeSingle();

        if (error || !data) {
          const recoveredPatch = acceptedPatch ?? (await recoverAcceptedPatchFromChain());
          const { data: recoveredData, error: recoveredError } = await supabase
            .from("sessions")
            .update(recoveredPatch ?? updatePayload)
            .eq("id", request.id)
            .eq("onchain_session_id", request.onchainSessionId)
            .select(GLOBAL_PROVIDER_REQUEST_SELECT)
            .maybeSingle();

          if (recoveredError || !recoveredData) {
            logMirrorSyncError("provider booking decision mirror sync failed", {
              source: "GlobalProviderIncomingRequestCard",
              sessionId: request.id,
              onchainSessionId: request.onchainSessionId,
              txHash: receipt.transactionHash,
              message:
                error?.message ??
                recoveredError?.message ??
                "Accept mirror fallback matched no row.",
            });
            setErrorMessage(
              "The on-chain request decision succeeded, but the session record could not be synced. Please refresh.",
            );
            setActionState("");
            return;
          }
        }
      } else {
        const { error } = await supabase
          .from("sessions")
          .update(updatePayload)
          .eq("id", request.id)
          .eq("onchain_session_id", request.onchainSessionId)
          .eq("status", "requested");

        if (error) {
          logMirrorSyncError("provider booking decision mirror sync failed", {
            source: "GlobalProviderIncomingRequestCard",
            sessionId: request.id,
            onchainSessionId: request.onchainSessionId,
            txHash: receipt.transactionHash,
            message: error.message,
          });
          setErrorMessage(
            "The on-chain request decision succeeded, but the session record could not be synced. Please refresh.",
          );
          setActionState("");
          return;
        }
      }

      logMirrorSync("provider booking decision mirror sync complete", {
        source: "GlobalProviderIncomingRequestCard",
        sessionId: request.id,
        onchainSessionId: request.onchainSessionId,
        txHash: receipt.transactionHash,
        status: nextStatus,
      });
      setRequest(null);
      setActionState("");
      window.dispatchEvent(new Event(PROVIDER_REQUEST_UPDATED_EVENT));
      setRefreshNonce((current) => current + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update this request right now.",
      );
      setActionState("");
    }
  };

  if (!shouldShow || !request) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed left-1/2 top-28 z-40 w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2">
      <div className="flex justify-end">
        <GlassCard className="pointer-events-auto liquid-glass-floating glass-panel w-full max-w-[30rem] border border-black/10 px-5 py-4 shadow-[0_18px_42px_rgba(15,23,42,0.18)] dark:border-white/[0.08] dark:shadow-[0_16px_40px_rgba(0,0,0,0.42)]">
          <div className="flex items-stretch gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase leading-none tracking-[0.24em] text-[var(--text-faint)] sm:whitespace-nowrap">
                Incoming Session Request
              </p>

              <h2 className="mt-3 truncate text-[1.35rem] font-semibold tracking-tight text-slate-950 dark:text-white">
                {truncateWallet(request.patientWallet)}
              </h2>

              <div className="mt-3">
                <StatusBadge label="Requested" tone="warning" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 sm:flex-nowrap">
                <span className="inline-flex items-center rounded-full border border-sky-400/26 bg-sky-400/10 px-3 py-1 text-xs font-medium whitespace-nowrap text-sky-700 backdrop-blur-xl dark:border-sky-300/24 dark:bg-sky-300/10 dark:text-sky-100">
                  {formatSessionMode(request.sessionMode)}
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-400/26 bg-emerald-400/10 px-3 py-1 text-xs font-medium whitespace-nowrap text-emerald-700 backdrop-blur-xl dark:border-emerald-300/24 dark:bg-emerald-300/10 dark:text-emerald-100">
                  50 min
                </span>
                <span className="inline-flex items-center rounded-full border border-yellow-300/40 bg-yellow-300/18 px-3 py-1 text-xs font-semibold whitespace-nowrap text-amber-800 shadow-[0_0_16px_rgba(253,224,71,0.2)] backdrop-blur-xl dark:border-yellow-200/36 dark:bg-yellow-300/16 dark:text-yellow-100 dark:shadow-[0_0_18px_rgba(253,224,71,0.24)]">
                  {formatEth(request.amountEth)} fee
                </span>
              </div>

              <p className="mt-3 text-sm text-slate-700 sm:whitespace-nowrap dark:text-[var(--text-muted)]">
                Requested {formatRelativeTime(request.createdAt)}
              </p>
            </div>

            <div className="flex w-[8.5rem] shrink-0 flex-col gap-3">
              <button
                type="button"
                onClick={() => void handleDecision("accepted")}
                disabled={Boolean(actionState)}
                className="flex-1 rounded-[1.15rem] border border-emerald-300/35 bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.34)] transition hover:-translate-y-px hover:bg-emerald-400 hover:shadow-[0_0_28px_rgba(16,185,129,0.42)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionState === "accept" ? "Updating..." : "Accept"}
              </button>
              <button
                type="button"
                onClick={() => void handleDecision("rejected")}
                disabled={Boolean(actionState)}
                className="flex-1 rounded-[1.15rem] border border-rose-500/48 bg-rose-500/34 px-4 py-3 text-sm font-semibold text-rose-950 shadow-[0_0_20px_rgba(244,63,94,0.2)] transition hover:-translate-y-px hover:bg-rose-500/40 hover:shadow-[0_0_24px_rgba(244,63,94,0.26)] dark:border-rose-300/38 dark:bg-rose-400/30 dark:text-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionState === "decline" ? "Updating..." : "Decline"}
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
}
