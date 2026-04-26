"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import { parseEther } from "viem";
import { useAccount, useChainId, useConfig } from "wagmi";
import { resolveFunding, SESSION_FEE_ETH } from "../lib/funding";
import { buildBookingRequestedPatch } from "../lib/onchain-session-mapping";
import {
  clearPendingBookingTxHash,
  isPendingReceiptLookupError,
  storePendingBookingTxHash,
  trySyncBookingByTxHash,
} from "../lib/booking-receipt";
import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
  MINDPASS_ESCROW_STATUS,
  normalizeMindPassEscrowSession,
  prepareCreateBookingRequest,
  type HexAddress,
} from "../lib/mindpassEscrow";
import {
  logEscrowDebug,
  logMirrorSync,
  logMirrorSyncError,
  logReceiptDecode,
} from "../lib/escrow-debug";
import { supabase } from "../lib/supabase";

type TherapistDirectoryCtaProps = {
  therapistWallet: string;
};

export default function TherapistDirectoryCta({
  therapistWallet,
}: TherapistDirectoryCtaProps) {
  const router = useRouter();
  const { address, isConnected, status: accountStatus } = useAccount();
  const chainId = useChainId();
  const wagmiConfig = useConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const activeSession = window.localStorage.getItem("mindpass-active-session");

    if (activeSession === "therapist") {
      alert(
        "You are currently logged in as a Provider. Please sign out first to book a session as a patient.",
      );
      return;
    }

    if (activeSession === "patient") {
      const storedProfile = window.localStorage.getItem("mindpass-patient-profile");

      if (!storedProfile || !supabase || !therapistWallet || isSubmitting) {
        router.push("/auth");
        return;
      }

      let patientWallet = "";
      let subsidyBalance = 0;
      try {
        const parsedProfile = JSON.parse(storedProfile) as {
          walletAddress?: string;
          subsidyBalance?: number;
        };
        patientWallet = String(parsedProfile.walletAddress ?? "").trim().toLowerCase();
        subsidyBalance = Number(parsedProfile.subsidyBalance ?? 0);
      } catch {
        patientWallet = "";
        subsidyBalance = 0;
      }

      if (!patientWallet) {
        router.push("/auth");
        return;
      }

      if (!address || !isConnected || accountStatus !== "connected") {
        alert("Connect your wallet before booking a session.");
        return;
      }

      if (address.toLowerCase() !== patientWallet) {
        alert("Connect the patient wallet shown in your session before booking.");
        return;
      }

      if (chainId !== MINDPASS_ESCROW_CHAIN_ID) {
        alert("Switch to Sepolia before booking a session.");
        return;
      }

      const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
      if (!contractAddress) {
        alert("The MindPass escrow contract is not configured in this app.");
        return;
      }

      const { data: existingOpenSession, error: existingOpenSessionError } = await supabase
        .from("sessions")
        .select("id, status")
        .ilike("patient_wallet", patientWallet)
        .in("status", [
          "requested",
          "accepted_awaiting_payment",
          "funded",
          "in_session",
          "queued_waiting_for_provider",
        ])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingOpenSessionError) {
        alert("Unable to verify your latest booking state. Please try again.");
        return;
      }

      if (existingOpenSession) {
        alert(
          existingOpenSession.status === "queued_waiting_for_provider"
            ? "You already have an active wait-queue request. Leave it before starting a new booking."
            : "You already have an active booking or session. Review it on the dashboard before starting a new booking.",
        );
        router.push("/dashboard");
        return;
      }

      setIsSubmitting(true);
      const funding = resolveFunding(subsidyBalance, SESSION_FEE_ETH);

      try {
        const activeSessionId = (await readContract(wagmiConfig, {
          address: contractAddress,
          abi: MINDPASS_ESCROW_ABI,
          functionName: "activeSessionOfPatient",
          args: [patientWallet as HexAddress],
          chainId: MINDPASS_ESCROW_CHAIN_ID,
        })) as bigint;

        if (activeSessionId !== 0n) {
          const activeSession = normalizeMindPassEscrowSession(
            (await readContract(wagmiConfig, {
              address: contractAddress,
              abi: MINDPASS_ESCROW_ABI,
              functionName: "sessions",
              args: [activeSessionId],
              chainId: MINDPASS_ESCROW_CHAIN_ID,
            })) as readonly unknown[],
          );
          alert(
            activeSession.status === MINDPASS_ESCROW_STATUS.Requested
              ? "You already have a booking request waiting for provider action."
              : "You already have an active booking or session on-chain. Review it on the dashboard before starting a new booking.",
          );
          router.push("/dashboard");
          return;
        }

        const bookingRequest = prepareCreateBookingRequest({
          address: contractAddress,
          therapist: therapistWallet.toLowerCase() as HexAddress,
          walletRequiredWei: parseEther(funding.walletRequired.toFixed(6)),
          subsidyRequiredWei: parseEther(funding.subsidyApplied.toFixed(6)),
          sessionMode: "text",
        });
        logEscrowDebug("submitting booking request", {
          source: "TherapistDirectoryCta",
          therapistWallet: therapistWallet.toLowerCase(),
          patientWallet,
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
          } else {
            alert(
              "Booking submitted, but the confirmation receipt is still pending. You will be redirected to the dashboard while the app keeps checking.",
            );
          }
          router.push("/dashboard");
          return;
        }
        logReceiptDecode({
          context: "booking request receipt decoded",
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
          .select()
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

            logMirrorSync("booking request fallback mirror sync complete", {
              source: "TherapistDirectoryCta",
              txHash: receipt.transactionHash,
            });
            router.push("/dashboard");
            return;
          } catch (recoveryError) {
            logMirrorSyncError("booking request mirror sync failed", {
              source: "TherapistDirectoryCta",
              txHash: receipt.transactionHash,
              message:
                error?.message ??
                (recoveryError instanceof Error
                  ? recoveryError.message
                  : "Booking recovery failed."),
            });
            alert(
              "The booking transaction succeeded, but the session record could not be synced. Please refresh.",
            );
            setIsSubmitting(false);
            return;
          }
        }

        logMirrorSync("booking request mirror sync complete", {
          source: "TherapistDirectoryCta",
          txHash: receipt.transactionHash,
          sessionId: data?.id ?? null,
          onchainSessionId: data?.onchain_session_id ?? null,
        });
        clearPendingBookingTxHash();
        router.push("/dashboard");
      } catch (error) {
        console.error("[escrow-debug] Failed to create booking session", error);
        alert(
          error instanceof Error &&
          (error.message.includes("SessionAlreadyExists") ||
            error.message.includes("0x61becbbc"))
            ? "You already have an active booking or session. Review it on the dashboard before starting a new booking."
            : error instanceof Error
              ? error.message
              : "Unable to book this session right now. Please try again.",
        );
        setIsSubmitting(false);
      }
      return;
    }

    router.push("/auth");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className="button-primary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
    >
      {isSubmitting ? "Booking..." : "Book Session"}
    </button>
  );
}
