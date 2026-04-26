import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  buildSessionFundedPatch,
  buildSubsidyFundingPatch,
} from "../../../../lib/onchain-session-mapping";
import {
  findMindPassEscrowEvent,
  MINDPASS_ESCROW_ABI,
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_STATUS,
  type HexAddress,
} from "../../../../lib/mindpassEscrow";
import {
  getRemainingSubsidyWei,
  resolveSubsidyFundingChainOutcome,
} from "../../../../lib/subsidy-funding";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import {
  logMirrorSync,
  logMirrorSyncError,
  logReceiptDecode,
  logSubsidyRelayer,
  logSubsidyRelayerError,
} from "../../../../lib/escrow-debug";

type SessionRow = {
  id: string;
  onchain_session_id: string | null;
  subsidy_applied_eth: number | string | null;
  patient_subsidy_choice_eth: number | string | null;
  funding_source: string | null;
};

type EscrowSession = {
  status: number;
  subsidyRequiredWei: bigint;
  walletFundedWei: bigint;
  subsidyFundedWei: bigint;
  fundedAt: bigint;
  noShowDeadlineAt: bigint;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function getEscrowAddress() {
  const value = getRequiredEnv("NEXT_PUBLIC_MINDPASS_ESCROW_ADDRESS");
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error("NEXT_PUBLIC_MINDPASS_ESCROW_ADDRESS is invalid.");
  }

  return value.toLowerCase() as HexAddress;
}

function getPrivateKeyEnv() {
  const value = getRequiredEnv("SUBSIDY_VAULT_PRIVATE_KEY");
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function getConfiguredChainId() {
  const value = Number(getRequiredEnv("NEXT_PUBLIC_CHAIN_ID"));
  if (value !== MINDPASS_ESCROW_CHAIN_ID) {
    throw new Error(
      `NEXT_PUBLIC_CHAIN_ID must be ${MINDPASS_ESCROW_CHAIN_ID} for subsidy funding.`,
    );
  }

  return value;
}

function toNumber(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toBigInt(value: unknown) {
  if (
    typeof value === "bigint" ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return BigInt(value);
  }

  return BigInt(0);
}

function normalizeEscrowSession(session: readonly unknown[]) {
  return {
    status: Number(session[3] ?? 0),
    subsidyRequiredWei: toBigInt(session[6]),
    walletFundedWei: toBigInt(session[7]),
    subsidyFundedWei: toBigInt(session[8]),
    fundedAt: toBigInt(session[11]),
    noShowDeadlineAt: toBigInt(session[17]),
  } satisfies EscrowSession;
}

function buildChainMirrorPatch(input: {
  contractAddress: HexAddress;
  chainSession: EscrowSession;
  txHash?: string | null;
  blockNumber?: bigint | null;
}) {
  const subsidyPatch =
    input.chainSession.subsidyFundedWei > BigInt(0)
      ? buildSubsidyFundingPatch({
          amountWei: input.chainSession.subsidyFundedWei,
          contractAddress: input.contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
          txHash: input.txHash,
          blockNumber: input.blockNumber,
        })
      : {};

  const fundedPatch =
    input.chainSession.status === MINDPASS_ESCROW_STATUS.Funded
      ? buildSessionFundedPatch({
          walletFundedWei: input.chainSession.walletFundedWei,
          subsidyFundedWei: input.chainSession.subsidyFundedWei,
          fundedAt: input.chainSession.fundedAt,
          noShowDeadlineAt: input.chainSession.noShowDeadlineAt,
          contractAddress: input.contractAddress,
          chainId: MINDPASS_ESCROW_CHAIN_ID,
          txHash: input.txHash,
          blockNumber: input.blockNumber,
        })
      : {};

  return {
    ...subsidyPatch,
    ...fundedPatch,
  };
}

function routeError(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      error: message,
      ...extra,
    },
    { status },
  );
}

function getErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      shortMessage: null,
      message: String(error),
      cause: null,
    };
  }

  const enrichedError = error as Error & {
    shortMessage?: string;
    cause?: unknown;
  };

  return {
    shortMessage: enrichedError.shortMessage ?? null,
    message: enrichedError.message,
    cause:
      enrichedError.cause instanceof Error
        ? enrichedError.cause.message
        : enrichedError.cause == null
          ? null
          : String(enrichedError.cause),
  };
}

function buildRelayerSignerMismatchPayload(input: {
  sessionId: string | null;
  onchainSessionId: string | null;
  configuredTreasuryAddress?: string | null;
  contractVaultAddress?: string | null;
  derivedSignerAddress: string;
  fundingSource: string | null;
  subsidyAmount: number | null;
}) {
  return {
    sessionId: input.sessionId,
    onchainSessionId: input.onchainSessionId,
    configuredTreasuryAddress: input.configuredTreasuryAddress ?? null,
    contractVaultAddress: input.contractVaultAddress ?? null,
    derivedSignerAddress: input.derivedSignerAddress,
    fundingSource: input.fundingSource,
    subsidyAmount: input.subsidyAmount,
    txHash: null,
  };
}

export async function POST(request: Request) {
  let sessionId: string | null = null;
  let onchainSessionId: string | null = null;
  let fundingSource: string | null = null;
  let subsidyAmount: number | null = null;
  let contractCallName: string | null = null;
  let txHash: `0x${string}` | null = null;

  const logRouteFailure = (
    stage: string,
    error: unknown,
    extra?: Record<string, unknown>,
  ) => {
    logSubsidyRelayerError(stage, {
      sessionId,
      onchainSessionId,
      fundingSource,
      subsidyAmount,
      contractCallName,
      txHash,
      ...getErrorDetails(error),
      ...extra,
    });
  };

  try {
    getConfiguredChainId();

    const payload = (await request.json()) as {
      sessionId?: string;
    };
    sessionId = payload.sessionId ?? null;

    if (!sessionId) {
      return routeError("missing_session_id", "sessionId is required.", 400);
    }

    logSubsidyRelayer("request received", { sessionId });

    const supabase = createServerSupabaseClient({ useServiceRole: true });
    const { data: row, error: rowError } = await supabase
      .from("sessions")
      .select(
        "id, onchain_session_id, subsidy_applied_eth, patient_subsidy_choice_eth, funding_source",
      )
      .eq("id", sessionId)
      .maybeSingle();

    if (rowError) {
      logRouteFailure("session lookup failed", rowError);
      return routeError("session_lookup_failed", rowError.message, 500);
    }

    if (!row) {
      logSubsidyRelayerError("session lookup returned no row", { sessionId });
      return routeError("session_not_found", "Session row not found.", 404);
    }

    const sessionRow = row as SessionRow;
    onchainSessionId = sessionRow.onchain_session_id;
    fundingSource = sessionRow.funding_source;
    if (!sessionRow.onchain_session_id) {
      logSubsidyRelayerError("missing on-chain session id", {
        sessionId,
        fundingSource,
      });
      return routeError(
        "missing_onchain_session_id",
        "This booking is missing an on-chain session id.",
        400,
      );
    }

    const rowSubsidyNeeded = Math.max(
      toNumber(sessionRow.subsidy_applied_eth),
      toNumber(sessionRow.patient_subsidy_choice_eth),
    );
    subsidyAmount = rowSubsidyNeeded;

    if (rowSubsidyNeeded <= 0) {
      return NextResponse.json(
        {
          ok: true,
          code: "no_subsidy_needed",
          message: "This booking does not require subsidy funding.",
          alreadyFunded: false,
        },
        { status: 200 },
      );
    }

    const escrowAddress = getEscrowAddress();
    const alchemyUrl = getRequiredEnv("ALCHEMY_SEPOLIA_URL");
    const account = privateKeyToAccount(getPrivateKeyEnv());
    const configuredVaultAddress = process.env.SUBSIDY_TREASURY_ADDRESS?.trim();

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(alchemyUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(alchemyUrl),
    });

    const rpcChainId = await publicClient.getChainId();
    if (rpcChainId !== MINDPASS_ESCROW_CHAIN_ID) {
      return routeError(
        "wrong_chain",
        `Alchemy RPC chain id ${rpcChainId} does not match ${MINDPASS_ESCROW_CHAIN_ID}.`,
        500,
      );
    }

    const onchainSessionIdValue = BigInt(sessionRow.onchain_session_id);
    const chainVault = (await publicClient.readContract({
      address: escrowAddress,
      abi: MINDPASS_ESCROW_ABI,
      functionName: "vault",
    })) as HexAddress;

    const relayerSignerMismatchPayload = buildRelayerSignerMismatchPayload({
      sessionId,
      onchainSessionId,
      configuredTreasuryAddress: configuredVaultAddress,
      contractVaultAddress: chainVault,
      derivedSignerAddress: account.address,
      fundingSource,
      subsidyAmount,
    });

    if (
      configuredVaultAddress &&
      configuredVaultAddress.toLowerCase() !== account.address.toLowerCase()
    ) {
      logSubsidyRelayerError(
        "relayer signer mismatch before tx submission: SUBSIDY_TREASURY_ADDRESS does not match SUBSIDY_VAULT_PRIVATE_KEY",
        relayerSignerMismatchPayload,
      );
      return routeError(
        "RELAYER_SIGNER_MISMATCH",
        "Subsidy relayer signer mismatch before tx submission: SUBSIDY_VAULT_PRIVATE_KEY does not match SUBSIDY_TREASURY_ADDRESS or escrow.vault().",
        500,
        relayerSignerMismatchPayload,
      );
    }

    logSubsidyRelayer("vault addresses resolved", {
      sessionId,
      onchainSessionId: sessionRow.onchain_session_id,
      derivedSignerAddress: account.address,
      escrowVaultAddress: chainVault,
    });

    if (chainVault.toLowerCase() !== account.address.toLowerCase()) {
      logSubsidyRelayerError(
        "relayer signer mismatch before tx submission: derived signer does not match escrow.vault()",
        relayerSignerMismatchPayload,
      );
      return routeError(
        "RELAYER_SIGNER_MISMATCH",
        "Subsidy relayer signer mismatch before tx submission: SUBSIDY_VAULT_PRIVATE_KEY does not match SUBSIDY_TREASURY_ADDRESS or escrow.vault().",
        500,
        relayerSignerMismatchPayload,
      );
    }

    const chainSession = normalizeEscrowSession(
      (await publicClient.readContract({
        address: escrowAddress,
        abi: MINDPASS_ESCROW_ABI,
        functionName: "sessions",
        args: [onchainSessionIdValue],
      })) as readonly unknown[],
    );

    const chainOutcome = resolveSubsidyFundingChainOutcome({
      status: chainSession.status,
      subsidyRequiredWei: chainSession.subsidyRequiredWei,
      subsidyFundedWei: chainSession.subsidyFundedWei,
    });
    const remainingSubsidyWei = getRemainingSubsidyWei({
      subsidyRequiredWei: chainSession.subsidyRequiredWei,
      subsidyFundedWei: chainSession.subsidyFundedWei,
    });

    logSubsidyRelayer("chain session loaded", {
      sessionId,
      onchainSessionId: sessionRow.onchain_session_id,
      chainStatus: chainSession.status,
      subsidyRequiredWei: chainSession.subsidyRequiredWei.toString(),
      subsidyFundedWei: chainSession.subsidyFundedWei.toString(),
      remainingSubsidyWei: remainingSubsidyWei.toString(),
      chainOutcome,
    });

    if (chainOutcome === "no_subsidy_needed") {
      logSubsidyRelayer("no subsidy needed", {
        sessionId,
        onchainSessionId: sessionRow.onchain_session_id,
      });
      return NextResponse.json(
        {
          ok: true,
          code: "no_subsidy_needed",
          message: "This booking does not require on-chain subsidy funding.",
          alreadyFunded: false,
        },
        { status: 200 },
      );
    }

    if (chainOutcome === "already_funded") {
      const patch = buildChainMirrorPatch({
        contractAddress: escrowAddress,
        chainSession,
      });

      const { data, error } = await supabase
        .from("sessions")
        .update(patch)
        .eq("id", sessionRow.id)
        .eq("onchain_session_id", sessionRow.onchain_session_id)
        .select("*")
        .maybeSingle();

      if (error) {
        logMirrorSyncError("already-funded mirror sync failed", {
          sessionId,
          onchainSessionId: sessionRow.onchain_session_id,
          code: "mirror_sync_failed_after_already_funded",
          message: error.message,
        });
        return routeError(
          "mirror_sync_failed_after_already_funded",
          "Subsidy is already funded on-chain, but the session record could not be synced.",
          500,
        );
      }

      logMirrorSync("already-funded mirror sync complete", {
        sessionId,
        onchainSessionId: sessionRow.onchain_session_id,
      });
      return NextResponse.json({
        ok: true,
        code: "already_funded",
        alreadyFunded: true,
        session: data,
      });
    }

    if (chainOutcome !== "ready_to_fund") {
      logSubsidyRelayerError("invalid chain status for subsidy funding", {
        sessionId,
        onchainSessionId: sessionRow.onchain_session_id,
        fundingSource,
        subsidyAmount,
        chainStatus: chainSession.status,
        chainOutcome,
      });
      return routeError(
        "invalid_chain_status",
        "This booking is no longer in a state that can receive subsidy funding.",
        409,
        {
          chainStatus: chainSession.status,
        },
      );
    }

    contractCallName = "fundSubsidyPortion";
    try {
      txHash = await walletClient.writeContract({
        address: escrowAddress,
        abi: MINDPASS_ESCROW_ABI,
        functionName: "fundSubsidyPortion",
        args: [onchainSessionIdValue],
        value: remainingSubsidyWei,
        account,
        chain: sepolia,
      });
    } catch (error) {
      logRouteFailure("contract write failed", error);
      return routeError(
        "tx_reverted",
        error instanceof Error
          ? error.message
          : "Subsidy funding transaction reverted.",
        500,
      );
    }

    logSubsidyRelayer("tx submitted", {
      sessionId,
      onchainSessionId: sessionRow.onchain_session_id,
      fundingSource,
      subsidyAmount,
      contractCallName,
      txHash,
    });

    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (error) {
      logRouteFailure("receipt wait failed", error);
      return routeError(
        "receipt_wait_failed",
        error instanceof Error
          ? error.message
          : "Unable to confirm subsidy funding transaction receipt.",
        500,
        {
          txHash,
        },
      );
    }
    logReceiptDecode({
      context: "subsidy funding receipt decoded",
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs,
    });
    const subsidyEvent = findMindPassEscrowEvent(receipt.logs, "SubsidyPortionFunded");
    const sessionFundedEvent = findMindPassEscrowEvent(receipt.logs, "SessionFunded");

    if (!subsidyEvent) {
      logSubsidyRelayerError("missing subsidy event after successful receipt", {
        sessionId,
        onchainSessionId: sessionRow.onchain_session_id,
        fundingSource,
        subsidyAmount,
        contractCallName,
        txHash: receipt.transactionHash,
      });
      return routeError(
        "missing_subsidy_event",
        "Subsidy funding transaction succeeded, but the subsidy event was missing.",
        500,
      );
    }

    const updatePatch = {
      ...buildSubsidyFundingPatch({
        amountWei: subsidyEvent.args.amountWei,
        contractAddress: escrowAddress,
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
            contractAddress: escrowAddress,
            chainId: MINDPASS_ESCROW_CHAIN_ID,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
          })
        : {}),
    };

    const { data, error } = await supabase
      .from("sessions")
      .update(updatePatch)
      .eq("id", sessionRow.id)
      .eq("onchain_session_id", sessionRow.onchain_session_id)
      .select("*")
      .maybeSingle();

    if (error) {
      logMirrorSyncError("post-tx subsidy mirror sync failed", {
        sessionId,
        onchainSessionId: sessionRow.onchain_session_id,
        fundingSource,
        subsidyAmount,
        contractCallName,
        txHash: receipt.transactionHash,
        code: "mirror_sync_failed_after_tx",
        message: error.message,
      });
      return routeError(
        "mirror_sync_failed_after_tx",
        "The subsidy funding transaction succeeded, but the session record could not be synced.",
        500,
        {
          txHash: receipt.transactionHash,
        },
      );
    }

    logMirrorSync("post-tx subsidy mirror sync complete", {
      sessionId,
      onchainSessionId: sessionRow.onchain_session_id,
      txHash: receipt.transactionHash,
      funded: Boolean(sessionFundedEvent),
    });
    return NextResponse.json({
      ok: true,
      code: sessionFundedEvent ? "funded" : "subsidy_funded",
      alreadyFunded: false,
      txHash: receipt.transactionHash,
      session: data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected subsidy funding error.";
    logRouteFailure("unexpected failure", error);
    if (message.startsWith("Missing ")) {
      return routeError("missing_env", message, 500);
    }
    if (message.includes("NEXT_PUBLIC_CHAIN_ID")) {
      return routeError("wrong_chain", message, 500);
    }
    return routeError(
      "unexpected_error",
      message,
      500,
    );
  }
}
