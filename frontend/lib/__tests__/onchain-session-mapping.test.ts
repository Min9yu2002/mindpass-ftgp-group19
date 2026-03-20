import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBookingAcceptedPatch,
  buildBookingRequestedPatch,
  buildCancelledUnstartedPatch,
  buildPatientCheckedInPatch,
  buildPaymentTimeoutPatch,
  buildSessionStartedPatch,
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
  assert.equal(cancelledPatch.total_refund_eth, "0.005");
  assert.equal(cancelledPatch.status, "cancelled_unstarted");
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
