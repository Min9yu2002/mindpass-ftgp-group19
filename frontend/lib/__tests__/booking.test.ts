import test from "node:test";
import assert from "node:assert/strict";

import {
  BOOKING_STEP_ETH,
  SESSION_FEE_ETH,
  clampSelfPayChoice,
  getBookingFundingSource,
  getSettlementPreview,
  resolveFunding,
  resolveFundingChoice,
  resolveNoShowSettlement,
} from "../booking.ts";

test("resolveFunding uses subsidy first", () => {
  const funding = resolveFunding(0.005);

  assert.equal(funding.fee, SESSION_FEE_ETH);
  assert.equal(funding.subsidyApplied, 0.005);
  assert.equal(funding.walletRequired, 0);
  assert.equal(funding.fundingSource, "subsidy");
});

test("resolveFunding falls back to mixed when subsidy is partial", () => {
  const funding = resolveFunding(0.002);

  assert.equal(funding.subsidyApplied, 0.002);
  assert.equal(funding.walletRequired, 0.003);
  assert.equal(funding.fundingSource, "mixed");
});

test("resolveFunding falls back to wallet when no subsidy exists", () => {
  const funding = resolveFunding(0);

  assert.equal(funding.subsidyApplied, 0);
  assert.equal(funding.walletRequired, 0.005);
  assert.equal(funding.fundingSource, "wallet");
});

test("clampSelfPayChoice respects subsidy floor and booking steps", () => {
  const clamped = clampSelfPayChoice(0.002, 0.0012);

  assert.equal(clamped, 0.003);
  assert.equal(Number((clamped / BOOKING_STEP_ETH).toFixed(0)), 6);
});

test("resolveFundingChoice returns consistent mixed funding fields", () => {
  const choice = resolveFundingChoice(0.003, 0.001);

  assert.equal(choice.fundingSource, "mixed");
  assert.equal(choice.patientSubsidyChoiceEth, 0.003);
  assert.equal(choice.patientWalletChoiceEth, 0.002);
  assert.equal(
    Number((choice.patientSubsidyChoiceEth + choice.patientWalletChoiceEth).toFixed(6)),
    SESSION_FEE_ETH,
  );
});

test("getBookingFundingSource returns deterministic funding labels", () => {
  assert.equal(getBookingFundingSource(0), "subsidy");
  assert.equal(getBookingFundingSource(0.0025), "mixed");
  assert.equal(getBookingFundingSource(0.005), "wallet");
});

test("resolveNoShowSettlement returns patient_no_show when therapist joined only", () => {
  const settlement = resolveNoShowSettlement({
    patientJoinedAt: null,
    therapistJoinedAt: "2026-03-18T10:10:00.000Z",
  });

  assert.deepEqual(settlement, {
    status: "patient_no_show",
    penalty_fee_eth: 0.0025,
    refund_amount_eth: 0.0025,
    therapist_payout_eth: 0.0025,
    protocol_fee_eth: 0,
    settlement_status: "penalty_paid_to_therapist",
  });
});

test("resolveNoShowSettlement returns therapist_no_show when patient joined only", () => {
  const settlement = resolveNoShowSettlement({
    patientJoinedAt: "2026-03-18T10:10:00.000Z",
    therapistJoinedAt: null,
  });

  assert.deepEqual(settlement, {
    status: "therapist_no_show",
    penalty_fee_eth: 0,
    refund_amount_eth: 0.005,
    therapist_payout_eth: 0,
    protocol_fee_eth: 0,
    settlement_status: "refunded_to_patient",
  });
});

test("resolveNoShowSettlement returns null when both joined", () => {
  const settlement = resolveNoShowSettlement({
    patientJoinedAt: "2026-03-18T10:10:00.000Z",
    therapistJoinedAt: "2026-03-18T10:11:00.000Z",
  });

  assert.equal(settlement, null);
});

test("resolveNoShowSettlement returns mutual_unstarted when neither participant joined", () => {
  const settlement = resolveNoShowSettlement({
    patientJoinedAt: null,
    therapistJoinedAt: null,
  });

  assert.deepEqual(settlement, {
    status: "mutual_unstarted",
    penalty_fee_eth: 0,
    refund_amount_eth: 0.004,
    therapist_payout_eth: 0,
    protocol_fee_eth: 0.001,
    settlement_status: "mutual_unstarted_platform_fee",
  });
});

test("getSettlementPreview returns stable copy for major workflow states", () => {
  assert.equal(getSettlementPreview("requested"), "Waiting for provider decision");
  assert.equal(
    getSettlementPreview("queued_waiting_for_provider"),
    "Provider is currently busy. You are in the wait queue and can leave at any time without charge.",
  );
  assert.equal(
    getSettlementPreview("accepted_awaiting_payment"),
    "Provider accepted. Please confirm payment within 3 minutes.",
  );
  assert.equal(
    getSettlementPreview("funded"),
    "Session funded. Waiting for both participants to enter.",
  );
  assert.equal(
    getSettlementPreview("payment_timeout"),
    "Booking expired because payment was not confirmed in time.",
  );
  assert.equal(
    getSettlementPreview("patient_no_show"),
    "You did not arrive within 2 minutes. 50% of the session fee was refunded and 50% was paid to the therapist.",
  );
  assert.equal(
    getSettlementPreview("mutual_unstarted"),
    "Neither participant arrived within 2 minutes. 80% of the session fee was refunded and a 20% platform fee was retained.",
  );
  assert.equal(
    getSettlementPreview("patient_cancelled_waiting"),
    "You left the provider wait queue. No fee, penalty, or deposit was charged.",
  );
});
