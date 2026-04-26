import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResolutionPatchFromEvent,
  buildResolutionPatchFromChainSession,
  getEscrowResolutionKind,
  splitRefundByFundingSource,
} from "../escrow-resolution.ts";
import { MINDPASS_ESCROW_STATUS } from "../mindpassEscrow.ts";

test("getEscrowResolutionKind flags overdue timeout and no-show sessions", () => {
  const afterDeadline = Date.parse("2026-03-18T10:10:00.000Z");

  assert.equal(
    getEscrowResolutionKind(
      {
        status: "accepted_awaiting_payment",
        paymentDueAt: "2026-03-18T10:05:00.000Z",
      },
      afterDeadline,
    ),
    "payment_timeout",
  );

  assert.equal(
    getEscrowResolutionKind(
      {
        status: "funded",
        noShowDeadlineAt: "2026-03-18T10:05:00.000Z",
        sessionStartedAt: null,
      },
      afterDeadline,
    ),
    "no_show",
  );
});

test("splitRefundByFundingSource mirrors contract refund allocation", () => {
  assert.deepEqual(
    splitRefundByFundingSource({
      refundTotalWei: 2_500_000_000_000_000n,
      walletFundedWei: 3_000_000_000_000_000n,
      feeWei: 5_000_000_000_000_000n,
    }),
    {
      patientRefundWei: 1_500_000_000_000_000n,
      vaultRefundWei: 1_000_000_000_000_000n,
    },
  );
});

test("buildResolutionPatchFromChainSession maps already-resolved terminal states", () => {
  const paymentTimeoutPatch = buildResolutionPatchFromChainSession({
    chainSession: {
      id: 42n,
      patient: "0x0000000000000000000000000000000000000001",
      therapist: "0x0000000000000000000000000000000000000002",
      status: MINDPASS_ESCROW_STATUS.PaymentTimeout,
      feeWei: 5_000_000_000_000_000n,
      walletRequiredWei: 3_000_000_000_000_000n,
      subsidyRequiredWei: 2_000_000_000_000_000n,
      walletFundedWei: 3_000_000_000_000_000n,
      subsidyFundedWei: 2_000_000_000_000_000n,
      providerAcceptedAt: 0n,
      paymentDueAt: 0n,
      fundedAt: 0n,
      patientJoinedAt: 0n,
      therapistJoinedAt: 0n,
      sessionStartedAt: 0n,
      completedAt: 0n,
      cancelledAt: 0n,
      noShowDeadlineAt: 0n,
      paymentTimeoutAt: 1_763_290_180n,
      penaltyFeeWei: 0n,
      refundAmountWei: 5_000_000_000_000_000n,
      protocolFeeWei: 0n,
      therapistPayoutWei: 0n,
      sessionMode: "0x" as const,
    },
    contractAddress: "0x0000000000000000000000000000000000000001",
    resolutionTxHash: "0xtimeout",
  });

  assert.equal(paymentTimeoutPatch?.status, "payment_timeout");
  assert.equal(paymentTimeoutPatch?.resolve_payment_timeout_tx_hash, "0xtimeout");

  const patientNoShowPatch = buildResolutionPatchFromChainSession({
    chainSession: {
      id: 42n,
      patient: "0x0000000000000000000000000000000000000001",
      therapist: "0x0000000000000000000000000000000000000002",
      status: MINDPASS_ESCROW_STATUS.PatientNoShow,
      feeWei: 5_000_000_000_000_000n,
      walletRequiredWei: 3_000_000_000_000_000n,
      subsidyRequiredWei: 2_000_000_000_000_000n,
      walletFundedWei: 3_000_000_000_000_000n,
      subsidyFundedWei: 2_000_000_000_000_000n,
      providerAcceptedAt: 0n,
      paymentDueAt: 0n,
      fundedAt: 0n,
      patientJoinedAt: 0n,
      therapistJoinedAt: 0n,
      sessionStartedAt: 0n,
      completedAt: 0n,
      cancelledAt: 0n,
      noShowDeadlineAt: 0n,
      paymentTimeoutAt: 0n,
      penaltyFeeWei: 2_500_000_000_000_000n,
      refundAmountWei: 2_500_000_000_000_000n,
      protocolFeeWei: 0n,
      therapistPayoutWei: 2_500_000_000_000_000n,
      sessionMode: "0x" as const,
    },
    contractAddress: "0x0000000000000000000000000000000000000001",
  });

  assert.equal(patientNoShowPatch?.status, "patient_no_show");
  assert.equal(patientNoShowPatch?.patient_refund_eth, "0.0015");
  assert.equal(patientNoShowPatch?.vault_refund_eth, "0.001");

  const therapistNoShowPatch = buildResolutionPatchFromChainSession({
    chainSession: {
      id: 42n,
      patient: "0x0000000000000000000000000000000000000001",
      therapist: "0x0000000000000000000000000000000000000002",
      status: MINDPASS_ESCROW_STATUS.TherapistNoShow,
      feeWei: 5_000_000_000_000_000n,
      walletRequiredWei: 0n,
      subsidyRequiredWei: 5_000_000_000_000_000n,
      walletFundedWei: 0n,
      subsidyFundedWei: 5_000_000_000_000_000n,
      providerAcceptedAt: 0n,
      paymentDueAt: 0n,
      fundedAt: 0n,
      patientJoinedAt: 0n,
      therapistJoinedAt: 0n,
      sessionStartedAt: 0n,
      completedAt: 0n,
      cancelledAt: 0n,
      noShowDeadlineAt: 0n,
      paymentTimeoutAt: 0n,
      penaltyFeeWei: 0n,
      refundAmountWei: 5_000_000_000_000_000n,
      protocolFeeWei: 0n,
      therapistPayoutWei: 0n,
      sessionMode: "0x" as const,
    },
    contractAddress: "0x0000000000000000000000000000000000000001",
  });

  assert.equal(therapistNoShowPatch?.patient_refund_eth, "0");
  assert.equal(therapistNoShowPatch?.vault_refund_eth, "0.005");
  assert.equal(therapistNoShowPatch?.settlement_status, "refunded_to_vault");
});

test("buildResolutionPatchFromEvent writes patient no-show resolution tx metadata", () => {
  const resolveTxHash = "0xresolve-patient-no-show";
  const patch = buildResolutionPatchFromEvent({
    resolutionEvent: {
      eventName: "PatientNoShowResolved",
      args: {
        therapistPayoutWei: 1_000_000_000_000_000n,
        patientRefundWei: 4_000_000_000_000_000n,
        vaultRefundWei: 0n,
        penaltyFeeWei: 1_000_000_000_000_000n,
      },
    },
    contractAddress: "0x0000000000000000000000000000000000000001",
    resolutionTxHash: resolveTxHash,
  });

  assert.equal(patch.resolve_no_show_tx_hash, resolveTxHash);
  assert.equal(patch.last_onchain_event, "PatientNoShowResolved");
  assert.equal(patch.last_synced_tx_hash, resolveTxHash);
});

test("buildResolutionPatchFromEvent writes therapist no-show resolution tx metadata", () => {
  const resolveTxHash = "0xresolve-therapist-no-show";
  const patch = buildResolutionPatchFromEvent({
    resolutionEvent: {
      eventName: "TherapistNoShowResolved",
      args: {
        patientRefundWei: 0n,
        vaultRefundWei: 5_000_000_000_000_000n,
      },
    },
    contractAddress: "0x0000000000000000000000000000000000000001",
    resolutionTxHash: resolveTxHash,
  });

  assert.equal(patch.resolve_no_show_tx_hash, resolveTxHash);
  assert.equal(patch.last_onchain_event, "TherapistNoShowResolved");
  assert.equal(patch.last_synced_tx_hash, resolveTxHash);
});
