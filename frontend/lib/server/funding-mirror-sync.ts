import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  buildPatientFundingPatch,
  buildSessionFundedPatch,
} from "../onchain-session-mapping";
import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_DEPLOYMENT,
  MINDPASS_ESCROW_STATUS,
  normalizeMindPassEscrowSession,
} from "../mindpassEscrow";
import { createServerSupabaseClient } from "../supabase-server";

function getAlchemyUrl() {
  const value = process.env.ALCHEMY_SEPOLIA_URL?.trim();
  if (!value) {
    throw new Error("Missing ALCHEMY_SEPOLIA_URL.");
  }

  return value;
}

type SyncFundingMirrorOptions = {
  sessionId?: string | null;
};

export async function syncFundingMirrorFromTxHash(
  txHash: `0x${string}`,
  options?: SyncFundingMirrorOptions,
) {
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
    throw new Error("Funding transaction was not successful on-chain.");
  }

  const patientFundingEvent = findMindPassEscrowEvent(
    receipt.logs,
    "PatientPortionFunded",
  );
  if (!patientFundingEvent) {
    throw new Error("PatientPortionFunded event was missing from the receipt.");
  }

  const sessionFundedEvent = findMindPassEscrowEvent(receipt.logs, "SessionFunded");
  const onchainSessionId = patientFundingEvent.args.sessionId.toString();

  const fundedPatch =
    sessionFundedEvent ??
    normalizeMindPassEscrowSession(
      (await publicClient.readContract({
        address: contractAddress,
        abi: MINDPASS_ESCROW_ABI,
        functionName: "sessions",
        args: [patientFundingEvent.args.sessionId],
      })) as readonly unknown[],
    );

  const updatePatch = {
    ...buildPatientFundingPatch({
      amountWei: patientFundingEvent.args.amountWei,
      contractAddress,
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    }),
    ...("args" in fundedPatch
      ? buildSessionFundedPatch({
          walletFundedWei: fundedPatch.args.walletFundedWei,
          subsidyFundedWei: fundedPatch.args.subsidyFundedWei,
          fundedAt: fundedPatch.args.fundedAt,
          noShowDeadlineAt: fundedPatch.args.noShowDeadlineAt,
          contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
        })
      : fundedPatch.status === MINDPASS_ESCROW_STATUS.Funded
        ? buildSessionFundedPatch({
            walletFundedWei: fundedPatch.walletFundedWei,
            subsidyFundedWei: fundedPatch.subsidyFundedWei,
            fundedAt: fundedPatch.fundedAt,
            noShowDeadlineAt: fundedPatch.noShowDeadlineAt,
            contractAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          })
        : {}),
    patient_paid_at: new Date().toISOString(),
  };

  const supabase = createServerSupabaseClient({ useServiceRole: true });
  let sessionQuery = supabase
    .from("sessions")
    .select("*")
    .eq("onchain_session_id", onchainSessionId);

  if (options?.sessionId) {
    sessionQuery = sessionQuery.eq("id", options.sessionId);
  }

  const { data: existingRow, error: existingError } = await sessionQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!existingRow) {
    throw new Error(`No session row found for on-chain session ${onchainSessionId}.`);
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("sessions")
    .update(updatePatch)
    .eq("id", String(existingRow.id))
    .eq("onchain_session_id", onchainSessionId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updatedRow) {
    throw new Error("Funding mirror sync completed, but the updated row could not be loaded.");
  }

  return updatedRow;
}
