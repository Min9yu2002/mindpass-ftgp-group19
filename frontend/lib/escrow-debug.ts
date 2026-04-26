import type { Hex } from "viem";
import { decodeEventLog } from "viem";
import { MINDPASS_ESCROW_ABI } from "./mindpassEscrow";

type EscrowReceiptLog = {
  data: Hex;
  topics: readonly Hex[] | Hex[];
};

type DebugDetails = Record<string, unknown>;

function logWithPrefix(
  method: "info" | "warn" | "error",
  prefix: string,
  message: string,
  details?: DebugDetails,
) {
  if (details && Object.keys(details).length > 0) {
    console[method](`${prefix} ${message}`, details);
    return;
  }

  console[method](`${prefix} ${message}`);
}

export function getMindPassEscrowEventNames(logs: readonly EscrowReceiptLog[]) {
  const eventNames: string[] = [];

  for (const log of logs) {
    try {
      const topics: [] | [Hex, ...Hex[]] =
        log.topics.length > 0
          ? [log.topics[0], ...log.topics.slice(1)]
          : [];
      const decoded = decodeEventLog({
        abi: MINDPASS_ESCROW_ABI,
        data: log.data,
        topics,
      });

      if (!eventNames.includes(decoded.eventName)) {
        eventNames.push(decoded.eventName);
      }
    } catch {
      continue;
    }
  }

  return eventNames;
}

export function logEscrowDebug(message: string, details?: DebugDetails) {
  logWithPrefix("info", "[escrow-debug]", message, details);
}

export function logEscrowWarning(message: string, details?: DebugDetails) {
  logWithPrefix("warn", "[escrow-debug]", message, details);
}

export function logMirrorSync(message: string, details?: DebugDetails) {
  logWithPrefix("info", "[mirror-sync]", message, details);
}

export function logMirrorSyncError(message: string, details?: DebugDetails) {
  logWithPrefix("error", "[mirror-sync]", message, details);
}

export function logSubsidyRelayer(message: string, details?: DebugDetails) {
  logWithPrefix("info", "[subsidy-relayer]", message, details);
}

export function logSubsidyRelayerError(message: string, details?: DebugDetails) {
  logWithPrefix("error", "[subsidy-relayer]", message, details);
}

export function logReceiptDecode(input: {
  context: string;
  txHash?: string | null;
  blockNumber?: bigint | number | null;
  logs: readonly EscrowReceiptLog[];
}) {
  logWithPrefix("info", "[receipt-decode]", input.context, {
    txHash: input.txHash ?? null,
    blockNumber:
      input.blockNumber === null || input.blockNumber === undefined
        ? null
        : Number(input.blockNumber),
    eventNames: getMindPassEscrowEventNames(input.logs),
  });
}
