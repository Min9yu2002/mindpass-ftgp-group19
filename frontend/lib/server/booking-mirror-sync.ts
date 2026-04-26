import { createPublicClient, hexToString, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { buildBookingRequestedPatch } from "../onchain-session-mapping";
import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
} from "../mindpassEscrow";
import { createServerSupabaseClient } from "../supabase-server";

function getAlchemyUrl() {
  const value = process.env.ALCHEMY_SEPOLIA_URL?.trim();
  if (!value) {
    throw new Error("Missing ALCHEMY_SEPOLIA_URL.");
  }

  return value;
}

function decodeSessionMode(value: Hex) {
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

export async function syncBookingMirrorFromTxHash(txHash: `0x${string}`) {
  const contractAddress = MINDPASS_ESCROW_DEPLOYMENT.address;
  if (!contractAddress) {
    throw new Error("MindPass escrow contract address is not configured.");
  }

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(getAlchemyUrl()),
  });
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Booking transaction was not successful on-chain.");
  }

  const bookingRequestedEvent = findMindPassEscrowEvent(
    receipt.logs,
    "BookingRequested",
  );

  if (!bookingRequestedEvent) {
    throw new Error("BookingRequested event was missing from the receipt.");
  }

  const supabase = createServerSupabaseClient({ useServiceRole: true });
  const onchainSessionId = bookingRequestedEvent.args.sessionId.toString();
  const { data: existingRow, error: existingError } = await supabase
    .from("sessions")
    .select("id, onchain_session_id, status, created_at, updated_at")
    .eq("onchain_session_id", onchainSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingRow) {
    return existingRow;
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from("sessions")
    .insert({
      ...buildBookingRequestedPatch({
        onchainSessionId: bookingRequestedEvent.args.sessionId,
        patient: String(bookingRequestedEvent.args.patient),
        therapist: String(bookingRequestedEvent.args.therapist),
        walletRequiredWei: bookingRequestedEvent.args.walletRequiredWei,
        subsidyRequiredWei: bookingRequestedEvent.args.subsidyRequiredWei,
        sessionMode: decodeSessionMode(bookingRequestedEvent.args.sessionMode),
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
    .select("id, onchain_session_id, status, created_at, updated_at")
    .single();

  if (insertError) {
    throw insertError;
  }

  return insertedRow;
}
