import {
  buildPatientNoShowPatch,
  buildPaymentTimeoutPatch,
  buildTherapistNoShowPatch,
} from "./onchain-session-mapping";
import {
  MINDPASS_ESCROW_CHAIN_ID,
  MINDPASS_ESCROW_STATUS,
  type HexAddress,
  type MindPassEscrowSessionStruct,
} from "./mindpassEscrow";
import {
  shouldCatchFundedNoShow,
  shouldCatchPaymentTimeout,
} from "./session-transition-guards";

type SessionDeadlineShape = {
  status: string;
  paymentDueAt?: string | null;
  noShowDeadlineAt?: string | null;
  sessionStartedAt?: string | null;
};

export type EscrowResolutionKind = "payment_timeout" | "no_show";

export function getEscrowResolutionKind(
  session: SessionDeadlineShape | null | undefined,
  now = Date.now(),
): EscrowResolutionKind | null {
  if (!session) {
    return null;
  }

  if (shouldCatchPaymentTimeout(session, now)) {
    return "payment_timeout";
  }

  if (shouldCatchFundedNoShow(session, now)) {
    return "no_show";
  }

  return null;
}

export function splitRefundByFundingSource(input: {
  refundTotalWei: bigint;
  walletFundedWei: bigint;
  feeWei: bigint;
}) {
  if (input.refundTotalWei <= 0n || input.feeWei <= 0n) {
    return {
      patientRefundWei: 0n,
      vaultRefundWei: 0n,
    };
  }

  const patientRefundWei =
    (input.refundTotalWei * input.walletFundedWei) / input.feeWei;

  return {
    patientRefundWei,
    vaultRefundWei: input.refundTotalWei - patientRefundWei,
  };
}

export function isTerminalEscrowResolutionStatus(status: number) {
  return (
    status === MINDPASS_ESCROW_STATUS.PaymentTimeout ||
    status === MINDPASS_ESCROW_STATUS.PatientNoShow ||
    status === MINDPASS_ESCROW_STATUS.TherapistNoShow
  );
}

export type EscrowResolutionEventInput =
  | {
      eventName: "PaymentTimedOut";
      args: {
        paymentTimeoutAt: bigint | number | string;
        patientRefundWei: bigint | number | string;
        vaultRefundWei: bigint | number | string;
      };
    }
  | {
      eventName: "PatientNoShowResolved";
      args: {
        therapistPayoutWei: bigint | number | string;
        patientRefundWei: bigint | number | string;
        vaultRefundWei: bigint | number | string;
        penaltyFeeWei: bigint | number | string;
      };
    }
  | {
      eventName: "TherapistNoShowResolved";
      args: {
        patientRefundWei: bigint | number | string;
        vaultRefundWei: bigint | number | string;
      };
    };

export function buildResolutionPatchFromEvent(input: {
  resolutionEvent: EscrowResolutionEventInput;
  contractAddress: HexAddress;
  resolutionTxHash?: string | null;
  blockNumber?: bigint | number | null;
}) {
  if (input.resolutionEvent.eventName === "PaymentTimedOut") {
    return buildPaymentTimeoutPatch({
      patientRefundWei: input.resolutionEvent.args.patientRefundWei,
      vaultRefundWei: input.resolutionEvent.args.vaultRefundWei,
      paymentTimeoutAt: input.resolutionEvent.args.paymentTimeoutAt,
      contractAddress: input.contractAddress,
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      txHash: input.resolutionTxHash,
      blockNumber: input.blockNumber,
    });
  }

  if (input.resolutionEvent.eventName === "PatientNoShowResolved") {
    return buildPatientNoShowPatch({
      therapistPayoutWei: input.resolutionEvent.args.therapistPayoutWei,
      patientRefundWei: input.resolutionEvent.args.patientRefundWei,
      vaultRefundWei: input.resolutionEvent.args.vaultRefundWei,
      penaltyFeeWei: input.resolutionEvent.args.penaltyFeeWei,
      contractAddress: input.contractAddress,
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      txHash: input.resolutionTxHash,
      blockNumber: input.blockNumber,
    });
  }

  return buildTherapistNoShowPatch({
    patientRefundWei: input.resolutionEvent.args.patientRefundWei,
    vaultRefundWei: input.resolutionEvent.args.vaultRefundWei,
    contractAddress: input.contractAddress,
    chainId: MINDPASS_ESCROW_CHAIN_ID,
    txHash: input.resolutionTxHash,
    blockNumber: input.blockNumber,
  });
}

export function buildResolutionPatchFromChainSession(input: {
  chainSession: MindPassEscrowSessionStruct;
  contractAddress: HexAddress;
  resolutionTxHash?: string | null;
  blockNumber?: bigint | number | null;
}) {
  if (input.chainSession.status === MINDPASS_ESCROW_STATUS.PaymentTimeout) {
    return buildPaymentTimeoutPatch({
      patientRefundWei: input.chainSession.walletFundedWei,
      vaultRefundWei: input.chainSession.subsidyFundedWei,
      paymentTimeoutAt: input.chainSession.paymentTimeoutAt,
      contractAddress: input.contractAddress,
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      txHash: input.resolutionTxHash,
      blockNumber: input.blockNumber,
    });
  }

  const { patientRefundWei, vaultRefundWei } = splitRefundByFundingSource({
    refundTotalWei: input.chainSession.refundAmountWei,
    walletFundedWei: input.chainSession.walletFundedWei,
    feeWei: input.chainSession.feeWei,
  });

  if (input.chainSession.status === MINDPASS_ESCROW_STATUS.PatientNoShow) {
    return buildPatientNoShowPatch({
      therapistPayoutWei: input.chainSession.therapistPayoutWei,
      patientRefundWei,
      vaultRefundWei,
      penaltyFeeWei: input.chainSession.penaltyFeeWei,
      contractAddress: input.contractAddress,
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      txHash: input.resolutionTxHash,
      blockNumber: input.blockNumber,
    });
  }

  if (input.chainSession.status === MINDPASS_ESCROW_STATUS.TherapistNoShow) {
    return buildTherapistNoShowPatch({
      patientRefundWei,
      vaultRefundWei,
      contractAddress: input.contractAddress,
      chainId: MINDPASS_ESCROW_CHAIN_ID,
      txHash: input.resolutionTxHash,
      blockNumber: input.blockNumber,
    });
  }

  return null;
}
