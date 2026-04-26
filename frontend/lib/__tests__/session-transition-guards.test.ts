import test from "node:test";
import assert from "node:assert/strict";

import {
  canAutoStartSession,
  canRecordArrivalInteraction,
  canCheckIntoSession,
  canCompleteSession,
  getNoShowCatchUpSettlement,
  shouldCatchFundedNoShow,
  shouldCatchPaymentTimeout,
} from "../session-transition-guards.ts";
import {
  inSessionFixture,
  mixedFundingSession,
  mutualUnstartedSession,
  patientNoShowSession,
  therapistNoShowSession,
  walletFundingSession,
} from "../../tests/fixtures/sessions.ts";

test("payment timeout catch-up only triggers once the payment window has passed", () => {
  const beforeDueAt = Date.parse("2026-03-18T10:02:00.000Z");
  const afterDueAt = Date.parse("2026-03-18T10:04:00.000Z");

  assert.equal(
    shouldCatchPaymentTimeout(
      {
        status: walletFundingSession.status,
        paymentDueAt: walletFundingSession.payment_due_at,
      },
      beforeDueAt,
    ),
    false,
  );
  assert.equal(
    shouldCatchPaymentTimeout(
      {
        status: walletFundingSession.status,
        paymentDueAt: walletFundingSession.payment_due_at,
      },
      afterDueAt,
    ),
    true,
  );
});

test("funded no-show catch-up resolves patient_no_show and therapist_no_show from attendance", () => {
  const afterDeadline = Date.parse("2026-03-18T10:11:00.000Z");

  assert.equal(
    shouldCatchFundedNoShow(
      {
        status: patientNoShowSession.status,
        noShowDeadlineAt: patientNoShowSession.no_show_deadline_at,
        sessionStartedAt: patientNoShowSession.session_started_at,
      },
      afterDeadline,
    ),
    false,
  );

  assert.deepEqual(
    getNoShowCatchUpSettlement(
      {
        status: "funded",
        noShowDeadlineAt: patientNoShowSession.no_show_deadline_at,
        sessionStartedAt: null,
        patientJoinedAt: patientNoShowSession.patient_joined_at,
        therapistJoinedAt: patientNoShowSession.therapist_joined_at,
      },
      afterDeadline,
    ),
    {
      status: "patient_no_show",
      penalty_fee_eth: 0.0025,
      refund_amount_eth: 0.0025,
      therapist_payout_eth: 0.0025,
      protocol_fee_eth: 0,
      settlement_status: "penalty_paid_to_therapist",
    },
  );

  assert.deepEqual(
    getNoShowCatchUpSettlement(
      {
        status: "funded",
        noShowDeadlineAt: therapistNoShowSession.no_show_deadline_at,
        sessionStartedAt: null,
        patientJoinedAt: therapistNoShowSession.patient_joined_at,
        therapistJoinedAt: therapistNoShowSession.therapist_joined_at,
      },
      afterDeadline,
    ),
    {
      status: "therapist_no_show",
      penalty_fee_eth: 0,
      refund_amount_eth: 0.005,
      therapist_payout_eth: 0,
      protocol_fee_eth: 0,
      settlement_status: "refunded_to_patient",
    },
  );

  assert.deepEqual(
    getNoShowCatchUpSettlement(
      {
        status: "funded",
        noShowDeadlineAt: mutualUnstartedSession.no_show_deadline_at,
        sessionStartedAt: null,
        patientJoinedAt: mutualUnstartedSession.patient_joined_at,
        therapistJoinedAt: mutualUnstartedSession.therapist_joined_at,
      },
      afterDeadline,
    ),
    {
      status: "mutual_unstarted",
      penalty_fee_eth: 0,
      refund_amount_eth: 0.004,
      therapist_payout_eth: 0,
      protocol_fee_eth: 0.001,
      settlement_status: "mutual_unstarted_platform_fee",
    },
  );
});

test("chat guard helpers distinguish check-in, start, and completion eligibility", () => {
  assert.equal(
    canCheckIntoSession(
      {
        status: mixedFundingSession.status,
        noShowDeadlineAt: mixedFundingSession.no_show_deadline_at,
      },
      Date.parse("2026-03-18T10:06:00.000Z"),
    ),
    true,
  );
  assert.equal(
    canAutoStartSession({
      status: mixedFundingSession.status,
      patientJoinedAt: "2026-03-18T10:07:00.000Z",
      therapistJoinedAt: "2026-03-18T10:08:00.000Z",
      sessionStartedAt: null,
    }),
    true,
  );
  assert.equal(
    canCompleteSession({
      status: inSessionFixture.status,
      sessionStartedAt: inSessionFixture.session_started_at,
      settlementStatus: inSessionFixture.settlement_status,
    }),
    true,
  );
  assert.equal(
    canCompleteSession({
      status: mixedFundingSession.status,
      sessionStartedAt: mixedFundingSession.session_started_at,
      settlementStatus: mixedFundingSession.settlement_status,
    }),
    false,
  );
});

test("arrival interactions only count before funded deadline unless the session is already live", () => {
  assert.equal(
    canRecordArrivalInteraction(
      {
        status: mixedFundingSession.status,
        noShowDeadlineAt: mixedFundingSession.no_show_deadline_at,
      },
      Date.parse("2026-03-18T10:06:00.000Z"),
    ),
    true,
  );
  assert.equal(
    canRecordArrivalInteraction(
      {
        status: mixedFundingSession.status,
        noShowDeadlineAt: mixedFundingSession.no_show_deadline_at,
      },
      Date.parse("2026-03-18T10:11:00.000Z"),
    ),
    false,
  );
  assert.equal(
    canRecordArrivalInteraction(
      {
        status: inSessionFixture.status,
        noShowDeadlineAt: mixedFundingSession.no_show_deadline_at,
      },
      Date.parse("2026-03-18T10:26:00.000Z"),
    ),
    true,
  );
});
