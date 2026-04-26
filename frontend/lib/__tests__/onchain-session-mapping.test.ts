import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBookingAcceptedPatch,
  buildBookingRequestedPatch,
  buildCancelledUnstartedPatch,
  buildPatientCheckedInPatch,
  buildPatientNoShowPatch,
  buildPaymentTimeoutPatch,
  buildSessionStartedPatch,
  buildTherapistNoShowPatch,
  buildWithdrawalPatch,
  compactSessionSyncPatch,
  decodeSessionModeBytes32,
  deriveFundingSourceFromRequiredSplit,
  getDbStatusForEscrowEvent,
  getTxHashFieldForEvent,
  normalizeOnchainAddress,
  weiToEthDecimalString,
} from "../onchain-session-mapping.ts";

test("deriveFundingSourceFromRequiredSplit maps wallet/subsidy/mixed splits", () => {
  assert.equal(
    deriveFundingSourceFromRequiredSplit(0n, 5_000_000_000_000_000n),
    "subsidy",
  );
  assert.equal(
    deriveFundingSourceFromRequiredSplit(5_000_000_000_000_000n, 0n),
    "wallet",
  );
  assert.equal(
    deriveFundingSourceFromRequiredSplit(2_500_000_000_000_000n, 2_500_000_000_000_000n),
    "mixed",
  );
});

test("buildBookingRequestedPatch syncs all fee columns and funding fields", () => {
  const patch = buildBookingRequestedPatch({
    onchainSessionId: 42n,
    patient: "0x60eCC43Eb6D34Aff650EE3ba18299dB4916fBD39",
    therapist: "0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD",
    walletRequiredWei: 3_000_000_000_000_000n,
    subsidyRequiredWei: 2_000_000_000_000_000n,
    sessionMode: "text",
    contractAddress: "0xAbcDEF0000000000000000000000000000001234",
    txHash: "0xcreate",
    blockNumber: 12345n,
  });

  assert.equal(patch.onchain_session_id, "42");
  assert.equal(patch.patient_wallet, "0x60ecc43eb6d34aff650ee3ba18299db4916fbd39");
  assert.equal(patch.therapist_wallet, "0x8ec7f2f349111b2443a6c68691344b7d53d5b2cd");
  assert.equal(patch.amount_eth, "0.005");
  assert.equal(patch.session_fee_eth, "0.005");
  assert.equal(patch.escrow_amount, "0.005");
  assert.equal(patch.funding_source, "mixed");
  assert.equal(patch.patient_wallet_choice_eth, "0.003");
  assert.equal(patch.patient_subsidy_choice_eth, "0.002");
});

test("buildBookingAcceptedPatch maps accept event timing into db fields", () => {
  const patch = buildBookingAcceptedPatch({
    acceptedAt: 1_763_290_000n,
    paymentDueAt: 1_763_290_180n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xaccept",
  });

  assert.equal(patch.status, "accepted_awaiting_payment");
  assert.ok(patch.provider_accepted_at);
  assert.ok(patch.payment_due_at);
  assert.equal(patch.accept_booking_tx_hash, "0xaccept");
});

test("payment timeout and cancelled-unstarted patches carry explicit refund splits", () => {
  const timeoutPatch = buildPaymentTimeoutPatch({
    patientRefundWei: 3_000_000_000_000_000n,
    vaultRefundWei: 2_000_000_000_000_000n,
    paymentTimeoutAt: 1_763_290_180n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xtimeout",
  });
  const cancelledPatch = buildCancelledUnstartedPatch({
    patientRefundWei: 3_000_000_000_000_000n,
    vaultRefundWei: 2_000_000_000_000_000n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xcancel",
  });

  assert.equal(timeoutPatch.total_refund_eth, "0.005");
  assert.equal(timeoutPatch.status, "payment_timeout");
  assert.equal(timeoutPatch.settlement_status, "refunded_split_patient_vault");
  assert.equal(cancelledPatch.total_refund_eth, "0.005");
  assert.equal(cancelledPatch.status, "cancelled_unstarted");
  assert.equal(cancelledPatch.settlement_status, "refunded_split_patient_vault");
});

test("patient no-show patch keeps full wallet-funded refunds on the patient side", () => {
  const txHash = "0xwallet-patient-no-show";
  const patch = buildPatientNoShowPatch({
    therapistPayoutWei: 1_000_000_000_000_000n,
    patientRefundWei: 4_000_000_000_000_000n,
    vaultRefundWei: 0n,
    penaltyFeeWei: 1_000_000_000_000_000n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash,
  });

  assert.equal(patch.therapist_payout_eth, "0.001");
  assert.equal(patch.penalty_fee_eth, "0.001");
  assert.equal(patch.patient_refund_eth, "0.004");
  assert.equal(patch.vault_refund_eth, "0");
  assert.equal(patch.subsidy_refunded_eth, "0");
  assert.equal(patch.total_refund_eth, "0.004");
  assert.equal(patch.refund_amount_eth, "0.004");
  assert.equal(patch.protocol_fee_eth, "0");
  assert.equal(patch.settlement_status, "penalty_paid_to_therapist");
  assert.equal(patch.resolve_no_show_tx_hash, txHash);
  assert.equal(patch.last_synced_tx_hash, txHash);
  assert.equal(patch.last_onchain_event, "PatientNoShowResolved");
});

test("patient no-show patch keeps full subsidy-funded refunds on the vault side", () => {
  const patch = buildPatientNoShowPatch({
    therapistPayoutWei: 1_000_000_000_000_000n,
    patientRefundWei: 0n,
    vaultRefundWei: 4_000_000_000_000_000n,
    penaltyFeeWei: 1_000_000_000_000_000n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xsubsidy-patient-no-show",
  });

  assert.equal(patch.therapist_payout_eth, "0.001");
  assert.equal(patch.penalty_fee_eth, "0.001");
  assert.equal(patch.patient_refund_eth, "0");
  assert.equal(patch.vault_refund_eth, "0.004");
  assert.equal(patch.subsidy_refunded_eth, "0.004");
  assert.equal(patch.total_refund_eth, "0.004");
  assert.equal(patch.refund_amount_eth, "0.004");
  assert.equal(patch.protocol_fee_eth, "0");
  assert.equal(patch.settlement_status, "penalty_paid_to_therapist");
});

test("patient no-show patch uses mixed-funding event values directly", () => {
  const patch = buildPatientNoShowPatch({
    therapistPayoutWei: 1_000_000_000_000_000n,
    patientRefundWei: 2_400_000_000_000_000n,
    vaultRefundWei: 1_600_000_000_000_000n,
    penaltyFeeWei: 1_000_000_000_000_000n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xmixed-patient-no-show",
  });

  assert.equal(patch.therapist_payout_eth, "0.001");
  assert.equal(patch.penalty_fee_eth, "0.001");
  assert.equal(patch.patient_refund_eth, "0.0024");
  assert.equal(patch.vault_refund_eth, "0.0016");
  assert.equal(patch.subsidy_refunded_eth, "0.0016");
  assert.equal(patch.total_refund_eth, "0.004");
  assert.equal(patch.refund_amount_eth, "0.004");
  assert.equal(patch.protocol_fee_eth, "0");
  assert.equal(patch.settlement_status, "penalty_paid_to_therapist");
});

test("therapist no-show patch keeps patient-funded refunds as patient withdrawals", () => {
  const txHash = "0xpatient";
  const patch = buildTherapistNoShowPatch({
    patientRefundWei: 5_000_000_000_000_000n,
    vaultRefundWei: 0n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash,
  });

  assert.equal(patch.patient_refund_eth, "0.005");
  assert.equal(patch.vault_refund_eth, "0");
  assert.equal(patch.settlement_status, "refunded_to_patient");
  assert.equal(patch.resolve_no_show_tx_hash, txHash);
  assert.equal(patch.last_synced_tx_hash, txHash);
  assert.equal(patch.last_onchain_event, "TherapistNoShowResolved");
});

test("therapist no-show patch keeps full subsidy refunds on the vault side", () => {
  const patch = buildTherapistNoShowPatch({
    patientRefundWei: 0n,
    vaultRefundWei: 5_000_000_000_000_000n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xvault",
  });

  assert.equal(patch.patient_refund_eth, "0");
  assert.equal(patch.vault_refund_eth, "0.005");
  assert.equal(patch.subsidy_refunded_eth, "0.005");
  assert.equal(patch.settlement_status, "refunded_to_vault");
});

test("therapist no-show patch marks mixed funding as split between patient and vault", () => {
  const patch = buildTherapistNoShowPatch({
    patientRefundWei: 3_000_000_000_000_000n,
    vaultRefundWei: 2_000_000_000_000_000n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xmixed",
  });

  assert.equal(patch.patient_refund_eth, "0.003");
  assert.equal(patch.vault_refund_eth, "0.002");
  assert.equal(patch.settlement_status, "refunded_split_patient_vault");
});

test("normalizers keep addresses lowercase and wei formatting precise", () => {
  assert.equal(
    normalizeOnchainAddress("0x8Ec7F2F349111B2443A6C68691344B7d53d5B2cD"),
    "0x8ec7f2f349111b2443a6c68691344b7d53d5b2cd",
  );
  assert.equal(weiToEthDecimalString(4_750_000_000_000_000n), "0.00475");
});

test("event helpers expose consistent tx-hash and status mappings", () => {
  assert.equal(getTxHashFieldForEvent("BookingRequested"), "create_booking_tx_hash");
  assert.equal(getTxHashFieldForEvent("SessionFunded"), null);
  assert.equal(getDbStatusForEscrowEvent("SessionCompleted"), "completed");
});

test("withdrawal patch syncs patient audit metadata", () => {
  const txHash = "0xwithdraw-patient";
  const patch = buildWithdrawalPatch({
    beneficiary: "patient",
    txHash,
  });

  assert.equal(patch.patient_withdrawal_tx_hash, txHash);
  assert.equal(patch.last_synced_tx_hash, txHash);
  assert.equal(patch.last_onchain_event, "Withdrawal");
  assert.ok(patch.last_synced_at);
  assert.equal("resolve_no_show_tx_hash" in patch, false);
});

test("withdrawal patch syncs therapist audit metadata", () => {
  const txHash = "0xwithdraw-therapist";
  const patch = buildWithdrawalPatch({
    beneficiary: "therapist",
    txHash,
  });

  assert.equal(patch.therapist_withdrawal_tx_hash, txHash);
  assert.equal(patch.last_synced_tx_hash, txHash);
  assert.equal(patch.last_onchain_event, "Withdrawal");
  assert.ok(patch.last_synced_at);
  assert.equal("resolve_no_show_tx_hash" in patch, false);
});

test("withdrawal patch syncs vault audit metadata", () => {
  const txHash = "0xwithdraw-vault";
  const patch = buildWithdrawalPatch({
    beneficiary: "vault",
    txHash,
  });

  assert.equal(patch.vault_withdrawal_tx_hash, txHash);
  assert.equal(patch.last_synced_tx_hash, txHash);
  assert.equal(patch.last_onchain_event, "Withdrawal");
  assert.ok(patch.last_synced_at);
  assert.equal("resolve_no_show_tx_hash" in patch, false);
});

test("withdrawal patch syncs protocol audit metadata", () => {
  const txHash = "0xwithdraw-protocol";
  const patch = buildWithdrawalPatch({
    beneficiary: "protocol",
    txHash,
  });

  assert.equal(patch.protocol_withdrawal_tx_hash, txHash);
  assert.equal(patch.last_synced_tx_hash, txHash);
  assert.equal(patch.last_onchain_event, "Withdrawal");
  assert.ok(patch.last_synced_at);
  assert.equal("resolve_no_show_tx_hash" in patch, false);
});

test("withdrawal patch composition preserves existing no-show resolution tx hash", () => {
  const resolveTxHash = "0xresolve";
  const withdrawalTxHash = "0xwithdraw";
  const resolutionPatch = buildPatientNoShowPatch({
    therapistPayoutWei: 1_000_000_000_000_000n,
    patientRefundWei: 4_000_000_000_000_000n,
    vaultRefundWei: 0n,
    penaltyFeeWei: 1_000_000_000_000_000n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: resolveTxHash,
  });
  const withdrawalPatch = buildWithdrawalPatch({
    beneficiary: "patient",
    txHash: withdrawalTxHash,
  });
  const composedPatch = {
    ...resolutionPatch,
    ...withdrawalPatch,
  };

  assert.equal(withdrawalPatch.resolve_no_show_tx_hash, undefined);
  assert.equal(composedPatch.resolve_no_show_tx_hash, resolveTxHash);
  assert.equal(composedPatch.patient_withdrawal_tx_hash, withdrawalTxHash);
  assert.equal(composedPatch.last_synced_tx_hash, withdrawalTxHash);
});

test("compactSessionSyncPatch drops undefined no-show tx hash fields before update", () => {
  const rawPatch = buildTherapistNoShowPatch({
    patientRefundWei: 5_000_000_000_000_000n,
    vaultRefundWei: 0n,
    contractAddress: "0x0000000000000000000000000000000000000001",
  });
  const compactedPatch = compactSessionSyncPatch(rawPatch);

  assert.equal(rawPatch.resolve_no_show_tx_hash, undefined);
  assert.equal("resolve_no_show_tx_hash" in compactedPatch, false);
});

test("check-in and session-start patches normalize timestamps and tracking fields", () => {
  const checkedInPatch = buildPatientCheckedInPatch({
    checkedInAt: 1_763_290_600n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xcheckin",
  });
  const startedPatch = buildSessionStartedPatch({
    sessionStartedAt: 1_763_290_660n,
    contractAddress: "0x0000000000000000000000000000000000000001",
    txHash: "0xstarted",
  });

  assert.ok(checkedInPatch.patient_joined_at);
  assert.equal(checkedInPatch.patient_checkin_tx_hash, "0xcheckin");
  assert.equal(startedPatch.status, "in_session");
  assert.ok(startedPatch.session_started_at);
  assert.equal(startedPatch.session_started_tx_hash, "0xstarted");
});

test("bytes32 session mode decoding stays readable for future event sync", () => {
  assert.equal(
    decodeSessionModeBytes32(
      "0x7465787400000000000000000000000000000000000000000000000000000000",
    ),
    "text",
  );
});
